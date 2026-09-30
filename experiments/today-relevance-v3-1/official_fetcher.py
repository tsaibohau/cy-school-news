"""Bounded same-origin/allowlisted official document fetch; no crawler loop."""
from __future__ import annotations

import ipaddress
from urllib.parse import parse_qs, urljoin, urlparse

ALLOWED_EXTENSIONS={".pdf",".doc",".docx",".xls",".xlsx",".jpg",".jpeg",".png",".gif",".webp"}
MAX_BYTES=8*1024*1024
MAX_REDIRECTS=3


def _safe_url(url: str, allowed_hosts: set[str]) -> bool:
    try:
        p=urlparse(url); host=(p.hostname or "").lower()
        if p.scheme!="https" or not host or p.username or p.password or (p.port not in (None,443)):
            return False
        if host not in {x.lower() for x in allowed_hosts}:
            return False
        try:
            ip=ipaddress.ip_address(host)
            if not ip.is_global: return False
        except ValueError:
            pass
        suffix=(p.path.rsplit("/",1)[-1]).lower()
        if any(suffix.endswith(ext) for ext in ALLOWED_EXTENSIONS):
            return True
        query=parse_qs(p.query)
        for key in ("filename", "file_name", "file", "name", "download"):
            for candidate in query.get(key, []):
                candidate_suffix=candidate.rsplit("/",1)[-1].lower()
                if any(candidate_suffix.endswith(ext) for ext in ALLOWED_EXTENSIONS):
                    return True
        return False
    except ValueError:
        return False


def fetch_official_document(session, url: str, *, source_host: str,
                            trusted_official_hosts: set[str] | None=None,
                            timeout: tuple[float,float]=(3.0,12.0),max_bytes: int=MAX_BYTES) -> dict:
    hosts={source_host.lower(),*((x or "").lower() for x in (trusted_official_hosts or set()))}
    current=url
    for hop in range(MAX_REDIRECTS+1):
        if not _safe_url(current,hosts):
            return {"canonical_status":"unknown","parse_status":"blocked","reason":"untrusted_or_unsafe_url"}
        try:
            response=session.get(current,stream=True,timeout=timeout,allow_redirects=False)
        except Exception as exc:
            kind="temporarily_unreachable" if "timeout" in type(exc).__name__.lower() or "connection" in type(exc).__name__.lower() else "unknown"
            return {"canonical_status":kind,"parse_status":"fetch_failed","reason":type(exc).__name__}
        try:
            code=int(response.status_code)
            if code in (301,302,303,307,308):
                location=response.headers.get("location","")
                next_url=urljoin(current,location)
                if hop>=MAX_REDIRECTS or not _safe_url(next_url,hosts):
                    return {"canonical_status":"unknown","parse_status":"blocked","reason":"unsafe_redirect"}
                current=next_url
                continue
            if code in (404,410):
                return {"canonical_status":"missing_confirmed","http_status":code,"parse_status":"missing"}
            if code<200 or code>=300:
                return {"canonical_status":"temporarily_unreachable" if code>=500 else "unknown","http_status":code,"parse_status":"fetch_failed"}
            declared=response.headers.get("content-length")
            if declared:
                try:
                    if int(declared)>max_bytes:return {"canonical_status":"unknown","parse_status":"blocked","reason":"size_limit"}
                except ValueError: pass
            chunks=[];size=0
            for chunk in response.iter_content(64*1024):
                if not chunk:continue
                size+=len(chunk)
                if size>max_bytes:return {"canonical_status":"unknown","parse_status":"blocked","reason":"size_limit"}
                chunks.append(chunk)
            return {"canonical_status":"available","http_status":code,"final_url":current,
                    "content_type":response.headers.get("content-type",""),"bytes":b"".join(chunks),
                    "byte_count":size,"parse_status":"downloaded"}
        finally:
            close=getattr(response,"close",None)
            if close:close()
    return {"canonical_status":"unknown","parse_status":"blocked","reason":"redirect_limit"}
