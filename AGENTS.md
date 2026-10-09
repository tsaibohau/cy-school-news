# 開發規範

1. 使用者本輪指令決定工作範圍。先核對遠端 ref、branch、HEAD、工作樹與相關 PR；不要自動 pull、merge、reset 或切換現有工作線。
2. Production 實際行為是產品真相；遠端原始碼、測試與部署證據用來解釋它。README、架構說明與歷史紀錄不能證明功能已上線或 migration 已套用。
3. 在獨立分支修改。除非本輪明確授權，不修改 main、Production、線上資料庫、正式生成資料、Actions 排程，不部署、不合併、不 force push。推送前檢查自動部署觸發。
4. `docs/data/`、`docs/calendar.ics`、爬蟲狀態及 outbox 由既有產生流程維護；不要手改或用舊分支覆蓋。變更產生器與執行它是兩項不同授權。
5. 刪檔前查 HTML／Service Worker、import／require、建置、workflow、測試、產生器及外部依賴。刪分支前核對完整 SHA、PR、部署引用與保全；有獨立成果先保存並驗證還原。
6. 專用工作線的 checkpoint 只描述該分支。不得自動重跑 acquisition、模型推論、盲測、backfill 或產生人工標籤。失敗時記錄確切阻擋；同法失敗兩次改查根因。
7. 只公開必要公告 metadata 與官方連結；受保護正文經既有會員授權讀取。保留 RLS、帳號隔離、tombstone、資料來源及日期未知處理；不提交私密憑證。
8. 執行受影響的離線回歸與建置檢查。爬蟲／解析改動另跑 `python tests/test_parser.py`。會連線寫 DB 的 RLS 測試、通知、爬取、部署需獨立授權。
9. 回報完整 Commit、分支、改動、驗證、未驗證項目與回復方式。測試通過、部署成功與產品驗收分開。架構導覽見 `ARCHITECTURE.md`；不要從歷史 ledger 接續。
