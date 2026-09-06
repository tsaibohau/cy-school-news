# 正式發布阻擋證據台帳

狀態：`PREVIEW_ONLY_REVIEW_REQUIRED`。本檔是發布前的證據清單，不是發布授權，也不取代法律意見。

## 已完成但不足以正式發布的事實

- Preview 的程式、CI、兩身分資料庫 RLS 測試與自助刪除介面已完成對應驗證。
- GitHub Pages production、線上 Supabase schema、公告 JSON 與爬蟲均未因 Preview 工作而變更。
- Google OAuth 只驗證登入 UX；RLS 的正式證據以兩個專用 Auth 使用者的一般 JWT 經 Supabase HTTP Data API 驗證為準。

## 尚未解除的發布阻擋

| 阻擋 | 可接受的解除證據 | 狀態 |
|---|---|---|
| 專用 Auth A/B HTTP RLS | 受保護 CI 中 `tests/test_rls_deployed.js` 成功，且只輸出消毒後 PASS／FAIL | 未完成 |
| 最小權限與提醒 schema | 經核准的線上 migration 紀錄、migration history 與再跑一次 A/B HTTP RLS | 未完成 |
| 外洩密碼保護 | Supabase Auth 設定截圖或設定匯出；若只允許 OAuth，需有同等限制的書面決定 | 未完成 |
| 保存期限執行 | 已部署的 30 天 tombstone／365 天閱讀紀錄清除排程，以及可重跑的驗證 | 未完成 |
| 私密更正／刪除管道 | 不公開個資的聯絡方式、身分核對規則與處理責任人 | 未完成 |
| 來源權利 | 各校書面同意，或具資格者對最小索引／摘要／連結範圍的權利評估 | 未完成 |
| 臺灣法律審查 | 對個資、著作、刪除流程與發布範圍的具資格專業審查 | 未完成 |

## 防誤報規則

1. CI 綠燈或 Vercel Preview Ready 都不會單獨解除任一阻擋。
2. 不把 Google OAuth 切換帳號測試當成 RLS 證據。
3. 未取得外部證據前，`docs/legal-compliance.json` 的對應控制必須保持 `false`，`production_ready` 必須保持 `false`。
4. 不得為解除阻擋而關閉 RLS、放寬來源限制、刪除公告資料或繞過身分核對。
