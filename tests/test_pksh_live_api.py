"""Opt-in, read-only probe of PKSH's official iSchool JSON endpoints.

It deliberately exits successfully when the official server's certificate chain
cannot be validated: availability is an external condition, while treating it
as an empty list would be a data-loss bug.  CI enables this probe on the
feature branch so its log records which tf variant, if any, actually worked.
"""
import json
import os
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))
from ischool_adapter import PkshAdapter  # noqa: E402

if os.environ.get("PKSH_LIVE_API") != "1":
    print("PKSH live API probe skipped (set PKSH_LIVE_API=1)")
    raise SystemExit(0)

config = json.loads((ROOT / "scraper" / "config.json").read_text(encoding="utf-8"))
school = next(row for row in config["schools"] if row["id"] == "pksh")
adapter = PkshAdapter(school)
session = requests.Session()
session.headers["User-Agent"] = "cy-school-news PKSH API verification"

uid = adapter.fallback_uid
try:
    board = adapter._request(session, "get", "/ischool/widget/site_news/main2.php",
                             timeout=20, params={"uid": uid})
    board.raise_for_status()
    uid, fallback = adapter.discover_board(board.text)
    print(json.dumps({"pksh_board_discovery": "fallback" if fallback else "html", "uid": uid}))
except requests.exceptions.RequestException as exc:
    print(json.dumps({"pksh_board_discovery": "unavailable", "error": type(exc).__name__,
                      "http_status": getattr(getattr(exc, "response", None), "status_code", None)}))

for tf in (1, 2):
    try:
        page = adapter.fetch_list(session, uid, tf=tf, timeout=20)
    except requests.exceptions.SSLError:
        print(json.dumps({"pksh_list": "tls_certificate_error", "method": "POST", "tf": tf}))
        continue
    except Exception as exc:
        print(json.dumps({"pksh_list": "unavailable", "method": "POST", "tf": tf,
                          "error": type(exc).__name__,
                          "http_status": getattr(getattr(exc, "response", None), "status_code", None)}))
        continue
    print(json.dumps({"pksh_list": "ok", "method": "POST", "tf": tf,
                      "rows": len(page.items), "total_pages": page.total_pages}))
    if page.items:
        try:
            detail = adapter.fetch_detail(session, page.items[0]["source_id"].split(":", 1)[1], uid)
            print(json.dumps({"pksh_detail": "ok", "attachments": len(detail.attachments),
                              "external_links": len(detail.external_links)}))
        except Exception as exc:
            print(json.dumps({"pksh_detail": "unavailable", "error": type(exc).__name__}))
    break
else:
    print("PKSH live API unavailable; no unverified TLS or alternate source was used")
