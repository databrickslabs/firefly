# Go Proxy for Databricks Apps

A simple Go reverse proxy with WebSocket support and encrypted OAuth token authentication.

## Features

- 🔒 **Encrypted Token Authentication**: OAuth tokens are encrypted in URLs for security
- 🔄 **WebSocket Support**: Full bidirectional WebSocket proxying
- 🌐 **CORS Enabled**: Cross-origin requests supported
- 🎯 **Dynamic Routing**: Route to any Databricks app dynamically

## URL Pattern

```
http://localhost:8090/app-proxy/{encrypted_token}/{provider}/{domain}/{app_name}/...
```

**Example:**
```
http://localhost:8090/app-proxy/abc123.../aws/databricksapps/code-editor-3771219485779100/
```

This will proxy to:
```
https://code-editor-3771219485779100.aws.databricksapps.com/
```

## Setup

1. **Create `.env` file** (already created):
   ```bash
   ENCRYPTION_KEY=37ce79d0c23aa754e9453a701279b1ef1d02b53de3082449c8b4f42704947fc3
   PORT=8090
   ```

2. **Install dependencies**:
   ```bash
   go mod tidy
   ```

3. **Run the proxy**:
   ```bash
   make run
   ```

## How It Works

1. **Token Encryption**:
   - OAuth Bearer tokens are encrypted using AES-256-GCM
   - The same encryption key is shared between Go proxy and Next.js app
   - Encrypted token is URL-safe base64 encoded

2. **URL Parsing**:
   - Proxy parses the URL to extract: encrypted token, provider, domain, and app name
   - Constructs target URL: `https://{app_name}.{provider}.{domain}.com`
   - Decrypts the token and adds it as `Authorization` header

3. **Request Handling**:
   - **HTTP Requests**: Proxied with full headers and CORS support
   - **WebSocket Requests**: Upgraded and bidirectionally proxied

## Usage from Next.js

In your Next.js app, use the `generateProxyUrl` function:

```typescript
import { generateProxyUrl } from "@/lib/token-encryption";

// Generate a proxy URL
const proxyUrl = generateProxyUrl(
  "Bearer eyJraWQi...", // Your OAuth token
  "https://code-editor-3771219485779100.aws.databricksapps.com",
  "/some/path"
);

// Use in iframe or fetch
<iframe src={`http://localhost:8090${proxyUrl}`} />
```

## Security

- ✅ Tokens are encrypted using AES-256-GCM (industry standard)
- ✅ Encryption key is 32 bytes (256 bits)
- ✅ URL-safe encoding prevents special character issues
- ✅ Tokens are never exposed in plain text in URLs
- ⚠️ Keep your `ENCRYPTION_KEY` secret and never commit it to version control

## Development

- **Run**: `make run`
- **Build**: `make build`
- **Clean**: `make clean`
- **Help**: `make help`
