"""Create the UC managed-memory store and grant the app's service principal on it.

This is what actually makes the durable, cross-session memory feature work — NOT
`grant_lakebase_permissions.py` (that grants Postgres/Lakebase table privileges,
which this Genie-One + UC-memory topology never uses). The memory tools in
`agent_server/utils_memory.py` talk to the Unity Catalog memory-store API
(`/api/2.1/unity-catalog/memory-stores/<catalog.schema.name>/entries`), so the
store must EXIST as a UC securable and the app's SP must hold READ/WRITE on it.
Neither is created by `quickstart` or the bundle, so without this step the agent
silently no-ops memory ("memory store not found", then "does not have READ/WRITE
MEMORY STORE"). Idempotent — safe to re-run.

Usage (from agent-build/, after the app exists so its SP is known):
    SP=$(databricks apps get <app> -p <profile> --output json | jq -r .service_principal_client_id)
    uv run --python 3.12 python scripts/setup_memory_store.py "$SP" \
        --memory-store workspace.default.firefly_managed_memory --profile <profile>

`--memory-store` defaults to $DATABRICKS_MEMORY_STORE (the value the app runs with).
"""

import argparse
import os
import sys

from databricks.sdk import WorkspaceClient
from databricks.sdk.errors import DatabricksError

MEMORY_STORE_API = "/api/2.1/unity-catalog/memory-stores"
PERMISSIONS_API = "/api/2.1/unity-catalog/permissions/memory_store"
PRIVILEGES = ["READ_MEMORY_STORE", "WRITE_MEMORY_STORE"]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create the UC memory store and grant the app SP READ/WRITE on it."
    )
    parser.add_argument(
        "sp_client_id",
        help="App service principal client ID (UUID). Get it via: "
        "databricks apps get <app> --output json | jq -r '.service_principal_client_id'",
    )
    parser.add_argument(
        "--memory-store",
        default=os.getenv("DATABRICKS_MEMORY_STORE"),
        help="Fully-qualified store name catalog.schema.name "
        "(default: DATABRICKS_MEMORY_STORE from env).",
    )
    parser.add_argument(
        "--profile",
        default=None,
        help="Databricks CLI profile to authenticate with (optional).",
    )
    args = parser.parse_args()

    if not args.memory_store or args.memory_store.count(".") != 2:
        print(
            "Error: --memory-store must be a fully-qualified catalog.schema.name "
            f"(got: {args.memory_store!r}). Set DATABRICKS_MEMORY_STORE or pass --memory-store.",
            file=sys.stderr,
        )
        sys.exit(1)

    catalog, schema, name = args.memory_store.split(".")
    w = WorkspaceClient(profile=args.profile) if args.profile else WorkspaceClient()

    # 1) Create the store (idempotent).
    print(f"==> Ensuring memory store {args.memory_store} exists")
    try:
        w.api_client.do(
            "POST",
            MEMORY_STORE_API,
            body={"catalog_name": catalog, "schema_name": schema, "name": name},
        )
        print("    created.")
    except DatabricksError as e:
        if getattr(e, "error_code", "") == "ALREADY_EXISTS" or "already exists" in str(e).lower():
            print("    already exists, skipping.")
        else:
            raise

    # 2) Grant the app SP READ + WRITE on the store.
    print(f"==> Granting {PRIVILEGES} to SP {args.sp_client_id}")
    w.api_client.do(
        "PATCH",
        f"{PERMISSIONS_API}/{args.memory_store}",
        body={"changes": [{"principal": args.sp_client_id, "add": PRIVILEGES}]},
    )

    # 3) Read back for confirmation.
    perms = w.api_client.do("GET", f"{PERMISSIONS_API}/{args.memory_store}")
    print(f"==> Current grants: {perms.get('privilege_assignments', [])}")
    print("==> Done. The agent's save_memory/get_memory tools can now persist per user.")


if __name__ == "__main__":
    main()
