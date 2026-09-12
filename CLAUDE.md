# 嘉雲快訊代理協作規範

## 0. 強制啟動流程

任何 Work / Codex / AI 代理在分析、修改、測試、部署本專案前，**必須先完整閱讀根目錄 `PROJECT_LEDGER.md`**。

`PROJECT_LEDGER.md` 是本專案的長期要求、鐵則、Freeze、目前 checkpoint、完成紀錄與待辦來源。

代理不得因為換了新工作環境，就要求使用者重新貼已記錄在 Ledger 的整套指令；應直接從 Ledger 的最後【已確認成功】checkpoint 接續。

若目前使用者訊息與 Ledger 衝突，以目前明確要求優先，並在工作完成後同步更新 Ledger，避免下一個 Work 再讀到舊規則。

開始前至少確認：

1. `PROJECT_LEDGER.md` 的「目前有效鐵則」。
2. Freeze／禁止區。
3. 目前 checkpoint。
4. 目前待辦／開發順序。

完成實際施工後，必須更新 Ledger 的 checkpoint／完成紀錄；不能只改程式而不更新專案記憶。

---

## 1. 基本協作規則

1. 開始任何修改前，先以 GitHub remote 的目前 `main` 為基準；不要相信過期 local worktree。
2. `docs/data/announcements.json` 由 GitHub Actions 機器人專屬維護，任何人（含 AI）不得手動修改；合併衝突時先依 generated-data ownership 規則處理。
3. 一般修改一律在分支上進行（如 `codex/xxx`、`feature/xxx`、`docs/xxx`），不直接 commit 到 `main`；使用者明確允許的小修改例外。
4. 修改爬蟲或解析邏輯後，至少執行對應 parser／adapter 測試；不得只因 unrelated baseline test 失敗就重做已成功資料操作。
5. 不任意提高 `.github/workflows` 抓取頻率，維持對學校伺服器友善的低頻、限速與退避。
6. 專案架構：`scraper/` 為爬蟲與設定，`docs/` 為 GitHub Pages/PWA；資料流由 Actions / scraper / generated data / 前端與受保護會員資料共同組成，實際現況以 repo 為準。

---

## 2. Cloud-first development

1. GitHub remote 是工程權威來源；local worktree 只是可丟棄 cache。
2. 每次 Work 從目前 remote refs 開始；有意義的成果要保存到遠端，不可只留在單一臨時環境。
3. 若 cloud write 無法使用，標記 `CLOUD_WRITE_BLOCKED`／【無法確認】，不要再堆疊大型未保存功能鏈。
4. GitHub-hosted CI 是主要驗證環境；本機測試是補充，不互相替代。
5. 有意義的 feature 變更預設保存後推 Preview/Staging；Production 仍需使用者在當次任務明確授權。
6. Supabase schema 變更必須以 migration 管理，維持 Auth ownership、RLS 與既有資料安全；不得因測試方便 reset Production。
7. Secrets 留在 provider-side；不得 commit token、credential、service key、password、cookie 或 private VAPID key，也不得為了驗證而把 secret 值讀出來。
8. Action-owned generated data 由機器流程維護；衝突時不可用舊工作樹覆蓋目前 `main`。

---

## 3. 不准鬼打牆

1. 同一路徑／同工具失敗兩次，改用其他驗證方法或停止並回報，不原樣無限重試。
2. 不因後續檢查失敗而重新執行已成功的 migration、backfill、commit、push 或資料寫入。
3. 外部服務若需等待、登入或人工授權，依 Ledger 的目前等待上限處理；超過即標記【等待中】／【無法確認】。
4. 永遠從最後一個【已確認成功】checkpoint 接續。
5. 禁止為了「恢復」而整包 revert／checkout 舊版覆蓋目前正確 `main` 或 Production；依 Ledger 做向前最小修正。

---

## 4. 狀態回報

必須分開標示：

- 程式已修改
- 測試通過
- CI 通過
- Preview/Staging 部署成功
- Production 部署成功
- 正式網站功能已實際驗收

任何一項都不能代替另一項。
