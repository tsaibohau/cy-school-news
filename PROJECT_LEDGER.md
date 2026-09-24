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

## 2026-09-22 08:18 UTC｜GitHub OAuth flow 唯讀網路／認證分層診斷

### 目標

在不重新啟動 GitHub OAuth、不帶 credential、不 push 的前提下，確認連續兩次 browser/device 授權後，失敗位於 device authorization、access-token exchange、API verification 或 credential storage 的哪一層。

### 開始前 checkpoint

- branch：`codex/calendar-parser-1151`
- local HEAD：`7ca289466ef789f77e0b10c092c7c1ffb165f092`
- local tree：`7964f27aeb5107fe2f594851b57e448eff63de78`
- remote branch HEAD：`423183f28182358390cd27f10d0b0fd2e6e2d2c3`
- working tree：本輪開始前已有 `PROJECT_LEDGER.md` modified；本輪只在同檔追加診斷，不修改既有 commit、程式或資料。

### 已完成

#### GitHub CLI

- `gh --version`：`2.101.0 (2026-09-15)`。
- `gh auth status`：exit 1，`You are not logged into any GitHub hosts`。
- 未執行 `gh auth login`、`gh auth setup-git` 或其他 OAuth 動作。

#### 無 credential HTTPS reachability

- 所有 curl 探測均明確移除 GitHub token 環境變數、停用 netrc，並送出空的 Authorization／Cookie／Proxy-Authorization header；沒有輸出或使用 token、cookie 或 authorization value。
- 執行環境不允許直接 DNS lookup：`github.com`、`api.github.com` 的 `getent`／直接 OpenSSL TLS 都因 temporary DNS resolution failure 失敗。這只代表 direct path 被隔離；實際允許的 HTTPS path 經本機政策代理 `127.0.0.1`。
- `https://github.com/`：代理路徑 TLS 驗證成功，HTTP 200。
- `https://github.com/login/device`：代理路徑 TLS 驗證成功，HTTP 302；device/browser 頁面路徑可達。
- `https://github.com/login/oauth/access_token`：無 credential GET 可完成 TLS 並收到 HTTP 404，證明一般 GET 路徑可達；但無 credential、空 body 的 POST 在代理 CONNECT 階段 timeout，HTTP 000，未建立 token exchange HTTP 連線。
- `https://api.github.com/`：兩次有界探測均未取得 HTTP 回應；獨立第二次結果為 proxy CONNECT timeout、HTTP 000。依同方法兩次失敗規則不再重試。

#### gh account metadata / credential storage

- `~/.config/gh/hosts.yml`：不存在。
- `github.com` entry：不存在。
- user / git_protocol metadata：不存在。
- credential 欄位：不存在（false）；沒有讀取或輸出任何 credential value。

#### Git credential helper

- combined Git config 中 `credential.helper` entry 數：0。
- `credential.useHttpPath`：未設定。
- origin 使用 HTTPS。
- 未呼叫 `git credential fill`，因此沒有觸發 helper、credential prompt 或任何 push。

### 精確診斷

- **主要分類：B — OAuth access-token exchange 被阻擋。** browser/device 頁面可達，但 token exchange 所需的 POST 目前在政策代理 CONNECT 階段 timeout；這是目前可重現的最早阻斷層。
- **後續仍存在 C 層 blocker：** `api.github.com` 也無法通過代理 CONNECT。即使 B 被解除，CLI 的 token/API 驗證仍可能在 C 失敗。
- **A 不符合目前證據：** 使用者已兩次完成 browser/device 操作，且 device 頁面可達；本輪沒有重新要求授權。由於禁止再次執行 OAuth，本輪不以新 flow 獨立重驗 server-side device approval。
- **D 沒有證據支持：** `hosts.yml` 尚未建立、Git 也沒有 credential helper；這更符合流程在 token/API 網路階段先被中止，尚未抵達持久化，而不是「token 已取得後 storage 寫入失敗」。
- 因此不得把「`hosts.yml` 不存在」單獨誤判為 storage failure，也不得把先前台帳的「向 api.github.com 交換 OAuth credential」當成精確協定描述：token exchange 與 API validation 是前後兩個端點／階段。

### 已排除原因

- 不是 `gh` 未安裝或版本不可執行。
- 不是 GitHub Web 首頁或 device 頁面整體不可達。
- 不是 repo remote protocol 被改成 SSH。
- 沒有 PAT、SSH、push、commit rewrite、程式／資料修改造成干擾。

### 尚待驗證

- 在目前網路政策下無法驗證含真實 device code 的 token POST 是否能回傳 token；空 POST 已在連線層被阻擋。
- 因 `api.github.com` 同樣被阻擋，無法驗證 token 後續 API identity check。
- credential storage 尚未被流程觸及，不能宣稱 storage 成功或失敗。

### 禁止重做

- 不再次要求或執行 OAuth browser/device 授權。
- 不使用 PAT、SSH 或 connector 重建 commit。
- 不 push，不執行 `gh auth setup-git`。
- 不修改、rebase、squash、amend 或重建現有 commit。
- 不修改程式、parser、fixture、candidate、正式資料、Supabase、Preview 或 Production。

### 下一個唯一允許動作

停止。若後續另有明確授權，只能先在允許 HTTPS POST 到 `github.com/login/oauth/access_token` 且允許 `api.github.com:443` 的環境，讀取既有登入狀態；不得先讓使用者重做第三次 device authorization。確認 credential 已存在後，才可另案決定是否設定 Git helper 或原樣 push。

### 最終狀態

【已完成唯讀診斷；B 為最早可重現 blocker，C 同時存在；未 push】

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

## 2026-09-21｜Git Credential Manager authentication unavailable

### 本輪授權

- 只允許讀取最新 `AGENTS.md` 與 `PROJECT_LEDGER.md`，並檢查雲端環境是否具有 Git Credential Manager；本輪不得 push。
- GCM 可用時才可使用 GitHub OAuth device login；禁止使用 PAT。

### 確認結果

- `git config --show-origin --get-all credential.helper`：無輸出，未設定 credential helper。
- `git-credential-manager`：`command not found`。
- `git-credential-manager-core`：`command not found`。
- `git credential-manager --version`：`git: 'credential-manager' is not a git command.`。
- 結論：cloud image 缺少可用的 GitHub interactive HTTPS authentication client。
- 因 GCM 不存在，未嘗試 OAuth device login；未要求、使用、輸出或保存 PAT/token。
- 未執行 `git push`；remote branch / Draft PR 未建立、未修改。
- 程式、fixtures、tests、parser、公開資料、Preview / Production / deployment：全部未修改、未執行。

### 下一個唯一允許動作

停止。等待使用者在具有可用 GitHub interactive HTTPS authentication client 的環境另行明確授權後，再處理認證或 push；不得以 PAT、connector 或重建 commit 替代。

### 最終狀態

【CLOUD_WRITE_BLOCKED：cloud image 缺少可用的 GitHub interactive HTTPS authentication client；已停止】

---

## 2026-09-21｜calendar-parser Draft PR publish 與 read-only review

### Publish checkpoint

- branch：`codex/calendar-parser-1151`。
- push 前本地 HEAD 已確認為 `43c969d0dd37e88d7934c3b1dd6d7c63bfa04836`，working tree clean。
- 以原生 `git push -u origin codex/calendar-parser-1151` 原樣發布；未重建、squash、rebase 或改寫任何既有 commit。
- push 後 remote branch HEAD 與本地 HEAD 均為 `43c969d0dd37e88d7934c3b1dd6d7c63bfa04836`；兩端 tree 均為 `b23537adcc2d95933a3cb21cacab07d048579858`。
- Draft PR #29：`https://github.com/tsaibohau/cy-school-news/pull/29`；base `main`，head `codex/calendar-parser-1151`，保持 Draft / OPEN，未標記 Ready、未 merge。

### Read-only review 結果

- **真實 fixtures：PASS。** `calendar_115_1_layout_sources.json` 的 CYSH／CYGSH PDF SHA-256 與既有 `calendar-source-status.json` 固定 revision 完全一致；fixture 分別保留 1／3 個 PDF page form-feed、原始斷行、跨行與 reading order，並非人工改寫成一行一事件。
- **row reconstruction：PASS。** CYSH 由週日期 anchor 配對正式的 `N 日`／range row；CYGSH 先合併同一編號 row，再且每 row 最多 append 一個事件。CYGSH row 內後續日期、時段及節次只保留在標題說明，不會 fan-out 成額外事件。
- **115-1 跨年：PASS。** `_calendar_year()` 對第一學期 1–2 月加一年；兩校真實 fixture regression 都明確要求存在 `2027-01-*` 事件。
- **quality gate：PASS。** gate 包含事件數、至少四個月份、碎片比例、重複比例、學期日期合理範圍、超過 31 日跨度，以及相對 last-known-good 少逾 40% 的異常縮水。
- **last-known-good / curated fallback：PASS。** discover 只在 gate PASS 後刪除並替換同校同學期 official rows、標記 `official_complete`；gate FAIL 會先 `continue`，保留既有 official rows。build 只讓 PASS 或明確 `using_last_known_good` 的 term 取代 curated rows；無可信 official term 時保留 curated fallback。
- **regression coverage：PASS。** 真實 fixture test 要求 CYSH 100 且大於 2、CYGSH 172、禁止已知純標點／時刻／節次碎片標題、兩校一月為 2027；另直接驗證 2-row collapse 與 fragment-heavy gate reject，以及 rejected/accepted term 的 curated fallback 行為。
- 本輪以 `PYTHONDONTWRITEBYTECODE=1 python -B tests/test_calendar_adapter.py` read-only 重跑：PASS；測試後 working tree 仍 clean。
- PR metadata 已確認：#29 為 Draft / OPEN，head OID 等於發布的本地 HEAD；branch push 後 GitHub 顯示既有自動 Vercel status 與 Preview Comments 均 SUCCESS。本輪未手動觸發、操作或驗收 Preview，未操作 Production，也未執行任何 deployment command。

### 未執行／未修改

- 未執行 discover/build、重新抓取、backfill 或任何 workflow。
- 未修改 parser、fixtures、tests、公開 `calendar-events.json`、official/status JSON、ICS、Preview、Production 或 deployment。
- 未修改 PR #28；未 merge 或將 PR #29 標記 Ready。

### Review finding

未發現 blocker；不需自行擴大修正。

### 下一個唯一允許動作

等待使用者人工審閱 Draft PR #29。未經另行明確授權，不得修改程式或資料、執行 discover/build/backfill、更新公開行事曆 JSON、操作 Preview / Production、部署、標記 Ready 或 merge。

### 最終狀態

【已完成：remote parity、Draft PR #29 與 read-only review；無 blocker】

---

## 2026-09-22｜PR #29 parser 驗收候選輸出

### 範圍與產生方式

- 從 Draft PR #29 branch `codex/calendar-parser-1151`、起始 HEAD `b235e27941bba8c78038774baf8e01a163603588` 繼續。
- 只讀下載 `calendar-source-status.json` 已固定的 CYSH／CYGSH 115-1 官方 PDF 到 `/tmp`，沒有執行 discover/build/backfill。
- PDF SHA-256：CYSH `981254e3c7e013c8cf532560b56fb00ea6e77606c2d23a8e14046203b39b18de`；CYGSH `b678dc6c5b93e3136d9b4c316a8096ba5733c1231640b993c35f01fa6b5db8ef`，均與 status 與 fixture provenance 完全一致。
- 使用 PR #29 現有 `extract_pdf_text()` 與 `parse_calendar_text()` 直接解析；新 extraction 與兩份 committed layout fixture 逐位元組一致。
- 未修改 parser、fixtures 或 tests。

### 隔離 artifact

- 候選事件：`artifacts/calendar-parser-1151/candidate-calendar-events.json`。
- machine-readable 驗收報告：`artifacts/calendar-parser-1151/candidate-validation-report.json`。
- 人工驗收摘要：`artifacts/calendar-parser-1151/README.md`。
- artifact 位於非 `docs/` 路徑；未覆蓋或修改 `docs/data/calendar-events.json`、`docs/data/calendar-source-status.json`、`docs/data/official-calendar-events.json`、`docs/calendar.ics` 或其他現行公開資料。
- 未建立或部署 Preview UI；candidate JSON 已可作後續本地／隔離 UI 輸入，但本輪只提供資料與報告供人工抽查。

### 統計結果

- CYSH：100 筆。月份分布：2026-08 11、09 19、10 16、11 19、12 20、2027-01 11、02 4。全範圍 2026-08-24～2027-02-11；2026-09～2027-01 共 85 筆，觀察範圍 2026-09-01～2027-01-29。
- CYGSH：172 筆。月份分布：2026-08 19、09 43、10 27、11 31、12 25、2027-01 23、02 4。全範圍 2026-08-27～2027-02-15；2026-09～2027-01 共 149 筆，觀察範圍 2026-09-01～2027-01-26。
- 跨日事件：CYSH 23 筆；例如 2026-08-25～27 高一選課、2026-09-02～03 高三第二次模擬考、2026-10-13～14 第一次期中考。CYGSH 0 筆；現有 parser 將 row 第一日期作單日定位，range 留在標題說明。
- 空標題、純標點碎片、純時段、純節次：兩校皆 0。
- 超出 115-1 合理範圍 2026-08-01～2027-02-28：兩校皆 0。
- quality gate：兩校皆 PASS。

### 與現行公開資料差異

- CYSH：公開 2 筆，candidate 100 筆，`+98`；公開資料的 `V1` 碎片不在 candidate。
- CYGSH：公開 169 筆，candidate 172 筆，表面 `+3`；公開資料把 1／2 月錯放在 2026，candidate 改為 2027。因 row reconstruction 同時改變標題與日期，不能把 count delta 單獨視為新增活動數。
- exact `(start_date, end_date, title)` 比對：CYSH overlap 0；CYGSH overlap 0，符合 parser v2 重建 row 與跨年修正造成的資料形狀變更。

### 已知疑點

- CYSH 有 4 個短標題；「校運會」與兩筆「科學節」可理解，但 `2027-01-01` 的「元旦放」疑似 extraction／row 截斷，需人工對照 PDF。
- CYGSH 有一組完全相同事件重複 3 次：`2026-09-29`「115 年嘉義市中小學聯合運動會 (9/29-10/15)」。quality gate 只計為 2 筆 excess、整體比例低於拒絕門檻，因此仍 PASS；人工驗收需決定三筆是否分屬不同處室欄或應去重。
- CYGSH range 事件目前全部以第一日期顯示為單日，range 留在標題；這符合目前 parser 設計，但應由人工 UI 驗收確認顯示預期。
- 依使用者限制，上述疑點只記錄，未自行修改 parser、fixtures 或 tests。

### 驗收判定

- 適合進入人工 UI／資料抽查：**是**。
- 適合直接發布為正式公開資料：**尚未判定／未授權**。應先抽查上述 CYSH 截斷標題、CYGSH 重複事件與 range 顯示。

### 未執行／未修改

- 未 merge PR #29、未標記 Ready、未修改 PR #28。
- 未 backfill、未執行 discover/build、未更新公開行事曆資料。
- 未修改 Preview / Production Supabase，未部署或自行發布候選資料。

### 下一個唯一允許動作

停止並等待人工驗收。未經使用者另行明確授權，不得修 parser、發布 candidate、覆蓋公開資料、操作 Preview / Production、標記 Ready 或 merge。

### 最終狀態

【已完成：隔離 candidate 與統計報告已產生；適合人工抽查，尚未授權發布】

---

## 2026-09-22｜PR #29 candidate-only 行事曆 UI 驗收入口

### 目標與範圍

- 從 Draft PR #29 branch `codex/calendar-parser-1151`、起始 HEAD `9d27f35f337a3622a3c12834c17c7ab0ccfc676d` 繼續。
- 只把已產生並驗證過的 candidate 接到 PR Preview 專用驗收頁；未修改 parser、fixture、quality gate 或 candidate 內容。
- 驗收頁只由 staging build 產生，不放入 `docs/` 公開站內容，也不覆蓋正式 `docs/data/calendar-events.json` 或 `docs/data/calendar-source-status.json`。

### 已完成

- 新增 Preview-only route：`/calendar-parser-1151-review.html`。
- staging build 將既有 `artifacts/calendar-parser-1151/candidate-calendar-events.json` 原樣複製到隔離路徑 `review/calendar-parser-1151/candidate-calendar-events.json`；來源與 build artifact 已用 `cmp` 確認逐位元組一致。
- 驗收頁沿用正式月曆的核心呈現契約：42 格月份網格、事件日期區間含首尾日、每天最多 4 個事件點及當日 agenda；另加人工驗收用的月份事件清單，不改正式 UI。
- 可切換全部／CYSH／CYGSH，並可直接切換 2026-09 至 2027-01。
- 頁面明確標示「驗收資料，不是正式公開資料」。
- 提供快速定位：CYSH「元旦放」、CYGSH 三筆完全重複事件、CYSH 跨日事件；疑似截斷與重複群組只在 UI 標記，不更動 candidate。
- Preview UI commit：`0693259`（`feat: add calendar parser candidate review page`），已 push 至 PR #29 branch。

### 驗證結果

- `node --check tools/staging/calendar-parser-1151-review.js`: PASS。
- `CYNEWS_STAGING_OUTPUT=/tmp/cy-school-news-staging-calendar-review node tools/build-staging.js`: PASS。
- candidate source 與 staging copy：byte-identical，PASS。
- 靜態互動資料契約：candidate 272 筆、CYSH「元旦放」1 筆、CYGSH 指定完全重複群組 3 筆、2026-09-03 顯示中的跨日事件 3 筆，PASS。
- `git diff --check`: PASS。
- 正式 `docs/data/calendar-events.json`、`docs/data/calendar-source-status.json`、官方 calendar JSON / ICS：本輪均無 diff。
- GitHub deployment `6573669816` / commit status：success；Vercel Preview deployment 已 READY。
- 直接驗收網址（需具 PR Preview 權限並登入 Vercel team）：`https://cy-school-news-staging-9c4kgl2or-tsaibohau-9644s-projects.vercel.app/calendar-parser-1151-review.html`。

### 已知疑點與精確限制

- candidate 既有疑點不變：CYSH「元旦放」疑似標題截斷；CYGSH 有 3 組完全重複事件；部分日期區間在 candidate 中仍以單日事件加標題文字表示。此輪只讓人工在月曆上檢查，未自行修正。
- Preview 受 Vercel Deployment Protection 保護；未登入的 cloud browser 被導向 Vercel Login，因此「deployment READY」已確認，但部署後頁面的實際 browser runtime 標記為【無法確認】，須由具權限人工登入後抽查。未降低保護、未改 deployment 設定。
- `gh pr view` 曾遇一次 GitHub GraphQL 502；改用 GitHub REST 後成功取得 deployment / status，沒有重試相同失敗方法。
- 穩定 staging alias 對此新 route 回傳 404，因此只能使用上列本次 PR deployment URL，不能把 alias 當成本輪驗收入口。

### 禁止重做

- 不得因 Preview 登入保護而發布 candidate、降低保護或改用正式資料路徑。
- 不得修改 parser、fixture、quality gate 或 candidate 內容；若人工驗收發現資料問題，只記錄並等待新授權。
- 不得 merge 或標記 Ready、backfill、Production deployment、操作 Production / Preview Supabase、修改 PR #28 或覆蓋任何正式行事曆資料。

### 下一個唯一允許動作

由具 PR #29 Preview 權限的人工直接開啟上列 URL，切換 CYSH / CYGSH 與 2026-09 至 2027-01，抽查「元旦放」、CYGSH 重複事件、跨日呈現及標題截斷／錯誤合併／漏項。完成前不得自行修 parser、發布 candidate、merge 或標記 Ready。

### 最終狀態

【已完成：candidate-only Preview 驗收入口已建立；deployment READY，受保護頁面 runtime 等待授權人工驗收】

---

## 2026-09-22｜PR #29 完整行事曆產品驗收頁（CLOUD_WRITE_BLOCKED）

### 目標與 checkpoint

- 從 branch `codex/calendar-parser-1151`、remote / local 起始 HEAD `423183f28182358390cd27f10d0b0fd2e6e2d2c3` 繼續。
- 只把既有 candidate-only 頁升級為完整行事曆產品驗收入口；未修改 parser、fixture、quality gate、candidate、正式行事曆 JSON 或 Supabase。
- 本地產品實作 commit：`6ddf5b6`（`feat: add full candidate calendar product review`）。commit 已建立，但 remote push 在 ref 更新前失敗，因此 PR #29 尚未包含此 commit、尚無本輪新版 Preview URL。

### schema / UI 盤點與重要度缺口

- 官方 calendar event：現有 canonical 欄位沒有 `importance`；本輪不修改 candidate，也不替官方資料偽造可持久化重要度。驗收畫面只以唯讀預設「一般」投影。
- user calendar event：本輪前 `CalendarState` 只有 `id/title/date/notes`，沒有重要度。現有 branch 的 persistence 是既有 `cyNews.calendarEvents.v1` localStorage lifecycle；本輪沒有另建第二套 persistence，也沒有新增 Supabase schema。
- task priority：`user_tasks.priority` 為 nullable `smallint 0–5`，現有 UI 使用高／中／低對應 5／3／1；這是 task 模型，不直接冒充 calendar importance。
- announcement importance：現有顯式判定讀取 `important === true`、`importance === "high"` 或 `source_pin === "important"`；不是一致的「重要／一般／參考」三態 schema。
- 本輪最小 calendar importance model：只為 user calendar event 加 `important | normal | reference`，UI 顯示「重要／一般／參考」，legacy / invalid 值 fail-safe 為 `normal`；月曆格子圓點與當日 agenda 均可辨識。此欄位隨既有 CalendarState/localStorage create/edit lifecycle 保存，不寫入官方事件。

### 完整產品驗收接線

- staging build 不再部署獨立簡化月曆；`calendar-parser-1151-review.html` 直接由完整 staging `index.html` 衍生，沿用同一份 `app.js`、calendar render、日期選取、agenda、auth 與既有個人事件 persistence。
- review bootstrap 只把官方行事曆 fetch URL 切換到隔離的 `review/calendar-parser-1151/candidate-calendar-events.json`；candidate build copy 與 source 已用 `cmp` 確認逐位元組一致。
- 未登入時 review route 例外允許開啟 calendar；candidate 官方事件可讀，但 user events 不投影，新增按鈕與表單隱藏，edit/delete handlers 亦 fail closed。
- 核准會員登入後投影「candidate 官方事件 + 既有自己的事件」，可沿用既有 create/edit/delete；操作按鈕只由 `kind === "user"` 產生，官方事件標示「候選官方行事曆（唯讀）」且不提供修改／刪除。
- 保留 CYSH／CYGSH selector、2026-09～2027-01 快速月份、CYSH「元旦放」、CYGSH 三筆重複、CYSH 跨日事件捷徑，並保留「驗收資料，不是正式公開資料」警示。

### 驗證結果

- `node --check docs/app.js docs/calendar-state.js tools/build-staging.js tools/staging/calendar-parser-1151-review.js`: PASS。
- `node tests/test_calendar_state.js`: PASS。
- `node tests/test_calendar_persistence.js`: PASS。
- `node tests/test_calendar_candidate_product_review.js`: PASS。
- `node tests/test_calendar_workflow.js`: PASS。
- `node tests/test_account_auth.js`: PASS；契約明確限定只有 candidate review calendar 可匿名進入，其餘會員頁籤仍需登入。
- `node tests/test_account_sync.js`: PASS。
- `node tests/test_account_switch_v3.js`: PASS。
- `node tests/test_ui_visual_contract.js`: PASS。
- staging build：PASS，shell revision `staging-0be9c77a2129`；candidate staging copy byte-identical；review HTML 已確認載入完整產品 shell、review bootstrap、警示、重要度欄位與驗收工具。
- candidate read-only contract：272 筆；CYSH「元旦放」1 筆；CYGSH 2026-09-29 相同標題實際 3 筆；2026-09-03 可見 3 筆 CYSH 跨日事件。
- `git diff --check`: PASS。
- `docs/data/calendar-events.json`、`docs/data/calendar-source-status.json`、`docs/data/official-calendar-events.json`、`docs/calendar.ics`: 本輪無 diff。

### 瀏覽器驗證限制

- skill 指定的 `agent-browser` 不存在。
- Node Playwright package 存在，但 Chromium executable 未安裝；啟動失敗於 `Executable doesn't exist ... chromium_headless_shell`。沒有下載 browser 或無限重試。
- 因此本地 build / static / state contract 均已驗證，但真實 browser runtime 與登入會員 OAuth 流程標記【無法確認】，必須待 cloud push 與有權限人工在 PR Preview 驗收。

### 精確 cloud write blocker

- `git push origin codex/calendar-parser-1151` 失敗：`fatal: could not read Username for 'https://github.com': No such device or address`；remote ref 未更新。
- 目前 image 找不到 `gh`，且 `git config --show-origin --get-all credential.helper` 無輸出。
- `apt-get update/install gh` 被 container 權限阻擋：APT helper 無法 `setgroups/setegid/seteuid`，沒有安裝任何 repo 內容。
- 改用官方 GitHub CLI release 到 `/tmp` 的下載在 30 秒只完成約 1%（14.5 MB 中約 238 KB），推估超過外部等待上限，已停止；未完成安裝、未進行 OAuth、未要求或保存 PAT/token。
- 狀態：`CLOUD_WRITE_BLOCKED`。本輪沒有新 Vercel deployment，因此不能提供新版 Preview 驗收 URL；上一輪 URL 仍只包含舊的簡化 candidate UI，不能當成本輪完成證據。

### 2026-09-22 OAuth recovery 再確認

- 已依授權從 GitHub CLI 官方 release 下載 `gh 2.101.0`（Linux amd64），以 `--no-same-owner` 解壓並安裝到 `~/.local/bin/gh`；未使用 apt / sudo，未修改 repo 檔案。
- 使用者已先後完成兩次 GitHub.com HTTPS browser/device 授權；兩次 `gh auth login` 都在授權完成後、CLI 向 `https://api.github.com:443` 交換 OAuth credential 時被 Cloud Work 網路政策中斷：`Network access to "https://api.github.com:443" was blocked by policy`。
- `gh auth status` 最終仍回報 `You are not logged into any GitHub hosts`；credential 沒有落地，因此未執行 `gh auth setup-git`、未 push，也未建立新 Preview。
- 為避免讓使用者反覆授權，同一 device-login 方法已停止。沒有要求、輸出或保存 PAT/token。
- local HEAD 仍為 `7ca289466ef789f77e0b10c092c7c1ffb165f092`；remote HEAD 仍為 `423183f28182358390cd27f10d0b0fd2e6e2d2c3`；既有兩個 commit 未 amend / rebase / squash / 重建。
- 本段是依失敗處理規則留下的本機 blocker 紀錄；因 GitHub credential 不可用，無法 commit / push 此 ledger 更新。下一個唯一允許動作仍是換到允許 `gh` 完成 OAuth API exchange 的 Work environment，確認登入後原樣 push 現有 branch。

### 禁止重做與下一個唯一允許動作

- 不得重建、squash、rebase 或改寫 `6ddf5b6`；不得重新實作已完成的完整產品驗收頁。
- 不得修改 parser / fixture / quality gate / candidate / 正式 JSON，不得 backfill、操作 Supabase、Production deploy、merge／Ready PR #29 或修改 PR #28。
- 下一個唯一允許動作：在具有 GitHub HTTPS OAuth credential helper 的 Work 環境，從本地 commit `6ddf5b6` 原樣 push `codex/calendar-parser-1151`；確認 remote HEAD 後等待 PR #29 Vercel Preview READY，再以受保護 Preview 實機驗收匿名／登入、重要度與指定 candidate 疑點。完成或失敗後更新本節。

### 最終狀態

【本地實作與測試已完成；CLOUD_WRITE_BLOCKED，PR #29 / 新 Preview 尚未更新】

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

---

## 2026-09-22 08:18 UTC｜最新 auth checkpoint 索引

- 本檔上方同時間的「GitHub OAuth flow 唯讀網路／認證分層診斷」為本輪完整、權威紀錄，並取代先前把 token exchange 與 `api.github.com` validation 混為同一階段的概括描述。
- 最新結論：**B 是目前最早可重現 blocker**（`github.com/login/oauth/access_token` 的無 credential POST 在政策代理 CONNECT 階段 timeout）；**C 同時存在**（`api.github.com` 亦 proxy CONNECT timeout）。A 不符合目前證據；D 沒有證據，因流程尚未抵達持久化。
- `gh auth status` 仍為未登入；`hosts.yml` 不存在；Git credential helper 0；未重新 OAuth、未 push、未修改 commit／程式／資料。
- 下一個唯一允許動作：停止；除非另有明確授權且環境先允許 token POST 與 GitHub API，不得要求第三次 device authorization。

### 最終狀態

【已完成唯讀診斷；PROJECT_LEDGER.md 已更新；未 push】

---

## 2026-09-22 09:26 UTC｜SSH Deploy Key 階段 1 條件檢查

### 目標

只確認 `ssh.github.com:443` 可達性，以及目前 Cloud Work 是否有可由本 agent 安全寫入、跨 session 保存的 secret / credential storage。任一條件不成立即不產生 key。

### 開始前 checkpoint

- branch：`codex/calendar-parser-1151`
- local HEAD：`7ca289466ef789f77e0b10c092c7c1ffb165f092`
- local tree：`7964f27aeb5107fe2f594851b57e448eff63de78`
- working tree：本輪開始前已有 `PROJECT_LEDGER.md` modified；本輪只追加 blocker 紀錄。

### 確認結果

- SSH 443：**不可達**。有界 `ssh-keyscan -T 8 -p 443 ssh.github.com` 未建立連線，exit 1；精確失敗點為 `getaddrinfo ssh.github.com: Temporary failure in name resolution`。
- 第一次探測包裝命令因包含被安全層拒絕的暫存檔清理語法，在 process 建立前即遭拒，沒有執行網路探測；改成不建立檔案後才取得上述真實結果。
- OpenAI 官方 Codex Cloud environment 文件確認平台有 environment Secrets，會加密保存並只在 setup script 執行時解密；進入 agent phase 前會移除。
- 目前此 Work agent 沒有 Cloud environment Secrets 的新增／更新工具；現有可見的 secret 類工具只屬其他產品（例如 Sites runtime），不能冒充本 repo 的 Cloud Work environment storage。
- 因此「可由本輪立即安全寫入 private key、並跨 session 保存」的 storage：**不存在／不可用**。只寫入目前容器的 `~/.ssh` 不符合要求。

### 執行決策

- 兩項前置條件都不成立，依使用者規則在階段 1 停止。
- 未產生 ED25519 keypair。
- private key：不存在；未寫入 repo、ledger、prompt、一般文字檔或 `~/.ssh`。
- public key：不存在。
- persistent secret name：未建立。
- SSH host alias：未建立。
- 未執行 OAuth、PAT、push、merge、Ready 或任何 commit／程式／candidate／tests 修改。

### 下一個唯一允許動作

停止。須先讓執行環境可解析並連線 `ssh.github.com:443`，並提供可由 agent 寫入的 Codex Cloud environment secret 介面；在兩項都以直接證據成立前，不得產生 Deploy Key，也沒有可進行的 GitHub Deploy keys UI 操作。

### 最終狀態

【BLOCKED：SSH 443 不可達，且本 agent 無可寫入的跨 session secret storage；未產生 key、未 push】

---

## 2026-09-22 11:45 UTC｜GitHub OAuth／push 環境差異唯讀鑑識

### 目標

追查「先前 Cloud Work 可原生 git push、目前 OAuth／部分 GitHub 路徑受阻」的環境差異；只做無 credential 的 fingerprint、DNS／TCP／TLS／HTTP、method policy 與 Git Smart HTTPS 測試。

### 開始前 checkpoint

- branch：`codex/calendar-parser-1151`
- local HEAD：`7ca289466ef789f77e0b10c092c7c1ffb165f092`
- local tree：`7964f27aeb5107fe2f594851b57e448eff63de78`
- working tree：本輪開始前已有 `PROJECT_LEDGER.md` modified；本輪只追加鑑識紀錄。
- 未 OAuth、未 push、未建立 credential、未修改 remote／commit／程式／candidate／tests、未安裝工具。

### 最後一次已記錄的 known-good

- Ledger 最後一次明確記錄原生 push 成功的 checkpoint：`2026-09-21｜calendar-parser Draft PR publish 與 read-only review`；只記錄日期，沒有精確時分。
- 已確認操作：`git push -u origin codex/calendar-parser-1151` 成功；local／remote HEAD 均為 `43c969d0dd37e88d7934c3b1dd6d7c63bfa04836`，tree 均為 `b23537adcc2d95933a3cb21cacab07d048579858`。
- 該成功 checkpoint **沒有記錄 `gh auth status` 成功**，也沒有記錄 gh version、OAuth exchange、DNS、proxy 或 endpoint reachability。因此本檔不能證明使用者題述的「gh auth 成功」部分，只能證明原生 push 成功。
- protocol：成功段落沒有再次展開 remote URL；它之前的 blocker 與下一動作均明確以 `https://github.com/tsaibohau/cy-school-news.git` 為目標，且未記錄 remote 曾被修改。故可記為「HTTPS 有連續 ledger 證據，但成功段落未獨立重列 URL」，不得宣稱有 SSH 證據。

### 目前環境 fingerprint

- `uname -a`：`Linux localhost 6.18.44 #1 SMP Sat Sep 12 15:35:21 UTC 2026 x86_64 x86_64 x86_64 GNU/Linux`
- OS：Ubuntu 24.04.3 LTS (Noble Numbat)，ID `ubuntu`，ID_LIKE `debian`。
- Git：`2.51.1`。
- gh：`not found`；與前一個已安裝 `gh 2.101.0` 的 session 不同。
- curl：`8.5.0`，libcurl `8.5.0`，OpenSSL `3.0.13`。
- hostname：`localhost`；`/etc/hostname` container identifier：`42b6cc441053`。
- `/etc/resolv.conf`：`nameserver 168.63.129.16`；沒有 search/domain 行。

### Proxy / network environment（已遮罩）

- `HTTP_PROXY`／`HTTPS_PROXY`／`http_proxy`／`https_proxy`：存在，`http://127.0.0.1`。
- `ALL_PROXY`／`all_proxy`：存在，`socks5h://127.0.0.1`。
- `NO_PROXY`／`no_proxy`：存在；只含 localhost、loopback 與 RFC1918 private ranges；未輸出 credential，原設定也未見 username／password／token／query。
- Git config 未另設 `http.proxy`／`https.proxy`，故 Git 使用環境 proxy。
- Git credential helper：0；`credential.useHttpPath` unset；`http.extraHeader` 不存在；`http.sslVerify`／`http.version` unset。
- `~/.curlrc`、`/etc/curlrc`、`~/.config/gh/hosts.yml`、`~/.config/gh/config.yml`：均不存在。

### Hostname 分層測試

- Direct path：`github.com`、`api.github.com`、`ssh.github.com` 全部 `socket.getaddrinfo()` 失敗，`Temporary failure in name resolution`；因此 direct TCP 443 與 direct TLS 都未開始。
- Proxy HTTPS GET：
  - `github.com`：proxy CONNECT timeout，HTTP 000，TLS 未建立。
  - `api.github.com`：proxy CONNECT timeout，HTTP 000，TLS 未建立。
  - `ssh.github.com`：proxy CONNECT timeout，HTTP 000，TLS 未建立。
- 這些結果代表「該次 generic curl GET」失敗，不代表同 host 的所有 operation 永久不可達；後續 OAuth dummy POST 與 Git Smart HTTPS 有成功反證。

### HTTP method policy

- Endpoint：`https://github.com/login/oauth/access_token`。
- GET：proxy CONNECT timeout，HTTP 000，未建立 TLS。
- 無 credential dummy POST：使用假的 `client_id`／`device_code`，未帶真實 code、token、cookie、Authorization；成功完成 proxy connection／TLS 並收到 HTTP 404，response body 未輸出。
- 與上一輪「GET 可達、空 POST timeout」結果方向相反。證據不支持固定的 POST-block policy；更符合 per-request／session proxy routing 不穩定或政策狀態漂移。

### Git Smart HTTPS

- `git ls-remote https://github.com/cli/cli.git HEAD`：exit 0；以 `credential.helper=`、`GIT_TERMINAL_PROMPT=0`、移除 GitHub token 環境變數執行，沒有登入或 credential。
- 目前 repo origin 的 `git ls-remote <origin> HEAD`：exit 0；同樣無 credential、無 prompt。
- current origin protocol：HTTPS。
- 結論：目前 Git Smart HTTPS read-only transport 可達；不是 GitHub HTTPS 全面中斷，也不是 Git-specific network failure。

### 矩陣

| endpoint / operation | previous known-good | current | failure layer |
|---|---|---|---|
| `github.com` GET | 成功 push checkpoint 未記錄 generic GET | curl proxy CONNECT timeout／HTTP 000；但同 host dummy POST 與 Git Smart HTTPS 成功 | generic GET 的 proxy routing／policy，不是 host 全面不可達 |
| OAuth token POST | 成功 checkpoint 未記錄 | fake-data POST 到達 HTTP 404 | 本次無 network failure；固定 POST filtering 不成立 |
| `api.github.com` GET | 成功 checkpoint未記錄 | direct DNS fail；proxy CONNECT timeout／HTTP 000 | DNS／proxy layer；TLS/HTTP 未到達 |
| Git Smart HTTPS | 2026-09-21 原生 push 成功、remote parity PASS | 公開 repo與目前 origin的無 credential `ls-remote` 均 exit 0 | 無 failure；read-only Smart HTTPS 可達 |
| `ssh.github.com:443` | 成功 checkpoint未記錄 | direct DNS fail；proxy CONNECT timeout／HTTP 000 | DNS／proxy layer；TCP/TLS 未到達 |

### 分類結論

- **A. session/network policy drift：成立。** 現容器 identifier、工具狀態與先前 session 不同；先前安裝的 gh 不存在。相同 proxy session 內 generic GET timeout，但 OAuth dummy POST與 Git Smart HTTPS 成功，且與上一輪 GET／POST結果反向，顯示 session／request-level network behavior 漂移。
- **B. proxy/DNS configuration drift：目前只能確認「現況問題」，不能證明 configuration drift。** 現況 direct DNS 全失敗，流量依賴 localhost proxy；但 known-good push checkpoint 未保存當時 resolv.conf／proxy env，無法比較設定是否改變。精確 configuration drift 證據不足。
- **C. GitHub endpoint/method-specific filtering：不成立／至少未被證明。** POST 本次成功到達 HTTP，而 GET timeout；Git Smart HTTPS同 host成功。結果不具穩定 method-specific pattern。
- **D. gh-specific regression：不成立。** 當前環境沒有 gh，且 curl本身已有 timeout；不能把 network failure歸因 gh binary。
- **E. 證據不足：同時成立。** Ledger 沒有「gh auth 成功」checkpoint、當時 gh version、proxy/DNS fingerprint或 generic endpoint matrix，因此無法精確指出 known-good與current之間哪一項平台設定改變，也不能從現有證據推定 GitHub服務端故障。

### 下一個唯一允許動作

停止。本輪只完成 forensic diagnosis；不得以此結果觸發 OAuth、push、PAT、SSH key、remote修改、工具重裝或任何產品修改。

### 最終狀態

【已完成：A + E；目前 Git Smart HTTPS 可達，generic curl/API/SSH受 DNS／proxy不穩定影響；未 OAuth、未 push】

---

## 2026-09-22 15:35 UTC｜成功 push credential lifecycle 唯讀鑑識

### 目標

只追查先前原生 Git push 成功時可能使用的 credential storage backend，以及其未跨 Cloud Work session 留存的證據；不觸發認證、不讀取 secret 值。

### 開始前 checkpoint

- branch：`codex/calendar-parser-1151`
- local HEAD：`7ca289466ef789f77e0b10c092c7c1ffb165f092`
- local tree：`7964f27aeb5107fe2f594851b57e448eff63de78`
- working tree：開始前已有 `PROJECT_LEDGER.md` modified；本輪只追加鑑識紀錄。
- 最後一次原生 push 成功：2026-09-21 `calendar-parser Draft PR publish 與 read-only review`，`git push -u origin codex/calendar-parser-1151` 成功並確認 remote parity；該 checkpoint 沒有記錄 gh auth 成功、gh version或 credential backend。

### 現存 Git credential 設定

- `git config --show-origin --get-all credential.helper`：exit 1，entries 0。
- `git config --show-origin --get-regexp '^credential\.'`：exit 1，entries 0。
- 沒有執行 `git credential fill`、credential prompt、fetch 或 push。
- 常見檔案存在性：`~/.git-credentials`、`~/.netrc`、`~/.authinfo`、`~/.config/git/credentials` 全部不存在；未讀取任何檔案內容。

### GitHub CLI credential 痕跡

- `~/.config/gh/`：不存在。
- `~/.config/gh/hosts.yml`：不存在。
- `github.com` entry：不存在。
- user／git_protocol metadata：不存在。
- credential/token 欄位：不存在（false）；未讀取或輸出任何值。

### 環境注入

- `GH_TOKEN`：不存在。
- `GITHUB_TOKEN`：不存在。
- `GH_HOST`：不存在。
- 只檢查變數存在性，沒有輸出值。

### Linux secure credential storage

- `secret-tool`、`gnome-keyring-daemon`、`kwalletd5`、`kwalletd6`、`keepassxc`、`gdbus`：binary 均不存在。
- `libsecret-tools`、`libsecret-1-0`、`gnome-keyring`：未安裝。
- `DBUS_SESSION_BUS_ADDRESS`、`XDG_RUNTIME_DIR`：均不存在。
- `gnome-keyring-daemon`、`kwalletd5`、`kwalletd6` 精確程序名檢查：均未執行。
- `busctl --user status org.freedesktop.secrets`：unavailable，exit 1。
- 第一次 KWallet 檢查曾用 `pgrep -f`，可能把檢查命令本身誤判為 running；已用 `pgrep -x kwalletd5/kwalletd6` 更正為 not running。錯誤結果不得作為證據。
- 結論：目前 session 沒有可用的 Secret Service／desktop keyring backend，也沒有它曾保存 GitHub credential 的痕跡。

### `$HOME` filesystem／mount 性質

- `$HOME=/root`：存在，位於 `/` 的 `overlay`／`overlayfs`，不是 dedicated mount。
- `~/.config`：不存在；若建立會落在同一 root overlayfs，沒有獨立 mount。
- `~/.local`：不存在；若建立會落在同一 root overlayfs，沒有獨立 mount。這與上一個曾安裝 `~/.local/bin/gh`、目前 gh 已消失的 session 差異一致。
- `~/.gitconfig`：存在，但位於同一 root overlayfs，不是 dedicated mount；credential 設定為 0。
- filesystem ID：`4cb5e943ee74aff3`（本 session）；沒有 bind mount、volume、network filesystem或其他跨 session persistent mount 證據。
- 以上只能證明「目前 HOME 是 container overlay 且無持久掛載證據」，不能倒推成功 session 的 credential 必然存放於 HOME。

### 問題 A：成功 session 最可能由哪個 storage backend 提供？

**證據不足，無法指定 backend。**

- 原生 push 成功證明當時 Git 取得過可寫 credential，但成功 checkpoint 沒保存 `credential.helper`、`hosts.yml`、環境注入、AskPass、記憶體 cache、keyring或其他 backend 證據。
- 目前所有痕跡為空，只描述新 container 的狀態；不能用「現在不存在」反推當時一定使用 gh `hosts.yml`、Git credential cache、環境注入或任何特定 backend。
- 因此不得把任一候選稱為「最可能」；現存證據只支持「某種 session 可用 credential source 曾存在」。

### 問題 B：是否足以證明沒有跨 session 保留的原因？

**證據不足，不能證明精確原因。**

- 可以證明：目前 container 與先前 session 不同；目前 `$HOME` 是非 dedicated 的 overlayfs；gh binary與所有已查 credential 痕跡均不存在；沒有 persistent mount 證據。
- 不能證明：成功 credential 當時確實位於 `$HOME` overlay、記憶體 cache、AskPass、環境變數或 keyring中的哪一處，也沒有成功 session 的 mount／environment snapshot可比較。
- 只有條件式敘述成立：若 credential 當時存於 session-local filesystem、process memory或臨時注入，新 container不保留它是合理結果；但這不是已證明的實際 backend／消失原因。

### 下一個唯一允許動作

停止。不得為補證據而啟動 OAuth、credential lookup、push／fetch、PAT、SSH、工具安裝、remote修改或其他認證替代方案。

### 最終狀態

【已完成：A＝證據不足；B＝證據不足；未觸發或讀取任何 credential】
## 2026-09-22｜GitHub 裝置授權後網路政策阻擋

- 最後成功 checkpoint：本機 branch `codex/calendar-parser-1151`，HEAD `7ca289466ef789f77e0b10c092c7c1ffb165f092`；先前 remote 追蹤分支落後兩個 commit。
- 使用者依 GitHub 裝置頁面完成授權；CLI 輪詢後工具回報 `Network access to https://api.github.com:443 was blocked by policy`。
- 精確失敗點：OAuth 授權結果無法回傳目前 CLI；`~/.config/gh/hosts.yml` 不存在，credential 尚未建立。沒有執行 push；remote HEAD parity 未驗證。
- 已排除：使用者端裝置授權未完成（截圖顯示 connected）。尚待驗證：此執行環境能否獲准連至 GitHub API 以完成 OAuth 輪詢。
- 下一個允許動作：待網路政策允許 `api.github.com:443` 後，重新啟動官方 GitHub CLI OAuth，完成 credential integration、native push 與 remote HEAD 核對；不得將使用者端成功頁面當作 CLI 認證成功。
- working tree：既有 `PROJECT_LEDGER.md` modified，本次僅追加此紀錄；未改產品程式與 commit。

## 2026-09-22｜SSH 443 只讀探測與 HTTPS Git 候選確認

- 目標：在不重跑 OAuth、不修改 commits 的前提下，以 native Git 推送 `codex/calendar-parser-1151`。
- 最後已確認本機 checkpoint：HEAD `7ca289466ef789f77e0b10c092c7c1ffb165f092`；origin URL `https://github.com/tsaibohau/cy-school-news.git`；working tree 只有既有 `PROJECT_LEDGER.md` modified。
- SSH 443 探測第一次：直連 `ssh.github.com:443` 在 DNS 階段失敗，`gaierror [Errno -3] Temporary failure in name resolution`。
- SSH 443 探測第二次：HTTPS proxy CONNECT 到 `ssh.github.com:443` 逾時，HTTP 000；因此此 session 無法證實 SSH 443 可達，已停止該路徑，未產生金鑰或修改 remote。
- HTTPS Git 只讀 `git ls-remote` 成功；遠端 `refs/heads/codex/calendar-parser-1151` HEAD 為 `423183f28182358390cd27f10d0b0fd2e6e2d2c3`，與本機不同。
- 精確 blocker：SSH endpoint 無法連通；OAuth API 被環境政策阻擋，無可用 credential。HTTPS Git transport 可達，但本 session 尚無安全方式取得僅供推送的 PAT；不得在對話、ledger、log 或 commit 接收或輸出 token。
- 最終狀態：【CLOUD_WRITE_BLOCKED；未 push；remote HEAD != local HEAD】。下一個允許動作：使用可安全提供 Git credential 的受信任環境，以 GitHub fine-grained PAT 完成 HTTPS native push，再用 native Git 核對 HEAD；不得要求在對話貼出 token。

## 2026-09-23｜原生推送重試與 commit 原樣移交

- branch `codex/calendar-parser-1151`；本機 HEAD `7ca289466ef789f77e0b10c092c7c1ffb165f092`，父 commit `6ddf5b686537c24dbc6346c377d99c8bdb88ee25`，其父為遠端基底 `423183f28182358390cd27f10d0b0fd2e6e2d2c3`。
- 使用者要求推送。`GIT_TERMINAL_PROMPT=0 timeout 25 git push origin HEAD:refs/heads/codex/calendar-parser-1151` exit 124，無進展輸出；未取得成功回報。
- GitHub 連接器有該 repo 的 push 權限，但其現有 create-commit 工具會重建 commit，不能保留原 SHA；未呼叫任何寫入工具。
- 只讀 GitHub commit lookup：本機 HEAD `7ca2894...` 回傳「No commit found」；基底 `423183f...` 存在。遠端 HEAD parity 未達成。
- 已建立並驗證增量 Git bundle `calendar-parser-1151.git.bundle`，內含原 HEAD、要求基底 `423183f...`；`git bundle verify` PASS。此檔供可信任的 Git 環境原樣載入後推送，不含未提交 working-tree 內容。
- 工作樹：既有 `PROJECT_LEDGER.md` modified，追加本段；未更動 commit、程式碼、remote 或 Git 設定。狀態：【CLOUD_WRITE_BLOCKED；未推送】。
- 下一個允許動作：在具 GitHub 寫入連線的環境取得 bundle，驗證基底與原 HEAD，原生推送且核對遠端 HEAD；不得重建既有 commit。

## 2026-09-23｜雲端專用移交方向修正

- 使用者確認全程只在雲端作業，不存在本機電腦；先前建議 Windows 終端機不適用。
- GitHub connector 已確認對 repo 有 push 權限，但其 API create-commit 會產生新 SHA，不能替代保留原 commit 的 native Git push。
- 探查純雲端 GitHub Codespaces 瀏覽器入口：Cloud Browser 開啟 GitHub 時顯示登入頁；既有 connector 授權未共享至此瀏覽器。安全登入交接結果為 user_took_over，隨後可見頁面仍為登入表單；未確認登入成功，未建立 Codespace、未上傳 bundle、未推送。
- bundle 原樣保留本機 HEAD `7ca289466ef789f77e0b10c092c7c1ffb165f092`，已驗證並保存供雲端移交。下一步只限純雲端：在已登入的 GitHub 雲端工作環境載入 bundle 後 native Git push，或由平台提供可保留原 commit 的物件傳輸；不得要求本機電腦，不得重建 commit。
- 狀態：【CLOUD_WRITE_BLOCKED；遠端尚未與本機 HEAD 一致】。

## 2026-09-23｜再次裝置授權遭 API 網路政策阻擋

- 使用者明確要求重新走 GitHub CLI device authorization；CLI 產生新代碼並顯示官方 `github.com/login/device` 入口。
- 使用者截圖顯示 GitHub 網頁 404；無法由截圖判定代碼是否曾成功提交或頁面轉址原因。
- CLI 輪詢時工具明確回報 `Network access to https://api.github.com:443 was blocked by policy`；授權結果無法傳回本 Cloud Work session。此次授權程序已無法繼續，不應重用該代碼。
- 未接收 credential、未 git push，remote HEAD parity 未達成。下一動作：停止重試同一 device flow；需平台允許 API 連線或使用保留原始 commit 的純雲端 Git 傳輸環境。

## 2026-09-23｜repo 專屬或 session 通道故障的對照診斷

- 同一 Cloud Work session、同一 native Git HTTPS transport 下，read-only `git ls-remote` 對 `tsaibohau/cy-school-news.git` 與無關的公開 repo `git/git.git` 均 exit 0 並回傳 HEAD。嘉雲快訊 origin URL 正確，Git 讀取路徑未發現 repo 專屬故障。
- GitHub connector 對嘉雲快訊 repo 回報 `admin/maintain/pull/push` 權限；平台連接器並非缺少該 repo 的寫入授權。
- 本機 HEAD `7ca289466ef789f77e0b10c092c7c1ffb165f092` 在 GitHub connector 查詢仍回報 No commit found；未推送。
- 已確認 blocker 仍是此 session 的 native Git 寫入 credential／OAuth API 網路路徑。只讀對照不能單獨證明所有 repo 的寫入是否可達，但新建 repo 不會自動改變本 session 的 OAuth API 端點、代理或 native Git credential；因此不建議以搬遷專案處理。
- 狀態：【診斷完成；repo 專屬故障無證據；session 級寫入通道受阻；未修改程式與 commit】。下一步：保留現有 repo，改用有原始 Git 物件傳輸能力的純雲端 Git 環境載入已驗證 bundle，再推送同一 branch 並驗證 SHA；若環境不可用，標示阻礙，不另建 repo。
## 2026-09-23｜推送工程再次檢查：雲端登入阻礙

- 本機 branch `codex/calendar-parser-1151` HEAD `7ca289466ef789f77e0b10c092c7c1ffb165f092`；`git bundle verify` PASS，bundle 要求基底 `423183f28182358390cd27f10d0b0fd2e6e2d2c3`。
- 原生 Git 只讀 `ls-remote` exit 0，遠端 branch HEAD 仍為 `423183f28182358390cd27f10d0b0fd2e6e2d2c3`；遠端與本機不一致。
- 雲端瀏覽器 Codespaces 入口仍為 GitHub 登入頁，只提供使用者名稱／電子郵件和密碼欄位；使用者先前表示以 Google 登入，本次未要求或輸入密碼，未建立 Codespace。
- 已知 CLI OAuth API 與 SSH 443 阻擋仍在先前 checkpoint，未重複 device flow 或 SSH probe；本輪未執行無憑證 push、未生成／接收 credential、未修改任何 commit、remote 或產品程式。
- 狀態：【CLOUD_WRITE_BLOCKED；未推送；remote HEAD != local HEAD】。下一步需要有 GitHub 登入且可用原生 Git 的純雲端環境，或平台提供安全 Git credential 與寫入網路通道；載入既有 bundle 後推送原 branch 並核對 SHA。

## 2026-09-23｜Codespace 原生 Git 推送成功

- 使用者在雲端瀏覽器完成 GitHub 登入，並明確授權信任 `cy-school-news` Codespace 工作區及使用終端機推送。
- 推送前先確認原始 bundle 仍存在（9,268 bytes），SHA-256 `cfdb9e76a6a439f2d95b7b2911b231cb8813c2dafeb691db07d40eec76ca1ef4`，`git bundle verify` 通過，bundle HEAD 為 `7ca289466ef789f77e0b10c092c7c1ffb165f092`。
- Codespace 的分支及遠端原為 `423183f28182358390cd27f10d0b0fd2e6e2d2c3`；在其 `/tmp` 還原並驗證 bundle，`git fetch` 載入原始物件，確認 `FETCH_HEAD` 為 `7ca289466ef789f77e0b10c092c7c1ffb165f092` 且為目前分支 HEAD 的後代。
- 原生 `git push origin FETCH_HEAD:refs/heads/codex/calendar-parser-1151` 成功：`423183f..7ca2894`；Codespace 的 `git ls-remote` 後續驗證輸出 `PUSH_VERIFIED`。
- Cloud Work 獨立以 native Git 查詢遠端 `refs/heads/codex/calendar-parser-1151` 為 `7ca289466ef789f77e0b10c092c7c1ffb165f092`，與原始本機 HEAD 完全一致。
- 未修改、重建、rebase、squash 或 amend 既有 commit；沒有修改產品程式碼、remote 或 Git 設定。本機僅此 ledger 保持未提交的 modified 狀態；它不包含在已推送 commit 中。
- 狀態：【已完成；git push 成功；remote HEAD == local HEAD】。

## 2026-09-23｜PDF 解析候選事件接入一般測試站行事曆

- 使用者要求讓 PDF 解析成果進入行事曆；以 PR #29 branch `codex/calendar-parser-1151` 的測試站為範圍，正式站 `main` 與 Action-owned `docs/data/*` 保持原樣。
- `tools/build-staging.js` 在品質報告通過時，僅於 `dist-staging` 將既有 272 筆 candidate 原樣覆蓋測試站的 `data/calendar-events.json`，讓一般行事曆使用；更新測試站 status 事件數與 review_pending 標記，首頁橫幅標明尚待人工核對。
- 既有 `/calendar-parser-1151-review.html` 保留獨立驗收；候選資料已知疑點包括 CYSH 短標題「元旦放」與 CYGSH 三筆同名事件，不能作為 Production 發布依據。
- `node tests/test_staging_build.js`、`node tests/test_calendar_candidate_product_review.js`、`node --check tools/build-staging.js`、`git diff --check`：PASS。Cloud Work 的 `python tests/test_parser.py` 因缺少 `requests` 在 import 時未啟動，待具備依賴的 Codespace／CI 驗證。
- 此段為實作中 checkpoint；remote 推送、PR Preview deployment 及實機驗收結果需於完成後續記，不得在驗證前標成已發布。
