#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Keep every non-public school's collected data out of the public repository.

The repository (and GitHub Pages) is public; only the schools listed in
``docs/restricted-files.json`` (``public_schools``) may be committed.  The
scraper still collects every school, so its working state lives outside the
repository, as gzip blobs in a private Supabase Storage bucket
(``scraper/restricted_sync.py`` moves them).  This tool does the splitting:

  split   --root . --out DIR [--phase blobs|apply|all]
      blobs : write one gzip JSON blob per rule (same shape as the public file,
              only the restricted entries) to DIR/<path>.gz.  Touches nothing else.
      apply : re-plan, check DIR holds exactly the blobs that cover what is about
              to be removed, then rewrite the public files (temp + rename) and
              delete the restricted per-school files and directories.
      all   : blobs, then apply (default).
  restore --root . --in DIR
      merge the blobs back (lists are concatenated, per-school files are put back,
      derived counters recomputed) so the scraper sees what it saw before the split.
  verify  --root .
      leak scan: exit 1 when a restricted school id, host or school field value is
      still present in docs/data, scraper/*.json or docs/calendar.ics.

Logs never print a restricted school id, name, host or value (the repository is
public and so are its Actions logs): only counts, sizes and public file paths.
Standard library only.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import os
import re
import subprocess
import shutil
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

RULES_REL = "docs/restricted-files.json"
SCHOOL_VALUE_KEYS = ("school", "school_id", "school_name", "short")


class SplitError(RuntimeError):
    pass


# --------------------------------------------------------------------------- rules / registry

def load_rules(root: Path) -> dict:
    path = Path(root) / RULES_REL
    try:
        rules = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise SplitError(f"cannot read {RULES_REL}: {exc.__class__.__name__}") from None
    if not isinstance(rules.get("public_schools"), list) or not isinstance(rules.get("files"), list):
        raise SplitError(f"{RULES_REL} is malformed")
    return rules


def parse_registry(root: Path, rules: dict) -> list[dict]:
    """Parse the one-school-per-line literals of docs/school-registry.js."""
    path = Path(root) / rules.get("registry", "docs/school-registry.js")
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise SplitError(f"cannot read the school registry: {exc.__class__.__name__}") from None
    schools = []
    for line in text.splitlines():
        m = re.match(r'\s*\{\s*id:\s*"([^"]+)"', line)
        if not m:
            continue

        def field(name):
            f = re.search(r'\b' + name + r':\s*"([^"]*)"', line)
            return f.group(1) if f else ""

        aliases = []
        a = re.search(r'\baliases:\s*\[([^\]]*)\]', line)
        if a:
            aliases = re.findall(r'"([^"]*)"', a.group(1))
        schools.append({"id": m.group(1), "site": field("site"), "name": field("name"),
                        "short": field("short"), "aliases": aliases})
    if not schools:
        raise SplitError("the school registry has no schools")
    return schools


def _base_host(url_or_host: str) -> str:
    value = url_or_host.strip().lower()
    host = urlparse(value if "//" in value else "//" + value).hostname or ""
    return host[4:] if host.startswith("www.") else host


class Policy:
    """Everything that decides whether an entry is public."""

    def __init__(self, rules: dict, registry: list[dict]):
        self.public = set(rules["public_schools"])
        self.schools = {s["id"]: s for s in registry}
        self.ids = set(self.schools)
        self.name_to_id: dict[str, str] = {}
        for s in registry:
            for label in [s["id"], s["name"], s["short"], *s["aliases"]]:
                if label:
                    self.name_to_id.setdefault(label.lower(), s["id"])
        self.public_bases = {b for s in registry if s["id"] in self.public
                             for b in [_base_host(s["site"])] if b}
        raw = {_base_host(s["site"]): s["id"] for s in registry
               if s["id"] not in self.public and s["site"]}
        # A restricted host that is the same as (or a parent of) a public host cannot be scanned for.
        self.restricted_bases = {b: sid for b, sid in raw.items() if b and not any(
            p == b or p.endswith("." + b) for p in self.public_bases)}

    # -- hosts
    def host_public(self, host: str) -> bool:
        host = (host or "").lower().rstrip(".")
        return any(host == b or host.endswith("." + b) for b in self.public_bases)

    def url_public(self, url: str) -> bool:
        return self.host_public(urlparse(str(url or "")).hostname or "")

    # -- school values
    def resolve(self, value, mode: str = "id"):
        if not isinstance(value, str) or not value:
            return None
        if mode == "id_or_name":
            return self.name_to_id.get(value.lower(), value)
        return value

    def school_from_target(self, entry: dict):
        target = str(entry.get("target_id") or "")
        for part in target.split(":")[1:]:
            sid = part.split("-")[0]
            if sid in self.ids:
                return sid
        url = entry.get("source_url")
        if url:
            for sid in self.public:
                if self.url_public(url):
                    return sid
        return None

    def entry_public(self, entry, list_spec: dict, file_spec: dict) -> bool:
        if list_spec.get("all_restricted") or not isinstance(entry, dict):
            return False
        if list_spec.get("school_from") == "target_id":
            return self.school_from_target(entry) in self.public
        field = list_spec.get("school_field") or file_spec.get("school_field")
        mode = list_spec.get("school_value") or file_spec.get("school_value", "id")
        return self.resolve(entry.get(field), mode) in self.public

    def key_public(self, key: str, file_spec: dict) -> bool:
        if file_spec.get("key_kind") == "url_host":
            return self.url_public(key)
        return key in self.public


# --------------------------------------------------------------------------- bytes / json helpers

def gz_bytes(data: bytes) -> bytes:
    """Deterministic gzip: fixed mtime, no file name."""
    buffer = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buffer, compresslevel=9, mtime=0) as handle:
        handle.write(data)
    return buffer.getvalue()


def blob_json_bytes(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def atomic_write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name("." + path.name + ".restricted-tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def detect_style(text: str) -> dict:
    """Recover how the scraper serialised a file so a rewrite keeps the diff small."""
    style = {"newline": text.endswith("\n"), "indent": None, "compact": False,
             "ascii": ("\\u" in text and text.isascii())}
    inner = text.strip().splitlines()[1:-1]
    if (text.lstrip().startswith("[") and inner
            and all(re.fullmatch(r"  \{.*\},?", line) for line in inner)):
        style["one_per_line"] = True  # hand-maintained list, one object per line
        return style
    m = re.match(r'[\[{]\s*\n( +)\S', text)
    if m:
        style["indent"] = len(m.group(1))
    elif "\n" not in text.strip():
        style["compact"] = '": ' not in text and '":' in text
    return style


def dump_json(value, style: dict) -> str:
    if style.get("one_per_line") and isinstance(value, list) and value:
        body = ",\n".join("  " + json.dumps(e, ensure_ascii=style["ascii"]) for e in value)
        return "[\n" + body + "\n]" + ("\n" if style["newline"] else "")
    kwargs = {"ensure_ascii": style["ascii"], "indent": style["indent"]}
    if style["indent"] is None and style["compact"]:
        kwargs["separators"] = (",", ":")
    return json.dumps(value, **kwargs) + ("\n" if style["newline"] else "")


def read_json_file(path: Path):
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8")
        return text, json.loads(text)
    except ValueError:
        raise SplitError(f"{path.name} is not valid UTF-8 JSON") from None


def _canon(entry) -> str:
    return json.dumps(entry, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


# --------------------------------------------------------------------------- shape handlers

def _list_specs(spec: dict) -> list[dict]:
    if spec["shape"] == "array":
        return [{"key": None, "school_field": spec.get("school_field")}]
    return spec.get("lists", [])


def split_object(obj, spec: dict, pol: Policy):
    """Return (public, restricted) halves of one JSON document."""
    shape = spec["shape"]
    if shape == "array":
        if not isinstance(obj, list):
            raise SplitError(f"{spec['path']} should be a list")
        ls = _list_specs(spec)[0]
        pub = [e for e in obj if pol.entry_public(e, ls, spec)]
        res = [e for e in obj if not pol.entry_public(e, ls, spec)]
        return pub, res
    if not isinstance(obj, dict):
        raise SplitError(f"{spec['path']} should be an object")
    if shape == "object_lists":
        pub, res = dict(obj), {}
        for ls in spec["lists"]:
            key = ls["key"]
            if key not in obj:
                continue
            if not isinstance(obj[key], list):
                raise SplitError(f"{spec['path']}: {key} should be a list")
            pub[key] = [e for e in obj[key] if pol.entry_public(e, ls, spec)]
            res[key] = [e for e in obj[key] if not pol.entry_public(e, ls, spec)]
        return pub, res
    if shape == "object_keys":
        pub = {k: v for k, v in obj.items() if pol.key_public(k, spec)}
        res = {k: v for k, v in obj.items() if not pol.key_public(k, spec)}
        return pub, res
    raise SplitError(f"unknown shape in rules: {shape}")


def merge_object(pub, blob, spec: dict, pol: Policy):
    """Merge a restricted blob into the public document (idempotent).

    The blob is the source of truth for restricted schools: any restricted entry already in the
    tree (e.g. an older copy left over before the first successful split) is dropped first, so an
    announcement never appears twice with different content."""
    shape = spec["shape"]
    dropped = 0
    if shape == "array":
        ls = _list_specs(spec)[0]
        if not isinstance(blob, list):
            raise SplitError(f"blob of {spec['path']} should be a list")
        pub = [e for e in pub if pol.entry_public(e, ls, spec)]
        have = {_canon(e) for e in pub}
        add = []
        for e in blob:
            if pol.entry_public(e, ls, spec):
                dropped += 1
            elif _canon(e) not in have:
                add.append(e)
        return list(pub) + add, dropped
    if not isinstance(blob, dict):
        raise SplitError(f"blob of {spec['path']} should be an object")
    out = dict(pub)
    if shape == "object_lists":
        for ls in spec["lists"]:
            key = ls["key"]
            if key not in blob:
                continue
            if not isinstance(blob[key], list):
                raise SplitError(f"blob of {spec['path']}: {key} should be a list")
            base = [e for e in (out.get(key) or []) if pol.entry_public(e, ls, spec)]
            have = {_canon(e) for e in base}
            for e in blob[key]:
                if pol.entry_public(e, ls, spec):
                    dropped += 1
                elif _canon(e) not in have:
                    base.append(e)
                    have.add(_canon(e))
            out[key] = base
        return out, dropped
    if shape == "object_keys":
        out = {k: v for k, v in out.items() if pol.key_public(k, spec)}
        for k, v in blob.items():
            if pol.key_public(k, spec):
                dropped += 1
            else:
                out[k] = v
        return out, dropped
    raise SplitError(f"unknown shape in rules: {shape}")


def apply_derived(specs: list[dict], docs: dict, *, add_if_missing: bool) -> None:
    """Recompute counters that depend on list lengths (series.count, latest.total_items)."""
    for spec in specs:
        obj = docs.get(spec["path"])
        if not isinstance(obj, dict):
            continue
        for rule in spec.get("derived", []):
            field = rule["field"]
            if field not in obj and not add_if_missing:
                continue
            if "len_of" in rule:
                lst = obj.get(rule["len_of"])
            else:
                ref_path, ref_key = rule["count_of"].split("#")
                ref = docs.get(ref_path)
                lst = ref.get(ref_key) if isinstance(ref, dict) else None
            if isinstance(lst, list):
                obj[field] = len(lst)


# --------------------------------------------------------------------------- calendar.ics

def parse_ics(raw: bytes):
    """Split an iCalendar file into (header, [VEVENT blocks], footer), byte-exact."""
    text = raw.decode("utf-8")
    lines = text.splitlines(keepends=True)
    header, events, footer, cur, state = [], [], [], None, "header"
    for line in lines:
        bare = line.strip()
        if state == "header":
            if bare == "BEGIN:VEVENT":
                state, cur = "event", [line]
            else:
                header.append(line)
        elif state == "event":
            cur.append(line)
            if bare == "END:VEVENT":
                events.append("".join(cur))
                cur, state = None, "between"
        else:
            if bare == "BEGIN:VEVENT":
                state, cur = "event", [line]
            else:
                footer.append(line)
    if state == "event":
        raise SplitError("calendar.ics has an unterminated VEVENT")
    return "".join(header), events, "".join(footer)


def ics_summary(block: str) -> str:
    lines = block.splitlines()
    for i, line in enumerate(lines):
        if line.startswith("SUMMARY"):
            value = line.split(":", 1)[1] if ":" in line else ""
            j = i + 1
            while j < len(lines) and lines[j][:1] in (" ", "\t"):
                value += lines[j][1:]
                j += 1
            return value
    return ""


def ics_event_public(block: str, pol: Policy) -> bool:
    m = re.match(r"\[([^\]]+)\]", ics_summary(block))
    if not m:
        return False
    return pol.name_to_id.get(m.group(1).lower()) in pol.public


# --------------------------------------------------------------------------- split plan

class Plan:
    def __init__(self):
        self.blobs: dict[str, bytes] = {}      # blob name -> gz bytes
        self.writes: dict[str, bytes] = {}     # rel path -> new public bytes
        self.delete_files: list[str] = []
        self.delete_dirs: list[str] = []
        self.stats: list[str] = []
        self.moved = 0
        self.kept = 0


def _school_names_in(directory: Path, kind: str, pattern: str):
    if not directory.is_dir():
        return []
    out = []
    for child in sorted(directory.iterdir()):
        if kind == "files" and child.is_file():
            m = re.fullmatch(re.escape(pattern).replace(re.escape("{id}"), "(.+)"), child.name)
            if m:
                out.append((m.group(1), child))
        elif kind == "dirs" and child.is_dir():
            out.append((child.name, child))
    return out


def plan_split(root: Path, rules: dict, pol: Policy) -> Plan:
    root = Path(root)
    plan = Plan()
    suffix = rules.get("blob_suffix", ".gz")
    specs = rules["files"]
    loaded: dict[str, tuple[str, object]] = {}
    for spec in specs:
        path = root / spec["path"]
        if path.is_file():
            loaded[spec["path"]] = read_json_file(path)
    pub_docs, res_docs = {}, {}
    for spec in specs:
        if spec["path"] in loaded:
            pub_docs[spec["path"]], res_docs[spec["path"]] = split_object(loaded[spec["path"]][1], spec, pol)
    apply_derived(specs, pub_docs, add_if_missing=False)
    apply_derived(specs, res_docs, add_if_missing=True)
    for spec in specs:
        rel = spec["path"]
        if rel not in loaded:
            continue
        text, original = loaded[rel]
        plan.blobs[rel + suffix] = gz_bytes(blob_json_bytes(res_docs[rel]))
        if pub_docs[rel] != original:
            plan.writes[rel] = dump_json(pub_docs[rel], detect_style(text)).encode("utf-8")
        for ls in _list_specs(spec):
            if spec["shape"] == "array":
                pub_n, res_n = len(pub_docs[rel]), len(res_docs[rel])
            elif ls["key"] in res_docs[rel]:
                pub_n, res_n = len(pub_docs[rel][ls["key"]]), len(res_docs[rel][ls["key"]])
            else:
                continue
            plan.kept += pub_n
            plan.moved += res_n
            plan.stats.append(f"{rel}{'' if ls['key'] is None else '#' + ls['key']}: keep {pub_n}, move {res_n}")
        if spec["shape"] == "object_keys":
            plan.stats.append(f"{rel}: keep {len(pub_docs[rel])}, move {len(res_docs[rel])}")
            plan.kept += len(pub_docs[rel])
            plan.moved += len(res_docs[rel])
    for rule in rules.get("per_school", []):
        directory = root / rule["dir"]
        moved = kept = 0
        for sid, child in _school_names_in(directory, rule["kind"], rule.get("pattern", "{id}.json")):
            if sid in pol.public:
                kept += 1
                continue
            moved += 1
            rel = child.relative_to(root).as_posix()
            if rule["kind"] == "files":
                if rule.get("store", True):
                    plan.blobs[rel + suffix] = gz_bytes(child.read_bytes())
                plan.delete_files.append(rel)
            else:
                plan.delete_dirs.append(rel)
        if moved or kept:
            plan.stats.append(f"{rule['dir']}/: keep {kept}, remove {moved}"
                              f"{'' if rule.get('store', True) else ' (derived, not stored)'}")
        plan.moved += moved
        plan.kept += kept
    ics = rules.get("calendar_ics")
    if ics and (root / ics["path"]).is_file():
        raw = (root / ics["path"]).read_bytes()
        header, events, footer = parse_ics(raw)
        pub_events = [b for b in events if ics_event_public(b, pol)]
        res_events = [b for b in events if not ics_event_public(b, pol)]
        plan.blobs[ics["path"] + suffix] = gz_bytes((header + "".join(res_events) + footer).encode("utf-8"))
        if res_events:
            plan.writes[ics["path"]] = (header + "".join(pub_events) + footer).encode("utf-8")
        plan.stats.append(f"{ics['path']}: keep {len(pub_events)}, move {len(res_events)}")
        plan.kept += len(pub_events)
        plan.moved += len(res_events)
    return plan


def cmd_split(root: Path, out: Path, phase: str) -> int:
    started = time.time()
    rules = load_rules(root)
    pol = Policy(rules, parse_registry(root, rules))
    plan = plan_split(root, rules, pol)
    if phase in ("blobs", "all"):
        if out.is_dir():
            for stale in out.rglob("*.gz"):
                stale.unlink()
        for name, data in plan.blobs.items():
            atomic_write_bytes(out / name, data)
        total = sum(len(d) for d in plan.blobs.values())
        print(f"split blobs: {len(plan.blobs)} written, {total} bytes gz -> {out}")
    if phase in ("apply", "all"):
        for name, data in plan.blobs.items():
            blob = out / name
            if not blob.is_file() or blob.read_bytes() != data:
                raise SplitError("blob directory does not match the tree (run the blobs phase again); "
                                 "nothing was changed")
        written = 0
        staged = []
        for rel, data in plan.writes.items():
            target = root / rel
            tmp = target.with_name("." + target.name + ".restricted-tmp")
            tmp.write_bytes(data)
            staged.append((tmp, target))
        for tmp, target in staged:
            os.replace(tmp, target)
            written += 1
        for rel in plan.delete_files:
            (root / rel).unlink()
        for rel in plan.delete_dirs:
            shutil.rmtree(root / rel)
        print(f"split apply: {written} public files rewritten, {len(plan.delete_files)} files and "
              f"{len(plan.delete_dirs)} directories removed")
    for line in plan.stats:
        print("  " + line)
    print(f"split done in {time.time() - started:.1f}s (kept {plan.kept}, restricted {plan.moved})")
    return 0


# --------------------------------------------------------------------------- restore

def known_blob_names(root: Path, rules: dict, pol: Policy, in_dir: Path) -> set[str]:
    suffix = rules.get("blob_suffix", ".gz")
    names = {s["path"] + suffix for s in rules["files"]}
    if rules.get("calendar_ics"):
        names.add(rules["calendar_ics"]["path"] + suffix)
    for rule in rules.get("per_school", []):
        if rule["kind"] == "files" and rule.get("store", True):
            base = in_dir / rule["dir"]
            if base.is_dir():
                for child in base.glob("*" + suffix):
                    names.add(child.relative_to(in_dir).as_posix())
    return names


def cmd_restore(root: Path, in_dir: Path) -> int:
    started = time.time()
    rules = load_rules(root)
    pol = Policy(rules, parse_registry(root, rules))
    suffix = rules.get("blob_suffix", ".gz")
    if not in_dir.is_dir():
        print("restore: no blob directory, nothing to restore")
        return 0
    specs = rules["files"]
    merged_docs, originals, styles, missing = {}, {}, {}, 0
    blobs_used = 0
    dropped = 0
    for spec in specs:
        rel = spec["path"]
        path = root / rel
        if path.is_file():
            text, obj = read_json_file(path)
            originals[rel], styles[rel] = obj, detect_style(text)
        merged_docs[rel] = originals.get(rel)
    for spec in specs:
        rel = spec["path"]
        blob_path = in_dir / (rel + suffix)
        if not blob_path.is_file():
            missing += 1
            continue
        try:
            blob = json.loads(gzip.decompress(blob_path.read_bytes()).decode("utf-8"))
        except (OSError, ValueError, EOFError):
            raise SplitError(f"blob of {rel} is not valid gzip JSON") from None
        pub = originals.get(rel)
        if pub is None:
            if spec["shape"] == "array":
                pub = []
            elif spec["shape"] == "object_keys":
                pub = {}
            else:
                print(f"restore: {rel} is missing in the tree, its blob is skipped")
                continue
            styles[rel] = {"newline": True, "indent": 1, "compact": False, "ascii": False}
        merged_docs[rel], d = merge_object(pub, blob, spec, pol)
        dropped += d
        blobs_used += 1
    docs = {k: v for k, v in merged_docs.items() if v is not None}
    apply_derived(specs, docs, add_if_missing=False)
    written = 0
    for spec in specs:
        rel = spec["path"]
        if rel not in docs or docs[rel] == originals.get(rel):
            continue
        atomic_write_bytes(root / rel, dump_json(docs[rel], styles[rel]).encode("utf-8"))
        written += 1
    restored_files = 0
    for rule in rules.get("per_school", []):
        if rule["kind"] != "files" or not rule.get("store", True):
            continue
        base = in_dir / rule["dir"]
        if not base.is_dir():
            continue
        for blob_path in sorted(base.glob("*" + suffix)):
            name = blob_path.name[: -len(suffix)]
            m = re.fullmatch(re.escape(rule.get("pattern", "{id}.json")).replace(re.escape("{id}"), "(.+)"), name)
            if not m or m.group(1) in pol.public:
                dropped += 1
                continue
            try:
                data = gzip.decompress(blob_path.read_bytes())
            except (OSError, EOFError):
                raise SplitError("a per-school blob is not valid gzip") from None
            atomic_write_bytes(root / rule["dir"] / name, data)
            restored_files += 1
    ics = rules.get("calendar_ics")
    ics_added = 0
    if ics and (in_dir / (ics["path"] + suffix)).is_file():
        blob_text = gzip.decompress((in_dir / (ics["path"] + suffix)).read_bytes()).decode("utf-8")
        _, blob_events, _ = parse_ics(blob_text.encode("utf-8"))
        target = root / ics["path"]
        if target.is_file():
            header, events, footer = parse_ics(target.read_bytes())
        else:
            header, events, footer = parse_ics(blob_text.encode("utf-8"))
            events = []
        stale = [e for e in events if not ics_event_public(e, pol)]
        events = [e for e in events if ics_event_public(e, pol)]
        have = set(events)
        add = [b for b in blob_events if not ics_event_public(b, pol) and b not in have]
        if add or stale:
            atomic_write_bytes(target, (header + "".join(events + add) + footer).encode("utf-8"))
            ics_added = len(add)
    known = known_blob_names(root, rules, pol, in_dir)
    extra = [p for p in in_dir.rglob("*") if p.is_file() and p.relative_to(in_dir).as_posix() not in known]
    if extra:
        print(f"restore: WARNING {len(extra)} unknown blob(s) ignored")
    if dropped:
        print(f"restore: WARNING {dropped} blob entr(ies) of a public school ignored")
    print(f"restore: {blobs_used} blobs merged ({missing} rules without blob), {written} files rewritten, "
          f"{restored_files} per-school files, {ics_added} calendar events, {time.time() - started:.1f}s")
    return 0


# --------------------------------------------------------------------------- verify

def scan_files(root: Path, rules: dict) -> list[Path]:
    root = Path(root)
    ignored = {root / p for p in rules.get("leak_scan", {}).get("ignored", [])}
    files: list[Path] = []
    data = root / "docs" / "data"
    if data.is_dir():
        files += [p for p in sorted(data.rglob("*")) if p.is_file()]
    scraper = root / "scraper"
    if scraper.is_dir():
        files += sorted(scraper.glob("*.json"))
    ics = root / "docs" / "calendar.ics"
    if ics.is_file():
        files.append(ics)
    files = [p for p in files if p not in ignored]
    skip = _git_ignored(root, files)
    return [p for p in files if p not in skip]


def _git_ignored(root: Path, files: list[Path]) -> set[Path]:
    """Files git never commits (.gitignore, e.g. scraper/new_items.json) cannot leak; skip them.
    Outside a git checkout (tests on temp copies) nothing is skipped."""
    if not files:
        return set()
    try:
        rel = "\0".join(p.relative_to(root).as_posix() for p in files) + "\0"
        done = subprocess.run(["git", "-C", str(root), "check-ignore", "-z", "--stdin"],
                              input=rel.encode("utf-8"), capture_output=True, timeout=30)
    except (OSError, ValueError, subprocess.SubprocessError):
        return set()
    if done.returncode not in (0, 1):
        return set()
    return {root / name for name in done.stdout.decode("utf-8").split("\0") if name}


def _walk(value, visit):
    stack = [value]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            visit(cur)
            stack.extend(cur.values())
        elif isinstance(cur, list):
            stack.extend(cur)


def verify_tree(root: Path, rules: dict, pol: Policy) -> list[tuple[str, str, int]]:
    restricted_ids = sorted(i for i in pol.ids if i not in pol.public)
    id_re = re.compile(r'(?:(?<=["/:\[])|^)(?:%s)(?=["/:\]]|-\d|\.json)' % "|".join(map(re.escape, restricted_ids)),
                       re.M) if restricted_ids else None
    bases = sorted(pol.restricted_bases, key=len, reverse=True)
    host_re = re.compile(r"(?<![a-z0-9-])(?:%s)(?![a-z0-9-])" % "|".join(map(re.escape, bases))) if bases else None
    labels = {s[k].lower() for sid, s in pol.schools.items() if sid not in pol.public
              for k in ("name", "short") if s[k]} | {i.lower() for i in restricted_ids}
    findings: dict[tuple[str, str], int] = {}

    def add(rel, kind, n=1):
        if n:
            findings[(rel, kind)] = findings.get((rel, kind), 0) + n

    for path in scan_files(root, rules):
        rel = path.relative_to(root).as_posix()
        text = path.read_bytes().decode("utf-8", errors="replace")
        if id_re:
            add(rel, "restricted school id", len(id_re.findall(text)))
        if host_re:
            add(rel, "restricted school host", len(host_re.findall(text.lower())))
        if path.suffix == ".json":
            try:
                doc = json.loads(text)
            except ValueError:
                add(rel, "unparseable json")
                continue
            hits = []

            def visit(node):
                for key, val in node.items():
                    if key.lower() in labels:
                        hits.append(1)
                    if key in SCHOOL_VALUE_KEYS and isinstance(val, str) and val.lower() in labels:
                        hits.append(1)

            _walk(doc, visit)
            add(rel, "restricted school field/key", len(hits))
        elif path.suffix == ".ics":
            _, events, _ = parse_ics(path.read_bytes())
            add(rel, "restricted calendar event", sum(1 for b in events if not ics_event_public(b, pol)))
    return [(rel, kind, n) for (rel, kind), n in sorted(findings.items())]


def cmd_verify(root: Path) -> int:
    rules = load_rules(root)
    pol = Policy(rules, parse_registry(root, rules))
    findings = verify_tree(root, rules, pol)
    files = len(scan_files(root, rules))
    ignored = ", ".join(rules.get("leak_scan", {}).get("ignored", []))
    if findings:
        # Per-school file names are school ids: show only the directory.
        masked = [d + "/*" for d in (r["dir"] for r in rules.get("per_school", []))]
        for rel, kind, n in findings:
            shown = next((m for m in masked if rel.startswith(m[:-1])), rel)
            print(f"LEAK {shown}: {n} x {kind}")
        print(f"verify FAILED: {len(findings)} finding(s) in {files} files (values are never printed)")
        return 1
    print(f"verify ok: {files} files scanned, no restricted school data "
          f"(not scanned, code/config: {ignored})")
    return 0


def rule_paths(rules: dict) -> list[str]:
    """Every repo path the split may rewrite or delete."""
    paths = [f["path"] for f in rules["files"]]
    if rules.get("calendar_ics"):
        paths.append(rules["calendar_ics"]["path"])
    paths += [r["dir"] for r in rules.get("per_school", [])]
    return sorted(set(paths))


def cmd_stage(root: Path) -> int:
    """Stage every split path (rewrites and deletions) so the commit always carries the split.

    Workflows commit with their own `git add` lists; a rewritten file missing from such a list
    (scraper/site_map.json, scraper/events.json, …) would otherwise keep its old full copy in git."""
    rules = load_rules(root)
    paths = []
    for rel in rule_paths(rules):
        tracked = subprocess.run(["git", "-C", str(root), "ls-files", "--error-unmatch", "--", rel],
                                 capture_output=True).returncode == 0
        if (root / rel).exists() or tracked:
            paths.append(rel)
    if not paths:
        print("stage: nothing to stage")
        return 0
    done = subprocess.run(["git", "-C", str(root), "add", "-A", "--", *paths], capture_output=True, text=True)
    if done.returncode != 0:
        print("stage: git add failed", file=sys.stderr)
        return 1
    print(f"stage: {len(paths)} split path(s) staged")
    return 0


def cmd_verify_staged(root: Path) -> int:
    """Leak scan of what git will commit: every split path must be identical in the index and the tree."""
    rules = load_rules(root)
    done = subprocess.run(["git", "-C", str(root), "diff", "--name-only", "--", *rule_paths(rules)],
                          capture_output=True, text=True)
    if done.returncode != 0:
        print("verify: cannot compare the index with the tree", file=sys.stderr)
        return 1
    unstaged = [line for line in done.stdout.splitlines() if line.strip()]
    if unstaged:
        print(f"verify FAILED: {len(unstaged)} split file(s) differ from what would be committed (run stage first)")
        return 1
    return cmd_verify(root)


# --------------------------------------------------------------------------- cli

def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("split")
    p.add_argument("--root", default=".")
    p.add_argument("--out", required=True)
    p.add_argument("--phase", choices=["blobs", "apply", "all"], default="all")
    p = sub.add_parser("restore")
    p.add_argument("--root", default=".")
    p.add_argument("--in", dest="in_dir", required=True)
    p = sub.add_parser("verify")
    p.add_argument("--root", default=".")
    p.add_argument("--staged", action="store_true",
                   help="also fail when a split file differs from the git index (what will be committed)")
    p = sub.add_parser("stage")
    p.add_argument("--root", default=".")
    args = parser.parse_args(argv)
    try:
        root = Path(args.root).resolve()
        if args.cmd == "split":
            return cmd_split(root, Path(args.out).resolve(), args.phase)
        if args.cmd == "restore":
            return cmd_restore(root, Path(args.in_dir).resolve())
        if args.cmd == "stage":
            return cmd_stage(root)
        return cmd_verify_staged(root) if args.staged else cmd_verify(root)
    except SplitError as exc:
        print(f"restricted_split: ERROR {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
