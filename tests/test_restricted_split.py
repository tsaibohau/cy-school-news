# -*- coding: utf-8 -*-
"""Tests for scraper/restricted_split.py, scraper/restricted_sync.py and the workflow wiring.

(a) synthetic three-school tree (made-up data), (b) round trip on temp copies of the real tree
(skipped when the tree no longer holds other schools' data), (c) workflow files.
Run: python tests/test_restricted_split.py
"""
import copy
import gzip
import hashlib
import http.server
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))
import restricted_split as rs  # noqa: E402
import restricted_sync as sync  # noqa: E402

RULES = json.loads((ROOT / "docs/restricted-files.json").read_text(encoding="utf-8"))

REGISTRY_JS = """var schools = [
    { id: "cysh", county: "A", site: "https://www.cysh.cy.edu.tw/", name: "國立嘉義高級中學", short: "嘉中", aliases: ["嘉義高中", "cysh"], capabilities: { announcements: true } },
    { id: "xxsh", county: "B", site: "https://www.xxsh.example.edu.tw/", name: "測試甲高中", short: "甲高", aliases: ["甲高中", "xxsh"], capabilities: { announcements: true } },
    { id: "yysh", county: "C", site: "https://rpage.yysh.example.edu.tw/", name: "測試乙高中", short: "乙高", aliases: ["yysh"], capabilities: { announcements: true } },
];
"""
SCHOOL_IDS = ["cysh", "xxsh", "yysh"]
SHORT = {"cysh": "嘉中", "xxsh": "甲高", "yysh": "乙高"}
HOST = {"cysh": "www.cysh.cy.edu.tw", "xxsh": "www.xxsh.example.edu.tw", "yysh": "rpage.yysh.example.edu.tw"}


def write_json(path, value, indent=1, newline=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=indent) + ("\n" if newline else ""), encoding="utf-8")


def make_tree(base: Path) -> Path:
    root = base / "tree"
    (root / "docs").mkdir(parents=True)
    (root / "docs/school-registry.js").write_text(REGISTRY_JS, encoding="utf-8")
    shutil.copy(ROOT / "docs/restricted-files.json", root / "docs/restricted-files.json")
    d = root / "docs/data"
    items = [{"id": f"{s}-{n}", "title": f"公告{n}", "school": s, "school_name": SHORT[s], "tokens": ["b", "a"],
              "url": f"https://{HOST[s]}/p/{n}"} for s in SCHOOL_IDS for n in range(1, 4)]
    schools = [{"id": s, "name": s, "short": SHORT[s], "base": f"https://{HOST[s]}"} for s in SCHOOL_IDS]
    meta = {"generated_at": "2026-11-08T00:00:00Z", "categories": ["一般"], "category_slugs": {"一般": "general"},
            "content_access": "approved-account-required"}
    write_json(d / "announcements.json", {**meta, "schools": schools, "items": items})
    write_json(d / "archive.json", {"generated_at": "x", "hot_cutoff": "y", "items": items[:6], "content_access": "z"})
    write_json(d / "announcements-latest.json", {**meta, "schools": schools, "partial": True,
                                                  "total_items": len(items), "items": items[::2]})
    write_json(d / "schools/manifest.json", {"schema_version": 1, "generated_at": "g", "categories": [],
                                              "schools": [dict(s, current=f"data/schools/{s['id']}/current.json") for s in schools]})
    for s in SCHOOL_IDS:
        for name in ("current", "archive", "latest"):
            write_json(d / f"schools/{s}/{name}.json", {"school": {"id": s}, "items": [i for i in items if i["school"] == s]})
        write_json(d / f"school-info/{s}.json", {"school": s, "pages": {"1": {"title": "t"}}}, newline=True)
    cal = [{"id": f"c-{s}", "school_id": s, "school": SHORT[s], "title": "活動", "start_date": "2026-11-10"} for s in SCHOOL_IDS]
    write_json(d / "calendar-events.json", cal, indent=2, newline=True)
    write_json(d / "official-calendar-events.json", cal, indent=2, newline=True)
    write_json(d / "calendar-source-status.json", [{"school_id": s, "status": "ok"} for s in SCHOOL_IDS], indent=2, newline=True)
    write_json(d / "class-timetables.json", {"schema_version": 1, "timetables": [{"school_id": s, "slots": [1, 2]} for s in SCHOOL_IDS]})
    series = [{"id": f"s_{s}", "name": "系列", "school": s, "members": [{"id": f"{s}-1"}]} for s in SCHOOL_IDS]
    (d / "series.json").write_text(json.dumps({"schema_version": 1, "count": len(series), "series": series},
                                              ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    write_json(d / "removed-announcements.json", {"schema_version": 1, "removed": [{"id": f"{s}-9", "school": s} for s in SCHOOL_IDS]}, newline=True)
    targets = []
    for s in SCHOOL_IDS:
        targets.append({"target_id": f"announcement:{s}-5:deadline:1", "title": "t", "source_url": f"https://{HOST[s]}/a"})
        targets.append({"target_id": f"calendar:official-calendar:{s}:2026-11:2026-11-10:1:1", "title": "t"})
    write_json(d / "reminder-targets.json", {"schema_version": 1, "targets": targets})
    sc = root / "scraper"
    write_json(sc / "notification_outbox.json", [{"id": f"{s}-1", "school": s, "school_name": SHORT[s]} for s in SCHOOL_IDS], newline=True)
    write_json(sc / "coverage_gaps.json", {"note": "n", "gaps": [{"school": s, "count": 2} for s in SCHOOL_IDS]})
    write_json(sc / "events.json", [{"date": "2026-11-10", "school": SHORT[s], "title": "事件"} for s in SCHOOL_IDS])
    write_json(sc / "fetch_state.json", {f"https://{HOST[s]}/list/{n}": "2026-11-08T00:00:00+08:00" for s in SCHOOL_IDS for n in (1, 2)} |
               {"https://unknown.example.org/x": "t"})
    write_json(sc / "site_map.json", {s: {"short": SHORT[s], "categories": []} for s in SCHOOL_IDS})
    write_json(sc / "school_backlog.json", {"_note": "n", "updated": "u", "schools": [{"id": "zzsh", "name": "候選"}]})
    write_json(sc / "subscriptions.json", [{"name": "n", "keywords": []}])
    write_json(sc / "config.json", {"schools": [{"id": s} for s in SCHOOL_IDS]})
    events = []
    for s in SCHOOL_IDS:
        for n in (1, 2):
            events.append(f"BEGIN:VEVENT\r\nUID:2026111{n}-{s}@cy-school-news\r\nSUMMARY:[{SHORT[s]}] 活動{n}\r\n"
                          f"BEGIN:VALARM\r\nACTION:DISPLAY\r\nEND:VALARM\r\nEND:VEVENT\r\n")
    (root / "docs/calendar.ics").write_bytes(("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" + "".join(events) + "END:VCALENDAR\r\n").encode("utf-8"))
    return root


def snapshot(root: Path) -> dict:
    return {p.relative_to(root).as_posix(): p.read_bytes() for p in sorted(root.rglob("*")) if p.is_file()}


def canon(x):
    return json.dumps(x, ensure_ascii=False, sort_keys=True)


def normalize(obj, spec):
    """Rule-level lists are compared without order; everything else must be identical."""
    if spec["shape"] == "array":
        return sorted(obj, key=canon)
    if spec["shape"] == "object_lists":
        out = dict(obj)
        for ls in spec["lists"]:
            if ls["key"] in out:
                out[ls["key"]] = sorted(out[ls["key"]], key=canon)
        return out
    return obj


def run(*argv):
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        code = rs.main(list(argv))
    return code, out.getvalue() + err.getvalue()


def ics_parts(path: Path):
    header, events, footer = rs.parse_ics(path.read_bytes())
    return header, sorted(events), footer


def compare_trees(before: Path, after: Path, label: str, skip_dirs=("docs/data/schools",)):
    """Every file equal, lists order-insensitive; the derived schools/<id>/ shards are skipped."""
    specs = {s["path"]: s for s in RULES["files"]}
    count = 0
    for p in sorted(before.rglob("*")):
        rel = p.relative_to(before).as_posix()
        if not p.is_file() or any(rel.startswith(d + "/") and rel != d + "/manifest.json" for d in skip_dirs):
            continue
        q = after / rel
        assert q.is_file(), f"{label}: {rel} missing after restore"
        if rel == "docs/calendar.ics":
            assert ics_parts(p) == ics_parts(q), f"{label}: calendar differs"
        elif rel in specs:
            a, b = json.loads(p.read_text(encoding="utf-8")), json.loads(q.read_text(encoding="utf-8"))
            assert normalize(a, specs[rel]) == normalize(b, specs[rel]), f"{label}: {rel} differs"
        else:
            assert p.read_bytes() == q.read_bytes(), f"{label}: {rel} differs"
        count += 1
    extra = {p.relative_to(after).as_posix() for p in after.rglob("*") if p.is_file()} - \
            {p.relative_to(before).as_posix() for p in before.rglob("*") if p.is_file()}
    assert not extra, f"{label}: unexpected files after restore ({len(extra)})"
    return count


# ------------------------------------------------------------------------------------ (a) synthetic

def test_synthetic():
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        root = make_tree(base)
        original = copy.deepcopy(snapshot(root))
        orig_root = base / "orig"
        shutil.copytree(root, orig_root)
        blobs = base / "blobs"

        code, out = run("verify", "--root", str(root))
        assert code == 1 and "LEAK" in out and "xxsh" not in out and "甲高" not in out, "verify must fail and never print values"

        code, out = run("split", "--root", str(root), "--out", str(blobs))
        assert code == 0, out
        for secret in ("xxsh", "yysh", "甲高", "乙高"):
            assert secret not in out, "split logs must not name restricted schools"
        code, out = run("verify", "--root", str(root))
        assert code == 0, out

        data = root / "docs/data"
        ann = json.loads((data / "announcements.json").read_text(encoding="utf-8"))
        assert {i["school"] for i in ann["items"]} == {"cysh"} and [s["id"] for s in ann["schools"]] == ["cysh"]
        assert ann["generated_at"] == "2026-11-08T00:00:00Z" and ann["categories"] == ["一般"]
        latest = json.loads((data / "announcements-latest.json").read_text(encoding="utf-8"))
        assert latest["total_items"] == 3 and {i["school"] for i in latest["items"]} == {"cysh"}
        series = json.loads((data / "series.json").read_text(encoding="utf-8"))
        assert series["count"] == 1 and [s["school"] for s in series["series"]] == ["cysh"]
        assert (root / "docs/data/series.json").read_text(encoding="utf-8").count("\n") == 1, "compact style kept"
        assert sorted(p.name for p in (data / "school-info").iterdir()) == ["cysh.json"]
        assert sorted(p.name for p in (data / "schools").iterdir()) == ["cysh", "manifest.json"]
        assert [s["id"] for s in json.loads((data / "schools/manifest.json").read_text(encoding="utf-8"))["schools"]] == ["cysh"]
        targets = json.loads((data / "reminder-targets.json").read_text(encoding="utf-8"))["targets"]
        assert len(targets) == 2 and all("cysh" in t["target_id"] for t in targets)
        fetch = json.loads((root / "scraper/fetch_state.json").read_text(encoding="utf-8"))
        assert sorted(fetch) == ["https://www.cysh.cy.edu.tw/list/1", "https://www.cysh.cy.edu.tw/list/2"], "unknown hosts are restricted"
        assert list(json.loads((root / "scraper/site_map.json").read_text(encoding="utf-8"))) == ["cysh"]
        events = json.loads((root / "scraper/events.json").read_text(encoding="utf-8"))
        assert [e["school"] for e in events] == ["嘉中"]
        backlog = json.loads((root / "scraper/school_backlog.json").read_text(encoding="utf-8"))
        assert backlog["schools"] == [] and backlog["_note"] == "n"
        header, vevents, _ = rs.parse_ics((root / "docs/calendar.ics").read_bytes())
        assert len(vevents) == 2 and all("[嘉中]" in v for v in vevents) and "\r\n" in header
        for name in ("calendar-events", "official-calendar-events", "calendar-source-status"):
            rows = json.loads((data / f"{name}.json").read_text(encoding="utf-8"))
            assert [r["school_id"] for r in rows] == ["cysh"], name
        assert (root / "scraper/config.json").read_bytes() == original["scraper/config.json"], "neutral files untouched"
        assert (root / "scraper/subscriptions.json").read_bytes() == original["scraper/subscriptions.json"]

        # blobs: same shape, only restricted entries, gz is deterministic
        blob = json.loads(gzip.decompress((blobs / "docs/data/announcements.json.gz").read_bytes()))
        assert {i["school"] for i in blob["items"]} == {"xxsh", "yysh"} and "generated_at" not in blob
        assert len(blob["items"]) == 6 and [s["id"] for s in blob["schools"]] == ["xxsh", "yysh"]
        assert sorted(p.name for p in (blobs / "docs/data/school-info").iterdir()) == ["xxsh.json.gz", "yysh.json.gz"]
        assert [q.name for q in (blobs / "docs/data/schools").iterdir()] == ["manifest.json.gz"], "derived shards are not stored"
        b2 = base / "blobs-again"
        shutil.copytree(orig_root, base / "tree2")
        run("split", "--root", str(base / "tree2"), "--out", str(b2))
        assert snapshot(blobs) == snapshot(b2), "blobs are byte-for-byte deterministic"
        assert gzip.decompress((blobs / "docs/data/series.json.gz").read_bytes()) and \
            json.loads(gzip.decompress((blobs / "docs/data/series.json.gz").read_bytes()))["count"] == 2

        # split twice = no-op (blobs empty, tree byte-identical)
        after_first = snapshot(root)
        again = base / "blobs2"
        code, out = run("split", "--root", str(root), "--out", str(again))
        assert code == 0 and snapshot(root) == after_first, "second split changes nothing"
        empty = json.loads(gzip.decompress((again / "docs/data/announcements.json.gz").read_bytes()))
        assert empty == {"items": [], "schools": []}
        assert not (again / "docs/data/school-info").exists() or not list((again / "docs/data/school-info").iterdir())

        # restore -> deep-equal (order-insensitive lists), twice is the same as once
        code, out = run("restore", "--root", str(root), "--in", str(blobs))
        assert code == 0, out
        n = compare_trees(orig_root, root, "synthetic")
        assert n >= 20
        # derived shards are rebuilt by the scraper; the manifest comes back
        run("restore", "--root", str(root), "--in", str(blobs))
        compare_trees(orig_root, root, "synthetic restore twice")

        # public-only blobs for a missing file / unknown blob / missing blob
        shutil.rmtree(root / "docs/data/schools")
        extra_dir = base / "blobs3"
        shutil.copytree(blobs, extra_dir)
        (extra_dir / "docs/data/not-in-rules.json.gz").write_bytes(rs.gz_bytes(b"{}"))
        (extra_dir / "docs/data/series.json.gz").unlink()
        code, out = run("restore", "--root", str(root), "--in", str(extra_dir))
        assert code == 0 and "unknown blob" in out and "not-in-rules" not in out
        assert json.loads((data / "series.json").read_text(encoding="utf-8"))["count"] == 3, "series restored by the first restore stay"
        code, out = run("restore", "--root", str(root), "--in", str(base / "nowhere"))
        assert code == 0

        # a public-school entry inside a blob is never restored (and never duplicated)
        evil = base / "blobs4"
        shutil.copytree(blobs, evil)
        p = evil / "docs/data/archive.json.gz"
        doc = json.loads(gzip.decompress(p.read_bytes()))
        doc["items"].append({"id": "cysh-evil", "school": "cysh"})
        p.write_bytes(rs.gz_bytes(rs.blob_json_bytes(doc)))
        shutil.rmtree(root)
        shutil.copytree(orig_root, root)
        run("split", "--root", str(root), "--out", str(base / "b5"))
        code, out = run("restore", "--root", str(root), "--in", str(evil))
        assert "cysh-evil" not in (data / "archive.json").read_text(encoding="utf-8")


def test_failure_leaves_tree_untouched():
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        root = make_tree(base)
        before = snapshot(root)
        (root / "docs/data/series.json").write_text("{not json", encoding="utf-8")
        before = snapshot(root)
        code, out = run("split", "--root", str(root), "--out", str(base / "blobs"))
        assert code == 2 and "ERROR" in out
        assert snapshot(root) == before, "nothing changed after a failed split"
        assert not (base / "blobs").exists() or not list((base / "blobs").rglob("*.gz"))

        # blobs phase never touches the tree; apply refuses when the tree moved on after the blobs were made
        root2 = make_tree(base / "second")
        before2 = snapshot(root2)
        code, _ = run("split", "--root", str(root2), "--out", str(base / "b2"), "--phase", "blobs")
        assert code == 0 and snapshot(root2) == before2, "blobs phase writes no public file"
        write_json(root2 / "scraper/coverage_gaps.json", {"note": "n", "gaps": [{"school": "xxsh", "count": 99}]})
        mid = snapshot(root2)
        code, out = run("split", "--root", str(root2), "--out", str(base / "b2"), "--phase", "apply")
        assert code == 2 and snapshot(root2) == mid, "apply without matching blobs changes nothing"
        shutil.rmtree(base / "b2")
        code, out = run("split", "--root", str(root2), "--out", str(base / "b2"), "--phase", "apply")
        assert code == 2 and snapshot(root2) == mid, "apply without any blobs changes nothing"

        # an unwritable blob directory fails before the tree is touched
        root3 = make_tree(base / "third")
        before3 = snapshot(root3)
        blocker = base / "blocker"
        blocker.write_text("file, not a directory", encoding="utf-8")
        try:
            code, out = run("split", "--root", str(root3), "--out", str(blocker / "sub"))
        except OSError:
            code = -1
        assert code != 0 and snapshot(root3) == before3, "failed blob write leaves the tree untouched"


# ------------------------------------------------------------------------------------ sync client

class MockStore(http.server.BaseHTTPRequestHandler):
    objects = {}
    log = []
    fail_next_put = 0
    corrupt_names = set()

    def log_message(self, *args):
        pass

    def _auth(self):
        if self.headers.get("apikey") != "pub-key" or self.headers.get("x-announcement-content-sync-token") != "tok":
            self.send_response(401)
            self.end_headers()
            return False
        return True

    def _send(self, code, body=b"", ctype="application/json"):
        self.send_response(code)
        self.send_header("content-type", ctype)
        self.end_headers()
        self.wfile.write(body)

    def _query(self):
        from urllib.parse import parse_qs, urlparse
        parsed = urlparse(self.path)
        assert parsed.path.endswith("/restricted-data-sync"), parsed.path
        return {k: v[0] for k, v in parse_qs(parsed.query).items()}

    def do_GET(self):
        if not self._auth():
            return
        q = self._query()
        if "list" in q:
            rows = [{"name": n, "bytes": len(d), "sha256": hashlib.sha256(d).hexdigest(), "updated_at": "t"}
                    for n, d in sorted(self.objects.items())]
            return self._send(200, json.dumps(rows).encode())
        data = self.objects.get(q.get("name"))
        if data is None:
            return self._send(404)
        self._send(200, data, "application/gzip")

    def do_PUT(self):
        if not self._auth():
            return
        q = self._query()
        body = self.rfile.read(int(self.headers.get("content-length", 0)))
        type(self).log.append(("PUT", q["name"]))
        if type(self).fail_next_put:
            type(self).fail_next_put -= 1
            return self._send(503)
        if hashlib.sha256(body).hexdigest() != self.headers.get("x-sha256"):
            return self._send(400)
        stored = body[:-1] + bytes([body[-1] ^ 1]) if q["name"] in self.corrupt_names else body
        self.objects[q["name"]] = stored
        self._send(200, json.dumps({"name": q["name"], "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}).encode())

    def do_DELETE(self):
        if not self._auth():
            return
        self.objects.pop(self._query()["name"], None)
        self._send(200, b"{}")


def start_server():
    MockStore.objects, MockStore.log, MockStore.fail_next_put, MockStore.corrupt_names = {}, [], 0, set()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), MockStore)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def test_sync_client():
    server = start_server()
    try:
        url = f"http://127.0.0.1:{server.server_address[1]}/functions/v1/announcement-content-sync"
        env = {"ANNOUNCEMENT_CONTENT_SYNC_URL": url, "ANNOUNCEMENT_CONTENT_SYNC_TOKEN": "tok", "SUPABASE_PUBLISHABLE_KEY": "pub-key"}
        config = sync.Config.from_env(env)
        assert config.url.endswith("/functions/v1/restricted-data-sync")
        assert sync.Config.from_env({}) is None
        client = sync.Client(config, sleep=lambda s: None)

        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            src = tmp / "src"
            (src / "docs/data/school-info").mkdir(parents=True)
            (src / "docs/data/a.json.gz").write_bytes(rs.gz_bytes(b'{"a":1}'))
            (src / "docs/data/school-info/xx.json.gz").write_bytes(rs.gz_bytes(b'{"b":2}'))

            assert sync.cmd_download(client, tmp / "empty") == 0, "an empty bucket is fine"
            MockStore.fail_next_put = 2
            assert sync.cmd_upload(client, src, prune=False) == 0, "retries recover from 5xx"
            assert len(MockStore.objects) == 2
            n_puts = len(MockStore.log)
            assert sync.cmd_upload(client, src, prune=False) == 0 and len(MockStore.log) == n_puts, "unchanged objects are not re-uploaded"
            dest = tmp / "dest"
            assert sync.cmd_download(client, dest) == 0
            assert (dest / "docs/data/a.json.gz").read_bytes() == (src / "docs/data/a.json.gz").read_bytes()

            # prune only with --prune
            MockStore.objects["docs/data/old.json.gz"] = b"old"
            sync.cmd_upload(client, src, prune=False)
            assert "docs/data/old.json.gz" in MockStore.objects
            sync.cmd_upload(client, src, prune=True)
            assert "docs/data/old.json.gz" not in MockStore.objects

            # read-back mismatch = failure
            (src / "docs/data/b.json.gz").write_bytes(rs.gz_bytes(b'{"c":3}'))
            MockStore.corrupt_names = {"docs/data/b.json.gz"}
            try:
                sync.cmd_upload(client, src, prune=False)
                raise AssertionError("a corrupted read-back must fail")
            except sync.SyncError as exc:
                assert "mismatch" in str(exc) and "docs/data/b" not in str(exc), "names are masked in errors"

            # persistent server failure = failure after 3 attempts
            MockStore.corrupt_names = set()
            MockStore.fail_next_put = 99
            before = len(MockStore.log)
            (src / "docs/data/c.json.gz").write_bytes(rs.gz_bytes(b"{}"))
            try:
                sync.cmd_upload(client, src, prune=False)
                raise AssertionError("must fail")
            except sync.SyncError:
                assert len(MockStore.log) - before == 3
            # bad credentials are not retried
            bad = sync.Client(sync.Config(config.url, "wrong", "pub-key"), sleep=lambda s: None)
            try:
                bad.list()
                raise AssertionError("must fail")
            except sync.SyncError as exc:
                assert "401" in str(exc)

            # CLI: configured, then not configured
            MockStore.fail_next_put = 0
            cli = [sys.executable, str(ROOT / "scraper/restricted_sync.py")]
            res = subprocess.run(cli + ["upload", "--src", str(src)], env={**os.environ, **env}, capture_output=True, text=True)
            assert res.returncode == 0, res.stderr
            assert "tok" not in res.stdout + res.stderr and "pub-key" not in res.stdout + res.stderr
            clean = {k: v for k, v in os.environ.items() if not k.startswith(("ANNOUNCEMENT_CONTENT", "SUPABASE_"))}
            res = subprocess.run(cli + ["download", "--dest", str(tmp / "d2")], env=clean, capture_output=True, text=True)
            assert res.returncode == 0 and "RESTRICTED_SYNC_NOT_CONFIGURED" in res.stdout
            res = subprocess.run(cli + ["upload", "--src", str(src)], env=clean, capture_output=True, text=True)
            assert res.returncode == 1, "upload fails closed without configuration"
            res = subprocess.run(cli + ["upload", "--src", str(tmp / "no-blobs")], env={**os.environ, **env}, capture_output=True, text=True)
            assert res.returncode == 1, "nothing to upload is an error"
    finally:
        server.shutdown()


# ------------------------------------------------------------------------------------ (b) real tree

def tree_size(root: Path) -> int:
    return sum(p.stat().st_size for p in root.rglob("*") if p.is_file())


def test_real_tree_round_trip():
    data = ROOT / "docs/data"
    if not (data / "announcements.json").is_file():
        print("real tree: skipped (no docs/data/announcements.json)")
        return
    probe = json.loads((data / "announcements.json").read_text(encoding="utf-8"))
    public = set(RULES["public_schools"])
    if all(i.get("school") in public for i in probe.get("items", [])):
        print("real tree: skipped (the tree already holds only public schools)")
        return
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        root = base / "tree"
        (root / "docs").mkdir(parents=True)
        (root / "scraper").mkdir()
        shutil.copytree(data, root / "docs/data")
        for rel in ("docs/calendar.ics", "docs/school-registry.js", "docs/restricted-files.json"):
            shutil.copy(ROOT / rel, root / rel)
        for p in (ROOT / "scraper").glob("*.json"):
            shutil.copy(p, root / "scraper" / p.name)
        pristine = base / "pristine"
        shutil.copytree(root, pristine)
        full_size = tree_size(root)

        # coverage: every collected file is governed by a rule (or is declared neutral)
        governed = {s["path"] for s in RULES["files"]} | set(RULES["neutral_files"]) | {RULES["calendar_ics"]["path"]}
        per_school = [r["dir"] for r in RULES["per_school"]]
        for p in rs.scan_files(root, RULES):
            rel = p.relative_to(root).as_posix()
            assert rel in governed or any(rel.startswith(d + "/") for d in per_school) or rel == "scraper/config.json", \
                f"{rel} is not covered by docs/restricted-files.json"

        # the serializer reproduces the scraper's bytes when nothing is restricted
        mismatched = []
        for spec in RULES["files"]:
            p = root / spec["path"]
            if p.is_file():
                text = p.read_bytes().decode("utf-8")
                if rs.dump_json(json.loads(text), rs.detect_style(text)) != text:
                    mismatched.append(spec["path"])
        print(f"real tree: files not reproduced byte-for-byte by the serializer: {len(mismatched)} {mismatched}")

        t0 = time.time()
        code, out = run("split", "--root", str(root), "--out", str(base / "blobs"))
        t_split = time.time() - t0
        assert code == 0, out
        t0 = time.time()
        code, out = run("verify", "--root", str(root))
        t_verify = time.time() - t0
        assert code == 0, out
        public_size = tree_size(root)
        blob_files = [p for p in (base / "blobs").rglob("*.gz")]
        blob_size = sum(p.stat().st_size for p in blob_files)
        biggest = sorted(((p.stat().st_size, p.name) for p in blob_files), reverse=True)[:3]
        ann = json.loads((root / "docs/data/announcements.json").read_text(encoding="utf-8"))
        assert {i["school"] for i in ann["items"]} <= public

        t0 = time.time()
        code, out = run("restore", "--root", str(root), "--in", str(base / "blobs"))
        t_restore = time.time() - t0
        assert code == 0, out
        n = compare_trees(pristine, root, "real tree")

        # the derived per-school shards are rebuilt from the merged files exactly as before
        import public_shards
        rebuilt = base / "rebuilt-schools"
        recent = json.loads((root / "docs/data/announcements.json").read_text(encoding="utf-8"))
        archive = json.loads((root / "docs/data/archive.json").read_text(encoding="utf-8"))
        public_shards.build_school_shards(recent, archive, rebuilt)
        shards_equal = 0
        for p in sorted(rebuilt.rglob("*.json")):
            old = pristine / "docs/data/schools" / p.relative_to(rebuilt)
            if old.is_file():
                a, b = json.loads(old.read_text(encoding="utf-8")), json.loads(p.read_text(encoding="utf-8"))
                a.pop("content_access", None)  # added later by tools/public-metadata-projection.js
                assert a == b, f"rebuilt school shard differs ({old.parent.name}/{old.name})"
                shards_equal += 1
        assert shards_equal >= 100
        print(f"real tree: {n} files compared equal after restore; shards rebuilt from merged data: {shards_equal}")
        print(f"real tree: full {full_size / 1e6:.1f} MB -> public {public_size / 1e6:.1f} MB; "
              f"{len(blob_files)} blobs {blob_size / 1e6:.2f} MB gz; largest {[s for s, _ in biggest]} bytes")
        print(f"real tree: split {t_split:.1f}s, verify {t_verify:.1f}s, restore {t_restore:.1f}s")


# ------------------------------------------------------------------------------------ (c) workflows

WRITERS = ["scrape-hourly", "announcement-prune", "school-info-backfill", "token-backfill",
           "calendar-daily", "pksh-windows-production"]


def load_yaml(path):
    try:
        import yaml
    except ImportError:
        return None
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def test_workflows():
    action = load_yaml(ROOT / ".github/actions/restricted-data/action.yml")
    if action is not None:
        assert action["inputs"]["mode"]["required"] is True and action["runs"]["using"] == "composite"
        steps = [s for s in action["runs"]["steps"] if "if" in s]
        modes = [re.search(r"'(\w+)'", s["if"]).group(1) for s in steps]
        assert modes[0] == "restore" and set(modes[1:]) == {"split"}
    text = (ROOT / ".github/actions/restricted-data/action.yml").read_text(encoding="utf-8")
    order = [text.index(k) for k in ("--phase blobs", "restricted_sync.py upload", "--phase apply", "restricted_split.py verify")]
    assert order == sorted(order), "split order: blobs -> upload+verify -> apply -> leak scan"
    assert text.index("restricted_sync.py download") < text.index("restricted_split.py restore")

    for name in WRITERS:
        path = ROOT / f".github/workflows/{name}.yml"
        raw = path.read_text(encoding="utf-8")
        doc = load_yaml(path)
        jobs = doc["jobs"] if doc is not None else None
        job_steps = [s for j in jobs.values() for s in j["steps"]] if jobs else []
        idx = {}
        if job_steps:
            for i, step in enumerate(job_steps):
                if step.get("uses") == "./.github/actions/restricted-data":
                    mode = step["with"]["mode"]
                    idx.setdefault(mode, []).append(i)
                    env = step.get("env", {})
                    for key in ("ANNOUNCEMENT_CONTENT_SYNC_TOKEN", "ANNOUNCEMENT_CONTENT_SYNC_URL", "SUPABASE_PUBLISHABLE_KEY"):
                        assert key in env, f"{name}: {key} missing"
            assert len(idx.get("restore", [])) == 1 and len(idx.get("split", [])) == 1, name
            r, s = idx["restore"][0], idx["split"][0]
            assert r < s, name
            commit = [i for i, st in enumerate(job_steps) if "git add" in str(st.get("run", ""))]
            assert commit and all(s < i for i in commit), f"{name}: split must come before git add"
            assert doc["concurrency"]["group"] == "scrape" and doc["concurrency"]["cancel-in-progress"] is False, name
        assert raw.index("mode: restore") < raw.index("mode: split") < raw.index("git add"), name

    scrape = (ROOT / ".github/workflows/scrape-hourly.yml").read_text(encoding="utf-8")
    split_at = scrape.index("mode: split")
    for needle in ("latest_slim.py", "event_series.py", "scraper/reminder_targets.py", "REMINDER_TARGET_SYNC_URL",
                   "scraper/notify.py", "export-member-content.js", "public-metadata-projection.js"):
        assert scrape.index(needle) < split_at, f"scrape-hourly: {needle} must run on the full tree, before the split"
    assert scrape.index("mode: restore") < scrape.index("python scraper/scrape.py")
    assert scrape.index("mode: split") < scrape.index("git add -A docs/data")

    # schedules untouched
    assert "cron: '1 23 * * *'" in (ROOT / ".github/workflows/calendar-daily.yml").read_text(encoding="utf-8")
    assert "cron: '10 23,0-11,13 * * *'" in (ROOT / ".github/workflows/scrape-schedule.yml").read_text(encoding="utf-8")


def test_transitional_restore_and_ignored_files():
    """Before the first successful split, the tree still holds older copies of restricted entries.
    The blob is the source of truth: each restricted announcement must appear exactly once, with
    the blob's content. Files git never commits (.gitignore) are not leak-scanned."""
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        root = make_tree(base)
        blobs = base / "blobs"
        code, out = run("split", "--root", str(root), "--out", str(blobs))
        assert code == 0, out
        stale_base = base / "stale"
        stale_base.mkdir()
        stale = make_tree(stale_base)
        ann = stale / "docs/data/announcements.json"
        doc = json.loads(ann.read_text(encoding="utf-8"))
        for item in doc["items"]:
            if item["school"] != "cysh":
                item["title"] = "舊版標題"
        ann.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
        code, out = run("restore", "--root", str(stale), "--in", str(blobs))
        assert code == 0, out
        merged = json.loads(ann.read_text(encoding="utf-8"))["items"]
        ids = [it["id"] for it in merged]
        assert len(ids) == len(set(ids)), "a restricted announcement appears twice after restore"
        assert not any(it["title"] == "舊版標題" for it in merged), "the stale tree copy must lose to the blob"
        assert len(merged) == len(doc["items"])

        # git-ignored scratch files (scraper/new_items.json) are never committed: not a leak
        repo = make_tree(base / "gitrepo")
        code, out = run("split", "--root", str(repo), "--out", str(base / "b-git"))
        assert code == 0, out
        restricted = next(s for s in SCHOOL_IDS if s != "cysh")
        (repo / "scraper").mkdir(exist_ok=True)
        (repo / "scraper/new_items.json").write_text(json.dumps([{"id": restricted + "-9", "school": restricted}]), encoding="utf-8")
        code, out = run("verify", "--root", str(repo))
        assert code != 0, "outside git, an untracked restricted file must still be reported"
        subprocess.run(["git", "init", "-q", str(repo)], check=True)
        (repo / ".gitignore").write_text("scraper/new_items.json\n", encoding="utf-8")
        code, out = run("verify", "--root", str(repo))
        assert code == 0, out


def main():
    test_synthetic()
    print("restricted_split synthetic: ok")
    test_failure_leaves_tree_untouched()
    print("restricted_split failure handling: ok")
    test_transitional_restore_and_ignored_files()
    print("restricted_split transitional restore + git-ignored files: ok")
    test_sync_client()
    print("restricted_sync: ok")
    test_workflows()
    print("workflow wiring: ok")
    test_real_tree_round_trip()
    print("restricted_split: all ok")


if __name__ == "__main__":
    main()
