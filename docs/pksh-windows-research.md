# 北港高中 Windows 安全抓取研究

日期：2026-09-05  
研究分支：`codex/pksh-windows-research-v12`  
基線：封存測試版 `cc5fb431c620a134ea1838ccbe4b4a5a0221288e`

## 已確認

- 北港高中公告使用 iSchool「消息公佈欄」，官方列表為 `main2.php`，公告識別碼位於官方 `show.php?nid=...` 連結。
- Linux 排程在 2026-09-05 的既有紀錄為 `tls_certificate_error`；它安全略過北港來源，沒有清空其他學校資料。
- Sectigo 官方說明：伺服器若未送齊中繼憑證，部分用戶端無法完成信任鏈。這與既有觀察相符，但只有 Windows 實機結果才能判斷 Windows runner 是否能補齊。
- 既有 PKSH HTML 解析器與安全網址限制已存在，離線測試可辨認公告、去重，並拒絕外部網域與相似假網域。

## 本分支新增

- `scraper/pksh_windows_fetch.ps1`：使用 `windows-latest` 的原生 HTTPS 驗證抓取固定官方列表；不關閉憑證驗證、不改用 HTTP、不加入自訂不可信憑證。
- `tools/pksh_snapshot.py`：把暫存 HTML 轉成只含標題、日期、處室／分類、學校及官方網址的 JSON；不輸出摘要、正文或詳情位置。
- Windows 工作只上傳資料最小化後的 JSON 與連線報告，不上傳完整頁面。

## 判定標準

- Windows 成功、Linux 仍失敗：可確認作業系統的憑證鏈建構差異足以影響此站，才評估把 PKSH 取件拆到 Windows。
- Windows 也失敗：停止整合，維持安全略過，問題應由校方補齊伺服器憑證鏈。
- Windows 成功但解析不到公告：TLS 不是唯一問題，需重新檢查 iSchool 回傳格式；不得因此放寬來源驗證。

本研究工作不會直接更新正式公告資料，也不會變更正式站或原封存測試分支。
