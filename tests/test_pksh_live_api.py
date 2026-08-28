"""GitHub-runner acceptance probe for PKSH's official iSchool endpoints.

This is intentionally read-only and fail-closed.  A network, TLS, HTTP, JSON,
or schema error is BLOCKED, never a zero-announcement result.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "pksh-live-report.json"
sys.path.insert(0, str(ROOT / "scraper"))
from ischool_adapter import PkshAdapter  # noqa: E402


class Blocked(RuntimeError):
    pass


def compact_error(exc: Exception) -> dict:
    response = getattr(exc, "response", None)
    return {
        "error": type(exc).__name__,
        "http_status": getattr(response, "status_code", None),
    }


def emit(event: str, **fields) -> None:
    print(json.dumps({"event": event, **fields}, ensure_ascii=False))


def write_report(report: dict) -> None:
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if os.environ.get("PKSH_LIVE_API") != "1":
    print("PKSH live acceptance skipped (set PKSH_LIVE_API=1)")
    raise SystemExit(0)

config = json.loads((ROOT / "scraper" / "config.json").read_text(encoding="utf-8"))
school = next(row for row in config["schools"] if row["id"] == "pksh")
adapter = PkshAdapter(school)
session = requests.Session()
session.headers.update({
    "User-Agent": "cy-school-news PKSH live acceptance",
    "Accept-Language": "zh-TW,zh;q=0.9",
})
report = {"verdict": "BLOCKED", "network": {}, "api": {}, "records": []}
report["network"]["requests_ca_bundle"] = requests.certs.where()
emit("pksh_tls_policy", verify=True,
     ca_bundle=report["network"]["requests_ca_bundle"])

try:
    board_params = {
        "allbtn": "0", "maximize": "1", "uid": adapter.fallback_uid,
    }
    try:
        board = adapter._request(session, "get", "/ischool/widget/site_news/main2.php",
                                 timeout=25, params=board_params)
        report["network"]["main2_http_status"] = board.status_code
        report["network"]["main2_content_type"] = board.headers.get("Content-Type", "")
        board.raise_for_status()
    except requests.exceptions.RequestException as exc:
        report["network"]["main2"] = compact_error(exc)
        raise Blocked(f"main2 GET unavailable: {type(exc).__name__}") from exc

    uid, used_fallback = adapter.discover_board(board.text)
    root_match = re.search(r"g_root_path\s*=\s*[\"']([^\"']+)", board.text)
    report["api"].update({
        "discovered_uid": uid,
        "used_fallback": used_fallback,
        "g_root_path": root_match.group(1) if root_match else "",
    })
    emit("pksh_board", http_status=board.status_code, uid=uid,
         used_fallback=used_fallback, g_root_path=report["api"]["g_root_path"])
    if used_fallback:
        raise Blocked("main2 did not expose a discoverable board UID")

    list_data = {
        "field": "time", "order": "DESC", "pageNum": "0", "maxRows": "30",
        "keyword": "", "uid": uid, "tf": "1", "auth_type": "user", "flock": "",
    }
    selected_tf = 1
    try:
        response = adapter._request(session, "post", adapter.list_path, timeout=25,
                                    data=list_data)
        response.raise_for_status()
        content_type = response.headers.get("Content-Type", "")
        payload = response.json()
        page = adapter.parse_list(payload, uid)
    except requests.exceptions.RequestException as exc:
        report["api"]["list"] = compact_error(exc)
        raise Blocked(f"list POST network/HTTP failure: {type(exc).__name__}") from exc
    except (ValueError, TypeError) as exc:
        report["api"]["list"] = {"error": type(exc).__name__, "reason": str(exc)[:160]}
        raise Blocked("list POST returned invalid JSON/schema") from exc

    # tf=2 is permitted only after tf=1 completed normally with a valid zero-row schema.
    if not page.items:
        selected_tf = 2
        list_data["tf"] = "2"
        try:
            response = adapter._request(session, "post", adapter.list_path, timeout=25,
                                        data=list_data)
            response.raise_for_status()
            content_type = response.headers.get("Content-Type", "")
            payload = response.json()
            page = adapter.parse_list(payload, uid)
        except requests.exceptions.RequestException as exc:
            report["api"]["list_tf2"] = compact_error(exc)
            raise Blocked(f"tf=2 list POST network/HTTP failure: {type(exc).__name__}") from exc
        except (ValueError, TypeError) as exc:
            report["api"]["list_tf2"] = {"error": type(exc).__name__, "reason": str(exc)[:160]}
            raise Blocked("tf=2 list POST returned invalid JSON/schema") from exc

    report["api"].update({
        "list_http_status": response.status_code,
        "list_content_type": content_type,
        "tf": selected_tf,
        "total_pages": page.total_pages,
        "rows": len(page.items),
    })
    emit("pksh_list", method="POST", http_status=response.status_code,
         content_type=content_type, tf=selected_tf,
         total_pages=page.total_pages, rows=len(page.items))
    if len(page.items) < 5:
        raise Blocked(f"valid list returned only {len(page.items)} announcements; need at least 5")

    verified = []
    attachment_found = None

    def fetch_detail(item: dict) -> dict:
        nid = item["source_id"].split(":", 1)[1]
        detail_response = adapter._request(
            session, "get", adapter.detail_path, timeout=25,
            params={"nid": nid, "dir": "0", "uid": uid})
        detail_response.raise_for_status()
        try:
            detail_payload = detail_response.json()
        except ValueError:
            detail_payload = detail_response.text
        detail = adapter.parse_detail(detail_payload)
        return {
            "newsId": nid,
            "source_id": item["source_id"],
            "id": item["id"],
            "title": item["title"][:160],
            "date": item.get("date", ""),
            "unit": item.get("source_unit", ""),
            "category": item.get("source_category", ""),
            "clicks": item.get("view_count", ""),
            "detail": "nonempty" if detail.content else "empty",
            "detail_http_status": detail_response.status_code,
            "external_links": len(detail.external_links),
            "attachments": len(detail.attachments),
            "attachment_urls": [row["url"] for row in detail.attachments[:3]],
        }

    for item in page.items[:5]:
        try:
            row = fetch_detail(item)
        except Exception as exc:
            row = {
                "newsId": item["source_id"].split(":", 1)[1],
                "title": item["title"][:160], "detail": "failed", **compact_error(exc),
            }
        verified.append(row)
        emit("pksh_record", **row)
        if row.get("attachments") and attachment_found is None:
            attachment_found = row
        time.sleep(0.4)

    report["records"] = verified
    detail_failures = sum(row.get("detail") != "nonempty" for row in verified)
    report["api"]["detail_failures"] = detail_failures
    if detail_failures:
        raise Blocked(f"{detail_failures} of the five required detail checks failed/empty")

    # Bounded attachment search: first five plus at most 20 more rows from the
    # first three API pages. This never becomes an unbounded historical crawl.
    checked_for_attachment = len(verified)
    if attachment_found is None:
        candidates = page.items[5:]
        for page_no in range(1, min(max(page.total_pages, 1), 3)):
            if len(candidates) >= 20:
                break
            extra = adapter.fetch_list(session, uid, page=page_no, tf=selected_tf, timeout=25)
            candidates.extend(extra.items)
            time.sleep(0.4)
        for item in candidates[:20]:
            checked_for_attachment += 1
            try:
                row = fetch_detail(item)
            except Exception:
                time.sleep(0.4)
                continue
            if row.get("attachments"):
                attachment_found = row
                emit("pksh_attachment", newsId=row["newsId"],
                     attachments=row["attachments"], urls=row["attachment_urls"])
                break
            time.sleep(0.4)

    report["api"]["attachment_search_checked"] = checked_for_attachment
    report["api"]["attachment_status"] = (
        f"verified:{attachment_found['newsId']}" if attachment_found
        else f"none_in_bounded_scope:{checked_for_attachment}")
    report["verdict"] = "VERIFIED"
    write_report(report)
    emit("pksh_verdict", verdict="VERIFIED",
         attachment_status=report["api"]["attachment_status"])
except Blocked as exc:
    report["blocked_reason"] = str(exc)
    write_report(report)
    emit("pksh_verdict", verdict="BLOCKED", reason=str(exc))
    raise SystemExit(2)
