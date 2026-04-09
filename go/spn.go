package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// spnHTTPClient is a dedicated HTTP client for SPN token requests with a
// conservative timeout so a slow Databricks endpoint never stalls the proxy.
var spnHTTPClient = &http.Client{Timeout: 15 * time.Second}

// tokenResponse is the JSON shape returned by the Databricks OIDC token endpoint.
type tokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"` // seconds
	TokenType   string `json:"token_type"`
}

// fetchDatabricksToken performs an OAuth 2.0 client-credentials grant against
// the workspace OIDC endpoint and returns the access token plus its expiry.
//
// Endpoint: POST {workspaceUrl}/oidc/v1/token
// Auth:     HTTP Basic — base64(clientId:clientSecret)
// Body:     grant_type=client_credentials&scope=all-apis
func fetchDatabricksToken(workspaceURL, clientID, clientSecret string) (string, time.Time, error) {
	// Normalise workspace URL (strip trailing slash).
	base := strings.TrimRight(workspaceURL, "/")
	tokenEndpoint := base + "/oidc/v1/token"

	formBody := url.Values{}
	formBody.Set("grant_type", "client_credentials")
	formBody.Set("scope", "all-apis")

	req, err := http.NewRequest(http.MethodPost, tokenEndpoint,
		strings.NewReader(formBody.Encode()))
	if err != nil {
		return "", time.Time{}, fmt.Errorf("build token request: %w", err)
	}

	credentials := base64.StdEncoding.EncodeToString(
		[]byte(clientID + ":" + clientSecret),
	)
	req.Header.Set("Authorization", "Basic "+credentials)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := spnHTTPClient.Do(req)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("token request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))

	if resp.StatusCode != http.StatusOK {
		return "", time.Time{}, fmt.Errorf(
			"token endpoint returned %d: %s", resp.StatusCode, string(body))
	}

	var tr tokenResponse
	if err := json.Unmarshal(body, &tr); err != nil {
		return "", time.Time{}, fmt.Errorf("parse token response: %w", err)
	}
	if tr.AccessToken == "" {
		return "", time.Time{}, fmt.Errorf("token endpoint returned empty access_token")
	}

	// Default to 1 hour if the endpoint doesn't report expiry.
	expiresIn := tr.ExpiresIn
	if expiresIn <= 0 {
		expiresIn = 3600
	}
	expiresAt := time.Now().Add(time.Duration(expiresIn) * time.Second)

	return tr.AccessToken, expiresAt, nil
}
