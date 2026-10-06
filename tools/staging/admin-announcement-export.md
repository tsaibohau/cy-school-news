# 管理員完整公告 CSV — Preview only

本功能只注入 Vercel 的 staging 建置。`docs/` 正式站程式及資料不修改。

資料來源沿用 `tools/staging/account-config.js` 的測試 Supabase，不讀寫正式 Supabase。
主要管理員登入後，在「管理員 → 公告管理 → 下載完整公告 CSV」選擇全部、篩選或勾選公告，產生後再點擊下載；手機可存至「檔案」。

每批最多 8 筆，後端重新呼叫既有唯讀 `current_account_access` 確認 approved + owner，才以既有 `member_announcement_detail` 取得 detail。未加入 service key、SQL、migration、資料寫入或新資料庫權限。一般會員及共同管理員不能呼叫此匯出端點；既有會員閱讀功能的權限不變。Vercel production 環境會拒絕此端點。

索引範圍：部署當時 `announcements.json` 與 `archive.json` 的嘉中、嘉女 ID，去重、排序。它不是整個資料庫清單。資料庫查不到（包含既有 RPC 排除的歸檔資料）會匯出 `body_status=missing`，不能宣稱取得完整正文。任何請求失敗、筆數或 ID 不符都取消檔案；過大批次分半讀取，單則超過限制則明確失敗。

CSV 為 UTF-8 BOM，每格加引號，保留正文換行、逗號、引號、不截短。`body_content` 為原始 blocks 的文字展開；`detail_json` 保存 blocks、連結、附件與來源欄位，僅移除 summary、snippet、verified_dates，以免盲標看到摘要和日期推論。它不是下載原始 HTML 或附件二進位檔。

`published_at` 僅取 detail 已存的同名欄位，沒有就留空；`source_index_date` 為索引的 date；`content_updated_at` 是內容資料庫更新時間，不能當官方更新日期。無法確認日期不補值。附件 `embedded_text` 已存在才輸出文字；沒有就附檔名、unread 和 parse_reason，不從檔名猜內容。

Excel 可能把 =、+、-、@ 開頭內容當公式。這些格加一個前置單引號，`csv_escaped_columns` 列出其欄名；離線讀取時只對列出的欄位移除第一個單引號，即恢復原值。完整 body 的原文字串亦保存在 detail_json。

正文僅存在瀏覽器記憶體與下載檔，沒有 localStorage、公開檔案或後端持久化。登出、切帳號、取消及離開頁面會撤銷下載 URL。失敗可由管理員重新手動開始，沒有自動重試或背景工作。

驗證：`node tests/test_admin_announcement_export.js`、`node tests/test_staging_build.js`。
