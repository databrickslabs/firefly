#!/usr/bin/env python3
# Single-file bootstrapper: download & run code-server on PORT with base path (/api), block until it exits.

import os
import sys
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
]

# NPM packages to pre-install globally
NPM_PACKAGES = [
    "@anthropic-ai/claude-code",
]

# This will be set to the temp directory in main() before any functions use it
HOME_DIR: Path = None

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

def main():
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

    tmp = Path(tempfile.mkdtemp(prefix="code-server-"))

    # Set HOME_DIR globally so all functions use the same temp directory
    global HOME_DIR
    HOME_DIR = tmp

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

    env = os.environ.copy()
    env.setdefault("HOME", str(tmp))
    # Apply default environment variables
    for key, value in DEFAULT_ENV.items():
        env.setdefault(key, value)

    args = [
        str(binary),
        "--bind-addr", f"0.0.0.0:{port}",
        "--auth", "none",
        "--abs-proxy-base-path", base_path,
        "--user-data-dir", str(data_dir / "user-data"),
        "--extensions-dir", str(data_dir / "extensions"),
    ]

    proc = subprocess.Popen(args, env=env)
    try:
        code = proc.wait()
        print(f"code-server exited with status {code}")
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
