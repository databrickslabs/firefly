#!/usr/bin/env python3
# Single-file bootstrapper: download & run code-server on PORT with base path (/api), block until it exits.

import os
import sys
import signal
import tarfile
import zipfile
import shutil
import stat
import json
import time
import tempfile
import platform
import subprocess
import urllib.request
from pathlib import Path

GITHUB_API_LATEST = "https://api.github.com/repos/coder/code-server/releases/latest"

# Default environment variables for code-server
DEFAULT_ENV = {
    "SHELL": "/usr/bin/bash",
}

# Extensions to pre-install grouped by category
EXTENSIONS = [
    # Python
    "ms-python.python",
    "ms-python.pyright",
    # Jupyter
    "ms-toolsai.jupyter",
    "ms-toolsai.jupyter-renderers",
    # Databricks
    "databricks.databricks",
    # Claude Code
    "anthropic.claude-code"
]

# NPM packages to pre-install globally
NPM_PACKAGES = [
    "@anthropic-ai/claude-code",
]

# This will be set to the temp directory in main() before any functions use it
HOME_DIR: Path = None

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
    "code-server-", ".code-server",
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

def sys_arch():
    osname = platform.system().lower()  # linux, darwin, windows
    mach = platform.machine().lower()
    if mach in ("x86_64", "amd64"):
        arch = "amd64"
    elif mach in ("aarch64", "arm64"):
        arch = "arm64"
    elif mach.startswith("arm"):
        arch = "arm64"
    else:
        arch = mach  # best-effort
    if osname == "darwin":
        osname = "macos"
    return osname, arch

def http_get(url, headers=None, retries=3, backoff=1.0):
    last = None
    for _ in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers or {"User-Agent": "code-server-bootstrap/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception as e:
            last = e
            time.sleep(backoff)
            backoff *= 2
    raise last

def pick_asset_from_release(release, osname, arch, version_override=None):
    assets = release.get("assets", [])
    patterns = []
    if osname == "linux":
        patterns = [f"linux-{arch}.tar.gz"]
    elif osname == "macos":
        patterns = ["macos-universal.tar.gz", f"macos-{arch}.tar.gz"]
    elif osname == "windows":
        patterns = ["windows-amd64.zip", "windows-x64.zip"]
    named = []
    for a in assets:
        n = a.get("name", "")
        if not n.startswith("code-server-"):
            continue
        if version_override and (f"code-server-{version_override}-" not in n):
            continue
        if any(n.endswith(p) for p in patterns):
            named.append((n, a.get("browser_download_url")))
    if not named:
        for a in assets:
            n = a.get("name", "")
            if osname in n and arch in n:
                named.append((n, a.get("browser_download_url")))
    if not named:
        raise RuntimeError(f"No suitable code-server asset found for {osname}-{arch}.")
    return named[0]

def download_to(url, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "code-server-bootstrap/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f)

def extract_archive(archive: Path, outdir: Path) -> Path:
    outdir.mkdir(parents=True, exist_ok=True)
    if archive.suffixes[-2:] == [".tar", ".gz"]:
        with tarfile.open(archive, "r:gz") as tar:
            tar.extractall(outdir)
    elif archive.suffix == ".zip":
        with zipfile.ZipFile(archive) as z:
            z.extractall(outdir)
    else:
        raise RuntimeError(f"Unknown archive type: {archive.name}")
    for p in outdir.iterdir():
        if p.is_dir() and p.name.startswith("code-server-"):
            return p
    raise RuntimeError("Extracted folder not found.")

def find_binary(root: Path) -> Path:
    candidates = [
        root / "bin" / "code-server",
        root / "bin" / "code-server.exe",
        root / "code-server",
        root / "code-server.exe",
    ]
    for c in candidates:
        if c.exists():
            return c
    raise RuntimeError("code-server binary not found in archive.")

def ensure_exec(p: Path):
    try:
        p.chmod(p.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    except Exception:
        pass

def ensure_bashrc_uv_env():
    """Ensure .bashrc exists and contains the uv env source line."""
    bashrc = HOME_DIR / ".bashrc"
    uv_env_line = '. "$HOME/.local/bin/env"'

    # Create .bashrc if it doesn't exist
    if not bashrc.exists():
        bashrc.touch()
        print(f"  Created {bashrc}")

    # Check if the line already exists
    content = bashrc.read_text()
    if uv_env_line not in content:
        # Append newline, the env line, and another newline
        with open(bashrc, "a") as f:
            f.write(f"\n{uv_env_line}\n")
        print(f"  Added uv env source line to {bashrc}")
    else:
        print(f"  uv env source line already exists in {bashrc}")

def install_uv():
    """Pre-install uv package manager."""
    print("Installing uv...")
    try:
        # Set HOME so uv installs to our temp directory
        env = os.environ.copy()
        env["HOME"] = str(HOME_DIR)
        result = subprocess.run(
            ["sh", "-c", "curl -LsSf https://astral.sh/uv/install.sh | sh"],
            capture_output=True,
            text=True,
            timeout=300,
            env=env,
        )
        if result.returncode == 0:
            print("  Successfully installed uv")
            # Ensure .bashrc has the uv env source line
            ensure_bashrc_uv_env()
        else:
            print(f"  Warning: Failed to install uv: {result.stderr}")
    except subprocess.TimeoutExpired:
        print("  Warning: Timeout installing uv")
    except Exception as e:
        print(f"  Warning: Error installing uv: {e}")

def ensure_bashrc_npm_path():
    """Ensure .bashrc contains the npm local bin path."""
    bashrc = HOME_DIR / ".bashrc"
    npm_path_line = 'export PATH="$HOME/.local/bin:$PATH"'

    # Create .bashrc if it doesn't exist
    if not bashrc.exists():
        bashrc.touch()
        print(f"  Created {bashrc}")

    # Check if the line already exists
    content = bashrc.read_text()
    if npm_path_line not in content:
        # Append newline, the path line, and another newline
        with open(bashrc, "a") as f:
            f.write(f"\n{npm_path_line}\n")
        print(f"  Added npm local bin path to {bashrc}")
    else:
        print(f"  npm local bin path already exists in {bashrc}")

def install_npm_packages():
    """Pre-install npm packages to user's local directory."""
    if not NPM_PACKAGES:
        return

    npm_prefix = HOME_DIR / ".local"
    npm_prefix.mkdir(parents=True, exist_ok=True)

    print(f"Installing {len(NPM_PACKAGES)} npm packages to {npm_prefix}...")
    for pkg in NPM_PACKAGES:
        print(f"  Installing npm package: {pkg}")
        try:
            result = subprocess.run(
                ["npm", "install", "-g", f"--prefix={npm_prefix}", pkg],
                capture_output=True,
                text=True,
                timeout=600,  # 10 minute timeout per package
            )
            if result.returncode == 0:
                print(f"    Successfully installed {pkg}")
                # Ensure .bashrc has the npm local bin path
                ensure_bashrc_npm_path()
            else:
                print(f"    Warning: Failed to install {pkg}: {result.stderr}")
        except subprocess.TimeoutExpired:
            print(f"    Warning: Timeout installing {pkg}")
        except Exception as e:
            print(f"    Warning: Error installing {pkg}: {e}")

    print("NPM package installation complete.")

def install_extensions(binary: Path, data_dir: Path, tmp: Path):
    """Pre-install extensions before starting the server."""
    if not EXTENSIONS:
        return

    # Set XDG_DATA_HOME to use our temp directory for code-server data
    env = os.environ.copy()
    env["XDG_DATA_HOME"] = str(tmp)
    env.setdefault("HOME", str(tmp))

    extensions_dir = data_dir / "extensions"
    user_data_dir = data_dir / "user-data"

    print(f"Installing {len(EXTENSIONS)} extensions...")
    for ext_id in EXTENSIONS:
        print(f"  Installing extension: {ext_id}")
        try:
            result = subprocess.run(
                [
                    str(binary),
                    "--install-extension", ext_id,
                    "--extensions-dir", str(extensions_dir),
                    "--user-data-dir", str(user_data_dir),
                ],
                env=env,
                capture_output=True,
                text=True,
                timeout=300,  # 5 minute timeout per extension
            )
            if result.returncode == 0:
                print(f"    Successfully installed {ext_id}")
            else:
                print(f"    Warning: Failed to install {ext_id}: {result.stderr}")
        except subprocess.TimeoutExpired:
            print(f"    Warning: Timeout installing {ext_id}")
        except Exception as e:
            print(f"    Warning: Error installing {ext_id}: {e}")

    print("Extension installation complete.")

def databricks_initial_download_sync(volume_path: str, local_path: Path):
    """One-time recursive copy from volume to local workspace directory using databricks fs cp."""
    cmd = ["databricks", "fs", "cp", f"dbfs:{volume_path}", str(local_path), "-r", "--overwrite"]
    print(f"Initial download sync: dbfs:{volume_path} -> {local_path}")
    print(f"  Running command: {' '.join(cmd)}")
    env = os.environ.copy()
    env["HOME"] = str(HOME_DIR)
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600, env=env)
        if result.returncode == 0:
            print("  Initial download sync completed successfully")
            if result.stdout:
                print(f"  stdout: {result.stdout}")
        else:
            print(f"  Warning: Initial download sync failed (exit code {result.returncode})")
            if result.stderr:
                print(f"  stderr: {result.stderr}")
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
        # Try pip3 as fallback
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
    # Map Firefly SPN credentials to standard Databricks SDK env vars
    if os.environ.get("FIREFLY_DATABRICKS_CLIENT_ID"):
        os.environ["DATABRICKS_CLIENT_ID"] = os.environ["FIREFLY_DATABRICKS_CLIENT_ID"]
    if os.environ.get("FIREFLY_DATABRICKS_CLIENT_SECRET"):
        os.environ["DATABRICKS_CLIENT_SECRET"] = os.environ["FIREFLY_DATABRICKS_CLIENT_SECRET"]
    if os.environ.get("FIREFLY_DATABRICKS_TOKEN"):
        os.environ["DATABRICKS_TOKEN"] = os.environ["FIREFLY_DATABRICKS_TOKEN"]

    port = os.getenv("PORT", "8080")
    base_path = os.getenv("CODE_SERVER_BASE_PATH", "/api")
    version_env = os.getenv("CODE_SERVER_VERSION", "").lstrip("v")  # e.g. "4.104.1" or "v4.104.1"
    osname, arch = sys_arch()

    # Resolve asset URL
    if version_env:
        tag = f"v{version_env}"
        try:
            rel = json.loads(http_get(f"https://api.github.com/repos/coder/code-server/releases/tags/{tag}").decode("utf-8"))
            name, url = pick_asset_from_release(rel, osname, arch, version_override=version_env)
        except Exception:
            suffix = (
                f"linux-{arch}.tar.gz" if osname == "linux"
                else "macos-universal.tar.gz" if osname == "macos"
                else "windows-amd64.zip"
            )
            name = f"code-server-{version_env}-{suffix}"
            url = f"https://github.com/coder/code-server/releases/download/v{version_env}/{name}"
    else:
        rel = json.loads(http_get(GITHUB_API_LATEST).decode("utf-8"))
        name, url = pick_asset_from_release(rel, osname, arch)

    tmp = Path("/tmp/code-server/workspace")
    tmp.mkdir(parents=True, exist_ok=True)

    # Set HOME_DIR globally so all functions use the same directory
    global HOME_DIR
    HOME_DIR = tmp

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

    backup_volume_path = os.getenv("BACKUP_VOLUME_PATH")
    backup_proc = None

    # Install code-server
    archive = tmp / name
    download_to(url, archive)
    extracted = extract_archive(archive, tmp)
    binary = find_binary(extracted)
    if platform.system().lower() != "windows":
        ensure_exec(binary)

    data_dir = tmp / "data"
    (data_dir / "user-data").mkdir(parents=True, exist_ok=True)
    (data_dir / "extensions").mkdir(parents=True, exist_ok=True)

    # Pre-install uv package manager
    install_uv()

    # Pre-install npm packages
    install_npm_packages()

    # Pre-install extensions before starting the server
    install_extensions(binary, data_dir, tmp)

    # After all installations: download user files from volume, then start watcher
    if backup_volume_path:
        databricks_initial_download_sync(backup_volume_path, tmp)
        backup_proc = databricks_volume_backup(tmp, backup_volume_path)
    else:
        print("BACKUP_VOLUME_PATH not set, skipping volume sync")

    env = os.environ.copy()
    env.setdefault("HOME", str(tmp))
    # Apply default environment variables
    for key, value in DEFAULT_ENV.items():
        env.setdefault(key, value)

    # Anthropic / Claude Code environment variables
    env["ANTHROPIC_MODEL"] = "databricks-claude-opus-4-6"
    env["ANTHROPIC_BASE_URL"] = "https://dbc-acc143fd-4ea9.cloud.databricks.com/serving-endpoints/anthropic"
    env["ANTHROPIC_AUTH_TOKEN"] = os.environ.get("FIREFLY_DATABRICKS_TOKEN", "")
    env["ANTHROPIC_DEFAULT_OPUS_MODEL"] = "databricks-claude-opus-4-6"
    env["ANTHROPIC_DEFAULT_SONNET_MODEL"] = "databricks-claude-sonnet-4-5"
    env["ANTHROPIC_CUSTOM_HEADERS"] = "x-databricks-use-coding-agent-mode: true"
    env["CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS"] = "1"

    args = [
        str(binary),
        "--bind-addr", f"0.0.0.0:{port}",
        "--auth", "none",
        "--abs-proxy-base-path", base_path,
        "--user-data-dir", str(data_dir / "user-data"),
        "--extensions-dir", str(data_dir / "extensions"),
    ]

    proc = subprocess.Popen(args, env=env)

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
        print(f"code-server exited with status {code}")
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
