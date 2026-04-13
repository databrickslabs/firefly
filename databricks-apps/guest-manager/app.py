import os
from datetime import datetime

import requests
import streamlit as st
from dotenv import load_dotenv

load_dotenv()

GUEST_API_SECRET = os.environ.get("GUEST_API_SECRET", "")
APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://localhost:5000").rstrip("/")

st.set_page_config(page_title="Guest Manager", page_icon="👤", layout="wide")
st.title("Guest Manager")

if not GUEST_API_SECRET:
    st.error("GUEST_API_SECRET is not set. Fill in your .env file and restart the app.")
    st.stop()


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def _headers() -> dict:
    return {"X-API-Key": GUEST_API_SECRET, "Content-Type": "application/json"}


def _url(path: str) -> str:
    return f"{APP_BASE_URL}{path}"


def api_get(path: str) -> requests.Response:
    return requests.get(_url(path), headers=_headers(), timeout=15)


def api_post(path: str, json: dict | None = None) -> requests.Response:
    return requests.post(_url(path), headers=_headers(), json=json or {}, timeout=15)


def api_delete(path: str) -> requests.Response:
    return requests.delete(_url(path), headers=_headers(), timeout=15)


# ---------------------------------------------------------------------------
# Data fetchers (cached per Streamlit run — use st.cache_data with short ttl)
# ---------------------------------------------------------------------------

@st.cache_data(ttl=10)
def fetch_guests(status: str) -> list[dict]:
    resp = api_get(f"/api/guest/users?status={status}")
    resp.raise_for_status()
    return resp.json().get("guests", [])


@st.cache_data(ttl=10)
def fetch_workspaces() -> list[dict]:
    resp = api_get("/api/guest/workspaces")
    resp.raise_for_status()
    return resp.json().get("workspaces", [])


@st.cache_data(ttl=10)
def fetch_spns() -> list[dict]:
    resp = api_get("/api/guest/spns")
    resp.raise_for_status()
    return resp.json().get("spns", [])


def invalidate_all():
    fetch_guests.clear()
    fetch_workspaces.clear()
    fetch_spns.clear()


# ---------------------------------------------------------------------------
# Email helpers
# ---------------------------------------------------------------------------

def parse_email(email: str) -> tuple[str, str]:
    """Split an email address into (local_part, domain)."""
    local, domain = email.rsplit("@", 1)
    return local, domain


def generate_guest_email(base_email: str, org_name: str = "") -> str:
    """Build a tagged guest email from a base address.

    Examples:
        base="sri.tikkireddy@databricks.com", org=""
          -> "sri.tikkireddy+fireflyguest_843201@databricks.com"
        base="sri.tikkireddy@databricks.com", org="ISV Demo"
          -> "sri.tikkireddy+isv_fireflyguest_843201@databricks.com"
    """
    local, domain = parse_email(base_email)
    base_local = local.split("+")[0]  # drop any existing + tag
    timestamp = str(int(datetime.now().timestamp()))[-6:]
    if org_name:
        org_slug = "".join(c for c in org_name.lower() if c.isalnum())[:10]
        tag = f"{org_slug}_fireflyguest_{timestamp}"
    else:
        tag = f"fireflyguest_{timestamp}"
    return f"{base_local}+{tag}@{domain}"


def is_my_guest(guest_email: str, base_email: str) -> bool:
    """Return True if guest_email was generated from base_email."""
    local, domain = parse_email(base_email)
    base_local = local.split("+")[0]
    return (
        guest_email.startswith(f"{base_local}+")
        and guest_email.endswith(f"@{domain}")
    )


# ---------------------------------------------------------------------------
# Current user (set once, shared across all tabs and sidebar)
# ---------------------------------------------------------------------------

user_email: str | None = st.context.headers.get("X-Forwarded-Email")


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def fmt_datetime(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d %H:%M UTC")
    except Exception:
        return iso


def status_badge(guest: dict) -> str:
    if guest.get("cleanedUpAt"):
        return "🗑 cleaned"
    if guest.get("isEffectivelyExpired"):
        return "🔴 expired"
    return "🟢 active"


# ---------------------------------------------------------------------------
# Tabs
# ---------------------------------------------------------------------------

tab_guests, tab_create, tab_workspaces, tab_spns = st.tabs(
    ["Guest Users", "Create Guest", "Workspaces", "SPNs"]
)


# ── Tab 1: Guest Users ─────────────────────────────────────────────────────
with tab_guests:
    col_filter, col_gc, col_refresh = st.columns([2, 1, 1])
    with col_filter:
        status_filter = st.selectbox(
            "Filter",
            options=["all", "active", "expired"],
            label_visibility="collapsed",
        )
    with col_gc:
        if st.button("Run GC", help="Delete expired guest records from the database"):
            try:
                resp = api_post("/api/guest/gc")
                resp.raise_for_status()
                data = resp.json()
                cleaned = data.get("cleaned", {}).get("count", 0)
                has_more = data.get("hasMore", False)
                st.success(f"Cleaned {cleaned} record(s).{' More remaining — run again.' if has_more else ''}")
                invalidate_all()
                st.rerun()
            except Exception as e:
                st.error(f"GC failed: {e}")
    with col_refresh:
        if st.button("Refresh"):
            invalidate_all()
            st.rerun()

    try:
        guests = fetch_guests(status_filter)
    except Exception as e:
        st.error(f"Failed to load guests: {e}")
        guests = []

    if user_email:
        guests = [g for g in guests if is_my_guest(g.get("email", ""), user_email)]

    if not guests:
        st.info("No guests found.")
    else:
        for guest in guests:
            guest_id = guest["id"]
            email = guest.get("email", "—")
            display_name = guest.get("displayName") or "—"
            org = guest.get("orgName") or "—"
            expires = fmt_datetime(guest.get("expiresAt"))
            badge = status_badge(guest)

            with st.container(border=True):
                cols = st.columns([3, 2, 2, 2, 1, 1])
                cols[0].markdown(f"**{email}**  \n{display_name}")
                cols[1].markdown(f"Org: `{org}`")
                cols[2].markdown(f"Expires: {expires}")
                cols[3].markdown(badge)

                regen_key = f"regen_{guest_id}"
                del_key = f"del_{guest_id}"

                if cols[4].button("Regen URL", key=regen_key):
                    try:
                        resp = api_post(f"/api/guest/users/{guest_id}")
                        resp.raise_for_status()
                        login_url = resp.json().get("loginUrl", "")
                        st.session_state[f"url_{guest_id}"] = login_url
                    except Exception as e:
                        st.error(f"Failed to regenerate URL: {e}")

                if cols[5].button("Delete", key=del_key, type="primary"):
                    try:
                        resp = api_delete(f"/api/guest/users/{guest_id}")
                        resp.raise_for_status()
                        st.success(f"Deleted {email}")
                        invalidate_all()
                        st.rerun()
                    except Exception as e:
                        st.error(f"Delete failed: {e}")

                url_val = st.session_state.get(f"url_{guest_id}")
                if url_val:
                    st.text_input(
                        "Login URL (valid 10 min)",
                        value=url_val,
                        key=f"urlbox_{guest_id}",
                    )


# ── Tab 2: Create Guest ────────────────────────────────────────────────────
with tab_create:
    try:
        spns_for_form = fetch_spns()
    except Exception as e:
        st.error(f"Could not load SPNs: {e}")
        spns_for_form = []

    spn_options = {f"{s['name']} ({s.get('workspaceName', '?')})": s["id"] for s in spns_for_form}

    st.subheader("New Guest User")

    # org_name lives outside the form so it can drive email generation
    org_name = st.text_input("Organization Name *", placeholder="e.g. Acme Corp Demo", key="org_name_input")

    # Auto-generate guest email from the forwarded header + org slug
    guest_email_value = generate_guest_email(user_email, org_name) if user_email else ""

    st.text_input(
        "Email",
        value=guest_email_value,
        disabled=True,
        placeholder="Auto-generated from your account" if not user_email else "",
        help="Auto-generated from your login email.",
        key="guest_email_display",
    )

    with st.form("create_guest_form"):
        name = st.text_input("Guest Name", placeholder="Optional — display name in logs")
        display_name = st.text_input("Display Name", placeholder="Optional — shown in the app header")
        custom_logo = st.text_input("Custom Logo URL", placeholder="Optional — https://...")

        if spn_options:
            spn_label = st.selectbox("Guest SPN *", options=list(spn_options.keys()))
            spn_id = spn_options[spn_label]
        else:
            st.warning("No SPNs configured. Add one in the SPNs tab first.")
            spn_id = None

        expires_in = st.number_input("Expires In (minutes)", min_value=1, value=60)
        submitted = st.form_submit_button("Create Guest", type="primary")

    if submitted:
        if not org_name:
            st.error("Organization Name is required.")
        elif not spn_id:
            st.error("A Guest SPN must be selected.")
        else:
            payload = {
                "orgName": org_name,
                "spnId": spn_id,
                "expiresInMinutes": int(expires_in),
            }
            if guest_email_value:
                payload["email"] = guest_email_value
            if name:
                payload["name"] = name
            if display_name:
                payload["displayName"] = display_name
            if custom_logo:
                payload["customLogo"] = custom_logo

            try:
                resp = api_post("/api/guest/users", json=payload)
                resp.raise_for_status()
                data = resp.json().get("guestUser", {})
                st.success(f"Guest created: {data.get('email')}")
                st.text_input(
                    "Login URL (share with guest)",
                    value=data.get("loginUrl", ""),
                    key="new_guest_url",
                )
                invalidate_all()
            except Exception as e:
                try:
                    detail = resp.json()
                except Exception:
                    detail = str(e)
                st.error(f"Failed to create guest: {detail}")


# ── Tab 3: Workspaces ──────────────────────────────────────────────────────
with tab_workspaces:
    col_ws_hdr, col_ws_refresh = st.columns([5, 1])
    col_ws_hdr.subheader("Guest Workspaces")
    if col_ws_refresh.button("Refresh", key="ws_refresh"):
        fetch_workspaces.clear()
        st.rerun()

    try:
        workspaces = fetch_workspaces()
    except Exception as e:
        st.error(f"Failed to load workspaces: {e}")
        workspaces = []

    if not workspaces:
        st.info("No workspaces configured yet.")
    else:
        for ws in workspaces:
            with st.container(border=True):
                cols = st.columns([3, 4])
                cols[0].markdown(f"**{ws['name']}**")
                cols[1].markdown(f"`{ws['workspaceUrl']}`")


# ── Tab 4: SPNs ────────────────────────────────────────────────────────────
with tab_spns:
    col_spn_hdr, col_spn_refresh = st.columns([5, 1])
    col_spn_hdr.subheader("Guest Service Principals")
    if col_spn_refresh.button("Refresh", key="spn_refresh"):
        fetch_spns.clear()
        st.rerun()

    try:
        spns = fetch_spns()
    except Exception as e:
        st.error(f"Failed to load SPNs: {e}")
        spns = []

    if not spns:
        st.info("No SPNs configured yet.")
    else:
        for spn in spns:
            with st.container(border=True):
                cols = st.columns([3, 3, 3])
                cols[0].markdown(f"**{spn['name']}**")
                cols[1].markdown(f"Client ID: `{spn['clientId']}`")
                cols[2].markdown(f"Workspace: {spn.get('workspaceName') or '—'}")

# ---------------------------------------------------------------------------
# Sidebar — connection info
# ---------------------------------------------------------------------------
with st.sidebar:
    if user_email:
        st.markdown(f"👋 Hello, **{user_email}**")
        st.markdown("---")
    st.markdown("### Configuration")
    st.markdown(f"**App URL:** `{APP_BASE_URL}`")
    secret_preview = GUEST_API_SECRET[:3] + "..." + GUEST_API_SECRET[-3:] if len(GUEST_API_SECRET) >= 6 else "***"
    st.markdown(f"**API Secret:** `{secret_preview}`")
    st.markdown("---")
    st.caption("Manage guest users, workspaces, and SPNs for the Firefly demo platform.")
