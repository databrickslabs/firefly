-- proxy_sessions: stores active proxy sessions managed by the Go proxy.
-- The primary key is SHA-256(cookie_value) so a leaked DB row cannot be
-- used to forge a valid session cookie.
CREATE TABLE IF NOT EXISTS proxy_sessions (
    id                TEXT PRIMARY KEY,        -- hex(SHA-256(cookie_value))
    user_id           TEXT NOT NULL,           -- better-auth user.id (from JWT sub)
    user_email        TEXT NOT NULL,           -- user.email (for audit + SPN lookup)
    tool_id           TEXT NOT NULL,           -- authoringTool.id
    org_id            TEXT NOT NULL,           -- organization.id
    app_url           TEXT NOT NULL,           -- snapshot of authoringTool.appUrl
    workspace_url     TEXT NOT NULL,           -- Databricks workspace URL for token refresh
    spn_client_id     TEXT NOT NULL,           -- snapshot of userSpns.clientId
    spn_client_secret TEXT NOT NULL,           -- snapshot of userSpns.clientSecret
    access_token      TEXT NOT NULL,           -- current Databricks bearer token
    token_expires_at  TIMESTAMPTZ NOT NULL,    -- when access_token expires
    expires_at        TIMESTAMPTZ NOT NULL,    -- when the proxy session expires (1 hour)
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS proxy_sessions_expires_idx
    ON proxy_sessions (expires_at);

CREATE INDEX IF NOT EXISTS proxy_sessions_tool_user_idx
    ON proxy_sessions (tool_id, user_id);
