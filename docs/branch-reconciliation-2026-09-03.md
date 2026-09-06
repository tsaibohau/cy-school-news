# main / staging 分歧整合紀錄

## 範圍與基線

- 正式基線：`4ac00accfb672ca466d192903a904431f24a8169`。
- 新版 staging 基線：`a0bdc576d21085468e4a622b4fae28700155e829`。
- 共同祖先：`6f3451c9c60b974f97a2d32038e6545aa12b8b62`。
- 本輪只整合既有成果與驗證發布；不調整搜尋／問校務權重、不變更線上資料庫、不解除正式發布閘門。

## 根因

1. 本機是 shallow clone，缺少共同祖先的歷史；補齊後可以正常合併，不能把先前的 unrelated histories 當成遠端倉庫無共同祖先的證據。
2. 本機 fetch refspec 只追蹤舊 feature 分支。必須明確更新 `origin/main` 和 `origin/staging`，不能依過期 remote-tracking ref 判斷進度。
3. main 獨有 54 筆公告機器人更新；staging 獨有 99 筆功能與回填提交。main 的差異僅在 `docs/data/`、`scraper/fetch_state.json`、`scraper/notification_outbox.json`。

## 整合決策

- 使用雙親 merge 保留兩邊歷史；不用 force-push、rebase 或 allow-unrelated-histories。
- 132 個衝突都是生成資料；main 自共同祖先更新的 1125 個生成檔案逐一採 main 原始 blob，無手動改寫公告內容。
- 新版程式、UI、管理員介面、課表、搜尋與問校務保持 staging 版本；staging 獨有的課表資料保留。
- 恢復 main 的 `scrape-schedule.yml` 原檔，維持原排程頻率，避免將 staging 推向正式時意外停掉排程。
- 修正 staging runbook 的過時後端說明；不將文件修正當成線上設定已驗證。
- UI 測試不再鎖死舊 `app.js?v=59`，改驗證 HTML 與 Service Worker 引用相同版本；加入現有 CI。現有行事曆 workflow 測試也加入 CI。

## 本機驗證

- 執行 `.github/workflows/staging-validation.yml` 列出的 `node --test` 檔案：原有 28 個實際存在的檔案通過。
- `node --test tests/test_ui_visual_contract.js tests/test_calendar_workflow.js`：2/2 通過。
- `node tools/evaluate-search-ranking.js --strict`：train 8/8、validation 8/8。
- `node tools/evaluate-assistant-qa.js --strict`：train 6/6、validation 6/6。注意此命令載入 8/30 的固定 QA 實作與資料快照，不等於線上新版回答的端到端驗收。
- `node tools/build-staging.js`：成功，殼層版本 `staging-729a8e479294`，與新版功能基線一致。
- `node tools/check-legal-compliance.js`：Preview 通過。
- `node tools/check-legal-compliance.js --production`：exit 2，`PRODUCTION_BLOCKED`。原紀錄的 7 個項目尚未逐一以正式環境證據解除。
- `git diff --check`、`git diff --cached --check`、建置後生成資料未變動檢查通過。
- Python 回歸使用依 `scraper/requirements.txt` 安裝的獨立環境；`test_parser.py`、`test_calendar_adapter.py`、`test_detail_parser.py`、`test_detail_backfill.py`、`test_attachment_parser.py`、`test_reminder_targets.py`、`test_timetable_adapter.py` 全部通過。

## 不可誤報的限制

- CI 清單中的 `test_search_ranking.js`、`test_production_release_evidence.js`、`test_announcement_validity.js`、`test_reviewed_validity_cases.js` 在 staging 實際不存在；Node 測試執行可能略過不存在的路徑。因此 CI 綠燈不代表這四個測試已跑過，本輪未用刪除清單或空白測試假裝補齊。
- QA 固定快照通過不可替代新版 QA 的功能驗收；本輪未重訓或改寫基準。
- Vercel connector 讀取部署清單回傳 403；不繞過權限。自動部署結果另以 GitHub 回報和公開頁面核對。
- 未驗證正式環境 Auth 後端、管理員審核的後端授權覆蓋、完整維運台與來源／隱私發布證據，不宣稱已完成。
- 本文件記錄提交前的驗證；遠端提交 SHA、CI 與部署結果以後續 GitHub 紀錄為準。正式站保持不變。
