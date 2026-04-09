package main

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/lestrrat-go/jwx/v2/jwt"
)

var (
	jwksCache       *jwk.Cache
	jwksCacheURL    string
	jwksEndpointURL string // set at startup; never changes
	jwksMu          sync.RWMutex
)

// initJWKSCache registers the JWKS endpoint with a local cache and performs
// an initial fetch so the proxy fails fast if the endpoint is unreachable.
func initJWKSCache(ctx context.Context, jwksEndpoint string) error {
	// Always record the endpoint URL so lazy-init can use it.
	jwksMu.Lock()
	jwksEndpointURL = jwksEndpoint
	jwksMu.Unlock()

	cache := jwk.NewCache(ctx)
	if err := cache.Register(jwksEndpoint,
		jwk.WithMinRefreshInterval(5*time.Minute),
	); err != nil {
		return fmt.Errorf("register JWKS endpoint %s: %w", jwksEndpoint, err)
	}

	// Initial fetch — validates reachability at startup.
	if _, err := cache.Refresh(ctx, jwksEndpoint); err != nil {
		return fmt.Errorf("initial JWKS fetch from %s: %w", jwksEndpoint, err)
	}

	jwksMu.Lock()
	jwksCache = cache
	jwksCacheURL = jwksEndpoint
	jwksMu.Unlock()
	return nil
}

// verifyProxyJWT validates a JWT produced by better-auth's JWT plugin.
// It verifies:
//   - Signature against the JWKS obtained from the better-auth /api/auth/jwks endpoint
//   - Issuer == frontendURL
//   - Audience contains frontendURL
//   - Token is not expired (with 10-second clock-skew tolerance)
//
// On success it returns the parsed token so callers can extract claims
// (sub = userId, email).
func verifyProxyJWT(tokenString string) (jwt.Token, error) {
	jwksMu.RLock()
	cache := jwksCache
	cacheURL := jwksCacheURL
	jwksMu.RUnlock()

	if cache == nil {
		// Cache was not populated at startup (dev mode, Next.js wasn't running).
		// Try to initialise it now using the recorded endpoint URL.
		jwksMu.RLock()
		endpoint := jwksEndpointURL
		jwksMu.RUnlock()
		if endpoint == "" {
			return nil, fmt.Errorf("JWKS cache not initialised and no endpoint configured")
		}
		if err := initJWKSCache(context.Background(), endpoint); err != nil {
			return nil, fmt.Errorf("JWKS cache not available: %w", err)
		}
		jwksMu.RLock()
		cache = jwksCache
		cacheURL = jwksCacheURL
		jwksMu.RUnlock()
		if cache == nil {
			return nil, fmt.Errorf("JWKS cache not initialised")
		}
	}

	keySet, err := cache.Get(context.Background(), cacheURL)
	if err != nil {
		return nil, fmt.Errorf("fetch JWKS: %w", err)
	}

	token, err := jwt.Parse([]byte(tokenString),
		jwt.WithKeySet(keySet),
		jwt.WithValidate(true),
		jwt.WithIssuer(frontendURL),
		jwt.WithAudience(frontendURL),
		jwt.WithAcceptableSkew(10*time.Second),
	)
	if err != nil {
		return nil, fmt.Errorf("JWT verification failed: %w", err)
	}

	return token, nil
}

// jwtEmail extracts the "email" private claim from a verified JWT.
// better-auth embeds the full user object in the payload by default.
func jwtEmail(token jwt.Token) (string, error) {
	raw, ok := token.Get("email")
	if !ok {
		return "", fmt.Errorf("JWT missing email claim")
	}
	email, ok := raw.(string)
	if !ok || email == "" {
		return "", fmt.Errorf("JWT email claim is not a non-empty string")
	}
	return email, nil
}
