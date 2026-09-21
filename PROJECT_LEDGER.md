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

# 3. 當前系統 checkpoint（2026-09-12 19:51 +08:00）

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

- PR #23：已 merged
- source branch：`codex/announcement-classification-recovery`
- source HEAD：`a8afea975be4daaeb4957a0e4b839f088df2efb5`
- merge commit / main HEAD：`d074e9498af18c3c25f95c99c0b50a6495dc0b10`
- Vercel Preview：Ready（合併前 checkpoint）
- CI：failure，但 baseline attribution 已完成
- 新增 regression：NO
- classification recovery：已進入 main
- Production Supabase migration / backfill / deployment：本輪未執行

### Ledger / recovery workflow

- branch：`codex/project-ledger-history`
- PR #24：已 merged `Add durable project ledger and recovery workflow`
- source HEAD：`ff767b4926b245ec91c24d4e6f894df8be9fc218`
- merge commit / 合併當下 main HEAD：`8ae8a415570f6884b28987b7c588e9314b1b56e9`
- changed files：`AGENTS.md`、`PROJECT_LEDGER.md`
- product / database changes：NO
- 目的：讓後續 Work 從 checkpoint / failure point 續接，不再重新考古。

---

# 4. 現在的優先順序

1. 最高優先：修復「使用者自行建立的行事曆事件沒有 durable persistence」所造成的資料遺失風險。
2. 在任何 migration 或實作前，先盤點現有 `user_tasks`、calendar event model 與 account sync，避免建立重複資料模型。
3. 完成行事曆事件 durable persistence 後，回到使用者原始主線「改善問校務」，從已完成的 Archive + announcement classification checkpoint 繼續問校務 v2。
4. Archive / lifecycle 維持 Freeze；PR #23 classification recovery 已完成，不重做 recovery、migration 或 backfill。
5. PR #25 已被使用者明確拒絕並關閉，`merged = false`；不得重新開啟、merge、繼續 member-capability-cutover，或套用該 PR 的 Preview / Production migration。
6. 不得自行插入其他產品重構。

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

**下一輪先以 read-only 方式盤點現有 `user_tasks`、calendar event model 與 account sync，提出不重複資料模型的帳號級 durable calendar persistence 方案；未經明確授權不得執行 migration 或產品實作。**

- Supabase 應作使用者行事曆事件的 canonical storage。
- localStorage 只能作 cache / offline queue，不得再作唯一 source of truth。
- PR #25 CLOSED、`merged = false`；禁止重新開啟、merge、繼續開發或套用其 Preview / Production migration。
- 行事曆資料遺失風險修復完成後，下一條產品主線才是從 Archive + classification checkpoint 繼續問校務 v2。
- 不得自行插入其他產品重構。

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

---

## 2026-09-20｜官方行事曆 parser repo-only 實作中斷 checkpoint

### 目標與起點

- 使用者授權從最新 `main` 開獨立 calendar-parser feature branch，只做真實 115-1 layout fixture、兩校 row reconstruction、第一學期跨年、quality gate、last-known-good 保護與 regression tests。
- 已先讀取最新 `AGENTS.md`、`PROJECT_LEDGER.md`，並追查上一個 read-only parser audit commit `24b12724367f70003d6f62a8f8d28eae760e9388`。
- remote canonical `origin/main` 起點：`15ff4e7594ca0bb50e3eea5bce73af97cba379b6`。
- 新分支：`codex/calendar-parser-1151`；獨立 worktree；未使用、未修改 PR #28 branch。

### 已確認狀態

- repo 的 `docs/data/calendar-source-status.json` 已保存 CYSH／CYGSH 115-1 官方 PDF URL、document label 與 SHA-256 revision：
  - CYSH：`981254e3c7e013c8cf532560b56fb00ea6e77606c2d23a8e14046203b39b18de`
  - CYGSH：`b678dc6c5b93e3136d9b4c316a8096ba5733c1231640b993c35f01fa6b5db8ef`
- repo、Git 歷史與目前可用工作樹均沒有這兩份 PDF、raw layout extraction 或可以重建真實表格位置的 fixture；只有舊的人工簡化「一行一事件」fixture。
- 為避免人工造假，未用既有錯誤 `official-calendar-events.json` 反推 layout fixture。

### 精確失敗／中斷點

- 第 1 步「先保存 CYSH／CYGSH 115-1 真實 PDF layout extraction regression fixture」無法完成。
- 第一次嘗試使用本機 Python `requests` 只讀下載到暫存區，在發出網路請求前即因環境沒有 `requests` 而失敗；未下載、未寫入 fixture。
- 第二次改用 Python standard library 的有界公開 PDF 讀取，執行安全層明確判定這會違反本輪「不得重新抓取正式資料」並拒絕；未發出下載、未繞過禁令。
- 同一方法已失敗兩次（依賴缺失／安全層拒絕），依 `AGENTS.md` 不再重試或改道繞過。

### 本輪未改動項目

- parser / quality gate / tests：未修改。
- `calendar-events.json`、`official-calendar-events.json`、`calendar-source-status.json`、ICS：未修改。
- `discover` / `build` / backfill：未執行。
- Preview / Production / Supabase / deployment：未操作。
- PR #28：未修改。

### 已排除原因

- 不是 parser 實作或 test failure；尚未進入第 2 步。
- 不能把人工整理的文字冒充「真實 PDF layout extraction」；這會讓 regression test 無法證明修復真實版面。
- 既有公開 JSON 只保留錯誤 parser 產物，並未保留 PDF 表格的列、欄與座標，無法完整反推。

### 下一個唯一允許動作

等待使用者提供兩份 115-1 PDF／既有 raw layout extraction 作為離線輸入，或明確追加授權「可只讀下載狀態檔所指的兩個固定 revision PDF 到暫存區，僅產生 fixture，不執行 discover/build，不改任何公開 JSON」。取得真實離線輸入後，從本分支第 1 步繼續；在此之前不得撰寫或提交仿真 fixture、parser 或假 regression 結論。

### 最終狀態

【中斷：缺少允許使用的真實 115-1 離線 PDF/layout fixture 輸入；只更新 ledger】

---

## 2026-09-21｜官方行事曆 parser repo-only 修復完成 checkpoint

### Branch / commits / safety

- branch：`codex/calendar-parser-1151`，從 `origin/main@15ff4e7594ca0bb50e3eea5bce73af97cba379b6` 建立的獨立 worktree；未使用或修改 PR #28 branch。
- blocker ledger commit：`d2b6faae63d24f9bd59f2e84f522d3b29f9814c3`。
- parser implementation commit：`80a0b96ed2d64cefa0627bb9576e004386699c45`。
- 使用者後續明確授權：可只讀下載狀態檔指定的兩個固定 revision PDF，僅製作離線 fixture，不執行 `discover/build`、不修改公開資料。
- 已下載到暫存目錄並核對 SHA-256：CYSH `981254e3...b39b18de`；CYGSH `b678dc6c...6b5db8ef`，兩者均與 committed status 完全一致。PDF 本體未 commit。

### Fixtures / parser 結果

- 新增真實 native PDF extraction fixture，保留原始斷行、表格讀取順序與跨行，並非人工改寫的「一行一事件」：
  - `tests/fixtures/calendar_cysh_115_1_layout.txt`
  - `tests/fixtures/calendar_cygsh_115_1_layout.txt`
  - `tests/fixtures/calendar_115_1_layout_sources.json` 記錄來源 document、PDF revision、extractor 與 fixture mapping。
- CYSH v2 reconstructor：先從週曆正式日期列建立 week anchors，再將各處室欄位的日期開頭項目綁定到該週；不再依賴「日期與完整標題必須剛好在同一 extraction line」。
- CYGSH v2 reconstructor：依處室欄內的編號項目重建 row；每個 row 最多建立一個事件，只用該 row 第一個日期定位，其後日期、時段與節次保留為說明，不另拆事件。
- fixture regression 產出：CYSH 100 筆（不再是 2）；CYGSH 172 筆編號 row，「`)`、`)`、單獨時刻／節次」都不會成為獨立事件標題。
- 第一學期跨年已修正：8–12 月用學年起始西元年；1–2 月用下一西元年。兩校 115-1 fixture 皆已證明 1 月事件落在 2027 年。

### Quality gate / last-known-good protection

- gate 已檢查：最低事件數、月份覆蓋、短標題／純標點碎片比例、重複比例、學期日期範圍、超過 31 日異常跨度，以及相對上一個真正通過 gate 的 last-known-good 縮水超過 40%。
- 只有 gate PASS 才會標記 `official_complete` 並替換該校／學期 official rows。
- gate FAIL 時不改寫 `official-calendar-events.json`；若已有通過 gate 的 last-known-good，`build` 繼續使用該版；若沒有可信 last-known-good，則保留 curated fallback，不會再因 official JSON 只有任一 row 就刪掉 fallback。
- 新 status `quality` 為 machine-readable，含 passed、metrics、reasons 與 last-known-good 使用狀態。

### Tests

- `python tests/test_calendar_adapter.py`：PASS（含兩校真實 fixture、CYSH 100、CYGSH 172、2027-01 rollover、fragment-heavy reject、2-row collapse reject、accepted/rejected term fallback protection）。
- `python tests/test_parser.py`：PASS（首次因執行環境缺 `requests` 而未啟動；後來只在 `/tmp` 安裝 repo 已宣告的 `scraper/requirements.txt` 後重跑，全數通過）。
- `node tests/test_calendar_workflow.js`：PASS。
- `node tests/test_calendar_state.js`：PASS。
- `node tests/test_calendar_persistence.js`：PASS。
- `python -m py_compile scraper/calendar_adapter.py scraper/calendar_schema.py scraper/schoolcal.py`：PASS。
- `git diff --check`：PASS。

### 未修改／未執行

- 未執行 `schoolcal.py discover`、`schoolcal.py build`、backfill 或任何排程 workflow。
- 未修改 `docs/data/calendar-events.json`、`docs/data/official-calendar-events.json`、`docs/data/calendar-source-status.json`、`docs/calendar.ics` 或 curated `scraper/events.json`。
- 未修改 Preview / Production / Supabase / Auth；未部署；未 merge；未修改 PR #28。

### 下一個唯一允許動作

只能對 `codex/calendar-parser-1151` 做 repo/PR review，核對真實 fixture、parser 邊界與 fail-closed protection。未經使用者另行明確授權，不得執行 discover/build、不得重新抓取或 backfill、不得修改現有公開行事曆資料、不得部署或 merge。

### 最終狀態

【已完成：repo-only parser 修復與真實 fixture regression PASS；公開資料／環境／部署均未修改】

---

## 2026-09-21｜calendar-parser remote publish blocker

### 本輪授權與起點

- 使用者明確授權只將 `codex/calendar-parser-1151` 現有三個 commit push 到 remote，驗證 remote HEAD / tree 與本地完全一致，再建立 Draft PR 與 read-only repo/PR review。
- 本地起點為 clean working tree；branch `codex/calendar-parser-1151`；HEAD `d52a3549ab029071dc5980f070564cd0a32053c7`；tree `a77b090653b6a4ce20539bd401d169d4e1051aa4`。
- 待 push 的三個 commit：`d2b6faae63d24f9bd59f2e84f522d3b29f9814c3`、`80a0b96ed2d64cefa0627bb9576e004386699c45`、`d52a3549ab029071dc5980f070564cd0a32053c7`。

### 精確 blocker

- `git push -u origin codex/calendar-parser-1151` 在建立任何 remote ref 前失敗：`fatal: could not read Username for 'https://github.com': No such device or address`。
- 目前 worktree 與 Git 設定沒有可用的 HTTPS credential helper / extra header；`gh` CLI 也不存在。
- 已確認有 GitHub connector 可建立 blob/tree/commit/ref/PR，但它只能重新建立 commit，無法上傳現有本地 commit object 或保留原 commit author/committer metadata；因此會產生不同 commit SHA，不符合「remote branch HEAD / tree 與本地完全一致」的明確要求。未使用此方式繞過。

### 實際狀態

- remote branch：未建立／未更新。
- Draft PR：未建立，因為必要的 remote head branch 不存在。
- remote HEAD / tree parity：無法驗證。
- repo/PR review：未開始；使用者要求的順序是 push、parity、Draft PR 後才 review，不跳過前置條件。
- 程式、fixtures、tests：未修改。
- parser / discover / build / backfill / 公開 JSON / Preview / Production / deployment：全部未執行、未修改。

### 下一個唯一允許動作

先提供能夠對 `https://github.com/tsaibohau/cy-school-news.git` 執行原生 Git push 的已授權通道（例如在 Work 環境完成 GitHub Git credential 連線）。從本 checkpoint 繼續時，只重試原本的三個 commit push，驗證 remote HEAD/tree 完全一致，建立 Draft PR，然後依使用者列出的五項進行 read-only review。未取得認證前不得改造 commits、不得以 connector 重建不同 SHA 的分支、不得建立無正確 head 的 PR。

### 最終狀態

【CLOUD_WRITE_BLOCKED：本地三個既有 commit 完整保留；remote 與 PR 未變更】

---

## 2026-09-21｜GitHub CLI authentication unavailable

### 本輪授權

- 只允許確認 Work 環境是否有 GitHub CLI；若有，使用 CLI 完成 github.com HTTPS authentication 與 `gh auth setup-git`，再只 push `codex/calendar-parser-1151`。
- 禁止重建 commit、禁止用 GitHub connector 模擬 push，且不得要求、輸出或保存 token 到 repo / ledger。

### 確認結果

- `command -v gh`：無輸出。
- Work 環境未安裝 GitHub CLI，因此無法執行 `gh auth status`、GitHub CLI HTTPS authentication 或 `gh auth setup-git`。
- 依使用者明確指令，未安裝 CLI、未要求或讀取 token、未再次執行 `git push`、未使用 GitHub connector。
- remote branch / Draft PR：未建立、未修改。
- 程式、fixtures、tests、parser、公開資料、Preview / Production / deployment：全部未修改、未執行。

### 下一個唯一允許動作

在已安裝 GitHub CLI 且可完成 github.com HTTPS authentication 的 Work 環境繼續；先執行 `gh auth setup-git`，再原樣 push branch，並核對 remote HEAD 與目標 commit `fd0514e2dd69bf1fbb36dadf7f2d9f548ac4b53d` 完全一致。不得以重建 commit 或 connector 替代。

### 最終狀態

【CLOUD_WRITE_BLOCKED：Work 環境無 GitHub CLI；已停止】

---

## 2026-09-12 17:18｜合併 PR #23

### 目標

只將 PR #23 `Recover announcement classification v1` 合併到 main，確認 main 已包含 recovery，並記錄 merge identity；不新增修正、不碰 Supabase 或 Production deployment。

### 開始前 checkpoint
- PR: #23 open、Ready for review、mergeable
- source branch: `codex/announcement-classification-recovery`
- source HEAD: `a8afea975be4daaeb4957a0e4b839f088df2efb5`
- DB / deployment checkpoint: Preview classification 4,887 / 4,887；indexed announcements 4,887；index rows 35,809；Vercel Preview Ready

### 已完成

- 以 expected source HEAD 鎖定後，使用 merge commit 方式合併 PR #23。
- GitHub 回報 `merged=true`。
- merge commit / 合併當下 main HEAD：`d074e9498af18c3c25f95c99c0b50a6495dc0b10`
- PR #23 狀態：closed、merged。
- main 已可直接讀取：
  - `scraper/classification_taxonomy.py`
  - `scraper/announcement_classifier.py`
  - `supabase/migrations/20260912061752_announcement_classification_v1_recovery.sql`
- 未修改 PR #23 內容，未新增任何產品修正。

### 驗證
- Git / main: merge commit 可讀，標題為 `Merge pull request #23 ... Recover announcement classification v1`
- classification recovery: taxonomy、classifier、recovery migration 已存在 main
- Preview Supabase: 本輪未呼叫、未寫入、未 backfill
- Production Supabase: 本輪未呼叫、未 migration、未 backfill
- Production deployment: 本輪未手動執行或呼叫部署
- baseline failures: 未調查、未處理

### 精確失敗點（若有）

- 合併本身無失敗。
- 第一次讀取 merge commit metadata 時誤用參數名 `repository_full_name`，唯讀呼叫被拒；改用正確參數 `repo_full_name` 後成功。此錯誤未改變 repo、PR、資料庫或部署狀態。

### 已排除原因

- source HEAD 未漂移。
- PR 確實已 merged，不只是 closed。
- main 確實包含 recovery 核心檔案。
- 本輪沒有任何 Supabase 或 deployment 寫入工具呼叫。

### 尚待驗證

無屬於本輪授權範圍的待驗證項目。

### 禁止重做

- 不重複 merge PR #23。
- 不重新 classification recovery。
- 不重新 backfill 4,887 筆。
- 不重跑 Preview / Production classification migration。
- 不修改 Preview / Production classification 或 index rows。
- 不處理 PKSH、user_tasks、account capability 或其他 baseline failure。
- 不執行 Production deployment。
- 不開始附件解析、Reference Knowledge 或問校務 v2。

### 下一個唯一允許動作

等待使用者指定下一項工作。

### 最終狀態
【已完成】


---

## 2026-09-12 17:31｜PR #24 收尾

### 目標

只確認 PR #24 變更範圍、同步最新 main、排除 merge conflict 並標記 Ready for review；不 merge、不修改產品或資料庫。

### 開始前 checkpoint
- PR: #24 open、Draft、mergeable
- branch: `codex/project-ledger-history`
- HEAD: `0960ed6738bd57976b47a7cac9c68b4d51067084`
- PR base SHA: `a32f769ad0ee8d3a1d3ae154ad2ee33126b0ca01`
- 最新 main（同步時）: `399f072e081c3e1e52f4be425098fbd868d9222c`
- PR #23 merge commit: `d074e9498af18c3c25f95c99c0b50a6495dc0b10`

### 已完成

- 確認 PR #24 只有 `AGENTS.md` 與 `PROJECT_LEDGER.md`。
- 確認內容只屬續接規則、失敗紀錄規則與專案總帳，沒有產品功能修改。
- 確認總帳包含：
  - PR #23 已 merged
  - merge commit / main HEAD checkpoint `d074e9498af18c3c25f95c99c0b50a6495dc0b10`
  - classification 4,887 / 4,887
  - index rows 35,809
  - 禁止重新 backfill
  - 禁止重新 classification recovery
- 以非破壞性 merge commit 將最新 main 同步到 PR 分支：
  - synced main: `399f072e081c3e1e52f4be425098fbd868d9222c`
  - sync commit: `fe59b6dbc8f4d571fc484d2a84a3a0c940f639ce`
- 同步後 PR base SHA 與最新 main 一致。
- 同步後 changed files 仍只有兩份規則文件。
- GitHub 回報 `mergeable=true`，無 merge conflict。
- PR #24 已由 Draft 標記為 Ready for review。
- PR #24 未 merge。

### 驗證
- PR #24 HEAD（寫入本次總帳紀錄前）: `fe59b6dbc8f4d571fc484d2a84a3a0c940f639ce`
- aligned main: YES，base SHA `399f072e081c3e1e52f4be425098fbd868d9222c`
- changed files: `AGENTS.md`、`PROJECT_LEDGER.md`
- merge conflict: NO
- Ready for review: YES
- 產品修改: NO
- Supabase / DB 修改: NO
- backfill / migration / deployment: NO

### 精確失敗點（若有）

- 同步後第一次 compare API 唯讀檢查誤用參數名 `repository_full_name`，呼叫被拒；PR metadata 已直接確認 base SHA、head SHA、`mergeable=true` 與 changed files，因此未重試此非必要方法。
- 此錯誤沒有改變 branch、main、PR、產品、資料庫或部署。

### 已排除原因

- PR #24 未混入產品檔案。
- PR 分支已納入同步當下最新 main。
- PR 無 merge conflict。
- PR 尚未 merged。

### 尚待驗證

無屬於本輪授權範圍的待驗證項目。

### 禁止重做

- 不重複同步已納入的 main commit `399f072e081c3e1e52f4be425098fbd868d9222c`。
- 不修改 PR #24 產品範圍。
- 不重新 backfill 或 classification recovery。
- 不修改 Supabase、classification、Archive、PKSH、user_tasks、account capability。
- 不做 migration 或 Production deployment。
- 不開始附件解析、Reference Knowledge 或問校務 v2。

### 下一個唯一允許動作

等待使用者決定是否 merge PR #24。

### 最終狀態
【已完成】


---

## 2026-09-12 19:51｜合併 PR #24

### 目標

只將 PR #24 `Add durable project ledger and recovery workflow` 合併到 main，確認續接制度正式存在於 main；不修改產品或資料庫。

### 開始前 checkpoint
- PR: #24 open、Ready for review、mergeable
- source branch: `codex/project-ledger-history`
- source HEAD: `ff767b4926b245ec91c24d4e6f894df8be9fc218`
- changed files: `AGENTS.md`、`PROJECT_LEDGER.md`

### 已完成

- 以 expected source HEAD 鎖定後，使用 merge commit 方式合併 PR #24。
- GitHub 回報 `merged=true`。
- PR #24 merge commit：`8ae8a415570f6884b28987b7c588e9314b1b56e9`
- 合併當下 main HEAD：`8ae8a415570f6884b28987b7c588e9314b1b56e9`
- PR #24 狀態：closed、merged。
- main 根目錄已正式包含 `AGENTS.md` 與 `PROJECT_LEDGER.md`。
- `AGENTS.md` 已確認包含：
  - 開工前讀 `PROJECT_LEDGER.md`
  - 從最後成功 checkpoint 與精確失敗點續接
  - 完成、失敗、中斷或等待後先更新 `PROJECT_LEDGER.md`
- PR #24 changed scope 仍只有兩份規則文件。

### 驗證
- merge result: SUCCESS
- PR changed files: `AGENTS.md`、`PROJECT_LEDGER.md`
- main files present: YES
- AGENTS continuation rules present: YES
- product changes: NO
- Supabase / database changes: NO
- backfill / migration / Production deployment: NO

### 精確失敗點（若有）

無。

### 已排除原因

- PR 不是只有 closed，而是 GitHub 明確回報 merged。
- main 可直接讀取兩份根目錄文件。
- 本輪沒有呼叫任何 Supabase、backfill、migration 或 deployment 工具。
- 未修改 classification、Archive、PKSH、user_tasks 或 account capability。

### 尚待驗證

無屬於本輪授權範圍的待驗證項目。

### 禁止重做

- 不重複 merge PR #24。
- 不重建 AGENTS / ledger 制度。
- 不因本輪合併重跑 classification recovery 或 backfill。
- 不修改 Supabase、classification、Archive、PKSH、user_tasks、account capability。
- 不做 migration 或 Production deployment。
- 不開始附件解析、Reference Knowledge 或問校務 v2。

### 下一個唯一允許動作

等待使用者指定下一項工作；後續必須從 main 的最新 ledger checkpoint 繼續。

### 最終狀態
【已完成】

---

## 2026-09-12 21:28｜會員功能權限分層：現況盤點與最小設計

### 目標

只盤點現有會員角色、功能權限、前端 gate、RPC 與 RLS，提出逐項授權的最小修改方案；不修改產品、不套用 migration、不修改任何 Supabase 資料。

### 開始前 checkpoint
- branch: main（cloud-first 唯讀盤點；沒有建立產品分支）
- HEAD: `79429a9ef07930035b2ef121609a1176ded7b7f3`
- tree / working tree: 未建立本機產品 working tree；GitHub main 逐檔唯讀檢查
- DB / deployment checkpoint:
  - Production auth users / account_access：4 / 4
  - Production access status：approved 4
  - Production service_level：full 4
  - Production active admin roles：owner 1、co_admin 1
  - Production capability rows：五項各 4 筆，missing rows 0
  - 本輪僅執行 schema / policy / function / aggregate count 的 SELECT；Preview 與 Production 都沒有寫入

### 已完成

#### 現有權限架構

- `public.account_access` 保管申請生命週期：`status`、`requested_at`、`reviewed_at`、`reviewed_by`，並保留舊 `service_level in ('full','timetable_only')`。
- `public.app_admins.admin_role` 保管管理權限：`owner` / `co_admin`；「僅課表」不是 admin role，而是舊 service level。
- main 已有 `public.account_capabilities`，主鍵為 `(user_id, capability)`，五個 key 已正好對應：
  - `member_content`＝會員摘要
  - `assistant`＝問校務
  - `timetable`＝課表
  - `calendar`＝行事曆
  - `notifications`＝訂閱通知
- 已有 `has_account_capability(text)`、`current_account_capabilities()`、`admin_account_capabilities(uuid[])`、`admin_set_account_capabilities(uuid,jsonb)`。
- `current_account_access()` 仍回傳 status / is_admin / admin_role / service_level / can_reapply。
- `admin_list_account_access(...)` 仍依 status / role / service_level 查詢；`admin_update_account(...)` 只更新 status / service_level；`owner_set_admin_role(...)` 管 owner / co_admin 並在升任時把 service_level 設為 full。
- Production 現況為五項 capability 每項都有 4 列；enabled aggregate：assistant 4，其餘 member_content / timetable / calendar / notifications 各 3。不得用 `service_level='full'` 重新展開並覆蓋這些既有逐項設定。
- Production capability RLS 已控制：
  - `user_reads` → member_content
  - `user_subscriptions` → notifications
  - `user_tasks` → calendar
  - `user_preferences` → assistant / timetable / calendar / notifications 任一
  - member announcement index/detail RPC → member_content
- Production 的 `user_reminder_rules`、`user_push_subscriptions` 仍使用舊 approved / full-service policy，尚未由 notifications capability 完整接管。
- Preview 已有 capability table / RPC，但沒有 applied `capability_policy_cutover_v1`；舊 approved policies 與 capability policies 同時存在。Postgres permissive policies 以 OR 合併，因此 Preview 的 fine-grained RLS 目前不是權威 gate。
- 前端 `docs/app.js` 仍以 `service_level` 的 `hasFullService()`、`applyServiceAccess()`、`isTimetableOnly()`、`switchTab()` 控制功能；管理介面仍顯示 full / timetable_only 下拉。
- `docs/capability-layer.js` 已有五項 checkbox、可見性 gate、`current_account_capabilities()` 與 admin capability RPC 串接，但 `docs/index.html` 沒有載入它，因此目前是 dead code。
- `docs/supabase-sync.js` 已能依 capability 控制 subscriptions / reads / tasks / preferences，但仍保留 serviceLevel fallback。
- 問校務 corpus 本身來自公開 current/archive JSON；受保護的會員 detail/summary 另由 member_content RPC 控制。因此 assistant 與 member_content 是兩項獨立權限；問校務可運作於公開資料，只有會員摘要補強需 member_content。

#### 建議的新權限資料模型

- 不新增第二張 feature-permission 表；沿用 `account_capabilities` 作唯一逐項功能權限來源。
- `account_access.status` 保留並作最外層核准 gate；非 approved 帳號所有 capability 的有效值皆為 false。
- `app_admins.admin_role` 保留，只代表管理介面與帳號管理 authority，不再代表會員功能集合。
- `service_level` 暫時保留一個相容期，只作舊 client / preset / 顯示用途，不再作前端或 RLS 的授權來源；後續另案移除。
- 第一版安全相容規則：
  - owner / co_admin：管理 authority 保持不變，會員功能有效值暫時視為全開，且維持不可由一般 capability editor 修改，避免兩個現有管理帳號因既有 disabled row 被鎖掉。
  - 舊 full：只在「缺列」時補成五項 true；已有列一律保留，不覆寫。
  - 舊 timetable_only：只在「缺列」時補 timetable=true、其餘 false；已有列一律保留。
  - pending / rejected：有效權限全 false，但保留 row 供重新核准時使用。
  - admin 升任期間可視為全開；移除 co_admin 後恢復該帳號原本保存的逐項 capability，不重算、不覆寫。
- 新帳號核准需在同一 transaction 寫 status 與完整五項 capability，避免 `admin_update_account` 成功但 capability 寫入失敗的半完成狀態。建議新增相容 RPC（例如 `admin_update_account_capabilities_v2(uuid,text,jsonb)`），保留舊 RPC 一個相容期。
- `current_account_access()`、`admin_list_account_access(...)` 可維持回傳 shape；前端另用既有 `current_account_capabilities()` 與 `admin_account_capabilities(uuid[])`，降低破壞舊 client 的風險。

#### 管理介面與前端最小修改

- 一般會員卡片顯示五個 checkbox；核准時以 atomic v2 RPC 一次提交 status + 五項權限，已核准會員後續可用既有 setter 更新。
- owner / co_admin 顯示角色與「管理員功能全開」唯讀摘要；co_admin 不得改 owner/co_admin，owner 的角色管理規則維持。
- 移除產品流程對 `service_level` 的硬 gate，統一以 capability map 控制 tab、home action、同步 adapter 與操作 guard。
- 不直接只把現有 compatibility layer 插入頁面後就算完成；需把 `app.js` 的舊 redirect/gate 改為 capability-aware，否則 timetable_only 與 capability 結果會互相覆蓋。
- 前端隱藏只作 UX；資料保護仍由 RLS / RPC 執行。

#### 需要修改的檔案 / migration

- `docs/index.html`：載入 capability client（順序在 `account-auth.js` 前）並更新 cache version。
- `docs/app.js`：改用 capability map、移除 service_level 功能 gate、改管理員五項 checkbox / atomic approval 流程。
- `docs/account-auth.js`：正式封裝 current/admin capability RPC 與 atomic v2 approval RPC。
- `docs/capability-layer.js`：由 monkey-patch / MutationObserver compatibility layer 收斂成正式模組，或將其邏輯整合進 app/auth；不可維持未載入 dead code。
- `docs/supabase-sync.js`：移除 serviceLevel 作授權依據，只保留 capability。
- 新增一個 forward-only migration（不得改寫已套用舊 migration）：
  - 補 atomic account approval + capability RPC
  - 補新帳號五項 row 的 idempotent 初始化
  - 讓 admin role 的有效功能相容規則明確
  - 將 reminder_rules / push_subscriptions 切到 notifications capability
  - 移除所有會與 capability policy OR 放行的舊 permissive policies
  - 明確 revoke PUBLIC / anon EXECUTE，僅 grant 必要角色
- 測試：新增 capability matrix / admin protection / atomic approval / missing-row / RLS policy coexistence contract；更新 `test_account_roles_contract.js`、`test_timetable_only_sync.js`，並補 reminder / push 的資料庫 RLS 測試。

### 驗證
- local tests: 本輪未修改程式，因此未跑產品測試；已盤點現有 contract tests，現況仍主要斷言舊 service_level。
- CI: 未觸發、未處理任何 baseline failure。
- Preview: 只做 metadata / aggregate SELECT；2 auth users、2 approved account_access、每項 capability 2 rows、missing 0；發現舊與新 permissive policies 並存。
- Production: 只做 metadata / aggregate SELECT；4 auth users、4 approved account_access、每項 capability 4 rows、missing 0；未修改 Auth / account_access / account_capabilities。
- migration / backfill / deployment: 全部 NO。

### 精確失敗點（若有）

無執行失敗。設計上的精確未完成點是：
1. capability 前端檔存在但未由 index 載入；
2. app.js 仍以 service_level 作硬 gate；
3. Preview 未套用 policy cutover，舊 policy 會 OR 放行；
4. Production reminder_rules / push_subscriptions 仍依賴舊 full-service gate；
5. 新帳號核准與 capability 設定尚非單一 transaction。

### 已排除原因

- 不需要再新增一張 feature permission 表；現有 `account_capabilities` 已涵蓋五項需求。
- 不可把 Production 4 個 full 帳號重新映射成全 true；現有 capability aggregate 已存在差異，重算會破壞既有設定。
- 不可只靠 UI 隱藏；必須完成 RLS / RPC enforcement。
- 不可把 admin role 與會員功能 permission 混成同一欄位。

### 尚待驗證

- 實作階段需以匿名化 per-user matrix 建立 before/after assertion，確認 4 個 Production 帳號的 status、admin role、既有 capability row 全部原樣保存。
- 需在隔離 Preview / local reset 驗證新 migration 的 policy matrix；本輪禁止套用，因此未做。
- 需確認 Security Definer function 的實際 EXECUTE grants 與固定 search_path 完整符合 hardening 要求。

### 禁止重做

- 不重算或覆蓋現有 4 個帳號的 capability。
- 不以 service_level 對既有帳號重新 backfill。
- 未獲下一輪明確授權前，不建立產品 branch、不修改前端、不新增 migration、不套用 Preview / Production。
- 不修改 Auth users、account_access 或 account_capabilities 現有資料。
- 不做 Production migration / backfill / deployment。
- 不處理 classification、Archive、PKSH、user_tasks baseline failure。
- 不開始附件解析、Reference Knowledge 或問校務 v2。

### 下一個唯一允許動作

等待使用者明確授權後，從最新 main 建立獨立功能分支，只做「repo-only 的 capability cutover 實作與測試」；可新增 forward-only migration 檔，但不得套用到 Preview 或 Production。

### 最終狀態
【已完成】

---

## 2026-09-15 20:15｜拒絕 PR #25、修正產品主線與行事曆 durable persistence checkpoint

### 目標

只更新 `PROJECT_LEDGER.md`，記錄使用者對 PR #25 的最終決策、更正產品主線、新增行事曆資料遺失風險與重排工作優先順序；不修改任何產品程式、migration、資料庫或部署。

### 開始前 checkpoint
- branch: `main`
- HEAD: `1c3bc1d8e15d590e9c497c91baeacfebc22e7062`
- tree: `20e4fffc6fad38ce4ff549b4669775e67c9469e0`
- working tree: clean；本地 `main` 已 fast-forward 至當時最新 `origin/main`
- DB / deployment checkpoint: 本輪未讀寫 Preview / Production Supabase，未執行 migration、backfill 或 deployment

### 已完成

#### PR #25 最終決策

- 使用者明確拒絕 PR #25。
- PR #25：CLOSED。
- `merged = false`。
- 禁止重新開啟。
- 禁止 merge。
- 禁止繼續 `member-capability-cutover`。
- 禁止套用該 PR 的 Preview / Production migration。
- 該 branch 僅保留歷史證據，不視為後續開發基礎。

#### 產品主線更正

- 使用者原始主要目標是「改善問校務」。
- Archive / 公告生命週期與 announcement classification 都是問校務 v2 的前置工程。
- Member capability cutover 是錯誤偏離主線，不得再自動選為下一項工作。

#### 高優先級已知缺陷

- 「使用者自行建立的行事曆事件沒有 durable persistence。」
- 已確認目前 main 的 calendar user events 使用 `localStorage`。
- key：`cyNews.calendarEvents.v1`。
- `loadUserEvents()` 從 `localStorage` 讀取。
- `saveUserEvents()` 只寫入 `localStorage`。
- 目前沒有帳號級 Supabase durable storage。
- 因此裝置或瀏覽器儲存遺失時，使用者建立的事件可能永久消失。

#### 正確技術方向

- `localStorage` 不得再作為行事曆事件唯一 source of truth。
- 未來需建立帳號級 durable calendar persistence。
- Supabase 作 canonical storage。
- 本機儲存只作 cache / offline queue。
- 在任何 migration 或實作前，先盤點現有 `user_tasks`、calendar event model 與 account sync，避免建立重複資料模型。

#### 鎖定工作優先順序

1. 修復「行事曆使用者事件無法長期保存」的資料遺失風險。
2. 回到問校務 v2 主線，從已完成的 Archive + classification checkpoint 繼續。
3. 不得自行插入其他產品重構。

### 驗證
- changed files: 僅 `PROJECT_LEDGER.md`
- product code: 未修改
- migration: 未新增、未修改、未套用
- local tests: 文件紀錄變更，不需執行產品測試
- CI: 本輪不以 CI 作完成條件
- Preview: 未修改、未部署
- Production: 未修改、未部署

### 精確失敗點（若有）

無。

### 已排除原因

- PR #25 不再是待審或後續開發候選，而是已被使用者最終拒絕的歷史分支。
- Member capability cutover 不屬問校務 v2 必要前置，不得再凌駕原始產品主線。
- `localStorage` 不能提供跨裝置、跨瀏覽器或瀏覽器資料清除後的 durable persistence。

### 尚待驗證

- 下一輪需 read-only 盤點 `user_tasks`、現有 calendar event model 與 account sync 的 schema、欄位、同步方向、衝突處理與離線行為。
- 尚未決定沿用 `user_tasks` 或建立其他模型；必須先以實際 schema 與程式資料流排除重複模型。

### 禁止重做

- 禁止重新開啟或 merge PR #25。
- 禁止繼續 `member-capability-cutover`。
- 禁止套用 PR #25 的 Preview / Production migration。
- 禁止把 PR #25 branch 當成後續開發基礎；只保留歷史證據。
- 禁止在盤點前直接建立新的 calendar persistence migration 或資料模型。
- 禁止重新執行 Archive / classification recovery、migration 或 4,887 筆 backfill。
- 禁止自行插入其他產品重構。

### 下一個唯一允許動作

以 read-only 方式盤點 main 現有 `user_tasks`、calendar event model 與 account sync，提出以 Supabase 為 canonical storage、localStorage 為 cache / offline queue，且不重複資料模型的最小修復方案；等待使用者明確授權後才可修改產品或新增／套用 migration。

### 最終狀態
【已完成】

---

## 2026-09-15 20:38｜隱藏管理員帳號卡片的舊服務 selector

### 目標

依使用者明確要求，只做極小 UI cleanup：所有帳號卡片不再顯示舊「服務／完整服務／僅課表」下拉選單；保留 legacy element 與 `data-admin-service` value 供既有 `app.js` 內部相容。不修改資料庫、capability 系統或其他產品流程。

### 開始前 checkpoint
- branch: `main`
- HEAD: `0bbfb97bfacebfe708ed0f2c5f7087e0ade61f72`
- tree: `7d5cd8a3dc522fbde68ff8a8bbc4b9215bf4ff02`
- working tree: clean；本地 `main` 與當時最新 `origin/main` 一致
- DB / deployment checkpoint: 本輪未呼叫或修改 Preview / Production Supabase；未執行 migration、backfill 或 Production deployment

### 已完成

- `docs/style.css` 將 `.admin-service-label` 設為全域 `display: none !important`。
- `docs/sw.js` 只將 shell cache `cy-news-v85` 提升為 `cy-news-v86`，確保已安裝 PWA 不會持續使用舊 CSS。
- 隱藏規則不位於 media query 內，因此桌面與手機版均套用。
- 保留 `app.js` 建立的 `.admin-service-label`、`select[data-admin-service]` 與既有 service value；舊核准／存取權流程仍可在背景讀取 selector value。
- 未刪除 `account_access.service_level`。
- 未修改 capability 系統、五項功能權限 UI 或儲存權限程式。
- 未重新開啟或套用 PR #25 的任何程式／migration。

### 驗證
- `node tests/test_admin_account_contract.js`: PASS
- `node tests/test_ui_visual_contract.js`: PASS
- `node tests/test_account_auth.js`: PASS（cache v86 更新後重跑）
- `node tests/test_pwa_notification.js`: PASS（cache v86）
- `node tests/test_account_sync.js`: PASS（V1.1 core、V1.2 durable lifecycle）
- `node tests/test_account_switch_v3.js`: PASS
- `node tests/test_announcement_classification_admin.js`: PASS
- UI cleanup 靜態 contract: PASS；確認全域桌面／手機 cascade 隱藏、legacy selector 保留、核准／移除存取權、設為／移除聯席管理員與五項 capability hook 均仍存在。
- `git diff --check`: PASS
- changed files: `docs/style.css`、`docs/sw.js`、`tests/test_account_auth.js`、`tests/test_pwa_notification.js`、`PROJECT_LEDGER.md`
- 真實瀏覽器視覺驗證: 【無法確認】；本機 server 正常啟動，但受控瀏覽器拒絕 localhost，回報 `ERR_BLOCKED_BY_CLIENT`。未部署 Production，因此沒有用 Production 網址取代本機驗證。
- CI: commit 前未觸發
- Preview: 未修改、未部署
- Production: 未修改、未部署

### 精確失敗點（若有）

- `node tests/test_account_roles_contract.js` FAIL：測試仍期待舊字串 `feature unavailable for timetable-only account`，但未被本輪修改的 `docs/supabase-sync.js` 現為 `feature unavailable for this account capability set`。
- 此 failure 位於未修改檔案的既有 contract 期待值，與本輪 `.admin-service-label` CSS 變更無關；本輪禁止順手修測試或 capability 系統。

### 已排除原因

- 不是 selector 被刪除：DOM、`data-admin-service` 與 value 仍保留。
- 不是只隱藏一般會員：CSS 規則不依 role，主要管理員、聯席管理員與一般會員卡片全部適用。
- 手機 media rule 沒有重新設定 `display`，且全域規則使用 `!important`，不會被手機寬度樣式覆蓋。
- 管理操作與 capability 程式均未修改；相關 contract 與靜態 hook 檢查通過。

### 尚待驗證

- 未在真實登入後的管理員頁面做桌面／手機視覺截圖；原因是本輪禁止 Production deployment，且受控瀏覽器無法開啟 localhost。
- remote CI 狀態須在 push 後另行觀察；不以 CI 修復為本輪擴張範圍。

### 禁止重做

- 不刪除 `account_access.service_level` 或 legacy selector/value。
- 不修改 schema、RPC、RLS、Supabase 或 capability 系統。
- 不重新開啟 PR #25，不套用 PR #25 的任何程式或 migration。
- 不部署 Production。
- 不順手修正既有 `test_account_roles_contract.js` baseline mismatch。
- 不自行開始其他產品重構。

### 下一個唯一允許動作

回到 ledger 已鎖定的最高優先事項：先以 read-only 方式盤點 `user_tasks`、calendar event model 與 account sync，規劃「行事曆使用者事件 durable persistence」；未經明確授權不得直接 migration 或實作。

### 最終狀態
【已完成】

---

## 2026-09-15 20:55｜行事曆使用者事件 durable persistence read-only 架構盤點

### 目標

只從最新 `main` 盤點行事曆使用者事件、`user_tasks`、account sync / Supabase sync 的實際資料模型與生命週期，回答是否可重用 `user_tasks`，並提出以 Supabase 為 canonical storage、localStorage 只作 cache / offline queue 的最小修復方案。本輪除本 ledger 外不修改任何產品程式、migration、Supabase、Preview 或 Production；不建立 PR、不開始實作、不碰 PR #25 或 capability cutover。

### 開始前 checkpoint

- branch: `main`
- HEAD: `797186a22d6e40e025efbbae1e3dcae3a1c01bda`
- tree: `37f6d4525237077813120b2727f780597d74f9d4`
- working tree: clean；本地 `main` 與當時最新 `origin/main` 一致
- DB / deployment checkpoint: 未連線、未讀寫 Preview / Production Supabase；未執行 migration、backfill 或 deployment

### 現況資料流

#### Calendar event model

- `docs/app.js` 的 `LS_EVENTS` 固定為全瀏覽器共用、未分帳號的 `cyNews.calendarEvents.v1`；頁面初始化時 `state.userEvents = loadUserEvents()`。
- `loadUserEvents()` 只從該 localStorage key 讀 JSON，再交給 `docs/calendar-state.js` normalize；解析失敗直接回空陣列。
- 現有事件只有 `id / title / date / notes`：
  - 新增：`user:` + `Date.now().toString(36)` 產生 id，`CalendarState.upsert()` 後 `saveUserEvents()`。
  - 編輯：保留原 id，覆寫 title/date/notes，再寫回同一 localStorage key。
  - 刪除：`CalendarState.remove()` / `filter()` 實體移除 row，再寫回 localStorage；沒有 tombstone。
- `docs/calendar-state.js` 只驗證非空 title 與 `YYYY-MM-DD` 字串；legacy 無 id row 以 index/date/title 合成 id。沒有 `user_id`、`created_at`、`updated_at`、revision、mutation id 或 `deleted_at`。
- `calendarEvents()` 將公告事件、官方校曆事件與 `state.userEvents` 合併顯示；使用者事件不進 account lifecycle、outbox 或 Supabase adapter。
- `clearAccountOwnedView()`、`publishState()`、`restoreAnonymous()`、logout、Google account switch 與 delete-cloud 流程都沒有重載、清空或重新分區 `state.userEvents`。因此同一瀏覽器的 A 帳號事件可在 B 帳號或匿名狀態繼續顯示，除了資料遺失風險，也有帳號隔離缺口。
- PWA shell 更新只處理 Cache Storage，正常情況不會主動刪 localStorage；但瀏覽器清站台資料、換瀏覽器、換裝置或 localStorage 損壞後，現況沒有任何雲端副本可恢復。

#### 現有 `user_tasks`

- 建表 migration：`supabase/migrations/0021_user_tasks.sql`。
- schema：`id uuid PK`、`user_id uuid FK auth.users ON DELETE CASCADE`、`title`、`status(open/completed)`、`due_date`、`priority(0..5)`、`notes`、`source_announcement_id`、`source_event_id`、`created_at`、`updated_at`、`completed_at`、`deleted_at`；另有 `(user_id, updated_at desc)` index。
- `20260902164000_session_owned_user_data.sql` 後 `user_id` default 為 `auth.uid()`；後續 migrations 曾依 approved account / service level / calendar capability 依序替換 RLS。repo 最新 migration 順序下，`user_tasks` 的目標 policy 是 authenticated owner 且具有既有 calendar access gate。這是現況盤點，不代表重啟或採用 PR #25。
- 初始 migration 已 `ENABLE RLS`、revoke anon、grant authenticated CRUD；ownership 條件使用 `(select auth.uid()) = user_id`。UPDATE 具 `USING` 與 `WITH CHECK`；現有 SQL / behavioral tests 覆蓋匿名拒絕、A/B owner isolation、own-row CRUD 與 upsert。
- `docs/task-state.js` 將 task normalize 為完整 task lifecycle；create/update/complete/reopen/delete 都走 `applyMutation()`。delete 寫 `deleted_at` tombstone，不立即移除；`visible()` 才隱藏 tombstone。
- task merge 以相同 id 合併：較新的 `updated_at` 勝；同 timestamp 時 tombstone 勝；再以 stable JSON 排序作 deterministic tie-break。這是 client timestamp LWW，能 deterministic，但仍有裝置時鐘偏差風險。
- `docs/app.js` 的 task CRUD 先透過 `queueAccountMutation()` 更新 account-scoped local state，再加入 `cyNews.accountSync.v1:<UID>` outbox；畫面只顯示未 tombstone row。
- `docs/supabase-sync.js` 對 `user_tasks` 以 `id` upsert，會傳完整 tombstone；登入同步為 remote fetch → local/remote merge → push merged state → 依序 drain outbox。
- 已具跨裝置「登入／重新觸發同步後」的 eventual sync，但不是即時同步：目前 account-ready 後的新 mutation 只 enqueue，沒有在同一次操作中立刻 drain；通常要後續重新登入／重載並重新跑 sync 才上雲。故 outbox 架構可重用，但不能原封不動宣稱已提供立即 durable write。
- `deleteOwnData()` 會依 table order hard-delete該 UID 的既有同步資料；若新增 calendar table，必須納入此帳號刪除流程與確認文字。

#### Account sync / isolation

- `docs/account-sync.js` 的 durable state key 為 `cyNews.accountState.v1:anonymous`、`cyNews.accountState.v1:<UID>` 與 meta；outbox 也以 `cyNews.accountSync.v1:<UID>` 分區。
- 初次登入先抓 verified session UID 的 remote namespace，才呼叫 `lifecycle.login(uid, remote)`；避免切換期間發布前一帳號資料。
- 該裝置 anonymous baseline 只自動 adopt 給第一個帳號一次，並以 `anonymous_adopted / adopted_account_id` 防止第二帳號重複採用。
- remote → local：subscriptions / reads / preferences / tasks 依各 domain merge；publish 前清除帳號畫面資料。
- local → remote：先 push merged state，再 drain 該 UID outbox；adapter 每一步重新核對 session UID、requested UID 與 sync generation。
- conflict：subscriptions/preferences/tasks 為 timestamp LWW 加 deterministic tie-break；reads 是 monotonic union。Supabase `upsert` 本身沒有 expected-version compare-and-set。
- offline queue：local mutation 會保存，但目前只在登入 sync path drain；成功項目 ack，第一個失敗後保留未完成項目；A outbox 無法由 B session drain。
- 以上隔離與 merge 邏輯目前不含 calendar user events。

### 核心設計結論

#### `user_tasks` 是否可直接重用：NO

- 欄位層面只能「勉強表示」：event title/date/notes 可塞入 task title/due_date/notes；但 task 強制帶 `open/completed`，且 priority、completed lifecycle、待辦清單、待辦計數、排序與 task reminder 都會把事件當成工作項目。
- `source_event_id` 是 task 對來源事件的引用欄位，不是 calendar event subtype，也不能承載事件本身。
- 若硬併，至少必須新增 `entity_type` / `task` vs `calendar_event`、將 status/due/completed constraints 改為 subtype-aware，並在所有 task query、today、reminder、UI 與統計處排除 event；修改面比新表更大，舊 task 也需 backfill。這會污染待辦語意並增加回歸風險。
- 正確重用邊界是：重用 account-scoped cache/outbox、verified UID guard、首次匿名資料單一歸屬與測試模式；不重用 `user_tasks` table 或 task domain model。

#### 推薦模型：新增 `public.user_calendar_events`

最小 canonical schema：

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`
- `title text not null`，check trim length `1..80`
- `event_date date not null`
- `notes text not null default ''`，check length `<= 240`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`（由 server mutation path 寫入）
- `deleted_at timestamptz null`（soft-delete tombstone）
- `version bigint not null default 1`，check `version > 0`
- `last_mutation_id uuid not null`，用來識別「server 已成功、client 未收到回覆」後的重試
- `legacy_import_key text null`；建立 `(user_id, legacy_import_key)` partial unique index，作同一帳號內的 v1 local event 匯入冪等鍵。此 constraint 不能阻止 A、B 兩個帳號先後匯入同一批 global legacy payload，跨帳號 ownership 必須由下述本機 durable claim 另外保護。
- active calendar query index：`(user_id, event_date) where deleted_at is null`；sync / recovery index：`(user_id, updated_at)`。這些 index 同時覆蓋 owner filter / FK cascade 的主要查詢路徑。

### RPC / RLS 最小方案

- 只新增 forward-only migration；不改寫既有 `user_tasks` migration，不從 PR #25 搬程式或 migration。
- table `ENABLE RLS`；revoke anon / PUBLIC；authenticated 只可 SELECT 自己資料。SELECT policy 至少包含 `(select auth.uid()) = user_id`，並沿用實作當下 `main` 已存在的 calendar access gate；只引用既有 gate，不修改 capability 系統。
- create/update/delete 不用無條件 client upsert。新增單一 atomic mutation RPC，例如 `apply_user_calendar_event_mutation(id, expected_version, mutation_id, operation, payload, legacy_import_key)`：
  - 從 `auth.uid()` 決定 owner，不接受 browser 指定他人 user_id。
  - create / update / delete 都鎖定同一 row；同 mutation id 重試回傳既有結果，不重做。
  - update/delete 只接受目前 `expected_version`；成功後 server 增加 version 並寫 server timestamp。
  - stale mutation 回傳明確 conflict 與 canonical row，不得以普通 upsert 靜默覆蓋。
  - tombstone row 的普通 update 不得清掉 `deleted_at`；未來若需要復原，必須另有明確 restore operation，不讓舊 cache 自動復活。
- 為阻止繞過 version protocol，authenticated 不直接取得 table INSERT/UPDATE/DELETE；mutation RPC 若採 `SECURITY DEFINER`，必須固定空 `search_path`、使用 fully-qualified object、在函式內明確驗證 `auth.uid()` 與既有 calendar access、revoke EXECUTE from PUBLIC/anon，只 grant authenticated。這是針對該新 table 的最小安全邊界，不是 capability cutover。
- 帳號「刪除已同步資料」另需 owner-only hard-delete RPC，或將 calendar hard-delete納入既有受保護的 account data deletion path；避免為了 bulk delete 開放一般 table DELETE。
- DB tests 必須證明 anon 無權、A 看不到/改不到 B、不能竄改 owner、stale version 被拒絕、mutation replay 冪等、tombstone 不復活、legacy import key 不重複。

### localStorage → cloud 安全遷移

1. 新版使用 account-scoped cache，例如 `cyNews.calendarEvents.v2:<UID>`；anonymous 另有獨立 namespace。登入／登出／切帳號先清空 in-memory events，再只讀目標 namespace，絕不共用 v1 全域陣列。
2. 登入帳號流程必須 remote-first：先取得 Supabase canonical rows與 tombstones，再套用本帳號待送 outbox；不得把任意 stale cache 直接 union 成 live row。
3. 舊 `cyNews.calendarEvents.v1` 視為「尚未確定 owner 的 import candidate」，不能自動送給每個登入帳號。第一次偵測到時，必須由使用者明確選擇是否把整批本機事件匯入目前帳號。
4. 使用獨立的本機 durable calendar import claim metadata（不能沿用可能早已完成的 account-sync `anonymous_adopted`）。使用者選定 A 後，先將整批 legacy payload 綁定到 A 的 UID，再開始任何 cloud import；不能只依賴 `(user_id, legacy_import_key)`，因為該 unique constraint 只保證同一帳號 idempotent，無法阻止 B 再匯入同一批資料。
5. claim 生效後，只有 claimed UID 可查看、續傳或重試這批 legacy events；logout、reload 或 account switch 都不得解除 claim，也不得讓其他 UID 顯示或匯入。若只成功匯入部分 events，claim 必須保留且狀態維持 claimed/pending，不能因部分失敗回復成 unclaimed。
6. 每筆以 claimed account UID + normalized legacy id/title/date/notes 產生穩定 `legacy_import_key`；DB unique constraint + mutation RPC 的 idempotent replay，使網路重試、重載與 lost response 都不重複建立同一帳號的 row。
7. 只有所有 legacy events 都取得 cloud confirmation 後，才把 canonical rows 寫入 claimed UID cache、寫 completed receipt，並清除 v1 payload 與 active claim metadata；在此之前兩者都必須保留。completed receipt 可繼續保留，避免完成後重跑 migration。
8. 未登入新增事件留在 anonymous v2 namespace / anonymous outbox。anonymous v2 data 也不得在登入時自動 merge 或 adopt；若未來支援匯入，仍必須由使用者明確確認目標 UID，並套用同一套 durable claim、idempotent retry 與全批 cloud confirmation 規則。
9. 網站/PWA 更新可替換程式 cache，但不能把 local event cache 當 canonical 或主動清除尚未 ack 的 outbox、v1 payload 或未完成 claim。

### 多裝置、刪除與 conflict 規則

- Supabase 是登入帳號 canonical source；新裝置登入 remote-first 後即可重建事件。
- localStorage 只保存該 UID 的最近 canonical snapshot、pending mutations、import receipt；離線可編輯，恢復 online 或下一次 account sync 時重送。
- 每次 local mutation 先以穩定 mutation UUID enqueue，再 optimistic 更新 UI；online 時要立即 best-effort drain，而不是沿用目前「只等下一次登入 sync」的限制。失敗仍留 queue，`online`、reload、re-login 再重送。
- 同一 version 的多裝置更新採 deterministic first-server-commit-wins；後到的 stale mutation不覆寫，client 收 canonical row並標示衝突。不能以裝置時鐘單獨決定勝負。
- delete 也是 versioned mutation，產生 tombstone；任何 base version 較舊的 edit/import 都不能清除它。tombstone 至少保留超過支援的最長離線窗口；首版不做自動 purge，避免離線舊 cache 復活。
- account switch 以現有 `syncGeneration / requestedUid / sessionUid` guard 擴充到 events；任何 A 的 late response 不得 publish 到 B。

### 最小修改檔案清單（未執行）

- 新增 `supabase/migrations/<timestamp>_user_calendar_events.sql`：table、constraints、indexes、RLS、mutation / account-delete RPC 與 grants。
- `docs/calendar-state.js`：擴充 timestamps/version/deleted/import normalization、deterministic cache projection與 tombstone-aware merge；不再實體刪除 canonical event。
- `docs/account-sync.js`：將 `calendar_events` 納入 account-scoped state、first-owner adoption、outbox mutation type 與 switch/logout isolation。
- `docs/supabase-sync.js`：fetch calendar rows、呼叫 mutation RPC、處理 version conflict、drain與 delete-own-data。
- `docs/app.js`：新增/編輯/刪除改走 account mutation；remote-first publish、分帳號 cache、legacy import確認、online immediate drain與同步狀態。
- `docs/index.html`、`docs/sw.js`：僅在實作需要新提示 UI / script cache bust 時做最小更新。
- tests：更新 `tests/test_calendar_state.js`、`tests/test_calendar_persistence.js`、`tests/test_account_sync.js`、`tests/test_supabase_sync.js`、`tests/test_account_switch_v3.js`；新增 calendar RLS/RPC SQL contract 與 behavioral tests，並更新 staging/PWA cache contracts（若檔案版本有變）。

### 建議 rollout 順序（未執行）

1. 使用者另行授權後，從最新 main 建獨立 calendar persistence branch；先寫 migration contract / state / sync / isolation tests，再做 repo-only 實作。
2. 另經明確授權，才在隔離 Preview 套 forward-only migration；先驗 RLS/RPC、A/B isolation、replay、stale conflict、tombstone與 account hard-delete。
3. Preview frontend 驗證 anonymous create → 明確 import、離線 create/edit/delete → online drain、雙裝置衝突、logout/switch、PWA upgrade、清除本機資料後 remote recovery。
4. Production rollout 必須先部署向後相容的新 table/RPC，再部署 frontend；舊 frontend 不使用新 table，因此 DB-first 可安全共存。
5. 觀察 import / mutation failure 後才考慮 tombstone retention / purge；首版不刪尚未確認的 v1 payload或 outbox。

### 風險

- 目前 global v1 event 在共用裝置會跨帳號顯示；遷移若自動認領，可能把事件匯入錯誤帳號。`(user_id, legacy_import_key)` 無法防止跨帳號雙重匯入，故必須先明確確認整批 owner，再建立不可因部分失敗、登出或切帳號而解除的本機 durable claim。
- 現有 event id 不是 UUID且 legacy id 含 index/title；直接拿來當新 PK 不穩定，需獨立 idempotent import key。
- 直接複製 `user_tasks` 的 client timestamp LWW 會受時鐘偏差影響；直接複製無條件 Supabase upsert 也可能讓 stale cache 覆蓋較新 remote。
- 只保留 `last_mutation_id` 需搭配 `expected_version`；否則較舊已成功 mutation 在更新 mutation之後重送時仍可能覆寫。
- tombstone 太早 hard-delete會讓長期離線裝置復活事件；永久保留則需評估儲存與隱私刪除需求。首版選擇不自動 purge，帳號刪除走明確 hard-delete。
- 現有 outbox 不會在每次 mutation 後立即 drain；只「接上同一 queue」仍不足以保證及時 durable，必須補 online immediate best-effort flush及 reload/online recovery。
- 新 table 必須加入 delete-cloud 全流程；漏加會違反使用者對「刪除已同步資料」的期待。

### 驗證

- `node tests/test_calendar_state.js`: PASS
- `node tests/test_calendar_persistence.js`: PASS（只證明現有 localStorage lifecycle，不證明 durable cloud persistence）
- `node tests/test_task_state.js`: PASS
- `node tests/test_account_sync.js`: PASS（V1.1 core、V1.2 durable lifecycle）
- `node tests/test_supabase_sync.js`: PASS
- `node tests/test_account_switch_v3.js`: PASS
- `node tests/test_rls_sql_contract.js`: PASS
- `git diff --check`: PASS（ledger 寫入前 baseline）
- Supabase 官方文件 read-only 核對：exposed table 必須啟用 RLS並做最小 grants；owner policy 用 `auth.uid()`；UPDATE 需 SELECT policy 及 `USING` / `WITH CHECK`；RLS owner欄位需 index。
- product code / migration / Supabase / Preview / Production / PR / deployment: 全部 NO。

### 精確失敗點（若有）

無執行失敗。現況的精確缺口是：calendar user events 不在 account state / outbox / Supabase，global v1 key 不隔離帳號，delete 為實體刪除且沒有 tombstone；既有 outbox 也不在每次 account-ready mutation 後立即送出。

### 已排除原因

- `user_tasks` 不是 calendar event canonical model；欄位可勉強容納不等於 domain 可安全重用。
- `source_event_id` 不是 event storage。
- PWA Cache Storage 更新不是目前資料消失的直接程式路徑；真正缺陷是 localStorage 為唯一副本。
- 不需要 Realtime 才能達成首版 durable persistence；remote-first login + immediate/outbox retry 已能提供 deterministic eventual multi-device sync，減少首版範圍。
- 不以 PR #25、member capability cutover 或其他產品重構作為本方案前置。

### 尚待驗證

- 實作前需用 migration SQL 明確決定 mutation RPC 的回傳型別與 conflict error contract，並在 local/Preview 驗證 concurrent transaction locking。
- tombstone 保留期限尚未由產品決策指定；首版安全預設是不自動 purge。
- legacy import 的確認文案與大量事件上限需在實作輪決定，但不得改為靜默自動匯入。
- Production / Preview 實際 schema、policy與資料量本輪依限制未查詢；實作前需在獲授權的環境重新確認 migration parity。

### 禁止重做

- 禁止重新開啟或 merge PR #25；禁止使用該 branch 作開發基礎或套用其 migration。
- 禁止回到 member capability cutover；本方案只可引用 main 已存在的 access gate，不修改 capability 系統。
- 未獲下一輪明確授權前，不新增 table/migration/RPC、不修改 frontend/sync、不連線或套用 Preview / Production。
- 不把 calendar event 塞進 `user_tasks`，也不為此重構 task domain。
- 不順手處理既有 outbox 的其他 domain、其他 bug、Archive/classification或問校務 v2。

### 下一個唯一允許動作

等待使用者明確授權；若獲授權，從當時最新 main 建立獨立 branch，只做上述 `user_calendar_events` repo-only migration、calendar/account sync、localStorage import與對應 tests。第一階段不得套用 migration到 Preview / Production，也不得部署；完成 repo review 後再等待另一次明確授權。

### 最終狀態
【已完成】

---

## 2026-09-15 23:29｜完成 calendar durable architecture ledger checkpoint

### 目標

只保留、核對並完成上一輪尚未提交的「行事曆使用者事件 durable persistence」架構盤點，補齊 legacy v1 import ownership 規則後直接 commit / push `main`；不修改任何產品程式、migration、Supabase、Preview 或 Production。

### 開始前 checkpoint

- branch: `main`
- 本輪開始時 local HEAD: `797186a22d6e40e025efbbae1e3dcae3a1c01bda`
- fetch 後 remote main HEAD: `821d9223482de8936f845922f293647a0a2ca488`
- remote 新增的是 GitHub Actions 機器公告資料 commit `更新公告 2026-09-15 21:37`；未修改 `AGENTS.md` 或 `PROJECT_LEDGER.md`
- 已以 `git pull --rebase --autostash origin main` fast-forward 到 remote main，並成功恢復上一輪僅 `PROJECT_LEDGER.md` 的未提交修改
- working tree 在本輪 ledger 補充前只有 `PROJECT_LEDGER.md` modified
- DB / deployment checkpoint: 未連線、未讀寫 Preview / Production Supabase；未執行 migration、backfill 或 deployment

### 已完成

- 完整保留上一輪 read-only architecture audit 與既定結論：
  - `user_tasks` 不重用。
  - 新增獨立 `public.user_calendar_events`。
  - Supabase 為登入帳號 canonical source；localStorage 僅作 account-scoped cache / offline queue。
  - 使用 versioned tombstone、`expected_version + mutation_id`、remote-first、immediate best-effort drain，且首版不自動 purge tombstone。
- 補齊 legacy v1 import ownership：
  - `cyNews.calendarEvents.v1` 是未分帳號的 global legacy payload。
  - `(user_id, legacy_import_key)` 只保證同帳號 idempotent，不能單獨阻止 A、B 先後匯入同一批 payload。
  - 使用者明確選定目標帳號後，必須先建立本機 durable batch claim 並綁定該 UID，才可開始匯入。
  - claim 後只有該 UID 可查看／續傳／重試；logout、reload、切帳號或部分失敗都不能解除、轉交或顯示給其他帳號。
  - 每筆 mutation 重試必須 idempotent；只有全批 events 都取得 cloud confirmation 後，才清除 v1 payload 與 active claim metadata。
  - anonymous v2 data 不得自動 merge / adopt 到登入帳號；未來若支援匯入，同樣必須由使用者明確確認並建立 durable claim。
- 未建立 feature branch、PR、migration 或產品實作；未碰 PR #25 或 capability cutover。

### 驗證

- changed files: 僅 `PROJECT_LEDGER.md`
- 已檢查上一輪 architecture audit 仍完整涵蓋現況資料流、`user_tasks = NO`、推薦 schema、RPC/RLS、localStorage migration、conflict/deletion、tests、rollout 與風險
- `git diff --check`: commit 前必須 PASS
- product code / migration / Supabase / Preview / Production / deployment / PR: 全部 NO
- local `main` ledger commit: 已完成；本輪只授權 commit，未明確授權遠端 publish，`git push origin main` 被執行環境安全政策拒絕，沒有遠端變更。狀態記為 `CLOUD_WRITE_BLOCKED`；`origin/main` 仍為 `821d9223482de8936f845922f293647a0a2ca488`。

### 精確失敗點（若有）

產品／ledger 內容無失敗。唯一外部失敗是未獲授權的 remote push 被政策拒絕；沒有重試、沒有繞過，也未修改 GitHub remote。

### 已排除原因

- DB unique key 不能代表 global legacy payload ownership；它只解決同一 UID 的重試重複問題。
- logout 或 account switch 不是 ownership reset，不能讓 claimed payload 回到可被其他帳號認領的狀態。
- anonymous v2 與 legacy v1 都沒有可安全推定的登入 owner，因此不得靜默自動採用。

### 尚待驗證

- 本輪只完成 durable design checkpoint；尚未建立 migration、RPC、frontend sync 或執行 Preview concurrency / RLS 測試。

### 禁止重做

- 不把 calendar events 併入 `user_tasks`。
- 不以 per-account unique key 取代 batch ownership claim。
- 不自動把 legacy v1 或 anonymous v2 data 匯入任何登入帳號。
- 不重新開啟或使用 PR #25，不回到 member capability cutover。
- 未獲明確授權前，不修改產品程式、不新增 migration、不操作 Supabase / Preview / Production、不部署。

### 下一個唯一允許動作

等待使用者明確授權後，從當時最新 `main` 建立獨立 branch，只做 `user_calendar_events` 的 repo-only 實作與測試；不得在同一授權下套用 Preview / Production migration 或部署。

### 最終狀態
【已完成】
