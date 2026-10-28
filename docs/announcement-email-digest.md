# 公告 Email 通知（V1）

讓已登入、已核准且具「訂閱通知」權限的帳號，把符合關鍵字的新公告寄到登入信箱。

## 使用者端

「我的 → 關鍵字追蹤」新增「Email 通知」：關閉／每天早上 7 點一封摘要／有新公告就寄（每小時最多一封）。
設定存在 `user_preferences.preferences.notification_preferences.email = { enabled, frequency, enabled_at }`，
跟著帳號同步。只會寄 `enabled_at` 之後才出現的公告，開啟時不會一次灌入舊公告。

比對來源：關鍵字追蹤（`user_subscriptions`）＋個人設定的「關鍵字」（`profile.tracked_keywords`），
比對公告標題與分類；預設只看公開學校 `cysh,cygsh`。

## 後端

- Migration `20261028120000_announcement_email_digest.sql`：只有後端可讀寫的寄送紀錄（防重複寄），
  以及 4 個只授權 `service_role` 的 RPC。收件人限 `account_access.status='approved'`、
  `notifications` 權限開啟、Email 已驗證。
- Edge Function `announcement-email-digest`：每小時由 pg_cron 觸發，讀 GitHub Pages 上的公開
  `announcements.json`，比對後用 Resend 寄出。每封信都有一鍵取消連結（HMAC 簽章）與
  `List-Unsubscribe` 標頭。24 小時內總寄送量上限 `EMAIL_DIGEST_DAILY_CAP`（預設 90，配合 Resend 免費方案每日 100 封）。

## 啟用步驟（擁有者執行，未啟用前不會寄信）

1. 在 Resend 驗證寄件網域（需要自己的網域，例如 `mail.<你的網域>`；`onboarding@resend.dev` 只能寄給自己）。
2. 套用 migration、部署 `announcement-email-digest`。
3. Edge Function secrets：`RESEND_API_KEY`、`EMAIL_DIGEST_FROM`（例如 `嘉校快訊 <news@mail.example.com>`）、
   `EMAIL_DIGEST_WORKER_TOKEN`、`EMAIL_DIGEST_UNSUBSCRIBE_SECRET`（各自獨立隨機值）、
   `EMAIL_DIGEST_FUNCTION_URL`（此函式的完整 https 網址）。
4. Vault：`email_digest_worker_url`、`email_digest_worker_token`。
5. 先以 `{"dryRun": true}` POST 一次確認數量，再執行 `supabase/scheduler/activate_announcement_email_digest_cron.sql`。
