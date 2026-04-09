# Go Proxy for Databricks Apps

A secure Go reverse proxy with WebSocket support that authenticates requests via
an `HttpOnly` cookie rather than embedding OAuth tokens in URLs.

## How it works

1. The Next.js server component encrypts the user's OAuth token and passes it (along
   with routing params) to the `<ProxyIframe>` client component as props.
2. On mount, `<ProxyIframe>` POSTs `{ encryptedToken, provider, domain, appName }` to
   `POST /init-proxy-session`. The token never appears in a URL.
3. The proxy decrypts the token, validates the target hostname against
   `ALLOWED_APEX_DOMAIN`, creates an in-memory session, and responds with:
   ```
   Set-Cookie: proxy_sid=<random>; HttpOnly; Secure; SameSite=None;
               Path=/app-proxy/{provider}/{domain}/{appName}/; Max-Age=3600
   ```
4. The iframe navigates to `/app-proxy/{provider}/{domain}/{appName}/`. All subsequent
   requests carry only the opaque `proxy_sid` cookie — no token ever appears in a URL,
   browser history, CDN log, or `Referer` header.
5. Expired sessions are purged automatically every 10 minutes.

## URL patterns

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/init-proxy-session` | POST | Exchange encrypted token for a session cookie |
| `/app-proxy/{provider}/{domain}/{appName}/...` | GET/WS | Proxy request (requires `proxy_sid` cookie) |

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENCRYPTION_KEY` | **Yes** | — | 32-byte AES-256-GCM key, hex-encoded (64 hex chars). Must match the value used by the Next.js app. Generate with: `openssl rand -hex 32` |
| `ALLOWED_APEX_DOMAIN` | **Yes** | — | Apex domain that all proxy targets must belong to (e.g. `aws.databricksapps.com`). Requests whose constructed hostname is not a subdomain of this value are rejected — prevents proxy-forgery attacks. Also enforced for CORS and WebSocket origin checks. |
| `APP_DOMAIN_SUFFIX` | No | `com` | TLD appended when constructing the target hostname: `{appName}.{provider}.{domain}.{APP_DOMAIN_SUFFIX}`. Change only if your Databricks Apps use a non-`.com` TLD. |
| `PORT` | No | `8090` | TCP port the proxy server listens on. |
| `DEV_MODE` | No | `false` | Set to `true` for local development over `http://localhost`. Drops `Secure` and uses `SameSite=Lax` on the session cookie, and allows `localhost` CORS origins. **Never enable in production.** |

## Building

```bash
cd go
go build ./...
```

## Running locally

```bash
export ENCRYPTION_KEY=$(openssl rand -hex 32)
export ALLOWED_APEX_DOMAIN=aws.databricksapps.com
go run .
```

Or with `make`:

```bash
make run
```

## Development commands

- **Run**: `make run`
- **Build**: `make build`
- **Clean**: `make clean`
- **Help**: `make help`
