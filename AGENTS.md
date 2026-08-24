# 協作規範

1. 開始任何修改前,先 git pull 同步 main。
2. `docs/data/announcements.json` 由 GitHub Actions 機器人專屬維護,任何人(含 AI)不得手動修改;合併衝突時一律採用 main 的版本。
3. 修改一律在分支上進行(命名如 `claude/xxx` 或 `codex/xxx`),不直接 commit 到 main;合併由使用者在 PR 確認後執行。
   (例外:使用者明確指示可直接推 main 的小修改)
4. 修改爬蟲或解析邏輯後,必須執行 `python tests/test_parser.py` 且全數通過。
5. 不改動 `.github/workflows` 的排程頻率,維持對學校伺服器友善的低頻抓取。
6. 專案架構:`scraper/` 爬蟲與設定、`docs/` 為 GitHub Pages 網站(PWA);資料流:Actions 排程 → `scrape.py` → `announcements.json` → 網站讀取。

# Cloud-first development

1. GitHub remote is the canonical engineering source; local worktrees are optional caches.
2. Start each Work cycle from current remote refs and finish meaningful work only after remote verification.
3. Do not leave durable feature work only on one computer. If cloud write is unavailable, classify `CLOUD_WRITE_BLOCKED` and do not accumulate another large feature chain.
4. GitHub-hosted CI is the canonical validation environment; Windows Docker is optional.
5. Staging builds run through cloud CI/deployment; production remains `main` and is never changed by staging work.
6. Supabase schema changes are committed migrations and must preserve authenticated ownership/RLS behavior.
7. Secrets remain provider-side; never commit tokens, credentials, service keys, passwords, cookies, or private VAPID keys.
8. Action-owned generated data is machine-owned; when conflicts occur, current `main` wins.
