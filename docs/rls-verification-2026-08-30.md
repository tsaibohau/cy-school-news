# 線上 RLS 驗證紀錄（2026-08-30）

專案：Supabase `cy-school-news`（`oppdhtnepjagdwovndra`）

## 已完成

- 確認 `user_subscriptions`、`user_reads`、`user_preferences`、`user_tasks` 均已啟用 RLS。
- 政策均以 `auth.uid() = user_id` 控制讀寫；`WITH CHECK` 同時限制新增與擁有者改寫。
- 匿名角色沒有四張資料表的權限。
- 以兩個既有 Auth 身分，在已部署資料庫中切換 `authenticated` 角色與 JWT `sub` 執行隔離測試。
- 三張可安全建立拋棄式資料的表各為 A、B 建立一筆測試資料；`user_preferences` 以跨帳號無副作用更新驗證。

## 結果

| 檢查 | 結果 |
|---|---:|
| A 可見自己的測試列 | 3 |
| A 可見 B 的測試列 | 0 |
| B 可見自己的測試列 | 3 |
| B 可見 A 的測試列 | 0 |
| A 刪除 B 資料影響列數 | 0 |
| A 更新 B 偏好影響列數 | 0 |
| 偽造 B 擁有者新增 | 被 RLS 拒絕 |
| 把 A 資料改成 B 擁有 | 被 `WITH CHECK` 拒絕 |
| 測試殘留 | 0 |

## 尚未完成

這是線上 PostgreSQL/RLS 的真實行為測試，但不是兩個獨立瀏覽器 OAuth 工作階段經由 Supabase HTTP API 的端到端測試。正式發布前仍須用兩個專用測試帳號與 publishable key 執行 `tests/test_rls_behavioral.js`，留下 CI 紀錄。

## 額外發現

`authenticated` 目前仍有前端不需要的 `TRUNCATE`、`TRIGGER`、`REFERENCES` 權限。雖然前端 REST API 沒有直接暴露 `TRUNCATE`，仍應依最小權限原則撤除。對應 account migration 已放在 `supabase/migrations/20260830120000_account_least_privilege.sql`，尚未套用線上資料庫。

完整 CI 另發現既有 reminder migration 曾保留 `DELETE` 權限，造成「瀏覽器不得硬刪永久提醒識別」的資料庫測試失敗。`supabase/migrations/20260830123000_reminder_browser_least_privilege.sql` 已明確撤銷提醒規則與推播裝置的 `DELETE`、`TRUNCATE`、`REFERENCES`、`TRIGGER`，並新增權限回歸斷言；同樣尚未套用線上資料庫。

## 線上再次核對（2026-08-30 14:33 UTC）

- Supabase migration history 目前只有 `account_sync_v1`、`account_security_hardening`、`add_user_tasks` 三筆。
- 線上只有四張帳號資料表；提醒規則、推播訂閱、提醒工作與傳送紀錄 schema 尚未部署。
- 四張帳號資料表均開啟 RLS，匿名角色沒有資料表權限；但 `user_subscriptions`、`user_reads`、`user_preferences` 的政策仍是 `PUBLIC` role，最小權限 migration 尚未套用。
- `authenticated` 仍持有 `REFERENCES`、`TRIGGER`、`TRUNCATE`；線上狀態證實最小權限修正尚未生效。
- Supabase Security Advisor 唯一警告是外洩密碼保護未啟用；正式啟用帳密登入前應開啟，或明確限制只允許受控 OAuth。

因此，Feature CI 與 Preview 成功不代表 Supabase schema 已部署或 production 已可發布。
