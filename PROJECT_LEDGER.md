# PROJECT_LEDGER.md — 嘉雲快訊 / cy-school-news 專案總帳

> 本檔是專案的「續接總帳」，不是單純變更日誌。
>
> 任何新的 Codex / Work / AI / 開發者在修改專案前，必須先讀 `AGENTS.md`，再讀本檔，找到：
>
> 1. 最後一個已確認成功 checkpoint
> 2. 上一次精確失敗／中斷點
> 3. 已完成、禁止重做的工作
> 4. 下一個唯一允許動作
>
> 若本檔與 repo、GitHub Actions、Vercel、Supabase 或正式站的直接證據衝突，以直接證據為準，並更新本檔，不得靠猜測補故事。

---

# 0. 永久工作規則

## 0.1 施工與續接

- 永遠從最後一個「已確認成功」checkpoint 繼續。
- 不得因為檢查失敗而重新執行已成功的修改、migration、backfill、commit、push 或 deployment。
- 不得因換 Codex / Work、換對話、換環境而從頭重做。
- GitHub remote 是 canonical engineering source；本機 working tree 只視為暫存快取。
- durable feature work 必須儘快 commit + push，不能只留在單一 Work 環境。
- 每次實際修改後，記錄 branch、HEAD、tree、working tree、測試與部署狀態。
- Production 只有在使用者明確要求時才能 merge / migration / backfill / deploy。
- 禁止整包 revert 舊 commit、checkout 舊版本覆蓋 main、或把舊 deployment 整包回填 production。
- CI 通過、部署成功、正式網站實際驗收三者必須分開記錄，不能互相推導。

## 0.2 失敗處理

發生下列任一事件：

- CI failure
- deployment failure
- migration failure
- timeout
- Work / Codex context 過長
- 工具中斷
- 外部服務等待

都必須在本檔記錄：

1. 最後成功 checkpoint
2. 精確失敗點
3. 已排除原因
4. 尚待驗證原因
5. 下一個允許動作

不得只寫「失敗」。

同一工具／同一方法失敗兩次後，不得無限重試；改用其他驗證方式或停止回報。
外部等待最長 5 分鐘；超過標記【無法確認】或【等待中】。

## 0.3 Codex / Work 回報交接規則

這是固定流程：

```text
Codex / Work 回報
      ↓
先更新 PROJECT_LEDGER.md
      ↓
更新最後 checkpoint / 精確失敗點 / 禁止重做 / 下一步
      ↓
再產生下一輪給 Codex 的指令
```

下一輪給 Codex 的指令應優先縮成：

> 先讀 `AGENTS.md` 與 `PROJECT_LEDGER.md`，從最後已確認 checkpoint 與上次精確失敗點繼續；只做 ledger 所列的下一個允許動作。完成或失敗後更新 `PROJECT_LEDGER.md`。

只補本輪新增限制，不再重新貼整份專案歷史。

## 0.4 公告與合規

- 公開欄位以日期、分類、處室、標題、原始網址為主。
- 不公開大量原始正文或附件全文。
- 摘要採必要範圍；遇可識別個資需跳過或最小化。
- 附件以官方來源連結為主；內部解析可供會員搜尋，但不得大量重刊。
- 爬蟲必須透明 User-Agent、合理限速、退避。
- 禁止 `verify=false`、`curl -k`、HTTP 降級等方式繞過 TLS。

---

# 1. 產品定位與固定架構

## 專案

- Repo：`tsaibohau/cy-school-news`
- 產品名稱歷史：嘉校快訊 → 嘉雲快訊 / CY 校訊
- 主要用途：多校公告整合、搜尋、分類、歷史歸檔、會員、問校務、課表、行事曆、通知。

## 資料流

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

Vercel = staging / preview
Supabase = Auth / 權限 / 會員資料 / 結構化公告資料
```

## 主要學校來源

- CYSH：嘉義高中
- CYGSH：嘉義女中
- FJSH：輔仁中學，曾進入多校整合與驗收流程
- PKSH：北港高中，iSchool API / TLS runner 問題為獨立技術線

---

# 2. 產品從出生到現在的主時間線

> 只有有明確紀錄者寫成已確認；不確定者保留【待驗證】。

## 2026-08-08｜Lite V2 / Apps Script 出生期

- 公告整合雛形已存在。
- `runLiteV2` 曾多次執行。
- 曾出現 `LITE_V2_IDENTITY_CONFLICT`，來源身分 / Stable ID 是早期核心問題。
- 至少一次 timeout。
- 後續逐步加入：10 分鐘觸發、Stable ID、UI、detail retry cap、URL 正規化、pinned、排序與過期修復。

## 2026-08 中旬｜多校整合

- CYSH + CYGSH 成為主要來源。
- 曾記錄約 30 個來源／類別：CYSH 23、CYGSH 7。
- M5 時期曾記錄公告量 182 → 571 → 572、重複 0、校別衝突 0。
- 前端逐步加入全文搜尋、學校篩選、分類、訂閱、PWA / 離線。

## 2026-08-24｜Cloud-first / staging

- Vercel staging 成為 feature 驗收環境。
- 工程流程逐步轉為 GitHub remote + CI + Vercel Preview。
- 此後本機資料夾不再能被視為 canonical。

## 2026-08-28｜個人化與多校畫面

- 發布個人化介面。
- 加入 FJSH 與依學校呈現的畫面。
- PKSH 未穩定進 production，保留獨立處理。

## 2026-08-29｜正式站搜尋版本

- 改善搜尋相關性、查詢主題、排序、權重與 PWA stale shell。
- 2026-08-29 18:13 左右可確認一版 production 發布成功。
- 重要歷史 commit：`27bde8ab1841b4f3c7e44ababac26a0511c4792a`。
- 後續一段時間 production 主要持續更新公告資料；新版帳號與管理員功能先留在 staging。

## 2026-08-30｜問校務效力、搜尋精準化、合規 gate

### 公告效力

- 新增有效、未來、過期、部分有效、效力未確認等概念。
- 人工審核真實公告，建立：部分取代、延長期限、勘誤指定範圍、跨學年度片段、過期窗口但後續規則仍有效。
- 後續形成片段級 validity model，不再整篇只給單一 status。

### 搜尋 / 問校務

- 搜尋加入精確詞、taxonomy、主題 / 動作、新鮮度、稀有詞權重與有效窗口。
- 建立固定搜尋 train / holdout 評測。
- 問校務建立自己的 QA 評測，不只沿用搜尋第一名。
- 強化來源、時效、個資最小化與證據不足時的警告。

### 合規 / RLS

- 新增 legal / privacy / source-rights 文件與 technical gate。
- Preview 階段刻意維持 `production_ready=false`，避免把工程控制誤稱完整法律審查。
- 帳號資料刪除與 RLS 最小權限開始系統化驗證。

## 2026-08-31｜獨立帳密登入

- 加入 Email + password。
- 後續加入 username + password，Google 保留。
- 增加 username 綁定、驗證信、忘記密碼。

## 2026-09-01｜載入與視覺

- 改善載入畫面與視覺回饋。

## 2026-09-02｜問校務呈現與班級課表

- 統一字體與問校務呈現。
- 加入公開班級課表讀取。
- 課表與行事曆確立為不同功能。

## 2026-09-03｜訪客 / 會員 / 管理員

- 未登入者先進公告總庫。
- 限制訪客使用個人功能。
- 登入支援 Email 或 username。
- 加入帳號審核面板。
- 管理員可核准、拒絕、移除使用權。
- 帳號管理移到獨立管理員介面。

## 2026-09-04｜正式資料與新版功能整合

- 將 production 較新的公告資料接回 staging，同時保留新版登入、管理員、課表、搜尋、問校務。
- 曾發生本機副本、remote branch、production 資料、staging 功能不同步。
- 永久教訓：
  - production 資料較新 != production UI 較新
  - 本機資料夾名稱 != 真實 branch / HEAD

## 2026-09-05｜內容保護與版本整理

- 第 9 號修改：詳細頁不直接大量展示原始正文 / 附件文字，改導回官方來源。
- 限制摘要長度 / 比例。
- 第 9 號進 staging；第 10 號曾是 staging → main 候選。
- 當時發現大量歷史 worktree / branch / deployment 混雜。
- 從此禁止：任意回滾、用舊 deployment 整包覆蓋 main。

## 2026-09-05～09-10｜Production Supabase / 會員摘要

### 環境

- Production：`oppdhtnepjagdwovndra`
- Preview：`ebezqanvmgsgtatsbssn`

### 已完成 production migration 歷史 checkpoint

1. 帳號角色、服務等級、重新申請、email outbox、RLS、註冊 trigger
2. 修正 `queue_account_email`
3. 移除舊 admin RPC、補索引
4. 建立 `private.announcement_member_content` 與會員摘要 RPC
5. `GRANT USAGE ON SCHEMA private TO service_role`

### 帳號基線

- Auth users：曾以 4 為基線
- account_access：曾以 4 為基線
- active admin / owner 不得因 migration 下降

### announcement-content-sync

- Production Edge Function v3 已部署，`verify_jwt=true`。
- 曾遇到 `ANNOUNCEMENT_CONTENT_SYNC_NOT_CONFIGURED`、401、503、`invalid_sync_token`。
- 最後定位到 GitHub Secret 與 Production Edge Function secret 不一致。
- 後續已把 `ANNOUNCEMENT_CONTENT_SYNC_TOKEN` 設定一致。
- 永久規則：不要讀 secret 值，只驗證 provider-side 設定與結果。

## 2026-09-06～09-10｜PKSH 獨立技術線

- 需求：不能只抓 90 筆，目標涵蓋站上約 1600+ 公告；先完整抓取，再由生命週期處理過期。
- iSchool API：
  - `/ischool/widget/site_news/news_query_json.php`
  - `/ischool/widget/site_news/news_query_json_content.php`
- Linux GitHub runner 曾有 TLS chain 問題。
- Windows runner 曾有成功跡象。
- 曾建立 `pksh-windows-production.yml`，後因其他正式站修復而移除。
- 只允許 targeted restore；不得 revert 整個歷史 commit。
- 抓取必須友善限速，不得為完整性變成攻擊。

## 2026-09-07～09-10｜會員權限分層方向

- 既有角色：管理員、聯席管理員、僅課表服務。
- 新方向：逐項授權問校務、訂閱通知、課表、行事曆、會員摘要。
- 使用者希望課表每學期可由會員自行更新。
- 問校務 v2 延後，先完成資料 / 權限基礎。

## 2026-09-11｜UI 全面改版與公告生命週期

### UI

- 改成較清爽 UI。
- 中途曾發生管理員介面消失、不能回主畫面，後續修正。
- 修正後上 production 並 freeze UI 基準。

### 公告生命週期

- 在問校務 v2 前先解決「公告只增加、不淘汰」。
- 建立公告失效檢查 / 清理系統。
- 核心：`expired != invalid`。
- 先 admin candidate review，不直接大量自動刪除。
- 明確期限、活動結束、學期 / 學年度結束可作失效依據；疑似新版取代需低信心人工處理。
- 長期法規 / 辦法 / 程序不能只因舊就失效。

## 2026-09-11～09-12｜Archive / Reference 基礎完成並上 Production

### 三層架構

```text
ACTIVE
  ↓
REFERENCE
  ↓
RAW ARCHIVE
```

### 核心規則

- archive 成功後才能從 ACTIVE 移除。
- tombstone 防 scraper 復活。
- 支援 Archive → ACTIVE restore。
- 歷史資訊必須標示歷史，不得冒充現況。

### 已完成 checkpoint

- PR #20：`Archive expired announcements safely`
- merge commit：`4a0e903e5303eaca4960fbbf06e089ba91aa1ccb`
- Production migrations：`announcement_archive_reference`、`archive_publish_date_guard`
- Production ACTIVE：4,887
- effective ARCHIVE：0（另有 1 RESTORED audit row）
- TOMBSTONE：0
- 真實 roundtrip：`fjsh-2393`
  - ACTIVE 4887 → 4886
  - Archive 0 → 1
  - tombstone 0 → 1
  - scraper resurrection prevention 已確認
  - restore 後 ACTIVE 4887、Archive 0、tombstone 0
- GitHub Pages production deployment 成功。
- Archive 基礎架構 Freeze。

### 既有 baseline failure

- `user_tasks` CI：6 / 25 failures。
- baseline commit 有相同 failures。
- 不屬 Archive regression，不得順手修。

## 2026-09-12｜公告分類系統 v1

### 目的

為附件解析、Reference Knowledge、問校務 v2 建立可搜尋的結構化資料，不只是新增 `category`。

### Schema / semantic direction

- school
- main_category / sub_category
- event_types
- audience
- topics
- actions
- requested_fields / available_fields
- academic_year / semester
- dates
- department / location
- reference_value
- classification_confidence
- classification_sources
- classification_version
- classification_source_hash
- matched_aliases / unresolved_terms
- manual override

### deterministic v1

```text
existing category
→ title
→ department
→ body
→ aliases
→ deterministic rules
```

不對 4,000+ 公告逐篇使用大型模型。

### Preview 資料 checkpoint

- classification rows：4,887 / 4,887
- `classification_version = 1`：4,887
- indexed announcements：4,887 / 4,887
- index rows：35,809

## 2026-09-12｜分類 Work context failure

第一次 Work 在程式碼尚未 commit / push 前中斷。

精確訊息：

```text
推理失敗
此對話太長，無法繼續。請開始新對話並再試一次。
```

### 已排除

- 不是 Preview classification 只完成一半。
- 不是 4,887 backfill 未完成。
- 不是已證明的 Supabase failure。

### 實際資料狀態

- full backfill 至少完成兩次。
- Retry 又啟動冗餘 idempotent upsert，至約 2,640 筆時 context 結束。
- 但 Preview 最終仍完整保存 4,887 classification + 35,809 index rows。

### 實際損失

- 舊 Work 未提交 working tree 無法在新環境找到。
- classifier / taxonomy / migration / admin UI 等未提交程式碼必須重建。

### 永久禁止重做

- 禁止重新 backfill 4,887 筆。
- 禁止重新分類既有 4,887 筆。
- 禁止清空 classification tables。
- 禁止重跑 Preview migration。
- 禁止改 classification / index rows 只為「驗證」。

## 2026-09-12｜公告分類程式碼 Recovery 完成

### Recovery identity

- branch：`codex/announcement-classification-recovery`
- HEAD：`a8afea975be4daaeb4957a0e4b839f088df2efb5`
- tree：`6128f4c390fbcdc93ace74749d9a4a9bb6743c19`
- working tree：clean
- 本地與遠端 HEAD / tree 一致
- Draft PR：#23 `Recover announcement classification v1`
- 已知檔案遺失：NO

### 已重建

- taxonomy v1
- 保留 Preview wire values：`event_learning`、`honor_roll`
- 提供 `activity` / `honor` 相容映射
- 15 個核准 aliases；未知詞不自動加入
- migration：依 Preview metadata 重建，未套用 Preview
- deterministic classifier
- source hash
- existing classification priority
- manual override preservation
- index builder：只輸出 dimension、token、announcement_id、classification_version
- backfill tool：batch / checkpoint / resume / idempotent upsert / version / source hash；只做 fixture dry-run
- Admin Classification View：指定篩選 + read-only

### 本地驗證

- classification tests：9 / 9
- Admin contract：通過
- parser suites：通過
- staging build：通過
- search / QA gates：通過

### Preview read-only 驗證

- classification rows：4,887
- classification v1：4,887
- indexed announcements：4,887
- index rows：35,809
- re-backfill：NO
- Preview Supabase write：NO

### CI baseline 歸因 — 已完成

Recovery 最終回報：GitHub CI 雖為 failure，但現有 failure 都屬 main baseline 既有問題：

1. Staging validation
   - account capability 文案 assertion
   - PKSH registry assertion
   - 結論：main baseline 既有問題，不是 PR #23 新增 regression

2. Local RLS
   - `user_tasks` RLS matrix 6 / 25 failures
   - 已知 main baseline 既有問題

3. migration reset
   - 成功

4. Vercel Preview
   - Ready

### PR #23 regression 結論

```text
【PR #23 無新增 regression】
```

分類 Recovery 本身視為完成。

### Safety

- Production modified：NO
- Archive modified：NO
- tombstone modified：NO
- Migration applied：NO
- Preview classification rows modified：NO
- Merged：NO
- Production deployment：NO

### 現在禁止

- 重新做 classification recovery
- 重新 backfill 4,887
- 重跑 Preview classification migration
- 為了 baseline failure 修改 `user_tasks`
- 為了 baseline failure 修改 PKSH
- 為了 baseline failure修改 account capability
- 在 PR #23 內混入無關修復
- 未經使用者決定直接 merge PR #23
- Production migration / backfill / deploy
- 提前開始附件解析 / Reference Knowledge / 問校務 v2

---

# 3. 當前系統 checkpoint（2026-09-12 16:54 +08:00）

## Production

### Archive / lifecycle

- ACTIVE：4,887
- Archive 核心：已上 Production，Freeze
- tombstone 防復活：已驗證
- restore：已驗證

### Production Supabase

- classification recovery 未修改 Production。
- Production migration / backfill / deploy：NO。

## Preview

### Classification

- classification v1：4,887 / 4,887
- indexed announcements：4,887 / 4,887
- index rows：35,809
- 資料 checkpoint：完成，禁止重跑

## Git

### Archive

- PR #20 已 merged。

### Classification

- PR #23：Ready for review
- branch：`codex/announcement-classification-recovery`
- HEAD：`a8afea975be4daaeb4957a0e4b839f088df2efb5`
- Vercel Preview：Ready
- CI：failure，但 baseline attribution 已完成
- 新增 regression：NO
- classification recovery：完成
- merge：尚未

### Ledger / recovery workflow

- branch：`codex/project-ledger-history`
- PR #24：Draft `Add durable project ledger and recovery workflow`
- 目的：讓後續 Work 從 checkpoint / failure point 續接，不再重新考古。

---

# 4. 現在的優先順序

1. 保住 Archive / lifecycle Freeze，不重做。
2. PR #23 classification recovery 已完成，不再調查 baseline CI。
3. PR #23 收尾已完成並標記 Ready for review；不得 merge，等待使用者決定。
4. PR #24 持續承載 ledger / recovery workflow，不混入產品功能。
5. 會員權限分層仍是後續重要方向。
6. 附件解析 → Reference Knowledge → 問校務 v2 為後續資料能力主線，但尚未開工。

---

# 5. 問校務 v2 已確認設計方向（尚未開工）

## Semantic roles

- 主題：段考、社團、獎學金、補考、選課
- 對象：高一、高二、高三、老師、全校
- 行為：報名、申請、繳交、轉社、請假
- 時間：今天、明天、截止、什麼時候
- 地點：哪裡、教室、辦公室
- 人物 / 單位：教務處、學務處、老師
- 問題目的：何時 / 哪裡 / 如何 / 是否 / 誰 / 多少

## Unknown terms

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
- REFERENCE：整理後的歷史知識，第二層。
- RAW ARCHIVE：原始歷史證據，不預設進主搜尋。
- 歷史資料不得冒充現況。
- 可能被新版取代的公告必須建立文件關係，不能只靠日期新舊。

---

# 7. PKSH 固定風險與規則

- 不得關閉 TLS 驗證。
- Windows / Linux 差異必須保存實際錯誤證據。
- 單校故障不得清空其他學校資料。
- 完整抓取也必須限速。
- 舊 workflow 恢復只做 targeted restore，不 revert 整個歷史 commit。

---

# 8. 版本混亂事件的永久教訓

曾出現：

- 同名本機 main 實際停在舊 commit。
- 多個 worktree 留有未提交修改。
- staging 功能較新，但 production 資料較新。
- Vercel deployment 很多，但不是每個都是可直接使用的「版本」。
- Work context 過長導致未提交 working tree 留死在舊環境。

因此：

1. remote refs > 本機資料夾名稱。
2. branch / HEAD / tree / working tree 一起記。
3. durable feature work 儘快 commit + push。
4. 資料工作完成先記 checkpoint，再繼續程式工作。
5. 重試前先確認失敗層：執行環境 / 資料 / 程式 / CI / deployment。

---

# 9. 每次工作結束必須追加的格式

```markdown
## YYYY-MM-DD HH:mm｜工作名稱

### 目標

### 開始前 checkpoint
- branch:
- HEAD:
- tree:
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

**等待使用者決定是否 merge PR #23。**

- PR #23 已完成收尾並為 Ready for review。
- 未經使用者明確指示不得 merge。
- 不得藉此處理 baseline failure、Supabase、Production、PKSH、user_tasks 或 account capability。
- 下一個產品動作由使用者另行指定。

---

## 2026-09-12 17:08｜PR #23 收尾

### 目標

只確認 PR #23 checkpoint 與說明，若仍為 Draft 則標記 Ready for review；不 merge、不修改產品與資料庫。

### 開始前 checkpoint
- branch: `codex/announcement-classification-recovery`
- HEAD: `a8afea975be4daaeb4957a0e4b839f088df2efb5`
- tree: `6128f4c390fbcdc93ace74749d9a4a9bb6743c19`（沿用已確認 checkpoint；本輪未重建 working tree）
- working tree: cloud-first read-only inspection；未建立產品修改
- DB / deployment checkpoint: Preview classification 4,887 / 4,887；indexed announcements 4,887；index 35,809；Vercel Preview Ready

### 已完成

- 確認 PR #23 branch / HEAD 未變。
- 確認 PR 說明已正確反映：
  - Preview classification 4,887 / 4,887
  - index 35,809 rows
  - no re-backfill
  - no Preview Supabase write
  - Vercel Preview Ready
  - CI failures 屬 main baseline
  - PR #23 無新增 regression
- PR #23 已由 Draft 標記為 Ready for review。
- PR #23 保持 open、mergeable，未 merge。

### 驗證
- local tests: 本輪未重跑；沿用 Recovery 已確認測試 checkpoint
- CI: failure 歸因沿用已完成 checkpoint；本輪未處理 baseline failure
- Preview: GitHub commit status `Vercel = success`，PR bot 留言顯示 Ready
- Production: 未修改、未部署

### 精確失敗點（若有）

無。

### 已排除原因

- PR 說明沒有缺漏指定 checkpoint。
- PR branch / HEAD 沒有漂移。
- Vercel Preview 並非等待中或失敗。
- PR 仍未 merge。

### 尚待驗證

無；是否 merge 由使用者決定。

### 禁止重做

- 不重新 backfill 4,887 筆。
- 不修改 Preview Supabase / classification / index rows。
- 不處理 main baseline 的 PKSH、user_tasks、account capability failure。
- 不做 Production migration / deployment。
- 不在未獲明確指示時 merge PR #23。

### 下一個唯一允許動作

等待使用者決定是否 merge PR #23。

### 最終狀態
【已完成】
