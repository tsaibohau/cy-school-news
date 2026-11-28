最後更新:2026-11-28

# 嘉雲校訊

**國立嘉義高級中學(嘉中)官網公告的自動彙整網站。** 爬蟲定時抓回嘉中官網公告,自動分類、整理後放上一個可以搜尋、會提醒的網站;手機可以「加入主畫面」當 App 用(PWA)。

這個專案一開始就是為嘉中架設的,目前公開網站與公開倉庫也只放嘉中的資料。

基本功能全程使用免費服務:

- **GitHub Actions**:台灣時間 07:10–19:10 每小時自動抓取,21:10 收尾;低頻頁每天一次
- **GitHub Pages**:架設前端網站(PWA,可離線瀏覽)
- **ntfy.sh**:手機推播新公告(選用)
- **Supabase**:帳號登入、會員內容、提醒(選用,不設定也能跑基本功能)

## 網站功能

| 分頁 | 功能 |
|---|---|
| 公告 | 全文搜尋(多關鍵字、同義詞、錯字容錯)、分類篩選、新公告紅點 |
| 首頁 | 今日重點、每日簡報、天氣 |
| 問校務 | 用一句話問學校的事(例如「段考什麼時候?」),從公告、行事曆、學生手冊找答案 |
| 活動總覽 | 歷屆同名活動的時間軸 |
| 行事曆 | 學校行事曆,可訂閱到 iPhone / Google 日曆 |
| 課表 | 公開的班級課表 |
| 設定 | 關鍵字訂閱、提醒、帳號 |

**自動分類**:段考考試、升學、獎助學金、榮譽榜、競賽、社團、選課、生活學務、研習活動、招生編班、行政公告、教職員;判斷不出來的歸「一般」。

---

## 一、資料怎麼流動

```
嘉中官網公告
   ↓  GitHub Actions 排程(scrape-schedule.yml → scrape-hourly.yml)
scraper/scrape.py  抓列表 → 進內頁 → 去重 → 自動分類 → 摘要
   ↓
docs/data/announcements.json(最近一年)、archive.json(更早的)
   ↓
GitHub Pages 網站讀取 → 搜尋 / 問校務 / 推播 / 行事曆
```

`docs/data/` 底下的資料檔由 Actions 機器人自動更新,**請勿手動修改**。

---

## 二、部署步驟(約 10 分鐘)

### 1. 建立 GitHub 儲存庫

1. 登入 [github.com](https://github.com),點右上「+」→「New repository」。
2. 名稱自訂(例如 `cy-school-news`),選 **Public**(公開儲存庫的 Actions 分鐘數不限),按「Create repository」。

### 2. 上傳專案檔案

```bash
cd cy-school-news
git init
git add .
git commit -m "初始化"
git branch -M main
git remote add origin https://github.com/<你的帳號>/<儲存庫名>.git
git push -u origin main
```

如果用網頁上傳,記得 `.github` 是隱藏資料夾,要一併上傳,不然排程不會動。

### 3. 開啟 Actions 寫入權限(重要!)

儲存庫 → **Settings → Actions → General → Workflow permissions** → 勾選 **Read and write permissions** → Save。
沒做這步,爬蟲抓完無法把資料寫回儲存庫。

### 4. 手動跑第一次爬蟲

儲存庫 → **Actions** → 左側選「抓取兩校公告」(工作流程的名稱沿用舊名)→「Run workflow」。
幾分鐘後 `docs/data/announcements.json` 就會更新成嘉中最新公告,之後依排程自動執行。

### 5. 開啟 GitHub Pages

儲存庫 → **Settings → Pages** → Source 選 **Deploy from a branch** → Branch 選 `main`、資料夾選 **/docs** → Save。
一兩分鐘後網站會出現在 `https://<你的帳號>.github.io/<儲存庫名>/`。

### 6. 手機安裝成 App(PWA)

- **iPhone(Safari)**:開啟網站 → 分享 →「加入主畫面」。
- **Android(Chrome)**:開啟網站 → 右上選單 →「安裝應用程式」。

---

## 三、推播通知(選用,但很推薦)

網頁內建的提醒只在開著網站時有用;要做到不開網站也會跳通知,用免費的 ntfy:

1. 想一個**不易被猜到**的主題名稱,例如 `cynews-a8k3x7`(知道名稱的人都能訂閱,所以請加亂碼)。
2. 儲存庫 → **Settings → Secrets and variables → Actions** → 新增 `NTFY_TOPIC`,值填主題名稱或完整 `https://ntfy.sh/主題名稱` 連結。
3. 手機安裝 **ntfy** App([iOS](https://apps.apple.com/app/ntfy/id1625396347) / [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy)),訂閱同一個主題名稱。

**只想收特定分類?** 每則公告也會發到「主題-分類代號」:

| 訂閱主題 | 收到的通知 |
|---|---|
| `你的主題` | 全部新公告 |
| `你的主題-exam` | 段考考試 |
| `你的主題-admission` | 升學 |
| `你的主題-scholarship` | 獎助學金 |
| `你的主題-honor` | 榮譽榜 |
| `你的主題-contest` | 競賽 |
| `你的主題-club` | 社團 |
| `你的主題-event` | 研習活動 |
| `你的主題-enroll` | 招生編班 |
| `你的主題-admin` | 行政公告 |
| `你的主題-general` | 一般與其他分類 |

**個人關鍵字推播**:編輯 `scraper/subscriptions.json`,新公告的「標題 + 摘要 + 分類名稱」命中任一關鍵字時,會額外推到 `你的主題-{topic_suffix}`:

```json
[
  { "name": "我的訂閱", "topic_suffix": "kw-me", "keywords": ["考試", "獎學金"] }
]
```

因為比對範圍包含分類名稱,訂「段考」就能命中整個「段考考試」分類,不會因為標題寫「期末考」而漏接。

**通知防洪**:單輪新公告超過 8 則時,主主題改推一則彙總(點擊開啟網站,網址設在 Variables 的 `SITE_URL`,選填);個人關鍵字命中的公告不受影響,永遠逐則推。

**行事曆訂閱與每日提醒**:重要日程會產生 `docs/calendar.ics` 訂閱檔。

- **iPhone**:設定 → 行事曆 → 帳號 → 加入帳號 → 其他 →「加入已訂閱的行事曆」→ 貼上 `https://<你的帳號>.github.io/<儲存庫名>/calendar.ics`。
- **Google 日曆**:電腦版設定 →「新增日曆」→「透過網址」→ 貼上同一網址。
- **ntfy**:訂閱 `你的主題-calendar`,每天 07:01 當天有事件才推播(由 `calendar-daily.yml` 執行)。

---

## 四、自訂調整

- **新增抓取來源**:嘉中官網任何「更多/MORE」列表頁(網址像 `/p/403-1008-xxx-1.php`)都可以直接貼進 `scraper/config.json` 的 `list_pages`,不用改程式。
- **來源分級**:`list_pages` 寫成 `{"url": "...", "tier": "hot"}` 表示每輪都抓;純網址字串是 cold,距上次成功抓取超過 20 小時才重抓(紀錄在 `scraper/fetch_state.json`)。手動 Run workflow 時一律全抓。
- **自動偵測漏抓**:掃首頁時,若有公告的分類不在 `list_pages` 裡,會寫進 `scraper/coverage_gaps.json` 並在 Actions log 警告。確定不收的分類加進 `config.json` 的 `coverage_ignore`。
- **重新盤點全站分類**:`python scraper/discover.py site_map` 會爬遍全站,產生 `scraper/site_map.json` 與 `scraper/discovery_report.md`。一次性工具(約 50 分鐘),**不要放進排程**。
- **資料分層**:`announcements.json` 只放最近一年(`hot_days`),更早的寫入 `docs/data/archive.json`,前端在搜尋或分類瀏覽時才背景載入。
- **調整自動分類**:分類器是加權投票制,規則與權重在 `scraper/category_scorer.py`(標題命中 3 倍權重,分數不夠歸「一般」)。改完用 `python tools/eval_category_scoring.py` 看準確率。
- **調整搜尋排名**:評分邏輯在 `docs/search-query.js`,同義詞在 `docs/qa-synonyms.js`,錯字容錯在 `docs/qa-typo.js`。改完用 `node tools/evaluate-search-ranking.js` 驗證。
- **抓取頻率**:排程在 `.github/workflows/scrape-schedule.yml`(cron 是 UTC,台灣時間要減 8 小時)。請求間隔 1.5 秒,**請維持低頻,對學校伺服器友善**。

## 五、本機開發與測試

```bash
pip install -r scraper/requirements.txt
python scraper/scrape.py          # 本機跑一次爬蟲
python tests/test_parser.py       # 解析邏輯離線測試(改爬蟲後必跑)
```

`tests/` 另有搜尋、分類、問校務、權限等測試,Python 用 `python tests/test_xxx.py`,JavaScript 用 `node tests/test_xxx.js`。

## 六、專案結構

```
cy-school-news/
├── .github/workflows/      # 排程:抓取、行事曆、清理、驗證
├── scraper/                # 爬蟲(Python)
│   ├── config.json         # 來源設定(要加來源改這裡)
│   ├── scrape.py           # 主程式:抓取、去重、分類
│   ├── adapters/           # 不同學校網站系統的解析轉接頭
│   ├── category_scorer.py  # 加權投票分類器
│   ├── detail_parser.py    # 公告內頁與附件解析
│   ├── notify.py           # ntfy 推播
│   └── subscriptions.json  # 個人關鍵字訂閱
├── docs/                   # GitHub Pages 網站(PWA)
│   ├── index.html / style.css / app.js
│   ├── search-query.js     # 搜尋評分
│   ├── assistant-qa.js     # 問校務
│   ├── sw.js / manifest.webmanifest
│   └── data/               # 公告資料(Actions 自動更新,勿手改)
├── supabase/               # 帳號、權限與提醒(選用)
├── tools/                  # 評估與維運工具
├── tests/                  # 測試
└── PROJECT_LEDGER.md       # 專案總帳:開發歷程與續接紀錄
```

`config.json` 裡還有其他學校的來源設定,屬於開發中的擴充;這些學校的資料不會放進公開倉庫或公開網站。

## 七、注意事項

- 本專案僅供個人非商業使用;資料皆來自嘉中**公開**官網,請保留來源連結,內容以官網為準。
- 爬蟲刻意設計成低頻率、低請求量,請勿改成高頻輪詢。
- 官網改版導致抓不到資料時,通常只要到官網複製新的列表頁網址、更新 `config.json` 即可。
