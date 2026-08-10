最後測試:2026-08-10

# 嘉校快訊

嘉義高中(嘉中)與嘉義女中(嘉女)官網公告的自動彙整網站,全程使用免費服務:

- **GitHub Actions**:每天 4 次(台灣時間 08:30 / 12:30 / 15:30 / 18:30)自動抓取兩校官網公告
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

---

## 三、自訂調整

- **新增抓取來源**:兩校官網任何「更多/MORE」列表頁(網址長得像 `/p/403-1008-xxx-1.php`)都可以直接貼進 `scraper/config.json` 的 `list_pages`,不用改程式——分類名稱會自動從頁面標題讀取。
- **調整抓取頻率**:改 `.github/workflows/scrape.yml` 裡的 cron(注意是 UTC 時間,台灣時間要減 8 小時)。請維持合理頻率,對學校伺服器友善。
- **調整自動分類**:改 `scraper/scrape.py` 開頭的 `CATEGORY_RULES` 關鍵字,由上而下依序比對。
- **本機測試**:`pip install -r scraper/requirements.txt` 後執行 `python scraper/scrape.py`;解析邏輯離線測試:`python tests/test_parser.py`。

## 四、專案結構

```
cy-school-news/
├── .github/workflows/scrape.yml   # 排程:抓取 → 推播 → 提交資料
├── scraper/
│   ├── config.json                # 兩校來源設定(要加來源改這裡)
│   ├── scrape.py                  # 爬蟲主程式(解析、去重、自動分類)
│   └── notify.py                  # ntfy 推播
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
