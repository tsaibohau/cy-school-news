# -*- coding: utf-8 -*-
"""一次性來源探測:盤點兩校 RulingDigital 系統的公告列表頁(不加入排程)。

用法:
  python scraper/discover.py            # 探測模式:固定區間 + 導覽頁 + 首頁頁籤
  python scraper/discover.py site_map   # 全站地圖模式:BFS 爬站 + 地毯式補掃

輸出:
  scraper/discovery_report.md  各候選頁的 ID、名稱、公告數、範例標題
  scraper/site_map.json        site_map 模式產生的完整分類地圖(永久保存)

site_map 模式一次跑約 30–45 分鐘,跑一次就有完整地圖,**不要放進排程**。
它存在的理由:分類 ID 既不連續、也不一定出現在導覽頁或首頁頁籤上
(實例:403-1008-168「新生專區」兩者都查不到,卻有 20 筆公告),
只有「爬遍全站 + 把 1..MAX_CATEGORY_ID 全掃一遍」才能保證沒有遺漏。

探測範圍:
- 固定區間的 /p/403-{unit}-{id}-1.php 分類列表頁。
- config.json 既有的來源(一併評估,報表才完整)。
- 兩校「網站導覽」頁中所有 /p/403-*.php 連結,以及連結文字含
  「最新消息/公告/訊息/宿舍/住宿」的 /p/412-*.php 頁面;順便記下行事曆網址。

兩個為了報表可讀性而做的處理:
- 導覽頁的連結文字只有「2-2-2-1 . 最新消息」這種大綱編號,因此另外解析導覽頁的
  編號階層,還原成「行政單位 > 教務處 > 註冊組 > 最新消息」這種完整路徑,
  才能判斷該頁屬於哪個處室。
- 兩校頁面都有站台共用的公告區塊,每頁的第一筆往往是同一則公告;範例標題會跳過
  這類「幾乎每頁都出現」的標題,改取該頁真正專屬的公告。

每個請求間隔 1 秒、逾時 15 秒;404 或解析不到公告的頁面標記後略過。
"""
import json
import re
import sys
import time
from collections import Counter
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parent))
from scrape import UA, extract_items, list_page_urls, page_category_name  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / "scraper" / "config.json").read_text(encoding="utf-8"))
REPORT_PATH = ROOT / "scraper" / "discovery_report.md"
SITE_MAP_PATH = ROOT / "scraper" / "site_map.json"

# site_map 模式的參數
BFS_MAX_PAGES = 400        # 單校 BFS 上限
# 地毯式補掃的分類 ID 上限。實測嘉中最大 908、嘉女最大 1177,
# 一開始設 850 會漏掉這兩個(當時只是碰巧被 BFS 的連結撈到),因此放寬到 1500。
MAX_CATEGORY_ID = 1500
ALLOWED_HOSTS = {
    (urlsplit(str(school.get("base") or "")).hostname or "").lower()
    for school in CONFIG.get("schools", [])
}

DELAY = 1.0
TIMEOUT = 15
PROBES = {
    "cysh": list(range(5, 76)),
    "cygsh": list(range(495, 536)) + list(range(775, 801)),
}
NAV_PAGES = {
    "cysh": "https://www.cysh.cy.edu.tw/p/17-1008.php",
    "cygsh": "https://www.cygsh.cy.edu.tw/p/17-1013.php",
}
# 想追查子選單的處室頁(首頁頁籤找不到對應分類頁時,直接看該處室自己的選單)
DEPARTMENT_PAGES = {
    "cysh": ["https://www.cysh.cy.edu.tw/p/412-1008-858.php",
             "https://www.cysh.cy.edu.tw/p/412-1008-626.php"],
}
P403_RE = re.compile(r"/p/403-(\d+)-(\d+)-\d+\.php")
P412_RE = re.compile(r"/p/412-(\d+)-(\d+)\.php")
OUTLINE_RE = re.compile(r"^([\d]+(?:-[\d]+)*)\s*[.、．]\s*(.+)$")
TAB_NBR_RE = re.compile(r"Type=mobile_rcg_mstr&Nbr=(\d+)")
KEYWORDS_412 = ["最新消息", "公告", "訊息", "宿舍", "住宿"]
# 出現在這麼多頁以上的標題視為站台共用區塊,不當作該頁的範例
COMMON_TITLE_MIN_PAGES = 4


def fetch(session, url):
    """回傳 (html, 錯誤訊息);404 以 '404' 表示,成功時錯誤訊息為空字串。"""
    try:
        parsed = urlsplit(str(url or ""))
        if (parsed.scheme != "https" or parsed.username or parsed.password
                or (parsed.hostname or "").lower() not in ALLOWED_HOSTS):
            return None, "source_url_not_allowlisted"
        resp = session.get(url, timeout=TIMEOUT)
        if resp.status_code == 404:
            return None, "404"
        resp.raise_for_status()
        final = urlsplit(resp.url)
        if (final.scheme != "https" or final.username or final.password
                or (final.hostname or "").lower() not in ALLOWED_HOSTS):
            return None, "redirect_url_not_allowlisted"
        resp.encoding = resp.apparent_encoding or "utf-8"
        return resp.text, ""
    except Exception as e:
        return None, str(e)


def parse_nav(soup, base):
    """解析網站導覽頁,回傳 (候選頁清單, 大綱編號→名稱, 行事曆連結)。"""
    labels, links, calendars = {}, [], {}
    for a in soup.find_all("a", href=True):
        raw = a.get_text(" ", strip=True)
        raw = re.sub(r"\s+", " ", raw).strip()
        m = OUTLINE_RE.match(raw)
        outline, text = (m.group(1), m.group(2).strip()) if m else ("", raw)
        if outline:
            labels[outline] = text
        if "行事曆" in text:
            calendars[urljoin(base, a["href"])] = text
        links.append((a["href"], outline, text))
    return links, labels, calendars


def outline_path(outline, labels, fallback):
    """把「2-2-2-1」還原成「行政單位 > 教務處 > 註冊組 > 最新消息」。"""
    if not outline:
        return fallback
    parts, acc = [], []
    for seg in outline.split("-"):
        acc.append(seg)
        name = labels.get("-".join(acc))
        if name:
            parts.append(name)
    return " > ".join(parts) if parts else fallback


def homepage_tabs(soup, base, unit):
    """解析首頁頁籤,回傳 [(頁籤名稱, 分類 ID, 對應的 403 列表頁網址)]。

    首頁頁籤 <a href="#cmb_3_1">考試訊息</a> 對應的 <div id="cmb_3_1"> 內容是
    JavaScript 動態載入的,靜態 HTML 裡看不到任何公告,只有一段:
        $.hajaxOpenUrl('/app/index.php?...&Type=mobile_rcg_mstr&Nbr=401', ...)
    其中的 Nbr 就是該頁籤的分類 ID,對應 /p/403-{unit}-{Nbr}-1.php。
    這是找出頁籤分類頁的唯一可靠途徑 —— 這些 ID 不連續(實測 11～742 都有),
    純靠掃描 ID 區間找不到。
    """
    tabs = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        label = re.sub(r"\s+", " ", a.get_text(" ", strip=True)).strip()
        if not href.startswith("#") or len(href) < 2 or not label:
            continue
        pane = soup.find(id=href[1:])
        if pane is None:
            continue
        m = TAB_NBR_RE.search(str(pane))
        if m:
            nbr = m.group(1)
            tabs.append((label, nbr, f"{base}/p/403-{unit}-{nbr}-1.php"))
    return tabs


def submenu_links(soup, base):
    """從處室頁面抽出它自己選單裡的 403/412 連結,回傳 [(網址, unit, 代號, 連結文字)]。"""
    found, seen = [], set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        text = re.sub(r"\s+", " ", a.get_text(" ", strip=True)).strip()
        m403, m412 = P403_RE.search(href), P412_RE.search(href)
        if m403:
            unit, cid = m403.group(1), m403.group(2)
            url = urljoin(base, f"/p/403-{unit}-{cid}-1.php")
            key = ("403", unit, cid)
        elif m412:
            unit, cid = m412.group(1), m412.group(2)
            url = urljoin(base, m412.group(0))
            key = ("412", unit, f"412-{unit}-{cid}")
        else:
            continue
        if key in seen:
            continue
        seen.add(key)
        found.append((url, key[1], key[2] if key[0] == "412" else key[2], text))
    return found


def evaluate(session, school, url, unit, cat_id, known, nav_path=""):
    """抓一個候選頁並整理成報表列。unit 依頁面網址為準(可能與學校主 unit 不同)。"""
    html, err = fetch(session, url)
    time.sleep(DELAY)
    row = {"url": url, "unit": unit, "cat_id": cat_id, "known": known,
           "nav_path": nav_path, "err": err, "count": 0,
           "name": "", "full_title": "", "titles": []}
    if html is None:
        return row
    soup = BeautifulSoup(html, "html.parser")
    row["full_title"] = soup.title.get_text(strip=True) if soup.title else ""
    row["name"] = page_category_name(soup)
    items = extract_items(html, dict(school, unit=unit), url)
    row["count"] = len(items)
    row["titles"] = [it["title"] for it in items]
    return row


def pick_samples(rows):
    """為每一列挑一則「該頁專屬」的範例標題,跳過站台共用區塊的公告。"""
    counter = Counter()
    for row in rows:
        counter.update(set(row["titles"]))
    common = {t for t, n in counter.items() if n >= COMMON_TITLE_MIN_PAGES}
    for row in rows:
        own = [t for t in row["titles"] if t not in common]
        row["sample"] = own[0] if own else (row["titles"][0] if row["titles"] else "")
        row["only_common"] = bool(row["titles"]) and not own
    return common


def md_cell(s, limit=60):
    s = (s or "").replace("|", "\\|").replace("\n", " ")
    return s[:limit] + ("…" if len(s) > limit else "")


def page_label(row):
    return (f"403-{row['unit']}-{row['cat_id']}"
            if row["cat_id"].isdigit() else row["cat_id"])


def same_site(url, base):
    """只走站內:host 必須與該校相同,且落在 *.cy.edu.tw。"""
    try:
        host = urlsplit(url).netloc.lower()
    except ValueError:
        return False
    return host == urlsplit(base).netloc.lower() and host.endswith(ALLOWED_HOST_SUFFIX)


def crawl_site(session, school):
    """BFS 爬站內 412 頁面,沿路收集 403 連結與 AJAX 頁籤的分類 ID。

    只把 412 頁面放進佇列(403 分類頁交給後面的地毯式補掃統一評估),
    這樣 BFS 的頁數預算才會全部花在「發現網站結構」上。
    """
    base, unit = school["base"], school["unit"]
    queue = [base + "/"]
    nav = NAV_PAGES.get(school["id"])
    if nav:
        queue.append(nav)
    visited, pages = set(), {}
    found_403, found_nbr = {}, {}

    while queue and len(visited) < BFS_MAX_PAGES:
        url = queue.pop(0)
        if url in visited or not same_site(url, base):
            continue
        visited.add(url)
        html, err = fetch(session, url)
        time.sleep(DELAY)
        if html is None:
            pages[url] = {"err": err}
            continue
        soup = BeautifulSoup(html, "html.parser")
        title = soup.title.get_text(strip=True) if soup.title else ""
        items = extract_items(html, school, url)

        # 這一頁提到的 403 分類頁
        links = []
        for a in soup.find_all("a", href=True):
            m403 = P403_RE.search(a["href"])
            if m403 and m403.group(1) == unit:
                cid = m403.group(2)
                links.append(cid)
                found_403.setdefault(cid, url)
                continue
            m412 = P412_RE.search(a["href"])
            if m412 and m412.group(1) == unit:
                nxt = urljoin(base, m412.group(0))
                if nxt not in visited and same_site(nxt, base):
                    queue.append(nxt)

        # 這一頁的 AJAX 頁籤分類 ID(各處室頁面也可能有自己的頁籤)
        nbrs = sorted(set(TAB_NBR_RE.findall(html)))
        for nbr in nbrs:
            found_nbr.setdefault(nbr, url)

        pages[url] = {"title": title, "count": len(items),
                      "links403": sorted(set(links)), "nbrs": nbrs}
        if len(visited) % 25 == 0:
            print(f"[{school['short']}] BFS {len(visited)} 頁,"
                  f"待訪 {len(queue)},已知分類 "
                  f"{len(set(found_403) | set(found_nbr))}", flush=True)

    return {"pages": pages, "visited": sorted(visited),
            "from_links": found_403, "from_tabs": found_nbr,
            "hit_limit": len(visited) >= BFS_MAX_PAGES}


def sweep_categories(session, school, discovered):
    """地毯式補掃 403-{unit}-{1..MAX_CATEGORY_ID},BFS 已發現的優先先掃。"""
    base, unit = school["base"], school["unit"]
    order = sorted(discovered, key=lambda x: int(x)) + \
        [str(i) for i in range(1, MAX_CATEGORY_ID + 1) if str(i) not in discovered]
    rows = []
    for n, cid in enumerate(order, 1):
        url = f"{base}/p/403-{unit}-{cid}-1.php"
        row = evaluate(session, school, url, unit, cid, False)
        row["discovered"] = cid in discovered
        rows.append(row)
        if not row["err"] and row["count"] > 0:
            print(f"[{school['short']}] 403-{unit}-{cid}: "
                  f"{row['count']} 筆「{row['name']}」", flush=True)
        elif n % 100 == 0:
            print(f"[{school['short']}] 補掃進度 {n}/{len(order)}", flush=True)
    return rows


def run_site_map():
    session = requests.Session()
    session.headers.update({"User-Agent": UA, "Accept-Language": "zh-TW,zh;q=0.9"})
    out = {}
    for school in CONFIG["schools"]:
        print(f"\n===== {school['short']} BFS 爬站 =====", flush=True)
        crawl = crawl_site(session, school)
        discovered = set(crawl["from_links"]) | set(crawl["from_tabs"])
        print(f"[{school['short']}] BFS 完成:{len(crawl['visited'])} 頁,"
              f"發現 {len(discovered)} 個分類 ID"
              f"{'(已達頁數上限)' if crawl['hit_limit'] else ''}", flush=True)

        print(f"\n===== {school['short']} 地毯式補掃 1..{MAX_CATEGORY_ID} =====",
              flush=True)
        rows = sweep_categories(session, school, discovered)
        pick_samples(rows)
        out[school["id"]] = {
            "short": school["short"], "unit": school["unit"],
            "bfs_pages": len(crawl["visited"]), "bfs_hit_limit": crawl["hit_limit"],
            "from_links": crawl["from_links"], "from_tabs": crawl["from_tabs"],
            "categories": [
                {k: r[k] for k in ("cat_id", "name", "count", "sample", "err",
                                   "only_common", "discovered", "url")}
                for r in rows],
        }
        live = [r for r in rows if not r["err"] and r["count"] > 0
                and not r.get("only_common")]
        print(f"[{school['short']}] 補掃完成:有自有公告的分類 {len(live)} 個",
              flush=True)
        SITE_MAP_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=1),
                                 encoding="utf-8")
    print(f"\n[info] 全站地圖已寫入 {SITE_MAP_PATH}", flush=True)
    return 0


def main():
    known = set()
    for s in CONFIG["schools"]:
        for u in list_page_urls(s):
            m = P403_RE.search(u)
            if m:
                known.add((m.group(1), m.group(2)))

    session = requests.Session()
    session.headers.update({"User-Agent": UA, "Accept-Language": "zh-TW,zh;q=0.9"})

    results = {}
    for school in CONFIG["schools"]:
        sid, unit = school["id"], school["unit"]
        rows, extras, seen = [], [], set()
        calendars = {}

        # 1) 固定範圍探測 + config.json 既有來源(既有來源可能落在區間外)
        probe_ids = [str(i) for i in PROBES.get(sid, [])]
        for u2, cid in sorted(known):
            if u2 == unit and cid not in probe_ids:
                probe_ids.append(cid)
        for pid in probe_ids:
            url = f"{school['base']}/p/403-{unit}-{pid}-1.php"
            seen.add(url)
            row = evaluate(session, school, url, unit, pid, (unit, pid) in known)
            rows.append(row)
            status = row["err"] or f"{row['count']} 筆 {row['name']}"
            print(f"[{school['short']}] 403-{unit}-{pid}: {status}")

        # 2) 網站導覽頁:收集 403 / 412 連結、大綱階層與行事曆
        nav_url = NAV_PAGES.get(sid, "")
        nav_html, nav_err = fetch(session, nav_url) if nav_url else (None, "無導覽頁")
        time.sleep(DELAY)
        nav_403, nav_412 = [], []
        if nav_html:
            nav_soup = BeautifulSoup(nav_html, "html.parser")
            links, labels, calendars = parse_nav(nav_soup, school["base"])
            for href, outline, text in links:
                m403 = P403_RE.search(href)
                m412 = P412_RE.search(href)
                if m403:
                    u2, cid = m403.group(1), m403.group(2)
                    url = urljoin(school["base"], f"/p/403-{u2}-{cid}-1.php")
                    if url not in seen:
                        seen.add(url)
                        nav_403.append((url, u2, cid,
                                        outline_path(outline, labels, text)))
                elif m412 and any(k in text for k in KEYWORDS_412):
                    u2, pid412 = m412.group(1), m412.group(2)
                    url = urljoin(school["base"], m412.group(0))
                    if url not in seen:
                        seen.add(url)
                        nav_412.append((url, u2, f"412-{u2}-{pid412}",
                                        outline_path(outline, labels, text)))
        elif nav_url:
            print(f"[warn] 導覽頁抓取失敗 {nav_url}: {nav_err}", file=sys.stderr)

        for url, u2, cid, path in nav_403:
            row = evaluate(session, school, url, u2, cid, (u2, cid) in known, path)
            rows.append(row)
            status = row["err"] or "{} 筆".format(row["count"])
            print(f"[{school['short']}] 導覽 403-{u2}-{cid}({path}): {status}")
        for url, u2, cid, path in nav_412:
            row = evaluate(session, school, url, u2, cid, False, path)
            extras.append(row)
            status = row["err"] or "{} 筆".format(row["count"])
            print(f"[{school['short']}] 導覽 {cid}({path}): {status}")

        # 3) 首頁頁籤 → 對應的分類頁(ID 不連續,掃區間找不到,只能從頁籤反查)
        tabs = []
        home_url = (school.get("scan_pages") or [school["base"]])[0]
        home_html, home_err = fetch(session, home_url)
        time.sleep(DELAY)
        if home_html:
            for label, nbr, url in homepage_tabs(
                    BeautifulSoup(home_html, "html.parser"), school["base"], unit):
                if url in seen:
                    tabs.append((label, nbr, "(已探測)"))
                    continue
                seen.add(url)
                row = evaluate(session, school, url, unit, nbr, (unit, nbr) in known,
                               f"首頁頁籤 > {label}")
                row["tab_label"] = label
                rows.append(row)
                status = row["err"] or "{} 筆".format(row["count"])
                tabs.append((label, nbr, status))
                print(f"[{school['short']}] 首頁頁籤「{label}」→ 403-{unit}-{nbr}: {status}")
        else:
            print(f"[warn] 首頁抓取失敗 {home_url}: {home_err}", file=sys.stderr)

        # 4) 指定處室頁:看它自己的子選單有沒有專屬公告頁
        depts = []
        for dept_url in DEPARTMENT_PAGES.get(sid, []):
            dept_html, dept_err = fetch(session, dept_url)
            time.sleep(DELAY)
            if not dept_html:
                print(f"[warn] 處室頁抓取失敗 {dept_url}: {dept_err}", file=sys.stderr)
                continue
            dept_soup = BeautifulSoup(dept_html, "html.parser")
            dept_name = page_category_name(dept_soup)
            for url, u2, cid, text in submenu_links(dept_soup, school["base"]):
                if url in seen:
                    continue
                seen.add(url)
                row = evaluate(session, school, url, u2, cid, False,
                               f"{dept_name} > {text}")
                row["dept"] = dept_name
                depts.append(row)
                status = row["err"] or "{} 筆".format(row["count"])
                print(f"[{school['short']}] {dept_name} 子選單 {cid}({text}): {status}")

        common = pick_samples(rows + extras + depts)
        results[sid] = {"rows": rows, "extras": extras, "depts": depts,
                        "tabs": tabs, "calendars": calendars,
                        "nav_err": nav_err, "common": common}

    # 3) 輸出報告:有公告的頁面逐列列出,404/空頁面只做摘要
    lines = [
        "# 公告來源探測報告", "",
        f"- 產生時間:{datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "- 探測範圍:固定 ID 區間 + config.json 既有來源 + 網站導覽頁的 403/412 連結。",
        "- 範例標題已跳過「站台共用區塊」的公告(出現在 "
        f"{COMMON_TITLE_MIN_PAGES} 頁以上的同一標題),取該頁專屬的公告。", "",
    ]
    for school in CONFIG["schools"]:
        d = results[school["id"]]
        lines += [f"## {school['short']}(unit {school['unit']})", ""]

        live = [r for r in d["rows"] if not r["err"] and r["count"] > 0]
        live.sort(key=lambda r: int(r["cat_id"]) if r["cat_id"].isdigit() else 10**9)
        lines += ["### 403 分類列表頁(有公告)", "",
                  "| 頁面 | 名稱 | 公告數 | 範例標題 | 狀態 |", "|---|---|---|---|---|"]
        for row in live:
            lines.append("| {} | {} | {} | {} | {} |".format(
                page_label(row), md_cell(row["name"] or row["nav_path"], 24),
                row["count"], md_cell(row["sample"], 46),
                "既有來源" if row["known"] else "新發現"))

        empty = [f"{r['cat_id']}({r['name']})" for r in d["rows"]
                 if not r["err"] and r["count"] == 0]
        err404 = [r["cat_id"] for r in d["rows"] if r["err"] == "404"]
        others = [f"{r['cat_id']}:{r['err']}" for r in d["rows"]
                  if r["err"] and r["err"] != "404"]
        lines += ["",
                  f"- 空頁面(0 筆,不採用):{', '.join(empty) if empty else '無'}",
                  f"- 404(不存在):共 {len(err404)} 個 ID"
                  + (f"({err404[0]}–{err404[-1]} 區間內)" if err404 else ""),
                  f"- 其他錯誤:{', '.join(others) if others else '無'}", ""]

        if d["extras"]:
            lines += ["### 導覽頁發現的 412 頁面", "",
                      "| 頁面 | 導覽路徑 | 公告數 | 範例標題 |", "|---|---|---|---|"]
            for row in sorted(d["extras"], key=lambda r: -r["count"]):
                lines.append("| {} | {} | {} | {} |".format(
                    row["cat_id"], md_cell(row["nav_path"], 40),
                    "—" if row["err"] else row["count"], md_cell(row["sample"], 40)))
            lines.append("")

        if d.get("tabs"):
            lines += ["### 首頁頁籤對應的分類頁(由 AJAX 參數 Nbr 反查)", "",
                      "| 頁籤 | 分類頁 | 結果 |", "|---|---|---|"]
            for label, nbr, status in d["tabs"]:
                lines.append("| {} | 403-{}-{} | {} |".format(
                    md_cell(label, 24), school["unit"], nbr, status))
            lines.append("")

        if d.get("depts"):
            lines += ["### 處室子選單探測", "",
                      "| 頁面 | 路徑 | 公告數 | 範例標題 |", "|---|---|---|---|"]
            for row in sorted(d["depts"], key=lambda r: -r["count"]):
                lines.append("| {} | {} | {} | {} |".format(
                    page_label(row), md_cell(row["nav_path"], 40),
                    "—" if row["err"] else row["count"], md_cell(row["sample"], 40)))
            lines.append("")

        if d["common"]:
            lines += ["<details><summary>站台共用區塊的公告(每頁重複出現,已排除於範例)"
                      "</summary>", ""]
            for t in sorted(d["common"])[:10]:
                lines.append(f"- {md_cell(t, 60)}")
            lines += ["", "</details>", ""]

        if d["calendars"]:
            lines += ["### 行事曆相關連結", ""]
            for url, text in d["calendars"].items():
                lines.append(f"- {md_cell(text, 30)}:{url}")
            lines.append("")

    lines += ["## 選用與取捨", "", "(探測後由維護者補充)", ""]

    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
    total = sum(len(d["rows"]) + len(d["extras"]) for d in results.values())
    print(f"[info] 共評估 {total} 個頁面,報告已寫入 {REPORT_PATH}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "site_map":
        sys.exit(run_site_map())
    sys.exit(main())
