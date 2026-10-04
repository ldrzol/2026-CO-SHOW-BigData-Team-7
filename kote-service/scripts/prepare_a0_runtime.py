"""Restore the six pinned A0 assets. Standard library only; never overwrite assets."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import sys
import tempfile
from urllib.request import Request, urlopen

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MANIFEST = PROJECT_ROOT / "reports/team_kote_setup_v0_1/RUNTIME_DOWNLOAD_MANIFEST.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def asset_path(root: Path, relative: str) -> Path:
    parts = PurePosixPath(relative)
    if parts.is_absolute() or ".." in parts.parts or "\\" in relative or ":" in relative:
        raise ValueError(f"Unsafe asset path: {relative}")
    target = root.joinpath(*parts.parts)
    target.resolve().relative_to(root.resolve())
    return target


def verify(path: Path, asset: dict) -> None:
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"Not a regular asset file: {path}")
    if path.stat().st_size != asset["size_bytes"]:
        raise ValueError(f"Size mismatch: {path}; expected {asset['size_bytes']}, "
                         f"got {path.stat().st_size}; existing file was NOT changed")
    if sha256(path) != asset["sha256"].upper():
        raise ValueError(f"SHA256 mismatch: {path}; existing file was NOT changed")


def download(asset: dict, target: Path, opener=urlopen) -> None:
    """Verify an owned temporary file before publication; keep existing files intact."""
    if not asset["url"].startswith("https://huggingface.co/"):
        raise ValueError("Only pinned HTTPS Hugging Face source URLs are allowed")
    transform = asset.get("transform", "none")
    if transform not in ("none", "lf_to_crlf"):
        raise ValueError(f"Unsupported transform: {transform}")
    remote = {"size_bytes": asset.get("download_size_bytes", asset["size_bytes"]),
              "sha256": asset.get("download_sha256", asset["sha256"])}
    if transform != "none" and remote["size_bytes"] > 1024 * 1024:
        raise ValueError("Text transformation only supports small label files")
    if target.exists() or target.is_symlink():
        verify(target, asset)
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".a0-download-", suffix=".part",
                                         dir=target.parent, delete=False) as output:
            temporary = Path(output.name)
            request = Request(asset["url"], headers={"User-Agent": "bitduli-a0-setup/0.1"})
            received = 0
            with opener(request, timeout=60) as response:
                for chunk in iter(lambda: response.read(1024 * 1024), b""):
                    received += len(chunk)
                    if received > remote["size_bytes"]:
                        raise ValueError(f"Download exceeds expected size: {target.name}")
                    output.write(chunk)
            output.flush()
            os.fsync(output.fileno())
        verify(temporary, remote)
        if transform == "lf_to_crlf":
            original = temporary.read_bytes()
            if b"\r" in original:
                raise ValueError("Expected LF-only source before line-ending restoration")
            temporary.write_bytes(original.replace(b"\n", b"\r\n"))
        verify(temporary, asset)
        # link is atomic and refuses an existing destination, including a race.
        # Both files reside in the same directory/filesystem (NTFS/ext4 supported).
        try:
            os.link(temporary, target)
        except FileExistsError:
            verify(target, asset)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def prepare(root: Path, assets: list[dict], allow_download: bool, opener=urlopen) -> list[dict]:
    missing = []
    statuses = []
    # Check ALL existing files before downloading anything.
    for asset in assets:
        target = asset_path(root, asset["path"])
        if target.exists() or target.is_symlink():
            verify(target, asset)
            statuses.append({"path": asset["path"], "status": "verified_existing"})
        else:
            missing.append((asset, target))
    total = sum(asset.get("download_size_bytes", asset["size_bytes"]) for asset, _ in missing)
    print(f"Missing: {len(missing)} file(s), {total:,} bytes ({total / 1024**2:.2f} MiB)")
    for asset, target in missing:
        if allow_download:
            print(f"Downloading {asset['path']}", flush=True)
            download(asset, target, opener)
            statuses.append({"path": asset["path"], "status": "downloaded_verified"})
        else:
            statuses.append({"path": asset["path"], "status": "missing"})
    return statuses


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="Offline verification (default)")
    mode.add_argument("--download", action="store_true", help="Download only missing assets")
    parser.add_argument("--asset-root", type=Path, default=PROJECT_ROOT,
                        help="Default: repository root; alternate root requires inference path flags")
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    # Frozen Python code is shared via Git, never downloaded or repaired here.
    for item in manifest["repository_files"]:
        verify(asset_path(PROJECT_ROOT, item["path"]), item)
    statuses = prepare(args.asset_root, manifest["assets"], args.download)
    for item in statuses:
        print(f"{item['status']}: {item['path']}")
    if any(item["status"] == "missing" for item in statuses):
        print("Assets missing. Use --download to restore them.", file=sys.stderr)
        return 1
    print("PASS: all six pinned assets and frozen evaluator verified. No inference was run.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        print("No existing asset was overwritten. Fix the cause and rerun; verified files are reused.",
              file=sys.stderr)
        raise SystemExit(2)
