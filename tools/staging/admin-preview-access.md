# Preview 模擬帳密：使用者鐵則

未經使用者另行明確授權，加入或調整模擬帳密時，絕對不得修改正式網站的程式、資料、main、正式 Supabase 或正式部署。只能在功能分支與 Preview 範圍內施工。模擬帳號不得變成正式站的驗證捷徑。

使用者要求後續每次 Preview 交付包含臨時模擬管理員帳密、失效時間與預覽連結。每次發布前輪替本分支 Preview 專用環境變數；不把帳密存入 Git 或公開 HTML。這是部署交付流程要求，並非已建立外部排程或自動監控。

`mock-admin.html` 是獨立入口：不載入正式 app、Auth、同步、account config 或 Service Worker 初始化。CSP 只允許同源網路。管理帳號審核與角色操作只作用於本頁合成資料，登出／重新整理重設。

`api/mock-admin.js` 只在指定分支 + Vercel Preview + 有完整模擬設定時啟用，Production、main 或缺設定時回 404。帳密有效期限由伺服器檢查；模擬 session 最長 2 小時，綁定部署網域，不能跨部署使用。

所有資料都是 12 則明確標記的合成公告，CSV 的 data_source=simulated，下載檔名也標「模擬公告」。API 不載入任何真實公告資料，不連 Supabase、不執行 SQL、不建 Auth 使用者。既有真實匯出端點會立即拒絕 mock token，不把它轉送到 Supabase。

模擬主要管理員具有本頁提供的全部模擬管理功能；不具有真實網站或資料庫管理權限。Vercel 既有部署存取保護不在本輪變更範圍。
