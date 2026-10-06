# Preview 模擬帳密：使用者鐵則

未經使用者另行明確授權，加入或調整模擬帳密時，絕對不得修改正式網站的程式、資料、main、正式 Supabase 或正式部署。只能在功能分支與 Preview 範圍內施工。模擬帳號不得變成正式站的驗證捷徑。

使用者要求後續每次 Preview 交付包含臨時模擬管理員帳密、失效時間與預覽連結。每次發布前輪替本分支 Preview 專用環境變數；不把帳密存入 Git 或公開 HTML。這是部署交付流程要求，並非已建立外部排程或自動監控。

`mock-admin.html` 是獨立入口：不載入正式 app、Auth、同步、account config 或 Service Worker 初始化。CSP 只允許同源網路。管理帳號審核與角色操作只作用於本頁合成資料，登出／重新整理重設。

`api/mock-admin.js` 只在指定分支 + Vercel Preview + 有完整模擬設定時啟用，Production、main 或缺設定時回 404。帳密有效期限由伺服器檢查；模擬 session 最長 2 小時，綁定部署網域，不能跨部署使用。

`mock-admin.html` 的獨立示範仍是 12 則合成公告，CSV 的 data_source=simulated，下載檔名標「模擬公告」。

`mock-system.html` 則是既有完整網站介面，使用相同臨時帳密。公告資料為功能分支既有嘉中、嘉女 current + archive 的全部去重索引，不加入合成公告；目前是 3,517 則。這是分支快照，不宣稱與學校即時總數相同。生成檔僅位於 dist-staging；不修改 docs 或 Action-owned JSON。兩校外的已停用來源維持原有範圍。

完整介面不載入真實 account config；網路 CSP 僅允許同源。Auth 控制器注入只有本頁記憶體的 client，所有模擬審核／角色／權限／封存／同步操作均不連 Supabase、不執行 SQL、不建 Auth 使用者。模擬 token 只由 Preview 專用 API 驗證；既有真實匯出端點立即拒絕 mock token。

正文資料阻塞：此分支無 details，非正式 Training 的 4,123 筆 snapshot_announcements 全部 metadata_only、正文非空筆數為 0（僅讀取彙總計數，不讀標註／盲測內容）。沒有從 Production 取資料。完整介面 CSV 明確標為「公告索引／無正文」，body_status=missing、data_source=branch_metadata_snapshot；不得拿它當完整正文標註集。下一步只能取得使用者提供或授權的非正式完整正文快照，再接入受保護 Preview；不能自行改用正式 DB、要求金鑰或假造內文。

模擬主要管理員具有本頁提供的全部模擬管理功能；不具有真實網站或資料庫管理權限。Vercel 既有部署存取保護不在本輪變更範圍。
