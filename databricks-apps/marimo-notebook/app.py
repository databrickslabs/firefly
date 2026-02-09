#!/usr/bin/env python3
# Single-file bootstrapper: install uv, init project, add marimo[recommended], and run marimo edit

import os
import sys
import signal
import subprocess
import tempfile
from pathlib import Path

# These will be set in main() before any functions use them
HOME_DIR: Path = None
WORKSPACE_DIR: Path = None

VOLUME_WATCHER_SCRIPT = '''\
#!/usr/bin/env python3
"""Watchdog-based file watcher that syncs local changes to a Databricks Volume."""
import os
import sys
import signal
import subprocess
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

LOCAL_PATH = Path(sys.argv[1])
VOLUME_PATH = sys.argv[2]
HOME_DIR = sys.argv[3]

IGNORE_PATTERNS = {
    "__pycache__", ".pyc", ".git", ".venv", "node_modules",
    ".uv", ".mypy_cache", ".pytest_cache", ".ruff_cache",
    "__marimo__",
}

executor = ThreadPoolExecutor(max_workers=8)


def should_ignore(path_str):
    try:
        rel = Path(path_str).relative_to(LOCAL_PATH)
    except ValueError:
        return False
    parts = rel.parts
    for part in parts:
        if part in IGNORE_PATTERNS or part.endswith(".pyc") or part.endswith(".lock"):
            return True
        for pattern in IGNORE_PATTERNS:
            if part.startswith(pattern):
                return True
    return False


def get_env():
    env = os.environ.copy()
    env["HOME"] = HOME_DIR
    return env


def upload_file(src_path):
    if should_ignore(src_path):
        return
    if not Path(src_path).is_file():
        return
    rel = Path(src_path).relative_to(LOCAL_PATH)
    remote = f"dbfs:{VOLUME_PATH}/{rel}"
    remote_dir = f"dbfs:{VOLUME_PATH}/{rel.parent}"
    # Ensure parent directory exists in volume
    if str(rel.parent) != ".":
        mkdir_cmd = ["databricks", "fs", "mkdir", remote_dir]
        try:
            subprocess.run(mkdir_cmd, capture_output=True, text=True, timeout=30, env=get_env())
        except Exception:
            pass
    cmd = ["databricks", "fs", "cp", str(src_path), remote, "--overwrite"]
    print(f"UPLOAD: {rel} -> {remote}", flush=True)
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60, env=get_env())
        if result.returncode != 0:
            print(f"  Warning: cp failed: {result.stderr}", flush=True)
    except Exception as e:
        print(f"  Warning: cp error: {e}", flush=True)


def delete_file(src_path):
    if should_ignore(src_path):
        return
    rel = Path(src_path).relative_to(LOCAL_PATH)
    remote = f"dbfs:{VOLUME_PATH}/{rel}"
    cmd = ["databricks", "fs", "rm", remote]
    print(f"DELETE: {rel} -> {remote}", flush=True)
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60, env=get_env())
        if result.returncode != 0:
            print(f"  Warning: rm failed: {result.stderr}", flush=True)
    except Exception as e:
        print(f"  Warning: rm error: {e}", flush=True)


class VolumeBackupHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return
        executor.submit(upload_file, event.src_path)

    def on_modified(self, event):
        if event.is_directory:
            return
        executor.submit(upload_file, event.src_path)

    def on_deleted(self, event):
        if event.is_directory:
            return
        executor.submit(delete_file, event.src_path)

    def on_moved(self, event):
        if event.is_directory:
            return
        executor.submit(delete_file, event.src_path)
        executor.submit(upload_file, event.dest_path)


observer = Observer()
observer.schedule(VolumeBackupHandler(), str(LOCAL_PATH), recursive=True)
observer.start()
print(f"Volume watcher started: {LOCAL_PATH} -> dbfs:{VOLUME_PATH}", flush=True)

def _shutdown(signum, frame):
    print(f"Watcher received signal {signum}, stopping...", flush=True)
    observer.stop()
    executor.shutdown(wait=False)

signal.signal(signal.SIGTERM, _shutdown)

try:
    while observer.is_alive():
        observer.join(timeout=1)
except KeyboardInterrupt:
    observer.stop()
executor.shutdown(wait=False)
observer.join()
'''


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
    """Initialize uv project in workspace directory (skips if already initialized)."""
    pyproject = WORKSPACE_DIR / "pyproject.toml"
    if pyproject.exists():
        print(f"uv project already initialized in {WORKSPACE_DIR} (pyproject.toml exists), skipping init")
        return True

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


def databricks_initial_download_sync(volume_path: str, local_path: Path):
    """One-time recursive copy from volume to local workspace directory using databricks fs cp."""
    cmd = ["databricks", "fs", "cp", f"dbfs:{volume_path}", str(local_path), "-r", "--overwrite"]
    print(f"Initial download sync: {volume_path} -> {local_path}")
    print(f"  Running command: {' '.join(cmd)}")
    env = os.environ.copy()
    env["HOME"] = str(HOME_DIR)
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,  # 10 minute timeout for initial sync
            env=env,
        )
        if result.returncode == 0:
            print("  Initial download sync completed successfully")
            if result.stdout:
                print(f"  stdout: {result.stdout}")
        else:
            print(f"  Warning: Initial download sync failed (exit code {result.returncode})")
            if result.stderr:
                print(f"  stderr: {result.stderr}")
            if result.stdout:
                print(f"  stdout: {result.stdout}")
    except subprocess.TimeoutExpired:
        print("  Warning: Initial download sync timed out")
    except Exception as e:
        print(f"  Warning: Error during initial download sync: {e}")

def databricks_volume_backup(local_path: Path, volume_path: str) -> subprocess.Popen:
    """Start a background watchdog process to continuously sync local changes to volume."""
    # Install watchdog in the parent process first
    print("Installing watchdog for volume backup watcher...")
    env = os.environ.copy()
    env["HOME"] = str(HOME_DIR)
    install_result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "-q", "watchdog"],
        capture_output=True, text=True, timeout=120, env=env,
    )
    if install_result.returncode != 0:
        print(f"  Warning: Failed to install watchdog: {install_result.stderr}")
        install_result = subprocess.run(
            ["pip3", "install", "-q", "watchdog"],
            capture_output=True, text=True, timeout=120, env=env,
        )
        if install_result.returncode != 0:
            print(f"  Warning: pip3 fallback also failed: {install_result.stderr}")
            return None
    print("  watchdog installed successfully")

    # Write the watcher script to a temp file
    watcher_script = HOME_DIR / "volume_watcher.py"
    watcher_script.write_text(VOLUME_WATCHER_SCRIPT)

    cmd = [sys.executable, str(watcher_script), str(local_path), volume_path, str(HOME_DIR)]
    print(f"Starting volume backup watcher: {local_path} -> dbfs:{volume_path}")
    print(f"  Running command: {' '.join(cmd)}")
    try:
        proc = subprocess.Popen(
            cmd,
            env=env,
        )
        print(f"  Volume backup watcher started (PID: {proc.pid})")
        return proc
    except Exception as e:
        print(f"  Warning: Failed to start volume backup watcher: {e}")
        return None

def main():
    global HOME_DIR, WORKSPACE_DIR

    # Map Firefly SPN credentials to standard Databricks SDK env vars
    if os.environ.get("FIREFLY_DATABRICKS_CLIENT_ID"):
        os.environ["DATABRICKS_CLIENT_ID"] = os.environ["FIREFLY_DATABRICKS_CLIENT_ID"]
    if os.environ.get("FIREFLY_DATABRICKS_CLIENT_SECRET"):
        os.environ["DATABRICKS_CLIENT_SECRET"] = os.environ["FIREFLY_DATABRICKS_CLIENT_SECRET"]
    if os.environ.get("FIREFLY_DATABRICKS_TOKEN"):
        os.environ["DATABRICKS_TOKEN"] = os.environ["FIREFLY_DATABRICKS_TOKEN"]

    # Create a temp directory to use as our base (similar to code-editor approach)
    tmp = Path(tempfile.mkdtemp(prefix="marimo-"))
    HOME_DIR = tmp
    WORKSPACE_DIR = tmp / "workspace"

    port = os.environ.get("PORT", "8080")

    # Create ~/.databrickscfg for the databricks CLI
    host = os.environ.get("DATABRICKS_HOST", "")
    token = os.environ.get("DATABRICKS_TOKEN", "")
    if host:
        if not host.startswith("https://"):
            host = f"https://{host}"
        cfg_path = tmp / ".databrickscfg"
        if token:
            cfg_path.write_text(
                f"[DEFAULT]\nhost = {host}\ntoken = {token}\n"
            )
            print(f"Created {cfg_path} with DEFAULT profile (token auth)")
        else:
            print("Warning: No DATABRICKS_TOKEN available for .databrickscfg")
    else:
        print("Warning: DATABRICKS_HOST not set, skipping .databrickscfg")

    # Ensure workspace directory exists
    WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Temp directory: {tmp}")
    print(f"Workspace directory ready: {WORKSPACE_DIR}")

    # Sync from volume to local workspace (initial download) - do this first
    backup_volume_path = os.environ.get("BACKUP_VOLUME_PATH")
    backup_proc = None
    if backup_volume_path:
        databricks_initial_download_sync(backup_volume_path, WORKSPACE_DIR)
        backup_proc = databricks_volume_backup(WORKSPACE_DIR, backup_volume_path)
    else:
        print("BACKUP_VOLUME_PATH not set, skipping volume sync")

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

    def shutdown(signum, frame):
        print(f"Received signal {signum}, shutting down...")
        try:
            proc.terminate()
        except Exception:
            pass
        if backup_proc:
            try:
                backup_proc.terminate()
            except Exception:
                pass
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.kill()
        if backup_proc:
            try:
                backup_proc.wait(timeout=3)
            except Exception:
                backup_proc.kill()
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)

    try:
        code = proc.wait()
        print(f"marimo exited with status {code}")
        if backup_proc:
            try:
                backup_proc.terminate()
                backup_proc.wait(timeout=5)
            except Exception:
                pass
        sys.exit(code)
    except KeyboardInterrupt:
        shutdown(signal.SIGINT, None)


if __name__ == "__main__":
    main()
