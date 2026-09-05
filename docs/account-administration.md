# 帳號分級與郵件通知

## 權限

- 主要管理員：管理一般帳號，也能授予或移除聯席管理員。
- 聯席管理員：能審核、拒絕、移除一般帳號存取權及調整服務範圍；不能改動任何管理員身分。
- 完整會員：可使用全部個人功能。
- 僅課表會員：只同步查看課表所需的學校與班級設定；資料庫會拒絕待辦、追蹤、已讀狀態與提醒資料。

拒絕申請或移除存取權不會刪除 Auth 帳號，也不是黑名單。使用者登入後可按「重新送審」，狀態會回到等待審核。

## 管理介面

管理頁一次最多讀取 50 筆，可用 Email、申請狀態、管理角色及服務範圍篩選。資料庫索引支援狀態、申請日期、服務與稽核紀錄查詢。

## 郵件

註冊、重新送審、核准、拒絕／移除、服務範圍改變，以及聯席管理員身分異動，都先寫入只有後端能讀取的寄送佇列。`account-email-worker` 使用 Resend 寄信，並以事件編號避免重複寄送。

寄信啟用前必須在 Edge Function 設定 `RESEND_API_KEY`、`ACCOUNT_EMAIL_FROM`、`ACCOUNT_EMAIL_WORKER_TOKEN`，並在 Vault 設定 `account_email_worker_url`、`account_email_worker_token`。確認寄件網域後，才執行 `supabase/scheduler/activate_account_email_cron.sql`；資料遷移本身不會擅自開始寄信。
