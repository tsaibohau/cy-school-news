"""Find and acquire only allowlisted official document links from a parsed page."""
from __future__ import annotations

from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse, unquote, parse_qs

from official_fetcher import ALLOWED_EXTENSIONS, fetch_official_document

MAX_LINKS_PER_PAGE = 12


class _DocumentLinks(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links=[]
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if tag.lower() in {"a","area","iframe"}:
            href=attrs.get("href") or attrs.get("src")
            if href:self.links.append(href.strip())


def extract_official_document_links(html: str, page_url: str, *, trusted_hosts: set[str]) -> list[str]:
    parser=_DocumentLinks();parser.feed(html or "")
    allowed={h.lower() for h in trusted_hosts}
    page_host=(urlparse(page_url).hostname or "").lower()
    if page_host:allowed.add(page_host)
    out=[];seen=set()
    for raw in parser.links:
        candidate=urljoin(page_url,raw)
        parsed=urlparse(candidate)
        host=(parsed.hostname or "").lower()
        if parsed.scheme!="https" or host not in allowed:
            continue
        suffix=parsed.path.rsplit("/",1)[-1].lower()
        query=parse_qs(parsed.query)
        filelike=any(suffix.endswith(ext) for ext in ALLOWED_EXTENSIONS)
        if not filelike:
            filelike=any(value.rsplit("/",1)[-1].lower().endswith(ext)
                         for key in ("filename","file_name","file","name","download")
                         for value in query.get(key,[]) for ext in ALLOWED_EXTENSIONS)
        if candidate not in seen and filelike:
            seen.add(candidate);out.append(candidate)
        if len(out)>=MAX_LINKS_PER_PAGE:break
    return out


def acquire_official_attachments(session, html: str, page_url: str, *, trusted_hosts: set[str],
                                 timeout: tuple[float,float]=(3.0,12.0)) -> list[dict]:
    """Return bounded byte records suitable for pipeline.run_inference(attachments=...)."""
    links=extract_official_document_links(html,page_url,trusted_hosts=trusted_hosts)
    results=[]
    for link in links:
        query=parse_qs(urlparse(link).query)
        candidate=(urlparse(link).path.rsplit("/",1)[-1] or "")
        if not any(candidate.lower().endswith(ext) for ext in ALLOWED_EXTENSIONS):
            candidate=next((values[0] for key in ("filename","file_name","file","name","download")
                            for values in [query.get(key,[])] if values),candidate or "official-attachment")
        name=unquote(candidate)[:300]
        fetched=fetch_official_document(session,link,source_host=(urlparse(page_url).hostname or ""),
                                        trusted_official_hosts=trusted_hosts,timeout=timeout)
        results.append({"source_name":name,"bytes":fetched.get("bytes"),
                        "parse_status":"not_parsed" if fetched.get("canonical_status")=="available" else fetched.get("parse_status"),
                        "fetch_status":fetched.get("canonical_status"),"reason":fetched.get("reason"),
                        "http_status":fetched.get("http_status"),"source_url":link})
    return results
