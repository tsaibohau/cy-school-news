# 嘉雲快訊 Project Ledger

> Repo: `tsaibohau/cy-school-news`
>
> 目的：這是嘉雲快訊的**長期專案總帳**。Work／Codex／其他代理進入本專案時，不應要求使用者重新貼一大段施工指令；先讀 `AGENTS.md`，再完整讀本檔，從「目前有效規則」「目前 checkpoint」「待辦」直接接續。
>
> 最後人工整理：2026-09-12（Asia/Taipei）

---

## 0. 規則優先順序

發生衝突時，依下列順序判斷：

1. **使用者在目前任務的明確要求**。
2. 本檔的「目前有效鐵則」與「目前 checkpoint」。
3. repo、GitHub Actions、Vercel、Supabase、實站的直接證據。
4. 本檔歷史紀錄、舊報告、舊 PR 描述。

舊紀錄只能解釋歷史，不得覆蓋更新 checkpoint。

若兩份紀錄互相矛盾：保留矛盾並標示【待驗證】，不得挑一份方便的說法當成事實。

---

## 1. Work 啟動方式（強制）

每次開始嘉雲快訊工作，Work 必須：

1. 讀 `AGENTS.md`。
2. 讀本檔 `PROJECT_LEDGER.md`，至少確認：
   - 目前有效鐵則
   - Freeze／禁止區
   - 目前 checkpoint
   - 下一步／待辦
3. 從最後一個【已確認成功】checkpoint 接續，不重新做已完成工作。
4. 只有在 repo／服務現況可能已變時才查最新證據；不要為了「重新理解專案」把所有歷史重跑一遍。
5. 不要求使用者重新提供本檔已存在的規則、背景或授權。
6. 有實際變更時，在工作完成前更新本檔的 checkpoint／完成紀錄；不能只改程式卻讓總帳停在舊狀態。

**禁止的工作方式：**

- 叫使用者每次重新寫完整 prompt 才能施工。
- 因為換了一個 Work 環境就把已完成資料重新 backfill／重建。
- 看不到舊 working tree 就自行重做可能會改資料的步驟。
- 用舊 commit、舊 deployment、舊報告覆蓋目前已確認正確的 main／Production。

---

## 2. 目前有效鐵則

### 2.1 證據與回報

任何狀態都必須分開：

- 【程式已修改】
- 【測試通過】
- 【CI 通過】
- 【Preview／Staging 部署成功】
- 【Production 部署成功】
- 【正式網站功能已實際驗收】

以上**不得互相推導**。例如 Vercel Ready 不等於功能驗收成功；CI 綠燈不等於 Production 已部署。

沒有 commit、diff、測試、run log、資料庫查詢或實站證據時，不得補寫成「已完成」。

### 2.2 不回滾覆蓋正確版本

除非使用者在目前任務明確要求，禁止：

- `revert` 一整個舊版本來修新問題。
- checkout 舊 commit 後整包覆蓋 `main`。
- 把舊 Vercel deployment 整包搬回 Production。
- 用舊 working tree／備份覆蓋目前正式站。

修復原則：**以目前正確基準向前做最小修正**。

### 2.3 Production

- 沒有使用者在目前任務的明確授權，不 merge／promote／deploy Production，不套 Production migration，不改 Production 資料。
- 使用者明確說「上正式站／部署正式站」才代表該次 Production 授權。
- Production 發布前若屬大範圍變更，先保留可追溯的目前基準（branch／commit／release evidence）；不得以備份為理由回滾其他已正確功能。
- staging／Preview 工作不得順手更動 Production。

### 2.4 分支、測試站與自動接續

- 一般修改在 feature branch 進行，不直接改 `main`；小型、明確且使用者允許的例外才可直推 `main`。
- 有意義的程式修改完成後，預設應自動做到：保存變更 → commit/push → 必要測試／CI → Vercel Preview/Staging；不必每一步再問一次。
- 如果目前任務明確禁止遠端寫入／部署，依該任務限制。
- Production 仍需獨立授權，不能因「自動推測試站」而一起上正式站。

### 2.5 避免鬼打牆

- 同一工具／同一路徑失敗兩次，不再原樣重試；改用另一驗證方法，或標記【失敗／無法確認】後停在最後成功 checkpoint。
- 不因後續檢查失敗而重新執行已成功的 migration、backfill、commit、push 或資料寫入。
- 外部服務若需等待／登入／人工授權，最長等待以 **5 分鐘**為上限；超過即標記【等待中】或【無法確認】，不要無限輪詢。
- 長工作需保留可接續 checkpoint；不要把大量成果只留在單一臨時 working tree。

### 2.6 Secrets 與安全

- Secrets 留在 GitHub／Supabase／Vercel provider-side；不得把 token、service key、password、cookie、private VAPID key 寫進 repo 或總帳。
- 不為了驗證而讀出 secret 值；應驗證「有沒有被正確使用」與 run 結果。
- 不使用 `verify=false` 繞過 TLS。
- 不繞過帳密、權限或 Vercel 保護頁。
- 不引入付費 API／付費 LLM 作為必要依賴，除非使用者另行批准。

### 2.7 學校伺服器友善原則

- 透明 User-Agent。
- 合理限速、退避與 retry cap。
- 不提高既有排程頻率造成類似攻擊的負載；如需改頻率，必須說明請求量影響。
- 單一公告錯誤應盡量隔離，不能讓整批有效公告一起失敗；但整頁／連線不完整時要 fail closed，保留既有正確資料。

### 2.8 機器產生資料

`docs/data/announcements.json` 與其他由 Actions 明確擁有的產生資料，以機器流程為權威；AI／人工不得隨手改。衝突時，先辨識檔案 ownership，再決定處理方式。

---

## 3. 產品與資料長期要求

### 3.1 公開資料邊界

公開頁面原則上只直接呈現安全欄位：

- 發布日期
- 分類
- 處室／來源
- 標題
- 官方原始網址

公告詳細全文、附件文字、PDF／DOCX／圖片內容不得因方便而整份公開鏡像。

摘要若公開：

- 必須是轉述，不是大段複製。
- 長度上限以原內容約 20% 為安全上限。
- 遇可識別個資或不適合重述的內容，跳過摘要或降為最小必要資訊。
- 附件公開面只標示存在並連回官方來源；受保護會員索引可有不同處理，但不得漏到 public projection。

### 3.2 公告總庫與生命週期

目標：全抓、去重、可搜尋、可追溯、可判斷效力，不讓資料只增不減。

生命週期現有方向：

`ACTIVE → 檢查失效 → Archive → tombstone 防復活 → 可人工 restore`

Archive 不是刪除歷史，而是把不應再當「目前公告」的內容移出 active 候選，同時保留歷史查詢能力。

### 3.3 搜尋／分類

搜尋不能只靠 category；需要能理解：

- 對象：如高一、高二、教師、家長
- 主題：段考、社團、升學、獎助學金、競賽、行政等
- 次序：第一次、第二次等
- 行動：報名、申請、繳費、選課、繳件等
- 答案欄位：時間、地點、資格、費用、承辦人、文件、是否強制、辦理方式等

公告分類系統的目的，是把公告整理為後續可搜尋、可推理的結構化資料，不只是多加一個 `category`。

### 3.4 問校務

問校務必須以證據為核心：

- 找不到直接證據就說不足，不猜答案。
- 新公告只在明確涵蓋同一欄位時取代舊公告；勘誤／補充可與主文件合併，不能一律「新者整篇取代舊者」。
- 過期的報名入口不能回答成現在仍可使用，但公告產生的結果／限制可能仍有效。
- 舊緊急公告只能證明過去事件，不能推定下一次事件同樣處理。
- 附件或 OCR 若證據品質不足，要顯示不足並引導核對官方原件。
- 個資敏感查詢不得整理、重述個人紀錄，只提供必要官方入口。

### 3.5 帳號與會員

長期方向：

- 支援 Google 與獨立帳密登入。
- 新註冊需審核；拒絕／移除後可重新申請，不等同永久黑名單。
- 未登入不顯示會員側邊功能。
- 管理員可管理存取；聯席管理員不得增刪最高管理員。
- 權限不再只靠單一 service level；以功能 capability 分開控制。

目前 capability 方向至少包含：

- member content／會員摘要
- 問校務
- 課表
- 行事曆
- 訂閱通知

舊 `service_level` 僅作相容欄位時，不應重新把系統倒退成粗粒度角色判斷。

### 3.6 課表

- 正式課表優先於試行版。
- 支援不同學校。
- 長期需求：學期變更時可由使用者自行更新自己的課表，避免每學期都必須重新開發抓取器。

---

## 4. Freeze／禁止區

### 4.1 UI Freeze（2026-09-11 起）

使用者已完成並接受新的清爽 UI 後要求 freeze。

含義：

- 不因開發其他功能而順手重新設計 UI。
- 可為新功能做必要介面接線或 bug fix，但不能藉機改整體視覺、導航結構或已驗收互動。
- 如使用者明確要求新一輪 UI 改版，該次要求可解除相關部分 freeze。

### 4.2 Archive 核心 Freeze（2026-09-12 起）

公告失效檢查、Archive／歷史公告、tombstone 防復活、Archive restore 的核心流程視為已完成基礎。

除非找到直接 bug 或使用者明確要求，後續分類、附件、Reference Knowledge、問校務工作**不要修改 Archive 核心流程**。

### 4.3 目前分類 checkpoint 保護（2026-09-12）

Preview Supabase 已由使用者提供外部驗證：

- `announcement_classification`: **4,887 / 4,887**
- `classification_version = 1`
- `announcement_classification_index`: **4,887 個 announcement_id**
- index rows: **35,809**

因此這批 Preview 分類資料視為完成 checkpoint。

在分類程式碼救援／重建尚未完成前，禁止：

- 重新 backfill 4,887 筆
- 重新分類既有 4,887 筆
- truncate／清空 classification tables
- reset Preview database
- 重跑 classification migration 到 Preview
- 修改既有 classification rows
- 修改 classification index rows
- 因找不到 working tree 就用資料庫重算一次
- 順手修改 Archive／tombstone
- 動 Production classification／Production migration／Production backfill

本 checkpoint 的正確續作是：**只處理程式碼保存／恢復／重建與驗證，資料庫保持唯讀**，直到使用者另行改變範圍。

---

## 5. 目前專案 checkpoint（2026-09-12）

### 5.1 main

- repo default branch：`main`
- 2026-09-12 13:51（臺灣時間）可見最新 `main` commit 為 news-bot 的公告資料更新；功能 commit 不能只看 HEAD，因 Actions 會持續產生資料 commit。

### 5.2 已知近期已合併功能（GitHub PR 直接證據）

- PR #11：完整帳號／訪客／會員／管理／課表／行事曆等整合基礎。
- PR #12：帳號分級、管理介面與 Email 通知基礎。
- PR #13：PKSH 單筆錯誤隔離，避免一筆錯誤鎖死整批。
- PR #14：嘉義高中 115-1 正式班級課表發現與 parser 修正。
- PR #15：細粒度會員 capability 基礎。
- PR #16：問校務 v2 的受保護附件來源程式碼曾合併；**不得因此推定 Production migration、Edge Function、OCR 排程與正式資料流程全部已啟用**。
- PR #18：全新清爽 UI 合併。
- PR #19：公告生命週期清理系統合併。
- PR #20：Archive expired announcements safely 合併；PR 本身的 Production 部署限制屬當時工作範圍，後續是否正式上線需以最新 evidence／使用者驗收為準。

### 5.3 使用者最近確認的狀態

- 新 UI 已要求上正式站後 freeze。
- 公告生命週期／Archive 基礎已完成，後續視為 Freeze。
- 公告分類資料 Preview checkpoint 已完成，但上一個 Work 的未提交分類程式碼沒有在新環境找到；**不可用重新 backfill 當成程式碼救援方法**。

### 5.4 Production Supabase 歷史 checkpoint（使用前必須重新確認是否仍為最新）

2026-09-07～09 曾完成／驗證的基礎：

- Production project: `oppdhtnepjagdwovndra`
- migration 共 5 支完成
- 當時 Auth users / account_access / active admin / owner = `4 / 4 / 1 / 1`
- `announcement-content-sync` v3 曾部署
- 2026-09-09 曾出現 sync token 不一致；後續使用者表示已把 GitHub Secret 與 Edge Function secret 設為一致
- 當時 `private.announcement_member_content` 仍曾為 0

這一節是**歷史 checkpoint，不是 9/12 現況保證**。下一個需要依賴會員摘要資料的工作，先只讀驗證最新狀態，不可自行重跑 migration／重建 Auth。

---

## 6. 完成紀錄（濃縮時間線）

> 這是導覽，不取代 GitHub commit／PR／Actions 原始證據。

### 2026-08-11

- 前端大量公告分頁／載入更多：PR #2 merged。
- 學校來源分級抓取，hot 每輪、cold 低頻：PR #3 merged；目的之一是降低每日請求量、維持涵蓋率。

### 2026-08-24

- Cloud-first recovery 流程建立，強化 remote／CI 為權威與 generated data ownership。

### 2026-08-30 ～ 2026-09-05

- 問校務公告效力、片段有效性、搜尋權重、個資／公開資料保護等功能逐步在測試線建立。
- 舊技術台帳確立重要原則：CI、部署、正式功能驗收必須分開記錄。
- 9/5 多個整合／合規 PR 合併；歷史版本報告只代表當時快照，後續不得拿來覆蓋 9/11 之後的新版本。

### 2026-09-05 ～ 2026-09-06

- 帳號角色、服務層級、管理介面、Email queue 基礎合併。
- PKSH 修正為單筆錯誤隔離；整頁／連線不完整仍保留既有資料。

### 2026-09-07 ～ 2026-09-09

- Production Supabase 權限與會員內容相關 migration 完成一輪修復。
- `announcement-content-sync` v3 完成部署與認證方式修正；最終資料同步是否完整成功需看最新 evidence，不用舊 `0 rows` 或單次失敗永遠當現況。

### 2026-09-09 ～ 2026-09-10

- 嘉中正式課表 discovery/parser 修正合併。
- 會員功能拆成細粒度 capability，Preview 行為驗證完成後合併。

### 2026-09-10 ～ 2026-09-11

- 問校務 v2 附件解析／OCR／答案欄位／受保護來源相關程式碼合併；Production 各服務是否啟用仍需分開驗證。
- 全新清爽 UI 合併；使用者之後要求 Production 版本 freeze。

### 2026-09-11 ～ 2026-09-12

- 公告生命週期：失效檢查、人工保留／刪除、tombstone、防 scraper 復活等合併。
- Archive：active → archive → restore 的基礎與歷史公告篩選合併；Archive 核心 Freeze。
- 分類資料在 Preview 完成 `4,887/4,887` 與 `35,809` index rows checkpoint。
- 分類程式碼 working tree 救援失敗；正確做法是保護已完成 DB，重建／保存程式碼，不重新 backfill。

---

## 7. 目前待辦／開發順序

除非使用者另行調整，優先順序：

1. **公告分類系統程式碼救援／重建與保存**：只讀既有分類 DB checkpoint，不重跑 4,887 backfill；完成後 commit/push/CI/Vercel Preview。
2. 驗證分類程式碼與現有 Preview schema／資料一致，建立可重現但不破壞 checkpoint 的增量分類流程。
3. 再決定附件解析／Reference Knowledge 如何接分類結果；不要在分類未收尾前擴大施工面。
4. 問校務 v2 的深度推理與附件證據使用，建立在分類、附件、Reference Knowledge 可追溯資料之上。
5. 課表長期需求：不同學校、每學期可由使用者自行更新。

---

## 8. 歷史狀態與新狀態的處理原則

- 2026-09-05 的「正式站仍是 8/29 功能」只是一份當時查核快照，已被後續 9/5～9/12 多次 merge／deployment 工作取代；不得當成今天現況。
- PR `merged=true` 只證明 Git 歷史已合併；不自動證明 Production DB migration、Edge Function、排程、Vercel/GitHub Pages、實站驗收全部完成。
- Actions 的公告資料 commit 可能讓 `main` HEAD 一直變；判斷功能版要找相關程式 commit／PR，不要把最後一筆 news-bot commit 當成功能發布版本。
- 使用者驗收是重要證據，但若與 repo／實站直接證據衝突，必須把衝突列出來，而不是自行選邊。

---

## 9. 每次工作完成時，本檔要怎麼更新

Work 完成實際施工後，在本檔追加或修正：

- 日期（臺灣時間）
- 做了什麼
- branch / commit / PR（若有）
- 測試結果
- CI 結果
- Preview/Staging 結果
- Production 是否有變更
- 資料庫是否有變更
- 使用者是否已實際驗收
- 新的 freeze／解除 freeze
- 下一個可安全接續 checkpoint

狀態只可使用清楚分類：

- 【已完成】
- 【失敗】
- 【未完成】
- 【等待中】
- 【無法確認】
- 【待驗證】

不要用「應該好了」「看起來可以」代替證據。

---

## 10. 一句話給下一個 Work

**先讀本檔，從最後成功 checkpoint 往前做；不要叫使用者重貼歷史，不要重做已完成資料，不要用舊版本覆蓋現在，也不要把 CI／部署／正式驗收混成同一件事。**
