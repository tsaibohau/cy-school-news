# 協作規範

1. 開始任何修改前,先 git pull 同步 main。
2. 開始任何修改前，必須依序閱讀 repo 根目錄的 `AGENTS.md` 與 `PROJECT_LEDGER.md`；若 `docs/校網爬蟲架設技術紀錄.md` 存在，也要一併閱讀相關段落。先找到「最後已確認成功 checkpoint」「上一次精確失敗／中斷點」「禁止重做項目」「下一個唯一允許動作」，再開始施工。不得因換 Work／換對話／換環境而從頭重做。
3. 每次 Codex / Work 回報完成、失敗、中斷或等待狀態後，必須先把該次結果更新進 `PROJECT_LEDGER.md`，再產生下一輪施工指令。下一輪指令應優先寫成「讀 `AGENTS.md` 與 `PROJECT_LEDGER.md`，從最後 checkpoint 與精確失敗點繼續」，只補充本輪新增限制，不得重新貼整份歷史背景。
4. 發生 CI failure、deployment failure、migration failure、timeout、Work 對話過長或工具中斷時，必須把「最後成功 checkpoint、精確失敗點、已排除原因、尚待驗證原因、下一個允許動作」更新進 `PROJECT_LEDGER.md`。不得只記錄「失敗」。
5. `docs/data/announcements.json` 由 GitHub Actions 機器人專屬維護,任何人(含 AI)不得手動修改;合併衝突時一律採用 main 的版本。
6. 修改一律在分支上進行(命名如 `claude/xxx` 或 `codex/xxx`),不直接 commit 到 main;合併由使用者在 PR 確認後執行。
   (例外:使用者明確指示可直接推 main 的小修改)
7. 修改爬蟲或解析邏輯後,必須執行 `python tests/test_parser.py` 且全數通過。
8. 不改動 `.github/workflows` 的排程頻率,維持對學校伺服器友善的低頻抓取。
9. 專案架構:`scraper/` 爬蟲與設定、`docs/` 為 GitHub Pages 網站(PWA);資料流:Actions 排程 → `scrape.py` → `announcements.json` → 網站讀取。

# Cloud-first development

1. GitHub remote is the canonical engineering source; local worktrees are optional caches.
2. Start each Work cycle from current remote refs and finish meaningful work only after remote verification.
3. Do not leave durable feature work only on one computer. If cloud write is unavailable, classify `CLOUD_WRITE_BLOCKED` and do not accumulate another large feature chain.
4. GitHub-hosted CI is the canonical validation environment; Windows Docker is optional.
5. Staging builds run through cloud CI/deployment; production remains `main` and is never changed by staging work.
6. Supabase schema changes are committed migrations and must preserve authenticated ownership/RLS behavior.
7. Secrets remain provider-side; never commit tokens, credentials, service keys, passwords, cookies, or private VAPID keys.
8. Action-owned generated data is machine-owned; when conflicts occur, current `main` wins.
