最後測試:2026-08-10

# 嘉校快訊

嘉義高中(嘉中)與嘉義女中(嘉女)官網公告的自動彙整網站,全程使用免費服務:

- **GitHub Actions**:台灣時間 07:00–19:00 每小時自動抓取(高流量頁),21:00 收尾;低頻頁每天一次、深度補齊每天四班
- **GitHub Pages**:免費架設前端網站(PWA,可「加入主畫面」當 App 用)
- **ntfy.sh**:免費推播通知(手機裝 ntfy App 即可收到新公告通知)

功能:全文搜尋(可多關鍵字)、學校篩選、自動分類(段考考試/社團/升學/獎助學金/榮譽榜/競賽/研習活動/招生編班/行政公告)、關鍵字訂閱與紅點提醒、離線瀏覽。

---

## 一、部署步驟(約 10 分鐘)

### 1. 建立 GitHub 儲存庫

1. 註冊/登入 [github.com](https://github.com),點右上「+」→「New repository」。
2. 名稱自訂(例如 `cy-school-news`),選 **Public**(公開儲存庫的 Actions 分鐘數不限),按「Create repository」。

### 2. 上傳專案檔案

**方法 A(推薦,用 git):**

```bash
cd cy-school-news        # 解壓縮後的專案資料夾
git init
git add .
git commit -m "初始化"
git branch -M main
git remote add origin https://github.com/<你的帳號>/<儲存庫名>.git
git push -u origin main
```

**方法 B(網頁上傳):** 進入儲存庫頁面 →「Add file」→「Upload files」,把專案資料夾內的**所有內容**拖進去(注意 `.github` 是隱藏資料夾,記得一併上傳,否則排程不會動)。

### 3. 開啟 Actions 寫入權限(重要!)

儲存庫 → **Settings → Actions → General → Workflow permissions** → 勾選 **Read and write permissions** → Save。
(沒做這步,爬蟲抓完會無法把資料寫回儲存庫。)

### 4. 手動跑第一次爬蟲

儲存庫 → **Actions** 分頁 → 左側選「抓取兩校公告」→ 右側「Run workflow」→ 綠色按鈕執行。
約 1–2 分鐘後完成,`docs/data/announcements.json` 就會更新成兩校最新公告。之後每天會自動跑 4 次。

### 5. 開啟 GitHub Pages

儲存庫 → **Settings → Pages** → Source 選 **Deploy from a branch** → Branch 選 `main`、資料夾選 **/docs** → Save。
一兩分鐘後網站就會出現在 `https://<你的帳號>.github.io/<儲存庫名>/`。

### 6. 手機安裝成 App(PWA)

- **iPhone(Safari)**:開啟網站 → 分享按鈕 →「加入主畫面」。
- **Android(Chrome)**:開啟網站 → 右上選單 →「安裝應用程式」。

---

## 二、推播通知設定(選用,但很推薦)

網頁內建的通知只在「開啟網站時」提醒你;要做到**真正的即時推播**(不開網站也會跳通知),用免費的 ntfy:

1. 想一個**不易被猜到**的主題名稱,例如 `cynews-a8k3x7`(任何知道名稱的人都能訂閱,所以請加亂碼)。
2. 儲存庫 → **Settings → Secrets and variables → Actions → Variables** → 「New repository variable」:
   - Name:`NTFY_TOPIC`
   - Value:你的主題名稱(如 `cynews-a8k3x7`)
3. 手機安裝 **ntfy** App([iOS](https://apps.apple.com/app/ntfy/id1625396347) / [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy)),新增訂閱、輸入同一個主題名稱即可。

**只想收特定分類?** 每則公告也會發到「主題-分類代號」,想收什麼就訂什麼:

| 訂閱主題 | 收到的通知 |
|---|---|
| `你的主題` | 全部新公告 |
| `你的主題-exam` | 段考考試 |
| `你的主題-club` | 社團 |
| `你的主題-admission` | 升學 |
| `你的主題-scholarship` | 獎助學金 |
| `你的主題-honor` | 榮譽榜 |
| `你的主題-contest` | 競賽 |
| `你的主題-event` | 研習活動 |
| `你的主題-enroll` | 招生編班 |

**個人關鍵字推播:** 編輯 `scraper/subscriptions.json`,新公告的「標題+摘要+自動分類名稱」命中任一關鍵字時,會額外推到 `你的主題-{topic_suffix}`:

```json
[
  { "name": "我的訂閱", "topic_suffix": "kw-me", "keywords": ["考試", "獎學金"] }
]
```

上例會把含「考試」或「獎學金」的新公告推到 `你的主題-kw-me`,手機用 ntfy 訂閱該主題即可;`name` 只是給自己看的備註,可放多組訂閱,改完 push 上 GitHub 後生效。

**通知防洪:** 單輪新公告超過 8 則時,主主題不逐則推播,改推一則彙總(「本輪新增 23 則:段考考試 2、獎助學金 5…」,點擊開啟網站——網站網址設在 Variables 的 `SITE_URL`,選填);**個人關鍵字命中的公告不受影響,永遠逐則推**。

關鍵字建議用**分類詞**(段考考試/升學/獎助學金/榮譽榜)或**學校實際用詞**(期中考/考程):因為比對範圍含自動分類名稱,訂「考試」或「段考」都能命中整個「段考考試」分類,不會因為某則公告標題寫「期末考」而漏接。

**行事曆訂閱與每日提醒:** 兩校的開學、段考、模擬考等重要日程整理在 `scraper/events.json`,自動產生 `docs/calendar.ics` 訂閱檔:

- **iPhone**:設定 → 行事曆 → 帳號 → 加入帳號 → 其他 →「加入已訂閱的行事曆」→ 貼上 `https://<你的帳號>.github.io/<儲存庫名>/calendar.ics`。
- **Google 日曆**:電腦版設定 →「新增日曆」→「透過網址」→ 貼上同一網址。
- **ntfy 推播**:訂閱 `你的主題-calendar`,每天早上 07:00 當天有事件才會推播(由 `calendar-daily.yml` 執行,不做任何爬取)。

行事曆資料由維護者從兩校官網的行事曆 PDF 人工轉錄(自動解析表格 PDF 不可靠);**每學期初跟維護者說「更新行事曆」即可換上新學期資料**。

---

## 三、自訂調整

- **新增抓取來源**:兩校官網任何「更多/MORE」列表頁(網址長得像 `/p/403-1008-xxx-1.php`)都可以直接貼進 `scraper/config.json` 的 `list_pages`,不用改程式——分類名稱會自動從頁面標題讀取。
- **自動偵測漏抓**(不用自己巡網站):每輪掃首頁時,若有公告的分類不在 `list_pages` 裡,會寫進 `scraper/coverage_gaps.json` 並在 Actions log 印警告。裡面每筆都附 `list_page` 網址,複製貼進 `config.json` 即可收錄;確定不想收的分類,加進 `config.json` 的 `coverage_ignore` 就不會再回報。
- **重新盤點全站分類**:`python scraper/discover.py site_map` 會爬遍全站並把分類 ID 從 1 掃到 850,產生 `scraper/site_map.json` 與 `scraper/discovery_report.md`。這是一次性工具(約 50 分鐘),**不要放進排程**;平常靠上面的哨兵機制就夠了。
- **調整抓取頻率**:改 `.github/workflows/scrape-hourly.yml` 裡的 cron(注意是 UTC 時間,台灣時間要減 8 小時)。目前的請求量:hot 44 頁 × 14 班 + cold 108 頁 × 1 班 + 補齊 80 × 4 班 ≈ **每日約 1,050 次**(兩校合計,平均每校每 2.5 分鐘不到 1 次,全程 1.5 秒間隔;單輪尖峰約 124 次、約 3 分鐘)。請維持合理頻率,對學校伺服器友善。
- **資料分層**:`announcements.json` 只放最近一年(`hot_days`)的公告供開站即載;其餘寫入 `docs/data/archive.json`,前端在搜尋或分類瀏覽時才背景載入,資料不會刪除。
- **來源分級(降低請求量)**:`list_pages` 的項目寫成 `{"url": "...", "tier": "hot"}` 表示每輪都抓;純網址字串為 cold,每天只抓一次(距上次成功抓取超過 20 小時才重抓,紀錄在 `scraper/fetch_state.json`,由 Actions 自動提交)。手動 Run workflow 時一律全抓。
- **調整自動分類**:改 `scraper/scrape.py` 開頭的 `CATEGORY_RULES` 關鍵字,由上而下依序比對。
- **本機測試**:`pip install -r scraper/requirements.txt` 後執行 `python scraper/scrape.py`;解析邏輯離線測試:`python tests/test_parser.py`。

## 四、專案結構

```
cy-school-news/
├── .github/workflows/scrape-hourly.yml  # 排程:抓取 → 推播 → 提交資料
├── scraper/
│   ├── config.json                # 兩校來源設定(要加來源改這裡)
│   ├── scrape.py                  # 爬蟲主程式(解析、去重、自動分類)
│   ├── notify.py                  # ntfy 推播
│   ├── subscriptions.json         # 個人關鍵字訂閱
│   ├── coverage_gaps.json         # 哨兵:偵測到的未收錄分類(自動產生)
│   ├── discover.py                # 一次性來源探測工具(不在排程內)
│   ├── discovery_report.md        # 探測結果與來源取捨理由
│   └── site_map.json              # 全站分類地圖(discover.py site_map 產生)
├── docs/                          # GitHub Pages 網站(PWA)
│   ├── index.html / style.css / app.js
│   ├── manifest.webmanifest / sw.js / icons/
│   └── data/announcements.json    # 公告資料(由 Actions 自動更新)
└── tests/test_parser.py           # 離線測試
```

## 五、注意事項

- 本專案僅供個人非商業使用;資料皆來自兩校**公開**官網,請保留頁面上的來源連結,內容以官網為準。
- 爬蟲已刻意設計成低頻率、低請求量(每天 4 次、請求間隔 1.5 秒),請勿改成高頻輪詢。
- 若某天官網改版導致抓不到資料,通常只需要到官網複製新的列表頁網址、更新 `config.json` 即可。
