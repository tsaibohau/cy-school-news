# Account & Sync V2

V2 adds an optional, lazy Supabase Auth/Sync bridge. Public announcement browsing and Local Notification V3 do not require Supabase.

## Identity boundary

The only authenticated account identity accepted by the client is `session.user.id` returned by `supabase.auth.getSession()`. Email input, URL parameters, DOM values, localStorage claims, and caller-provided UUIDs are never account owners.

`docs/account-auth.js` pins `@supabase/supabase-js` to `2.112.3` and loads it only when account functions are used. `docs/supabase-sync.js` receives the verified client by injection and re-checks the session UID before every write and outbox item.

## Google login and configuration

V1 的主要登入方式是「使用 Google 登入」，不顯示 Email/Magic-Link 表單。前端只呼叫：

```js
supabase.auth.signInWithOAuth({
  provider: "google",
  options: { redirectTo: approvedCurrentAppUrl },
});
```

Copy `docs/account-config.example.js` to an untracked local configuration only after provisioning a dedicated Free-tier project. Supabase Auth redirect allow-list 必須精確包含：

- `https://tsaibohau.github.io/cy-school-news/`
- `http://127.0.0.1:8266/`

Google Cloud OAuth Web Client 的 Authorized redirect URI 必須填入 Supabase Dashboard 的 Google provider 頁面顯示的 callback URL。Google Client Secret 只放在 Supabase Auth provider 設定，不得進 repository、GitHub Pages 或 `account-config.js`。

OAuth 回到 app 後，app 只重新呼叫 `supabase.auth.getSession()`，確認 session 存在後才使用 `session.user.id` 啟動 AccountLifecycle。callback URL、email、Google subject、DOM、localStorage 中的 UUID 都不是帳戶身份。登出使用 `supabase.auth.signOut()`，再恢復既有匿名 baseline。

目前 `docs/account-config.js` 保持空設定，未配置 Supabase 時整個 account UI 隱藏，匿名公告瀏覽與 Local Notification V3 照常運作。Magic Link 暫不實作，避免形成第二套未審核的登入與 redirect 路徑。

Never put service-role keys, database passwords, access tokens, refresh tokens, or magic-link URLs in the repository or custom local state.

## Sync behavior

- anonymous use remains fully functional when Supabase is unavailable;
- first account adoption merges the durable anonymous baseline, persisted account state, and remote state once;
- remote subscriptions arriving on a device receive a local notification baseline of “now”, preventing historical notification floods;
- tombstones are pushed as subscription rows with `deleted_at` and are not resurrected by stale devices;
- upserts use adapter-owned conflict targets: subscriptions `(user_id, normalized_keyword)`, reads `(user_id, announcement_id)`, preferences `(user_id)`; callers cannot override them;
- subscription server UUIDs are transport details only. Cross-device identity is `user_id + normalized_keyword`;
- reads remain monotonic and preferences use deterministic timestamp merging;
- only successfully sent outbox mutations are acknowledged; failures remain pending;
- a session UID change aborts the remaining queue and cannot send A's queue under B.

## Security status

The migration and adapter are prepared, but no dedicated Supabase project is configured in this repository. Therefore real schema inspection, behavioral RLS tests, Magic Link delivery, and real-browser account E2E remain unexecuted and must not be reported as PASS. `docs/account-config.js` is intentionally empty until provisioning.
