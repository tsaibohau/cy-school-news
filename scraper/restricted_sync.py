#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Move the restricted-data blobs to and from the private Supabase bucket.

Talks to the Edge Function ``restricted-data-sync`` (contract: GET ?list=1,
GET ?name=, PUT ?name= with x-sha256, DELETE ?name=).  Standard library only.

  download --dest DIR     list, then fetch every object to DIR/<name>
  upload   --src DIR      PUT every *.gz that changed, then read every object back
                          and compare sha256; --prune also deletes remote objects
                          that no longer exist locally

Environment (the calling workflow sets it; values are never printed):
  ANNOUNCEMENT_CONTENT_SYNC_URL    URL of the announcement-content-sync function;
                                   the restricted-data-sync URL is derived from it
  ANNOUNCEMENT_CONTENT_SYNC_TOKEN  shared secret (header x-announcement-content-sync-token)
  SUPABASE_PUBLISHABLE_KEY         publishable key (header apikey)

Not configured: ``download`` prints RESTRICTED_SYNC_NOT_CONFIGURED and exits 0 (forks and
pull requests have no secrets); ``upload`` exits 1 (fail closed, never publish without the
private copy).  Object names contain school ids and the logs of a public repository are
public, so logs show an object only as obj#<hash prefix>.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

NAME_RE = re.compile(r"^[A-Za-z0-9._/-]{1,160}$")
MAX_OBJECT_BYTES = 8 * 1024 * 1024
FUNCTION_FROM = "announcement-content-sync"
FUNCTION_TO = "restricted-data-sync"
ATTEMPTS = 3
BACKOFF_SECONDS = (2, 5)


class SyncError(RuntimeError):
    pass


def tag(name: str) -> str:
    return "obj#" + hashlib.sha256(name.encode("utf-8")).hexdigest()[:8]


def valid_name(name: str) -> bool:
    return bool(NAME_RE.match(name)) and ".." not in name and not name.startswith("/")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class Config:
    def __init__(self, url: str, token: str, key: str):
        self.url, self.token, self.key = url, token, key

    @classmethod
    def from_env(cls, env=None):
        env = os.environ if env is None else env
        base = (env.get("ANNOUNCEMENT_CONTENT_SYNC_URL") or "").strip()
        token = env.get("ANNOUNCEMENT_CONTENT_SYNC_TOKEN") or ""
        key = env.get("SUPABASE_PUBLISHABLE_KEY") or ""
        if not (base and token and key):
            return None
        if FUNCTION_FROM not in base:
            raise SyncError(f"ANNOUNCEMENT_CONTENT_SYNC_URL does not contain '{FUNCTION_FROM}'")
        return cls(base.replace(FUNCTION_FROM, FUNCTION_TO), token, key)


class Client:
    def __init__(self, config: Config, sleep=time.sleep):
        self.config = config
        self.sleep = sleep
        host = urllib.parse.urlparse(config.url).hostname or ""
        if host in ("127.0.0.1", "localhost", "::1"):
            self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        else:
            self.opener = urllib.request.build_opener()

    def _headers(self, extra=None):
        headers = {"apikey": self.config.key, "x-announcement-content-sync-token": self.config.token,
                   "user-agent": "cy-school-news-restricted-sync/1"}
        headers.update(extra or {})
        return headers

    def request(self, method: str, query: dict, body: bytes | None = None, headers=None) -> bytes:
        url = self.config.url + ("&" if "?" in self.config.url else "?") + urllib.parse.urlencode(query)
        last = "unknown error"
        for attempt in range(ATTEMPTS):
            req = urllib.request.Request(url, data=body, method=method, headers=self._headers(headers))
            try:
                with self.opener.open(req, timeout=60) as response:
                    return response.read(MAX_OBJECT_BYTES + 1024)
            except urllib.error.HTTPError as exc:
                last = f"HTTP {exc.code}"
                if exc.code < 500 and exc.code != 429:
                    raise SyncError(f"{method} failed: {last}") from None
            except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as exc:
                last = exc.__class__.__name__
            if attempt < ATTEMPTS - 1:
                self.sleep(BACKOFF_SECONDS[min(attempt, len(BACKOFF_SECONDS) - 1)])
        raise SyncError(f"{method} failed after {ATTEMPTS} attempts: {last}")

    def list(self) -> dict[str, dict]:
        try:
            rows = json.loads(self.request("GET", {"list": "1"}).decode("utf-8"))
        except ValueError:
            raise SyncError("list returned invalid JSON") from None
        if not isinstance(rows, list):
            raise SyncError("list returned an unexpected shape")
        out = {}
        for row in rows:
            name = row.get("name") if isinstance(row, dict) else None
            if not isinstance(name, str) or not valid_name(name):
                raise SyncError("list contains an invalid object name")
            out[name] = row
        return out

    def get(self, name: str) -> bytes:
        return self.request("GET", {"name": name})

    def put(self, name: str, data: bytes) -> None:
        raw = self.request("PUT", {"name": name}, body=data,
                           headers={"content-type": "application/gzip", "x-sha256": sha256_hex(data)})
        try:
            reply = json.loads(raw.decode("utf-8"))
        except ValueError:
            raise SyncError(f"{tag(name)}: PUT reply is not JSON") from None
        if reply.get("sha256") and reply["sha256"] != sha256_hex(data):
            raise SyncError(f"{tag(name)}: server stored a different sha256")

    def delete(self, name: str) -> None:
        self.request("DELETE", {"name": name})


def cmd_download(client: Client, dest: Path) -> int:
    listing = client.list()
    dest.mkdir(parents=True, exist_ok=True)
    total = 0
    for name, row in sorted(listing.items()):
        data = client.get(name)
        if len(data) > MAX_OBJECT_BYTES:
            raise SyncError(f"{tag(name)}: object is larger than {MAX_OBJECT_BYTES} bytes")
        expected = row.get("sha256")
        if expected and sha256_hex(data) != expected:
            raise SyncError(f"{tag(name)}: downloaded bytes do not match the listed sha256")
        target = dest / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        total += len(data)
    print(f"restricted-sync download: {len(listing)} object(s), {total} bytes")
    return 0


def local_objects(src: Path) -> dict[str, bytes]:
    out = {}
    for path in sorted(src.rglob("*.gz")):
        if not path.is_file():
            continue
        name = path.relative_to(src).as_posix()
        if not valid_name(name):
            raise SyncError(f"{tag(name)}: invalid object name")
        data = path.read_bytes()
        if len(data) > MAX_OBJECT_BYTES:
            raise SyncError(f"{tag(name)}: object is larger than {MAX_OBJECT_BYTES} bytes")
        out[name] = data
    return out


def cmd_upload(client: Client, src: Path, prune: bool) -> int:
    objects = local_objects(src)
    if not objects:
        raise SyncError("no *.gz objects to upload (refusing to continue)")
    remote = client.list()
    uploaded = skipped = 0
    for name, data in objects.items():
        digest = sha256_hex(data)
        if remote.get(name, {}).get("sha256") == digest:
            skipped += 1
            continue
        client.put(name, data)
        uploaded += 1
    # Read everything back: fresh listing for all, a full GET for what was just written.
    after = client.list()
    for name, data in objects.items():
        digest = sha256_hex(data)
        if after.get(name, {}).get("sha256") != digest:
            raise SyncError(f"{tag(name)}: read-back sha256 mismatch or object missing")
    for name, data in objects.items():
        if remote.get(name, {}).get("sha256") != sha256_hex(data):
            if sha256_hex(client.get(name)) != sha256_hex(data):
                raise SyncError(f"{tag(name)}: downloaded copy differs from what was uploaded")
    pruned = 0
    if prune:
        for name in sorted(set(after) - set(objects)):
            client.delete(name)
            pruned += 1
    print(f"restricted-sync upload: {len(objects)} object(s) verified "
          f"({uploaded} uploaded, {skipped} unchanged, {pruned} pruned)")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("download")
    p.add_argument("--dest", required=True)
    p = sub.add_parser("upload")
    p.add_argument("--src", required=True)
    p.add_argument("--prune", action="store_true")
    args = parser.parse_args(argv)
    try:
        config = Config.from_env()
        if config is None:
            if args.cmd == "download":
                print("RESTRICTED_SYNC_NOT_CONFIGURED")
                return 0
            print("restricted-sync: RESTRICTED_SYNC_NOT_CONFIGURED, refusing to publish without the private copy",
                  file=sys.stderr)
            return 1
        client = Client(config)
        if args.cmd == "download":
            return cmd_download(client, Path(args.dest))
        return cmd_upload(client, Path(args.src), args.prune)
    except SyncError as exc:
        print(f"restricted-sync: ERROR {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
