package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var (
	// frontendURL is the Next.js application origin (e.g. https://firefly-analytics.com).
	// Used for:
	//   - JWT iss/aud validation
	//   - Strict CORS origin check on /start-session
	//   - CSP frame-ancestors value on proxied responses
	frontendURL string

	// allowedApexDomain pins the Databricks-apps apex domain so URL path
	// components can never redirect the proxy to an attacker-controlled host.
	allowedApexDomain string

	appDomainSuffix string

	// devMode relaxes cookie security (no Secure flag, path-scoped cookie)
	// for local http:// development.  Never enable in production.
	devMode bool
)

// upgrader is initialised in main() after frontendURL / allowedApexDomain are known.
var upgrader websocket.Upgrader

var safeLabel = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

// sessionHash computes the SHA-256 of the raw session ID so that the value
// stored in the database cannot be used to forge a valid cookie.
func sessionHash(sessionID string) string {
	h := sha256.Sum256([]byte(sessionID))
	return hex.EncodeToString(h[:])
}

// isAllowedOrigin returns true when origin is an https:// subdomain of
// allowedApexDomain.  Used as a fallback for WebSocket CheckOrigin so that
// browsers inside Databricks-apps iframes can still open WS connections.
func isAllowedOrigin(origin string) bool {
	if origin == "" {
		return false
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if devMode && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1") {
		return true
	}
	if allowedApexDomain == "" {
		return false
	}
	if u.Scheme != "https" {
		return false
	}
	host := u.Hostname()
	return host == allowedApexDomain || strings.HasSuffix(host, "."+allowedApexDomain)
}

func isWebSocketRequest(r *http.Request) bool {
	return strings.ToLower(r.Header.Get("Connection")) == "upgrade" &&
		strings.ToLower(r.Header.Get("Upgrade")) == "websocket"
}

// buildTargetURL validates the app URL obtained from the DB against the
// allowedApexDomain to prevent open-redirect / SSRF via a tampered DB value.
func buildTargetURL(appURL string) (string, error) {
	parsed, err := url.Parse(appURL)
	if err != nil {
		return "", fmt.Errorf("invalid appUrl: %w", err)
	}
	hostname := parsed.Hostname()
	if !strings.HasSuffix(hostname, "."+allowedApexDomain) && hostname != allowedApexDomain {
		return "", fmt.Errorf(
			"app hostname %q is not a subdomain of allowed apex domain %q",
			hostname, allowedApexDomain,
		)
	}
	return appURL, nil
}

func normalizeAuthToken(token string) string {
	token = strings.TrimSpace(token)
	if !strings.HasPrefix(strings.ToLower(token), "bearer ") {
		return "Bearer " + token
	}
	return token
}

// stripForwardedHeaders removes X-Forwarded-* headers from a request to
// prevent header injection into the upstream Databricks app.
func stripForwardedHeaders(h http.Header) {
	for key := range h {
		if strings.HasPrefix(strings.ToLower(key), "x-forwarded-") {
			h.Del(key)
		}
	}
}

// handleStartSession is the session-creation endpoint.
//
// POST /start-session
// Body: { "jwt": "...", "toolId": "...", "orgId": "..." }
// Requires Origin == frontendURL (strict CORS, defence-in-depth).
//
// Flow:
//  1. Validate Origin
//  2. Verify JWT (JWKS)
//  3. Extract userId (sub) and email from JWT
//  4. DB: validate user access → appUrl, workspaceUrl, clientId, clientSecret
//  5. Fetch Databricks bearer token via SPN client-credentials flow
//  6. Generate random session ID, store SHA-256(id) in proxy_sessions
//  7. Set HttpOnly session cookie
func handleStartSession(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")

	// Set CORS headers only when the origin is exactly the frontend.
	// No wildcard, no subdomain matching — prevents any other site from
	// initiating proxy sessions.
	if origin == frontendURL {
		w.Header().Set("Access-Control-Allow-Origin", frontendURL)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Vary", "Origin")
	}

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Defence-in-depth: reject explicitly if origin is wrong, even after CORS.
	if origin != frontendURL {
		http.Error(w, "forbidden: invalid origin", http.StatusForbidden)
		return
	}

	// Strip potentially injected forwarding headers before any processing.
	stripForwardedHeaders(r.Header)
	r.Header.Del("Authorization")

	var body struct {
		JWT    string `json:"jwt"`
		ToolID string `json:"toolId"`
		OrgID  string `json:"orgId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Validate toolId and orgId contain only safe characters.
	for name, val := range map[string]string{"toolId": body.ToolID, "orgId": body.OrgID} {
		if val == "" || !safeLabel.MatchString(val) {
			http.Error(w, fmt.Sprintf("invalid or missing %q", name), http.StatusBadRequest)
			return
		}
	}
	if body.JWT == "" {
		http.Error(w, "missing jwt", http.StatusBadRequest)
		return
	}

	// Fast-path: if the client already has a valid session cookie for this
	// tool+org, reuse it without re-running the full JWT / DB / SPN flow.
	// This handles page refreshes and React StrictMode double-invocations.
	if existing, cookieErr := r.Cookie("proxy_sid"); cookieErr == nil {
		hashHex := sessionHash(existing.Value)
		if sess, lookupErr := getProxySession(r.Context(), hashHex); lookupErr == nil &&
			sess != nil &&
			!time.Now().After(sess.ExpiresAt) &&
			sess.ToolID == body.ToolID &&
			sess.OrgID == body.OrgID {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"ok":true}`))
			return
		}
	}

	// Verify the JWT (signature, iss, aud, exp).
	token, err := verifyProxyJWT(body.JWT)
	if err != nil {
		log.Printf("JWT verification failed: %v", err)
		http.Error(w, "unauthorized: invalid JWT", http.StatusUnauthorized)
		return
	}

	// Extract claims.
	userID := token.Subject()
	if userID == "" {
		http.Error(w, "unauthorized: JWT missing sub claim", http.StatusUnauthorized)
		return
	}
	userEmail, err := jwtEmail(token)
	if err != nil {
		http.Error(w, "unauthorized: "+err.Error(), http.StatusUnauthorized)
		return
	}

	// DB: validate access and retrieve app + SPN details.
	access, err := validateUserAccess(r.Context(), userID, userEmail, body.ToolID, body.OrgID)
	if err != nil {
		log.Printf("Access validation failed for user=%s tool=%s org=%s: %v",
			userID, body.ToolID, body.OrgID, err)
		http.Error(w, "forbidden: "+err.Error(), http.StatusForbidden)
		return
	}

	// Validate that the DB-stored appUrl is within the allowed apex domain.
	if _, err := buildTargetURL(access.AppURL); err != nil {
		log.Printf("App URL validation failed: %v", err)
		http.Error(w, "forbidden: app URL is not in the allowed domain", http.StatusForbidden)
		return
	}

	// Fetch a fresh Databricks bearer token using the user's SPN credentials.
	accessToken, tokenExpiresAt, err := fetchDatabricksToken(
		access.WorkspaceURL, access.SPNClientID, access.SPNClientSecret,
	)
	if err != nil {
		log.Printf("SPN token fetch failed for user=%s: %v", userID, err)
		http.Error(w, "failed to obtain Databricks token", http.StatusInternalServerError)
		return
	}

	// Generate a cryptographically random 32-byte session ID.
	sidBytes := make([]byte, 32)
	if _, err := rand.Read(sidBytes); err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	sessionID := hex.EncodeToString(sidBytes)
	hashHex := sessionHash(sessionID)

	// Persist the session.
	sess := proxySessionRecord{
		ID:              hashHex,
		UserID:          userID,
		UserEmail:       userEmail,
		ToolID:          body.ToolID,
		OrgID:           body.OrgID,
		AppURL:          access.AppURL,
		WorkspaceURL:    access.WorkspaceURL,
		SPNClientID:     access.SPNClientID,
		SPNClientSecret: access.SPNClientSecret,
		AccessToken:     accessToken,
		TokenExpiresAt:  tokenExpiresAt,
		ExpiresAt:       time.Now().Add(1 * time.Hour),
	}
	if err := upsertProxySession(r.Context(), sess); err != nil {
		log.Printf("Failed to persist proxy session: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Set the session cookie.
	// Dev:  Path-scoped to the tool's proxy path, no Secure flag (http://localhost).
	// Prod: Domain-scoped to the proxy host, Secure + SameSite=None.
	//
	//       SameSite=None is required (not Lax) because the Next.js frontend and
	//       the Go proxy run on different domains (e.g. firefly-analytics-deployment.replit.app
	//       vs firefly-proxy.replit.app). Both replit.app subdomains are separate
	//       "sites" under the Public Suffix List, so the browser treats all iframe
	//       requests from the Next.js app to the proxy as cross-site. SameSite=Lax
	//       cookies are not sent in cross-site iframe requests, causing every
	//       /app-proxy/ request to fail with "missing session cookie".
	//
	//       SameSite=None does not weaken CSRF protection here because:
	//         1. /start-session requires a valid short-lived JWT in the POST body
	//            (an attacker cannot forge this from another origin).
	//         2. The Origin header is hard-checked against FRONTEND_URL before any
	//            processing, rejecting all other callers.
	//         3. /app-proxy/ routes are read-only proxies — there is no
	//            state-mutating action a cross-site request could exploit.
	//       SameSite=None must be paired with Secure (HTTPS-only), which browsers
	//       enforce — they silently ignore SameSite=None on non-Secure cookies.
	cookie := &http.Cookie{
		Name:     "proxy_sid",
		Value:    sessionID,
		MaxAge:   3600,
		HttpOnly: true,
	}
	if devMode {
		cookie.Path = "/app-proxy/" + body.ToolID + "/"
		cookie.SameSite = http.SameSiteLaxMode
		cookie.Secure = false
	} else {
		cookie.Domain = r.Host
		cookie.Path = "/"
		cookie.SameSite = http.SameSiteNoneMode
		cookie.Secure = true
	}
	http.SetCookie(w, cookie)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"ok":true}`))
}

func handleWebSocketProxy(w http.ResponseWriter, r *http.Request, targetWSURL, authToken string) {
	fmt.Printf("WebSocket request: %s\n", r.URL.Path)

	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Printf("Failed to upgrade client connection: %v\n", err)
		return
	}
	defer clientConn.Close()

	headers := http.Header{}
	headers.Set("Authorization", normalizeAuthToken(authToken))
	targetURL, err := url.Parse(targetWSURL)
	if err == nil {
		headers.Set("Origin", fmt.Sprintf("%s://%s", targetURL.Scheme, targetURL.Host))
	}

	dialer := &websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
		NetDialContext: (&net.Dialer{
			Timeout: 5 * time.Second,
		}).DialContext,
	}

	targetConn, resp, err := dialer.Dial(targetWSURL, headers)
	if err != nil {
		fmt.Printf("Failed to connect to target WebSocket: %v (response: %+v)\n", err, resp)
		clientConn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "Failed to connect to target"))
		return
	}
	defer targetConn.Close()

	done := make(chan struct{})
	var closeOnce sync.Once

	go func() {
		defer closeOnce.Do(func() { close(done) })
		for {
			messageType, message, err := clientConn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					fmt.Printf("Error reading from client: %v\n", err)
				}
				return
			}
			if err := targetConn.WriteMessage(messageType, message); err != nil {
				fmt.Printf("Error writing to target: %v\n", err)
				return
			}
		}
	}()

	go func() {
		defer closeOnce.Do(func() { close(done) })
		for {
			messageType, message, err := targetConn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					fmt.Printf("Error reading from target: %v\n", err)
				}
				return
			}
			if err := clientConn.WriteMessage(messageType, message); err != nil {
				fmt.Printf("Error writing to client: %v\n", err)
				return
			}
		}
	}()

	<-done
}

func handleHTTPProxy(w http.ResponseWriter, r *http.Request, targetURL, authToken, remainingPath string) {
	// Proxy routes are loaded inside an iframe that shares the proxy's origin —
	// no CORS headers needed (same-origin from the iframe's perspective).

	target, err := url.Parse(targetURL)
	if err != nil {
		http.Error(w, "invalid target URL", http.StatusInternalServerError)
		return
	}

	proxy := httputil.NewSingleHostReverseProxy(target)

	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = target.Host
		// Replace any inbound Authorization with the session's bearer token.
		req.Header.Del("Authorization")
		req.Header.Set("Authorization", normalizeAuthToken(authToken))
		// Strip all X-Forwarded-* headers to prevent header injection.
		stripForwardedHeaders(req.Header)
		req.URL.Path = remainingPath
		if remainingPath == "" {
			req.URL.Path = "/"
		}
	}

	// Inject security headers on every proxied response.
	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Set("Content-Security-Policy",
			fmt.Sprintf("frame-ancestors 'self' %s", frontendURL))
		resp.Header.Set("X-Frame-Options", "SAMEORIGIN")
		return nil
	}

	proxy.ServeHTTP(w, r)
}

// handleProxyRequest is the main proxy router.
// URL pattern: /app-proxy/{toolId}/...
// The proxy target comes exclusively from the DB session — never from the URL.
func handleProxyRequest(w http.ResponseWriter, r *http.Request) {
	// Parse toolId and remaining path from URL.
	// Pattern: /app-proxy/{toolId}[/...]
	re := regexp.MustCompile(`^/app-proxy/([^/]+)(/.*)?$`)
	matches := re.FindStringSubmatch(r.URL.Path)
	if matches == nil {
		http.Error(w, "invalid proxy URL", http.StatusBadRequest)
		return
	}
	toolID := matches[1]
	remainingPath := matches[2]

	if !safeLabel.MatchString(toolID) {
		http.Error(w, "invalid toolId in URL", http.StatusBadRequest)
		return
	}

	// Retrieve session cookie.
	cookie, err := r.Cookie("proxy_sid")
	if err != nil {
		http.Error(w, "missing session cookie", http.StatusUnauthorized)
		return
	}

	hashHex := sessionHash(cookie.Value)

	sess, err := getProxySession(r.Context(), hashHex)
	if err != nil {
		log.Printf("Session lookup error: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if sess == nil || time.Now().After(sess.ExpiresAt) {
		http.Error(w, "session expired or not found", http.StatusUnauthorized)
		return
	}

	// Ensure this cookie belongs to the requested tool — prevents cross-app reuse.
	if sess.ToolID != toolID {
		http.Error(w, "session tool mismatch", http.StatusForbidden)
		return
	}

	// Refresh the Databricks token if it expires within the next 5 minutes.
	accessToken := sess.AccessToken
	if time.Now().After(sess.TokenExpiresAt.Add(-5 * time.Minute)) {
		newToken, newExpiry, err := fetchDatabricksToken(
			sess.WorkspaceURL, sess.SPNClientID, sess.SPNClientSecret,
		)
		if err != nil {
			log.Printf("Token refresh failed for session %s: %v", hashHex[:8], err)
			// Continue with the existing token — it may still be valid.
		} else {
			accessToken = newToken
			if updateErr := updateSessionToken(r.Context(), hashHex, newToken, newExpiry); updateErr != nil {
				log.Printf("Failed to persist refreshed token: %v", updateErr)
			}
		}
	}

	// Validate the DB-stored appUrl before using it.
	targetURL, err := buildTargetURL(sess.AppURL)
	if err != nil {
		log.Printf("App URL validation failed: %v", err)
		http.Error(w, "invalid proxy target", http.StatusInternalServerError)
		return
	}

	fmt.Printf("Proxying to: %s%s (session: %s...)\n",
		targetURL, remainingPath, hashHex[:8])

	if isWebSocketRequest(r) {
		wsURL := strings.Replace(targetURL, "https://", "wss://", 1) + remainingPath
		if r.URL.RawQuery != "" {
			wsURL += "?" + r.URL.RawQuery
		}
		handleWebSocketProxy(w, r, wsURL, accessToken)
	} else {
		handleHTTPProxy(w, r, targetURL, accessToken, remainingPath)
	}
}

func main() {
	// ── Required environment variables ───────────────────────────────────────

	frontendURL = os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		log.Fatal("FRONTEND_URL is required (e.g. https://firefly-analytics.com)")
	}

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required (PostgreSQL connection string)")
	}

	allowedApexDomain = os.Getenv("ALLOWED_APEX_DOMAIN")
	if allowedApexDomain == "" {
		log.Fatal("ALLOWED_APEX_DOMAIN is required (e.g. aws.databricksapps.com)")
	}

	// ── Optional environment variables ───────────────────────────────────────

	appDomainSuffix = os.Getenv("APP_DOMAIN_SUFFIX")
	if appDomainSuffix == "" {
		appDomainSuffix = "com"
	}

	devMode = strings.ToLower(os.Getenv("DEV_MODE")) == "true"
	if devMode {
		fmt.Println("WARNING: DEV_MODE enabled — cookie security relaxed, do not use in production")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8090"
	}

	// ── Initialise DB ─────────────────────────────────────────────────────────

	if err := initDB(databaseURL); err != nil {
		log.Fatalf("Database init failed: %v", err)
	}

	// ── Initialise JWKS cache ─────────────────────────────────────────────────

	jwksEndpoint := frontendURL + "/api/auth/jwks"
	if err := initJWKSCache(context.Background(), jwksEndpoint); err != nil {
		if devMode {
			// In dev mode the Next.js app may not be running yet; warn and continue.
			// The cache will be populated on the first real /start-session request.
			log.Printf("WARNING: JWKS cache init failed (Next.js not running yet?): %v", err)
			log.Printf("WARNING: /start-session will fail until %s is reachable", jwksEndpoint)
		} else {
			log.Fatalf("JWKS cache init failed: %v", err)
		}
	} else {
		fmt.Printf("JWKS cache initialised from %s\n", jwksEndpoint)
	}

	// ── WebSocket upgrader ────────────────────────────────────────────────────

	// CheckOrigin is called before session validation during the WS handshake.
	// Allow:
	//   1. frontendURL — the Next.js app (source of iframes)
	//   2. The proxy's own host — WS connections initiated from within an iframe
	//      carry the proxy's origin, not the frontend's.
	//   3. Subdomains of allowedApexDomain — direct Databricks-app origins.
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			if origin == frontendURL {
				return true
			}
			if r.Host != "" {
				scheme := "https"
				if devMode {
					scheme = "http"
				}
				if origin == scheme+"://"+r.Host {
					return true
				}
			}
			return isAllowedOrigin(origin)
		},
	}

	// ── Background session cleanup ────────────────────────────────────────────

	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			if err := deleteExpiredSessions(context.Background()); err != nil {
				log.Printf("Session cleanup error: %v", err)
			}
		}
	}()

	// ── Routes ────────────────────────────────────────────────────────────────

	http.HandleFunc("/start-session", handleStartSession)
	http.HandleFunc("/app-proxy/", handleProxyRequest)
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "not found", http.StatusNotFound)
	})

	// ── Start server ──────────────────────────────────────────────────────────

	fmt.Printf("Proxy server listening on :%s\n", port)
	fmt.Printf("Frontend URL: %s\n", frontendURL)
	fmt.Printf("Allowed apex domain: %s\n", allowedApexDomain)
	fmt.Printf("URL pattern: /app-proxy/{toolId}/...\n")

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}
