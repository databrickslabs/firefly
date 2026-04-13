# Guest Manager

Streamlit app for managing Firefly guest users. Allows creating, listing, and revoking guest access tied to a running Firefly Next.js deployment.

## Prerequisites

- Databricks CLI configured (`databricks --version`)
- A running Firefly Next.js app and its `GUEST_API_SECRET` value

---

## 1. Create the secret scope and secret

```bash
# Create the scope (once per workspace)
databricks secrets create-scope firefly-guest-manager

# Store the API secret
databricks secrets put-secret firefly-guest-manager guest-api-secret \
  --string-value '<your-64-char-hex-secret>'
```

To generate a new secret if you don't have one:

```bash
openssl rand -hex 64
```

Verify it was stored:

```bash
databricks secrets list-secrets firefly-guest-manager
```

---

## 2. Review `app.yaml`

The app reads two environment variables at runtime:

```yaml
env:
  - name: APP_BASE_URL
    value: https://<your-firefly-app-url>

  - name: GUEST_API_SECRET
    valueFrom: guestApiSecret
```

`valueFrom: guestApiSecret` maps to the `guest-api-secret` key in the `firefly-guest-manager` scope via the Databricks Apps secret binding. Update `APP_BASE_URL` to point to your Firefly deployment.

---

## 3. Deploy the app

```bash
databricks apps deploy <app-name> --source-code-path /path/to/guest-manager
```

Or via the Databricks workspace UI: **Compute → Apps → Create App**, point it at this directory, and confirm the secret binding is wired up under the app's environment settings.

---

## Local development

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

```ini
GUEST_API_SECRET=<your-64-char-hex-secret>
APP_BASE_URL=http://localhost:5000
```

Run the app:

```bash
uv run streamlit run app.py
```

> Note: `X-Forwarded-Email` is not injected locally, so the email field in the Create Guest form will be disabled but blank, and the guest list will show all guests rather than filtering by user.
