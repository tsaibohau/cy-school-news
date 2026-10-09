# 安全清理紀錄（2026-10-09）

## 範圍與證據

- Repository：tsaibohau/cy-school-news。基線 main：`5c697048e3742ff63dde88b6a6e5b066a26b8db0`。
- 清理分支：`codex/project-cleanup-20261009`；不合併、不部署、不 force push。
- 從最新 GitHub 68 branches／5 open PR、完整 mirror、301 tracked files、原始碼／HTML／Service Worker／建置／workflow／測試重建資料流。
- `ARCHITECTURE.md` 記錄實際程式入口；README 僅導覽，AGENTS 是單一開發規範，CLAUDE 僅轉介。
- 本輪沒有呼叫 Supabase，沒有執行爬取、回填、通知、Actions 或部署。正式生成資料、workflow、Supabase 目錄及正式執行 JS/CSS 均與基線一致。
- 正式站 index.html／app.js／sw.js 的 HTTP 讀取與基線位元組一致。未實測會員登入、線上 RPC、RLS、通知、完整瀏覽器流程。

## 未合併成果保全

- 原 announcement_intel HEAD：`5778da07df9069b449bb15540e1541512e8d8ac1`。
- repair HEAD：`096927a597f7e1b8b1a1e179a1feaa3f64d8a6e9`；新增僅歷史 ledger 阻擋說明，announcement_intel 與原始目錄一致。
- 新私人備份 `announcement-intel-preserved-20261009.zip`：bare Git objects／refs／shallow 邊界，加 389 tracked file snapshot 及每檔 SHA-256。
- SHA-256：`b22b6e2725dff5f80ef42a34c62baac045e2c3e8c3c2ddde9dd11c3bf4af3fe4`。
- 從備份實際解壓，Git fsck 通過、HEAD 一致、389 檔 SHA-256 全數一致；announcement_intel 310 tests 通過。
- 已持久保存私人備份；不把含來源正文的工作線推到公開 repo。原有歷史 shallow 邊界仍保留，未宣稱取得更早完整歷史。
- 31 個有獨立 commits 的遠端分支全部維持原 ref，可從 GitHub 還原；mirror 已 fsck。尚未進行 feature 整合／淘汰。
- 本輪未刪除任何既有工作目錄；沒有 git clean 或破壞性 reset。

## 精確刪除清單

| 路徑 | 原 SHA-256 | 原因 |
|---|---|---|
| `PROJECT_LEDGER.md` | `5b0595f911bbb688711d8ca4debca36f95315043700b4a15c13e7b9a0d75caa8` | 過時開發 checkpoint；移除權威入口，歷史仍可從基線 commit 還原。 |
| `docs/branch-reconciliation-2026-09-03.md` | `557d48b107a397c62660915f0d580e570de03e9246ae08bbb28f8c129abd9173` | 一次性整合紀錄；現行規範已保留 fetch、生成資料、驗收分離等必要原則。 |
| `docs/校網爬蟲架設技術紀錄.md` | `95f8da3ec55074c13bc01f77c98a88877e03d00be6ad7d54db59ac7d264159f9` | 舊 staging 架設與驗收紀錄，不再用作開發啟動指令；現行資料邊界已有專用政策與測試。 |
| `tools/staging/admin-announcement-export.css` | `1047338fae8fc2d44ea3203eb37e1bf97ffa3d77211fff70573ac5f126197214` | 與 docs/admin-announcement-export.css 位元組完全相同；建置直接使用 docs 複製版本。 |
| `tools/staging/announcement-csv.js` | `f5f9a434a1182cc7c31ed3a1aa84f0de598d07856c31a917e726739bb06d0ee0` | 與 docs/announcement-csv.js 位元組完全相同；建置及測試改共用 docs 版本。 |

刪除前的每檔 SHA 與字串引用存於 `file-audit.json`。字串掃描不是完整動態依賴圖；所有刪除候選另核對實際用途。零引用未作為自動刪除理由。

## 保留與修改理由

- 所有 migrations、資料、測試 fixture、排程與 backend source 保留。
- `artifacts/calendar-parser-1151`、staging-data、mock API、acceptance companion 仍被建置／測試／workflow 使用，不刪。
- `docs/notification-state.js` 由 Service Worker 使用；保留。
- source-rights／privacy／RLS／production-release evidence 文件有機器引用，保留；不當作開發指令或即時部署證據。
- 移除 CSV／CSS 兩個相同副本後，Preview 從 docs 複製唯一版本；原正式版本沒有修改。CSV round-trip／1001 rows／授權／撤銷／錯誤測試仍完整；建置新檢查核對兩個輸出檔位元組一致。
- account roles contract 原本失敗於過時的 timetable-only 錯誤文字；fine-grained capability cutover 的程式已使用 capability set。更新舊文字要求，課表帳號讀取／寫入／拒絕 mutation 的行為測試仍通過。
- vercel.json 只新增本清理 branch 的 `git.deploymentEnabled=false` 規則。其他部署參數與分支預設不變。依官方 https://vercel.com/docs/project-configuration/git-configuration 設定，在建立遠端分支前納入，避免自動部署。

## 分支決策

分支完整 SHA、ahead／behind、PR、workflow 字串引用與分類見 `branches.json`。ahead 是未在 main 祖先鏈中的提交數，不代表全部內容仍獨有；patch-equivalent 也不代表可以刪除。

| 分類 | 數量 | 本輪處理 |
|---|---:|---|
| main／staging | 2 | 保留；staging 部署角色仍待釐清 |
| 完全在 main 祖先鏈中的歷史分支 | 35 | 暫不刪；外部部署／使用者依賴未確認完整 |
| 有獨立 commits | 31 | 保留原 refs；逐支記錄 patch-equivalence 與實作路徑範例 |

Vercel staging 近 100 筆紀錄包含 main 及多個歷史 feature branches；分頁仍有下一頁。專案讀取沒有完整 Git link／root directory 等設定，無法證明所有外部依賴不存在，所以沒有刪 branch。

## 尚待處理的工作線

| 工作線 | 下一個決策 |
|---|---|
| announcement_intel | 維持隔離／私人保全；先完成實機與人工驗證，不擅自接正式站 |
| acquisition／ranking v3／worklog／review host | 分離 frozen corpus、盲測與模型成果；不得因清理重跑推論或打開封存 batch |
| PR #33 UI | 比較現行正式 UI 與獨立差異，再決定採用；不自動合併 |
| PR #29 calendar parser | 與 main 已有 parser／候選資料比對；保留獨立證據及未合併修正 |
| PR #22／#27 舊 Ledger 規劃 | 整合或淘汰前核對唯一產品決策；不得再引入舊代理啟動規則 |
| PR #8 compliance Preview | 保留到來源、環境與替代實作查清 |
| 其他 Auth／capabilities／通知／來源 adapter 舊工作線 | 逐支審查 non-equivalent commits；不要批次刪除 |
| 已合併 35 分支 | 查齊 PR、所有部署頁與外部依賴後才刪；先保存每支原 SHA |

## 驗證

- announcement_intel：310 tests PASS；389 tracked 檔實際還原 PASS。
- Node baseline：56 個離線 test files 中 55 PASS、1 FAIL，原因為上述舊錯誤文字。更新後結果見 `validation.json`。
- 相關清理回歸：CSV／owner 授權／mock isolation／Preview output parity／timetable-only 行為全部通過。
- Python：15 個 test files，13 PASS；extractive summary 舊 v2 契約失敗；OCR 缺 chi_tra+eng 環境。失敗相關 source 與 tests 均等同 baseline，未刪測試、未改摘要政策。
- search benchmark：train 8/8、validation 8/8；QA 歷史固定 benchmark：train 6/6、validation 6/6（不能證明現行問答端到端）。
- Legal preview gate PASS；沿用 6 個既有正式發布 blocker，未宣稱正式發布可用。
- git diff --check、正式資料／workflow／backend／正式外殼未改動檢查 PASS。
- 兩個線上 RLS harness 未執行；Deno typecheck／DB schema 實際套用／完整瀏覽器驗收未執行。

## 回復方式

- 還原單檔：在需要還原的開發分支執行 `git restore --source=5c697048e3742ff63dde88b6a6e5b066a26b8db0 -- <上表精確路徑>`，檢查 diff 後另 commit。
- 撤銷整輪清理：在該開發分支使用 `git revert <cleanup commit>`；不 force push、不對 main 操作。
- 歷史 branch 本輪沒有刪，仍可用 `git switch <branch>` 或在新 clone 取得原 ref；若將來核准刪除，先記錄完整 SHA，再用 `git branch <原名稱> <原SHA>` 重建。
- intel：解壓備份後執行 `git clone intel-preserved.git restored-intel`；以 VERIFICATION.json 核對 HEAD／檔案 SHA，確認 shallow 邊界及私人來源保護。

## 建議最終分支結構

1. `main`：唯一正式發布來源。
2. `staging`：保留到實際環境綁定查明，再決定保留或取消。
3. 少量 `feature/<任務>`／`codex/<任務>`：每支有明確責任、base SHA、驗證與下一步；只留下正在開發或審查的工作。
4. `announcement_intel`：隔離工作線，來源與驗證資料保持私人保全；公開 repo 只在另行確認可發布範圍後接收程式。
5. 歷史成果用精確 commit、tag 或可還原備份保存；原 branch 外部依賴全部解除後才刪。

本輪是可審查的安全清理候選，不是整個 repo 所有歷史功能均已淘汰的證明。
