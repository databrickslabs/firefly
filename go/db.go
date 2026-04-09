package main

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/001_proxy_sessions.sql
var migrationSQL string

// dbPool is the global connection pool, initialised in initDB().
var dbPool *pgxpool.Pool

// proxySessionRecord mirrors the proxy_sessions table.
type proxySessionRecord struct {
	ID              string
	UserID          string
	UserEmail       string
	ToolID          string
	OrgID           string
	AppURL          string
	WorkspaceURL    string
	SPNClientID     string
	SPNClientSecret string
	AccessToken     string
	TokenExpiresAt  time.Time
	ExpiresAt       time.Time
	CreatedAt       time.Time
}

// appAccessResult holds the data returned by validateUserAccess.
type appAccessResult struct {
	AppURL          string
	WorkspaceURL    string
	SPNClientID     string
	SPNClientSecret string
}

// initDB opens a connection pool and applies the proxy_sessions migration.
func initDB(connStr string) error {
	cfg, err := pgxpool.ParseConfig(connStr)
	if err != nil {
		return fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	cfg.MaxConns = 10

	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		return fmt.Errorf("open DB pool: %w", err)
	}

	// Verify connectivity.
	if err := pool.Ping(context.Background()); err != nil {
		return fmt.Errorf("ping DB: %w", err)
	}

	// Apply migration (idempotent — uses CREATE TABLE IF NOT EXISTS).
	if _, err := pool.Exec(context.Background(), migrationSQL); err != nil {
		return fmt.Errorf("apply migration: %w", err)
	}
	log.Println("DB migration applied successfully")

	dbPool = pool
	return nil
}

// validateUserAccess performs all DB checks required before creating a session:
//  1. User exists and is not banned
//  2. User is a member of the requested organisation
//  3. authoringTool exists in that org, is not deleted, and has a valid appUrl
//  4. userSpns record exists for the user's email
//
// Returns the data needed to initiate proxying.
func validateUserAccess(ctx context.Context, userID, userEmail, toolID, orgID string) (*appAccessResult, error) {
	tx, err := dbPool.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// 1. Check user is not banned.
	var banned *bool
	err = tx.QueryRow(ctx,
		`SELECT banned FROM "user" WHERE id = $1`, userID,
	).Scan(&banned)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("user not found")
	}
	if err != nil {
		return nil, fmt.Errorf("user lookup: %w", err)
	}
	if banned != nil && *banned {
		return nil, fmt.Errorf("user is banned")
	}

	// 2. Check organisation membership.
	var memberRole string
	err = tx.QueryRow(ctx,
		`SELECT role FROM member WHERE "userId" = $1 AND "organizationId" = $2`,
		userID, orgID,
	).Scan(&memberRole)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("user is not a member of organisation %q", orgID)
	}
	if err != nil {
		return nil, fmt.Errorf("membership lookup: %w", err)
	}

	// 3. Look up the authoringTool.
	var appURL, appStatus string
	var deletedAt *time.Time
	err = tx.QueryRow(ctx,
		`SELECT "appUrl", status, "deletedAt"
		   FROM "authoringTool"
		  WHERE id = $1 AND "organizationId" = $2`,
		toolID, orgID,
	).Scan(&appURL, &appStatus, &deletedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("tool %q not found in org %q", toolID, orgID)
	}
	if err != nil {
		return nil, fmt.Errorf("tool lookup: %w", err)
	}
	if deletedAt != nil {
		return nil, fmt.Errorf("tool %q has been deleted", toolID)
	}
	if appStatus == "DELETING" || appStatus == "ERROR" {
		return nil, fmt.Errorf("tool %q is in status %q and cannot be proxied", toolID, appStatus)
	}
	if appURL == "" {
		return nil, fmt.Errorf("tool %q has no app URL configured yet", toolID)
	}

	// 4. Look up SPN credentials.
	var clientID, clientSecret, workspaceURL string
	err = tx.QueryRow(ctx,
		`SELECT "clientId", "clientSecret", "workspaceUrl"
		   FROM "userSpns"
		  WHERE email = $1`,
		userEmail,
	).Scan(&clientID, &clientSecret, &workspaceURL)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("no SPN credentials found for user %q", userEmail)
	}
	if err != nil {
		return nil, fmt.Errorf("SPN lookup: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}

	return &appAccessResult{
		AppURL:          appURL,
		WorkspaceURL:    workspaceURL,
		SPNClientID:     clientID,
		SPNClientSecret: clientSecret,
	}, nil
}

// upsertProxySession replaces any existing sessions for the same
// (user_id, tool_id, org_id) tuple and inserts the new one, all within a
// single transaction.  This prevents duplicate sessions from accumulating
// when the client re-initialises (e.g. page refresh, React StrictMode).
func upsertProxySession(ctx context.Context, sess proxySessionRecord) error {
	tx, err := dbPool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Remove any existing sessions for this user+tool+org combination.
	if _, err = tx.Exec(ctx,
		`DELETE FROM proxy_sessions WHERE user_id = $1 AND tool_id = $2 AND org_id = $3`,
		sess.UserID, sess.ToolID, sess.OrgID,
	); err != nil {
		return fmt.Errorf("delete existing sessions: %w", err)
	}

	if _, err = tx.Exec(ctx,
		`INSERT INTO proxy_sessions
		 (id, user_id, user_email, tool_id, org_id, app_url,
		  workspace_url, spn_client_id, spn_client_secret,
		  access_token, token_expires_at, expires_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		sess.ID, sess.UserID, sess.UserEmail, sess.ToolID, sess.OrgID,
		sess.AppURL, sess.WorkspaceURL, sess.SPNClientID, sess.SPNClientSecret,
		sess.AccessToken, sess.TokenExpiresAt, sess.ExpiresAt,
	); err != nil {
		return fmt.Errorf("insert session: %w", err)
	}

	return tx.Commit(ctx)
}

// getProxySession looks up a session by its SHA-256 hash (the DB primary key).
// Returns nil, nil when no matching session exists.
func getProxySession(ctx context.Context, hashHex string) (*proxySessionRecord, error) {
	var s proxySessionRecord
	err := dbPool.QueryRow(ctx,
		`SELECT id, user_id, user_email, tool_id, org_id, app_url,
		        workspace_url, spn_client_id, spn_client_secret,
		        access_token, token_expires_at, expires_at, created_at
		   FROM proxy_sessions WHERE id = $1`,
		hashHex,
	).Scan(
		&s.ID, &s.UserID, &s.UserEmail, &s.ToolID, &s.OrgID, &s.AppURL,
		&s.WorkspaceURL, &s.SPNClientID, &s.SPNClientSecret,
		&s.AccessToken, &s.TokenExpiresAt, &s.ExpiresAt, &s.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("session lookup: %w", err)
	}
	return &s, nil
}

// updateSessionToken refreshes the stored access token after a token refresh.
func updateSessionToken(ctx context.Context, hashHex, accessToken string, tokenExpiresAt time.Time) error {
	_, err := dbPool.Exec(ctx,
		`UPDATE proxy_sessions
		    SET access_token = $2, token_expires_at = $3
		  WHERE id = $1`,
		hashHex, accessToken, tokenExpiresAt,
	)
	return err
}

// deleteExpiredSessions removes all sessions past their expires_at.
func deleteExpiredSessions(ctx context.Context) error {
	tag, err := dbPool.Exec(ctx,
		`DELETE FROM proxy_sessions WHERE expires_at < NOW()`,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() > 0 {
		log.Printf("Purged %d expired proxy sessions", tag.RowsAffected())
	}
	return nil
}
