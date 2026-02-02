#!/usr/bin/env python3
# Single-file bootstrapper: install uv, init project, add marimo[recommended], and run marimo edit

import os
import sys
import subprocess
import tempfile
from pathlib import Path

# These will be set in main() before any functions use them
HOME_DIR: Path = None
WORKSPACE_DIR: Path = None


def run_command(args, env=None, cwd=None, timeout=300):
    """Run a command and return success status."""
    try:
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
            cwd=cwd,
        )
        if result.returncode == 0:
            return True, result.stdout
        else:
            return False, result.stderr
    except subprocess.TimeoutExpired:
        return False, "Command timed out"
    except Exception as e:
        return False, str(e)


def install_uv():
    """Install uv package manager."""
    print("Installing uv...")
    env = os.environ.copy()
    env["HOME"] = str(HOME_DIR)
    success, output = run_command(
        ["sh", "-c", "curl -LsSf https://astral.sh/uv/install.sh | sh"],
        env=env,
    )
    if success:
        print("  Successfully installed uv")
    else:
        print(f"  Failed to install uv: {output}")
    return success


def get_uv_path() -> Path:
    """Get the path to the uv binary."""
    return HOME_DIR / ".local" / "bin" / "uv"


def uv_init():
    """Initialize uv project in workspace directory."""
    print(f"Initializing uv project in {WORKSPACE_DIR}...")
    uv_path = get_uv_path()
    env = os.environ.copy()
    env["HOME"] = str(HOME_DIR)

    success, output = run_command(
        [str(uv_path), "init"],
        env=env,
        cwd=str(WORKSPACE_DIR),
    )
    if success:
        print("  Successfully initialized uv project")
    else:
        print(f"  Failed to initialize uv project: {output}")
    return success


def uv_add_marimo():
    """Add marimo[recommended] to the project."""
    print("Adding marimo[recommended]...")
    uv_path = get_uv_path()
    env = os.environ.copy()
    env["HOME"] = str(HOME_DIR)

    success, output = run_command(
        [str(uv_path), "add", "marimo[recommended]"],
        env=env,
        cwd=str(WORKSPACE_DIR),
        timeout=600,
    )
    if success:
        print("  Successfully added marimo[recommended]")
    else:
        print(f"  Failed to add marimo: {output}")
    return success


def uv_sync():
    """Sync uv project dependencies."""
    print("Syncing dependencies...")
    uv_path = get_uv_path()
    env = os.environ.copy()
    env["HOME"] = str(HOME_DIR)

    success, output = run_command(
        [str(uv_path), "sync"],
        env=env,
        cwd=str(WORKSPACE_DIR),
        timeout=600,
    )
    if success:
        print("  Successfully synced dependencies")
    else:
        print(f"  Failed to sync: {output}")
    return success


def main():
    global HOME_DIR, WORKSPACE_DIR

    # Create a temp directory to use as our base (similar to code-editor approach)
    tmp = Path(tempfile.mkdtemp(prefix="marimo-"))
    HOME_DIR = tmp
    WORKSPACE_DIR = tmp / "workspace"

    port = os.environ.get("PORT", "8080")

    # Ensure workspace directory exists
    WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Temp directory: {tmp}")
    print(f"Workspace directory ready: {WORKSPACE_DIR}")

    # Install uv
    if not install_uv():
        print("Failed to install uv, exiting.")
        sys.exit(1)

    uv_path = get_uv_path()
    if not uv_path.exists():
        print(f"Error: uv not found at {uv_path}")
        sys.exit(1)

    # Initialize uv project
    if not uv_init():
        print("Failed to initialize uv project, exiting.")
        sys.exit(1)

    # Add marimo[recommended]
    if not uv_add_marimo():
        print("Failed to add marimo, exiting.")
        sys.exit(1)

    # Sync dependencies
    if not uv_sync():
        print("Failed to sync dependencies, exiting.")
        sys.exit(1)

    # Prepare environment
    env = os.environ.copy()
    env["HOME"] = str(HOME_DIR)

    # Build marimo command using uv run
    args = [
        str(uv_path),
        "run",
        "marimo",
        "edit",
        "--host", "0.0.0.0",
        "--port", port,
        "--allow-origins", "*",
        "--no-token",
    ]

    print(f"Starting marimo on port {port}...")
    print(f"Command: {' '.join(args)}")

    # Run marimo from workspace directory
    proc = subprocess.Popen(args, env=env, cwd=str(WORKSPACE_DIR))
    try:
        code = proc.wait()
        print(f"marimo exited with status {code}")
        sys.exit(code)
    except KeyboardInterrupt:
        try:
            proc.terminate()
        except Exception:
            pass
        proc.wait()
        sys.exit(130)


if __name__ == "__main__":
    main()
