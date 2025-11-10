package main

import (
	"encoding/hex"
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
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // Allow all origins for CORS
		},
	}
	encryptionKey    []byte
	appDomainSuffix  string
)

func enableCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
	w.Header().Set("Access-Control-Allow-Credentials", "true")
}

func isWebSocketRequest(r *http.Request) bool {
	return strings.ToLower(r.Header.Get("Connection")) == "upgrade" &&
		strings.ToLower(r.Header.Get("Upgrade")) == "websocket"
}

// parseProxyURL parses the URL pattern: /app-proxy/{encrypted_token}/{provider}/{domain}/{app_name}/...
// Returns: decrypted token, target URL, remaining path, error
func parseProxyURL(path string) (string, string, string, error) {
	// Pattern: /app-proxy/{encrypted_token}/{provider}/{domain}/{app_name}/...
	re := regexp.MustCompile(`^/app-proxy/([^/]+)/([^/]+)/([^/]+)/([^/]+)(/.*)?$`)
	matches := re.FindStringSubmatch(path)

	if matches == nil {
		return "", "", "", fmt.Errorf("invalid proxy URL format")
	}

	encryptedToken := matches[1]
	provider := matches[2]      // e.g., "aws"
	domain := matches[3]        // e.g., "databricksapps"
	appName := matches[4]       // e.g., "code-editor-3771219485779100"
	remainingPath := matches[5] // e.g., "/some/path"

	// Decrypt the token
	token, err := Decrypt(encryptedToken, encryptionKey)
	if err != nil {
		return "", "", "", fmt.Errorf("failed to decrypt token: %v", err)
	}

	// Construct target URL: https://{app_name}.{provider}.{domain}.{suffix}
	targetURL := fmt.Sprintf("https://%s.%s.%s.%s", appName, provider, domain, appDomainSuffix)

	return token, targetURL, remainingPath, nil
}

func normalizeAuthToken(token string) string {
	// Ensure token has Bearer prefix
	token = strings.TrimSpace(token)
	if !strings.HasPrefix(strings.ToLower(token), "bearer ") {
		return "Bearer " + token
	}
	return token
}

func handleWebSocketProxy(w http.ResponseWriter, r *http.Request, targetWSURL, authToken string) {
	fmt.Printf("WebSocket request: %s\n", r.URL.Path)

	// Upgrade client connection
	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Printf("Failed to upgrade client connection: %v\n", err)
		return
	}
	defer clientConn.Close()

	// Create headers for target connection
	headers := http.Header{}
	headers.Set("Authorization", normalizeAuthToken(authToken))

	// Parse target URL to get origin
	targetURL, err := url.Parse(targetWSURL)
	if err == nil {
		headers.Set("Origin", fmt.Sprintf("%s://%s", targetURL.Scheme, targetURL.Host))
	}

	// Connect to target WebSocket
	dialer := &websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
		NetDialContext: (&net.Dialer{
			Timeout: 5 * time.Second,
		}).DialContext,
		TLSClientConfig: nil, // Use default TLS config
	}

	targetConn, resp, err := dialer.Dial(targetWSURL, headers)
	if err != nil {
		fmt.Printf("Failed to connect to target WebSocket: %v (response: %+v)\n", err, resp)
		clientConn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "Failed to connect to target"))
		return
	}
	defer targetConn.Close()

	fmt.Printf("Successfully established WebSocket connection\n")

	// Proxy messages bidirectionally
	done := make(chan struct{})
	var closeOnce sync.Once

	// Client to target
	go func() {
		defer closeOnce.Do(func() { close(done) })
		for {
			messageType, message, err := clientConn.ReadMessage()
			if err != nil {
				if !websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					fmt.Printf("Client connection closed normally\n")
				} else {
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

	// Target to client
	go func() {
		defer closeOnce.Do(func() { close(done) })
		for {
			messageType, message, err := targetConn.ReadMessage()
			if err != nil {
				if !websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					fmt.Printf("Target connection closed normally\n")
				} else {
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
	fmt.Printf("WebSocket proxy connection closed\n")
}

func handleHTTPProxy(w http.ResponseWriter, r *http.Request, targetURL, authToken, remainingPath string) {
	enableCORS(w)

	// Handle preflight requests
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Parse target URL
	target, err := url.Parse(targetURL)
	if err != nil {
		fmt.Printf("Invalid target URL: %v\n", err)
		http.Error(w, "Invalid target URL", http.StatusInternalServerError)
		return
	}

	// Create reverse proxy
	proxy := httputil.NewSingleHostReverseProxy(target)

	// Customize the director to modify the request
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = target.Host
		req.Header.Set("Authorization", normalizeAuthToken(authToken))
		req.URL.Path = remainingPath
		if remainingPath == "" {
			req.URL.Path = "/"
		}
	}

	proxy.ServeHTTP(w, r)
}

func main() {
	// Load encryption key from environment variable
	encryptionKeyHex := os.Getenv("ENCRYPTION_KEY")
	if encryptionKeyHex == "" {
		log.Fatal("ENCRYPTION_KEY environment variable is required (32-byte hex string)")
	}

	var err error
	encryptionKey, err = hex.DecodeString(encryptionKeyHex)
	if err != nil {
		log.Fatalf("Invalid ENCRYPTION_KEY format: %v", err)
	}

	if len(encryptionKey) != 32 {
		log.Fatal("ENCRYPTION_KEY must be 32 bytes (64 hex characters)")
	}

	// Load app domain suffix from environment (default: com)
	appDomainSuffix = os.Getenv("APP_DOMAIN_SUFFIX")
	if appDomainSuffix == "" {
		appDomainSuffix = "com"
	}

	// Handle all requests
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Check if this is a proxy request
		if !strings.HasPrefix(r.URL.Path, "/app-proxy/") {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}

		// Parse the proxy URL
		token, targetURL, remainingPath, err := parseProxyURL(r.URL.Path)
		if err != nil {
			fmt.Printf("Failed to parse proxy URL: %v%v\n", err, r.URL.Path)
			http.Error(w, fmt.Sprintf("Invalid proxy URL: %v", err), http.StatusBadRequest)
			return
		}

		fmt.Printf("Proxying to: %s%s (auth: %s...)\n", targetURL, remainingPath, token[:20])

		// Check if this is a WebSocket upgrade request
		if isWebSocketRequest(r) {
			// Build WebSocket URL (wss for https)
			wsURL := strings.Replace(targetURL, "https://", "wss://", 1) + remainingPath
			if r.URL.RawQuery != "" {
				wsURL += "?" + r.URL.RawQuery
			}
			handleWebSocketProxy(w, r, wsURL, token)
		} else {
			handleHTTPProxy(w, r, targetURL, token, remainingPath)
		}
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8090"
	}

	fmt.Printf("Starting proxy server on http://localhost:%s\n", port)
	fmt.Printf("WebSocket support enabled\n")
	fmt.Printf("URL pattern: /app-proxy/{encrypted_token}/{provider}/{domain}/{app_name}/...\n")

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}
