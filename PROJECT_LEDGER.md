# PROJECT_LEDGER.md — 嘉雲快訊 / cy-school-news 專案總帳

> 本檔是專案的「續接總帳」，不是單純變更日誌。
>
> 任何新的 Work / AI / 開發者在修改專案前，必須先讀 `AGENTS.md`，再讀本檔，找到：
> 1. 最後一個已確認成功 checkpoint
> 2. 上一次精確失敗／中斷點
> 3. 已經完成、禁止重做的工作
> 4. 下一個唯一允許動作
>
> 若本檔與 repo、GitHub Actions、Vercel、Supabase 或正式站的直接證據衝突，以直接證據為準，並更新本檔，而不是靠猜測補故事。

---

## 0. 核心工作規則

### 永久規則

- 不得因為檢查失敗而重新執行已成功的修改、migration、backfill、commit 或 push。
- 永遠從最後一個「已確認成功」的 checkpoint 繼續。
- 不得整包 revert 舊 commit、checkout 舊版本覆蓋 main、或用舊 deployment 回填整個 production。
- Production 只能在使用者明確要求時修改、merge 或部署。
- 測試站／feature 可以驗證，但不得把 Preview Ready 當成 production 已完成。
- CI 通過、部署成功、正式網站實際驗收必須分開記錄。
- GitHub remote 是工程事實來源；本機 working tree 只能視為暫存快取。
- 每次實際修改後，必須記錄 branch、HEAD、測試結果、working tree 狀態。
- 同一工具／同一方法失敗兩次後，不得無限重試，必須換方法或停止並回報。
- 外部等待最長 5 分鐘；超過標記【無法確認】或【等待中】，不得一直卡住。
- 發生失敗、timeout、Work 對話過長、CI failure、deployment failure、migration failure 時，本檔必須記錄：
  - 最後成功 checkpoint
  - 精確失敗點
  - 已排除原因
  - 尚待驗證原因
  - 下一個允許動作
- 禁止把「失敗」只寫成一句話而沒有失敗位置。

### 公告與合規規則

- 公開欄位以：日期、分類、處室、標題、原始網址為主。
- 不公開大量原始正文或附件全文。
- 摘要採必要範圍，遇可識別個資需跳過或最小化。
- 附件以官方連結為主；內部解析可供會員搜尋，但不得直接大量重刊。
- 爬蟲必須使用透明 User-Agent、合理限速、退避；禁止 `verify=false`、`curl -k`、HTTP 降級等方式繞過 TLS。

---

## 1. 產品定位與固定架構

### 專案

- Repo：`tsaibohau/cy-school-news`
- 產品名稱歷史：嘉校快訊 → 嘉雲快訊 / CY 校訊
- 主要用途：整合多校公告、搜尋、分類、歷史歸檔、會員功能、問校務、課表、行事曆、通知。

### 主要資料流

```text
學校公告來源
  ↓
GitHub Actions
  ↓
scraper/scrape.py
  ↓
announcements.json / archive.json / new_items.json /
fetch_state.json / coverage_gaps.json
  ↓
GitHub Pages PWA（production）
  ↓
搜尋 / 問校務 / 通知 / 會員功能

Vercel = staging / preview 驗收
Supabase = Auth / 權限 / 會員資料 / 結構化公告資料
```

### 主要學校來源

- CYSH：嘉義高中
- CYGSH：嘉義女中
- FJSH：輔仁中學，曾進入多校整合與驗收流程
- PKSH：北港高中，iSchool API / TLS runner 問題仍是獨立處理項

---

# 2. 產品從出生到現在的主時間線

> 原則：只有有明確紀錄者才寫成已確認；不確定處保留【待驗證】。

## 2026-08-08｜Lite V2 舊階段

- Apps Script / Lite V2 時期已存在公告整合雛形。
- `runLiteV2` 曾多次執行。
- 曾出現 `LITE_V2_IDENTITY_CONFLICT`，代表來源身分／Stable ID 曾是早期核心問題。
- 至少有一次 timeout。
- 後續版本逐步加入：10 分鐘觸發、Stable ID、UI、detail retry cap、URL 正規化、pinned、排序與過期修復。
- 此階段是產品出生期，很多版本號只有歷史紀錄，不能直接等同現行程式。

## 2026-08 中旬｜多校整合

- CYSH 與 CYGSH 成為主要來源。
- 曾記錄來源總數約 30（CYSH 23、CYGSH 7）。
- M5 時期曾出現公告量 182 → 571 → 572，重複 0、校別衝突 0 的紀錄。
- 前端逐步加入全文搜尋、學校篩選、分類、訂閱、PWA / 離線。

## 2026-08-24｜Cloud-first / staging 形成

- Vercel staging 開始成為 feature 驗收環境。
- 專案逐步從「本機工作副本」轉向 GitHub remote + CI + Vercel Preview 的雲端工程流程。
- 這之後的重要規則：本機 working tree 不能再被視為唯一成果保存位置。

## 2026-08-28｜個人化與多校畫面

- 發布個人化介面。
- 後續加入 FJSH 公告與依學校呈現的畫面。
- PKSH 當時未穩定進 production，保留為獨立技術問題。

## 2026-08-29｜正式站搜尋版本

- 主要工作集中在搜尋相關性、查詢主題判斷、排序、搜尋權重與 PWA 舊快取問題。
- 2026-08-29 18:13 左右可確認當時一版正式網站發布成功。
- 重要歷史 commit：`27bde8ab1841b4f3c7e44ababac26a0511c4792a`。
- 此後一段時間 production 主要持續更新公告資料，而新版帳號、管理員等功能先留在 staging。

## 2026-08-30｜問校務「效力」與搜尋精準化

### 公告效力

- 新增公告效力判斷：有效、未來、過期、部分有效、效力未確認等。
- 問校務開始避免把舊公告當成現在有效。
- 人工審核一批真實公告，用來建立：
  - 部分取代
  - 延長期限
  - 勘誤只覆蓋指定條文
  - 跨學年度仍有效片段
  - 過期辦理窗口但後續規則仍有效
- 後續形成片段級 validity model，而不是整篇只給一個 status。

### 搜尋

- 搜尋從純字面改為：
  - 精確詞
  - taxonomy
  - 主題 / 動作拆分
  - 新鮮度
  - 稀有詞權重
  - 有效窗口
- 建立固定搜尋訓練集與留出驗證集。
- 曾達成訓練 8/8、驗證 8/8 的紀錄，但不得把固定題目全對等同所有真實查詢都正確。

### 問校務

- 問校務建立自己的 QA 評測集，不再只是直接沿用搜尋第一名。
- 強化來源、時效、個資最小化與證據不足時的拒答／警告。

### 合規與資料保護

- 新增 legal / privacy / source-rights 相關文件與技術 gate。
- Preview 階段曾刻意維持 `production_ready=false`，避免把工程措施誤稱為法律審查完成。
- 帳號資料刪除與 RLS 最小權限開始被系統性測試。

## 2026-08-31｜獨立帳密登入

- 新增 Email + password 測試版。
- 後續加入 username + password，保留 Google 登入。
- 形成「使用者不必只靠 Google 登入」的新帳號路線。
- 帳號名稱綁定、驗證信、忘記密碼逐步加入。

## 2026-09-01｜載入與視覺改善

- 改善載入畫面與整體視覺回饋。
- 這個階段仍主要是 staging 線演進。

## 2026-09-02｜問校務呈現與班級課表

- 統一字體與問校務回答呈現。
- 加入公開班級課表讀取功能。
- 課表與行事曆確立為不同功能。

## 2026-09-03｜訪客 / 會員 / 管理員分流

- 未登入者可先進公告總庫。
- 限制訪客進入個人化功能。
- 登入支援 Email 或 username。
- 新增帳號審核面板。
- 管理員可核准、拒絕、移除使用權。
- 帳號管理移到獨立管理員介面。

## 2026-09-04｜正式資料與新版功能整合

- 將 production 較新的公告資料接回 staging，同時保留新版登入、管理員、課表、搜尋、問校務。
- 曾發生版本混亂：本機副本、遠端 branch、production 資料與 staging 功能不是同一條線。
- 重要教訓：
  - 「正式資料較新」不等於「正式 UI 較新」。
  - 不得把任一舊本機目錄當成 canonical。

## 2026-09-05｜內容保護、第 9 / 10 號版本與正式站整理

- 第 9 號修改把公告詳細頁調整為不直接展示大量原始正文／附件文字，改導回官方來源。
- 限制摘要長度／比例。
- 第 9 號整合進 staging。
- 第 10 號曾作為把 staging 搬進 main 的發布候選。
- 此時查核曾發現大量歷史工作副本、分支與 deployment，正式線與測試線版本脈絡高度混亂。
- 使用者因此建立更嚴格的版本規則：
  - 不准任意回滾
  - 不准用舊 deployment 整包覆蓋 main
  - 以已驗收 staging 為當時基準

## 2026-09-05～09-10｜Production Supabase 權限與會員摘要

### Production Supabase

- Production project：`oppdhtnepjagdwovndra`
- Preview project：`ebezqanvmgsgtatsbssn`

### 已完成的 production migrations（歷史 checkpoint）

1. 帳號角色、服務等級、重新申請、email outbox、RLS、註冊 trigger。
2. 修正 queue_account_email 參數。
3. 移除舊 admin RPC、補索引。
4. 建立 `private.announcement_member_content` 與會員摘要 RPC。
5. `GRANT USAGE ON SCHEMA private TO service_role`。

### 帳號基線

- Auth users 曾以 4 為基線。
- account_access 曾以 4 為基線。
- active admin / owner 都有明確驗證要求，不得因 migration 下降。

### announcement-content-sync

- Production Edge Function v3 已部署，`verify_jwt=true`。
- workflow 可從 Variable / Secret 取得 publishable key。
- 曾發生：
  - `ANNOUNCEMENT_CONTENT_SYNC_NOT_CONFIGURED`
  - 401
  - 503
  - `invalid_sync_token`
- 最後定位到 GitHub Secret 與 Production Edge Function secret 不一致。
- 使用者後續已將 `ANNOUNCEMENT_CONTENT_SYNC_TOKEN` 設定一致。
- 這一段的重要工程規則：不要讀 secret 值，只驗證流程與結果。

## 2026-09-06～09-10｜PKSH（北港高中）獨立技術線

- 需求：不能只抓 90 筆，目標是完整涵蓋站上約 1600+ 公告；先全抓，再依生命週期處理過期。
- iSchool API：
  - `/ischool/widget/site_news/news_query_json.php`
  - `/ischool/widget/site_news/news_query_json_content.php`
- Linux GitHub runner 曾因 TLS chain 問題無法正常抓取。
- Windows runner 曾有成功跡象。
- 曾建立 `pksh-windows-production.yml`，後因正式站其他修復而被移除。
- 後續規則：只做 PKSH targeted restore，禁止 revert 整個舊 commit。
- 抓取頻率必須友善，不得因追求完整而變成攻擊。

## 2026-09-07～09-10｜會員權限分層方向

- 角色：管理員、聯席管理員、僅課表服務。
- 新方向：功能改成逐項可授權，包括：
  - 問校務
  - 訂閱通知
  - 課表
  - 行事曆
  - 會員摘要
- 使用者希望課表之後可由會員每學期自行更新，而不是每學期重新抓取。
- 問校務 v2 延後，先做資料與權限基礎。

## 2026-09-11｜UI 全面改版與公告生命週期

### UI

- 嘉雲快訊改成更清爽的 UI。
- 中途曾發生管理員介面不見、無法返回主畫面等問題，後續修正。
- 修正後上 production 並 freeze UI 基準。

### 公告生命週期

- 問校務 v2 開發前，先處理「公告只增加、不淘汰」的架構問題。
- 新增公告失效檢查／清理系統。
- 核心觀念：expired != invalid。
- 先建立 admin 候選檢查，而不是直接自動大量刪除。
- 失效理由包括：
  - 明確期限已過
  - 活動已結束
  - 學期／學年度型公告已結束
  - 可能被新版取代（低信心需人工）
- 長期法規、辦法、程序不得只因舊就自動失效。

## 2026-09-11～09-12｜Archive / Reference 基礎完成並上 Production

### 三層架構

```text
ACTIVE
  ↓
REFERENCE（歷史整理 / 可重用知識）
  ↓
RAW ARCHIVE（原始歷史證據）
```

### 核心規則

- 歸檔必須先 archive 成功，再從 ACTIVE 移除。
- tombstone 防止 scraper 把已移除公告重新抓回 ACTIVE。
- 支援 Archive → ACTIVE restore。
- 歷史資訊必須標成歷史，不可冒充現況。

### 已完成 checkpoint

- PR #20：`Archive expired announcements safely`
- merge commit：`4a0e903e5303eaca4960fbbf06e089ba91aa1ccb`
- Production migrations：
  - `announcement_archive_reference`
  - `archive_publish_date_guard`
- Production ACTIVE：4,887
- effective ARCHIVE：0（另有 1 RESTORED audit row）
- TOMBSTONE：0
- 真實 roundtrip 使用 `fjsh-2393` 驗證：
  - ACTIVE 4887 → 4886
  - Archive 0 → 1
  - tombstone 0 → 1
  - scraper resurrection prevention 確認
  - restore 後 ACTIVE 回 4887，Archive 0，tombstone 0
- GitHub Pages production deployment 成功。
- Archive 基礎架構視為 Freeze。

### 既有 baseline failure

- `user_tasks` CI 有 6/25 failures。
- baseline commit 也有相同 failures。
- 因此不得把這 6 項當成 Archive regression，也不得順手修。

## 2026-09-12｜公告分類系統 v1

### 目標

為附件解析、Reference Knowledge、問校務 v2 建立可搜尋的結構化資料，而不是只做一個 `category`。

### 問句設計方向

例如：

```text
高一第一次段考什麼時候？
高一      → audience
第一次    → ordinal
段考      → topic / exam
什麼時候  → requested field = date
```

分類資料結構包含：

- school
- main_category
- sub_category
- event_types
- audience
- topics
- actions
- requested_fields
- available_fields
- academic_year
- semester
- dates
- department
- location
- reference_value
- classification_confidence
- classification_sources
- classification_version
- classification_source_hash
- matched_aliases
- unresolved_terms
- manual override

### deterministic v1

優先順序：

```text
existing category
→ title
→ department
→ body
→ aliases
→ deterministic rules
```

不使用每篇公告的大模型分類。

### Preview 已完成資料 checkpoint

- `announcement_classification`：4,887 / 4,887
- `classification_version = 1`：4,887
- `announcement_classification_index`：涵蓋 4,887 個 announcement_id
- index rows：35,809

### 曾發生的 Work 重大失敗

第一次 Work 執行分類工作後，在尚未 commit / push 程式碼前停止。

精確失敗訊息：

```text
推理失敗
此對話太長，無法繼續。請開始新對話並再試一次。
```

#### 已排除

- 不是 Preview classification 資料只跑一半。
- 不是 4,887 backfill 未完成。
- 不是已證明的 Supabase failure。

#### 實際資料狀態

- full backfill 至少已完成兩次。
- Retry 又開始第三次冗餘 idempotent upsert，跑到約 2,640 筆後因 Work context 結束。
- 4,887 筆 classification 與 35,809 index rows 在 Preview 都已完整存在。

#### 造成的損失

- 舊 Work 的未提交 working tree 無法在新 Work 環境找到。
- 新環境甚至一開始不是 Git repository。
- 因此原未提交 classifier / taxonomy / migration / admin UI 程式碼視為遺失。

#### 永久禁止重做

- 禁止重新 backfill 4,887 筆。
- 禁止重新分類現有 4,887 筆。
- 禁止清空 classification tables。
- 禁止重跑 Preview migration。
- 禁止修改既有 classification / index rows 來「驗證」。

## 2026-09-12｜公告分類程式碼 Recovery

### Recovery branch

- branch：`codex/announcement-classification-recovery`
- HEAD：`a8afea975be4daaeb4957a0e4b839f088df2efb5`
- tree：`6128f4c390fbcdc93ace74749d9a4a9bb6743c19`
- working tree：clean
- Draft PR：#23 `Recover announcement classification v1`

### 已重建

- taxonomy v1
- 15 個核准 aliases
- migration（只補回版本控制，未套用 Preview）
- deterministic classifier
- source hash
- manual override preservation
- index builder
- backfill tool（支援 batch / checkpoint / resume / idempotent upsert，但只做 fixture dry-run）
- Admin Classification View
- classification tests

### 本地測試

- 分類測試 9/9
- Admin contract
- parser suites
- staging build
- search / QA gates

以上本地驗證均通過。

### Preview read-only 驗證

- classification rows：4,887
- classification v1：4,887
- indexed announcements：4,887
- index rows：35,809
- 是否重新 backfill：NO
- 是否修改 Preview Supabase：NO

### PR #23 CI 現況

GitHub CI：failure，但目前已知項目為：

1. Local RLS：`user_tasks` 6/25 failure
   - 已知為 main baseline 既有問題。
   - 不屬 classification recovery。

2. Staging validation：
   - account capability 文案 assertion
   - PKSH registry assertion

### 當前精確阻塞點

目前唯一需要做的是：

> 在 main baseline 執行同一組 Staging validation，確認「account capability 文案 assertion」與「PKSH registry assertion」是否以相同原因失敗。

如果 baseline 也相同失敗：

```text
【PR #23 無新增 regression】
```

如果 baseline 通過但 PR #23 失敗：

```text
【可能為 PR #23 regression】
```

立即停止，只回報差異，不得自行擴大修正。

### 現在禁止

- merge PR #23
- Production migration
- Production backfill
- Production deploy
- 重新執行 classification backfill
- 修改 Preview classification rows
- 修改 user_tasks
- 修改 PKSH
- 修改 account capability
- 開始附件解析
- 開始 Reference Knowledge
- 開始問校務 v2

---

# 3. 當前系統 checkpoint（2026-09-12）

## Production

### Archive / lifecycle

- ACTIVE：4,887
- Archive 核心：已上 Production，視為 Freeze
- tombstone 防復活：已驗證
- restore：已驗證

### Production Supabase

- 不得因 classification recovery 動到 Production。
- 帳號 / 權限 / member content 既有 migration 視為另一條已完成或待驗證工作線。

## Preview

### Classification

- 4,887 / 4,887 classification v1
- 4,887 / 4,887 indexed announcements
- 35,809 index rows
- 視為已完成資料 checkpoint

## Git

### Archive

- 已 merged 到 main。

### Classification

- Draft PR #23
- 尚未 merge
- Vercel Preview Ready
- CI 尚待 baseline 歸因完成

---

# 4. 目前功能優先順序

依目前使用者決策：

1. 保住 Archive / lifecycle 基礎，不再重做。
2. 完成 classification recovery 的 CI baseline 歸因。
3. classification v1 確認可安全 merge 後，再決定正式資料部署策略。
4. 會員功能分層仍是重要方向。
5. 問校務 v2 延後。
6. 附件解析與 Reference Knowledge 不得提前開始，除非使用者另行開工。

---

# 5. 問校務 v2 已確認的設計方向（尚未開工）

## 問句 semantic roles

- 主題：段考、社團、獎學金、補考、選課
- 對象：高一、高二、高三、老師、全校
- 行為：報名、申請、繳交、轉社、請假
- 時間：今天、明天、截止、什麼時候
- 地點：哪裡、教室、辦公室
- 人物 / 單位：教務處、學務處、老師
- 問題目的：何時 / 哪裡 / 如何 / 是否 / 誰 / 多少

## Unknown terms

優先：

```text
固定校務詞典
→ alias / synonym
→ context inference
→ classification index
→ AI fallback（最後）
```

低 confidence 不得硬猜。

## Heavy at ingestion, light at query

```text
公告進站
→ classify
→ extract tags / dates / audience / location
→ index
→ store

使用者提問
→ normalize
→ alias
→ intent
→ index retrieval
→ 少量 candidates
→ 必要時 AI 生成答案
```

---

# 6. Archive / Reference 未來規則

- ACTIVE：現行主要回答來源。
- REFERENCE：整理後的歷史知識，只能當第二層。
- RAW ARCHIVE：原始歷史證據，不預設進主搜尋。
- 歷史資料不得冒充現況。
- 可能被新版取代的公告必須建立文件關係，不能只靠日期新舊。

---

# 7. PKSH 固定風險與規則

- 不得為了讓 Linux runner 成功而關閉 TLS 驗證。
- Windows / Linux 的差異必須保存實際錯誤證據。
- 單校故障不得清空其他學校資料。
- 完整抓取也必須限速。
- 舊 workflow 若要恢復，只做 targeted restore，不 revert 整個歷史 commit。

---

# 8. 版本混亂事件留下的永久教訓

曾出現：

- 同名本機 main 實際停在舊 commit。
- 多個 worktree 留有未提交修改。
- staging 功能較新，但 production 資料較新。
- Vercel deployment 多，但不是每個都是可直接使用的「版本」。
- 一次 Work 因 context 過長，把尚未 commit 的 working tree 直接留死在舊環境。

因此以後：

1. remote refs > 本機資料夾名稱。
2. branch / HEAD / tree / working tree 必須一起記。
3. durable feature work 儘快 commit + push，不准只留在 Work 本機。
4. 資料工作完成後先記 checkpoint，程式碼工作再繼續。
5. 重試前先確認「失敗的是執行環境、資料、程式、CI、部署中的哪一層」。

---

# 9. 每次工作結束時必須追加的格式

```markdown
## YYYY-MM-DD HH:mm｜工作名稱

### 目標

### 開始前 checkpoint
- branch:
- HEAD:
- working tree:
- DB / deployment checkpoint:

### 已完成

### 驗證
- local tests:
- CI:
- Preview:
- Production:

### 精確失敗點（若有）

### 已排除原因

### 尚待驗證

### 禁止重做

### 下一個唯一允許動作

### 最終狀態
【已完成 / 失敗 / 未完成 / 無法確認 / 等待中】
```

---

# 10. 目前下一個唯一允許動作

**只做 PR #23 Staging validation 的 main baseline 歸因。**

需要比對：

1. account capability 文案 assertion
2. PKSH registry assertion

不得修改程式。
不得修改 Supabase。
不得重新 backfill。
不得 merge。
不得 Production deployment。

完成後，必須把 baseline commit、兩項 assertion 的 PR / baseline 結果，以及「是否新增 regression」更新回本檔。
