# Account & Sync V1

帳號功能是 optional；未登入時公告瀏覽、搜尋、訂閱、local notification 與 read UI 完整可用。登入文字應為「登入以同步設定」，不建立 profile/social 功能。

## 資料邊界

- 公開公告仍由 GitHub JSON 提供，不放入 Supabase。
- Supabase 只存 `user_subscriptions`、`user_reads`、`user_preferences`。
- `Notification.permission`、`notifiedIds`、`notifiedThrough`、Service Worker/cache 永遠留在裝置，不同步。
- `cyNews.lastSeen` 是 UI 狀態，不是全域 notification cursor。

## Supabase setup

1. 建立專用、免費 tier Supabase project。
2. 執行 `supabase/migrations/001_account_sync_v1.sql`。
3. 啟用 Google provider。Google Cloud Web Client 的 Authorized redirect URI 使用 Supabase Dashboard Google provider 頁面顯示的 callback URL；Supabase redirect allow-list 使用正式 GitHub Pages URL 與 localhost 開發 URL。
4. 只把 project URL 與 anon/publishable key 放入公開設定；禁止 service-role key、database password 或其他 private secret 進 frontend。

目前 repository 沒有既有 Supabase project URL/key，因此本分支只提供 migration 與 deterministic sync core；Google 登入 UI 僅在 public config 有效時顯示。Client Secret 只放在 Supabase provider 設定，不能進 frontend 或 repository。

## Sync semantics

- local mutation 先更新 UI，再進 `cyNews.accountSync.v1:<account UUID>` outbox；anonymous 使用獨立 namespace，網路恢復後重試。
- subscription identity 是 trim + `toLocaleLowerCase("zh-TW")` 後的 keyword；刪除以 tombstone 保留，避免 stale device 復活。
- reads 以 read union 合併，read 是 monotonic。
- preferences 以 `updated_at` last-write-wins。
- first login merge anonymous local state 與 remote state，但不改 Notification V3 delivery state。
- sign out 時應移除 active account-derived state，恢復匿名 backup；Notification permission 與公共快取不動。

## Durable local state (V1.2)

- sync-domain state 使用 `cyNews.accountState.v1:anonymous`、
  `cyNews.accountState.v1:<auth user UUID>` 與 `cyNews.accountState.v1:meta`。
- anonymous baseline 在該裝置對某帳戶第一次 adoption 時匯入一次；之後登入只合併該帳戶持久狀態與 remote，避免 tombstone 被舊匿名資料復活。
- lifecycle reload 可恢復指定 authenticated account；logout 恢復原 anonymous baseline。
- malformed state 只降級為該 account 的空 sync state，不刪除其他 localStorage，也不觸碰 public data 或 Notification V3 state。
- legacy outbox 只有明確 owner（`anonymous` 或 matching auth UUID）才會一次性遷移；空/未知 owner fail closed 並保留原資料。

## 不可快取

Service Worker 不得快取 auth token、Supabase authenticated API response 或 user-specific sync payload。公告 `/data/` 維持目前 network-first 行為。
