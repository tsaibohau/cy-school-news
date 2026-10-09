# 嘉義校訊

彙整嘉義高中與嘉義女中公告，提供搜尋、個人待辦、課表、行事曆及依來源整理的校務問答。

## 開發入口

- [開發規範](AGENTS.md)：唯一維護的代理工作規範。
- [架構與資料流](ARCHITECTURE.md)：從程式與建置入口核對的導覽。
- [本輪清理紀錄](maintenance/cleanup-20261009/REPORT.md)：保全、逐檔決策、分支狀態與回復方式。

這份文件不宣稱部署完成。功能是否已上線，以正式站行為及部署 SHA 為準；資料庫是否套用，以環境證據為準。

## 主要目錄

| 路徑 | 用途 |
|---|---|
| `docs/` | GitHub Pages PWA、瀏覽器模組及機器產生的公開資料 |
| `scraper/` | 公告、正文／附件、行事曆、課表與公開資料分片的產生流程 |
| `supabase/` | 已提交的 schema migrations、函式、權限契約與排程 SQL；存在於 repo 不代表已套用 |
| `tools/`、`api/` | 測試站建置、驗證、匯出及預覽 API |
| `tests/` | 離線回歸與需另外授權的線上 RLS harness |
| `.github/workflows/` | 抓取、回填、通知與驗證流程；排程不在本輪改動 |
| `artifacts/`、`staging-data/` | 目前建置仍讀取的候選／預覽資料 |

## 離線驗證

Node 直接執行相關 `tests/test_*.js`；Python 解析測試需 `scraper/requirements.txt` 相依套件。
`node tests/test_staging_build.js` 會在系統暫存目錄建置、檢查並移除預覽產物，不部署。
不要直接執行所有 JS 測試的 wildcard：`test_rls_behavioral.js` 與 `test_rls_deployed.js` 會操作線上測試資料庫，需要獨立授權。

`announcement_intel` 尚未合併到 main；保全與待辦見清理紀錄，不能把正式站現有規則誤認為其新實作。
