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

1. 保住 Archive / lifecycle Freeze，不重做。
2. PR #23 classification recovery 已完成，不再調查 baseline CI。
3. PR #23 已依使用者明確授權合併；不得重複合併或重做 recovery。
4. PR #24 已依使用者明確授權合併；續接制度已進入 main，不得重複合併。
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

**停止在 PR #24 已合併 checkpoint，等待使用者指定下一項工作。**

- 不重複 merge PR #24。
- 後續工作必須先讀 main 根目錄的 `AGENTS.md` 與 `PROJECT_LEDGER.md`。
- 不自動修改產品、Supabase、classification、Archive 或 baseline failures。
- 不自動開始附件解析、Reference Knowledge 或問校務 v2。

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

## 2026-09-13 01:26｜會員 capability cutover：repo-only 實作與隔離驗證

### 目標

依 2026-09-12 21:28 已確認設計，完成既有 `account_capabilities` 的正式前端啟用、RPC / RLS cutover 與測試；只新增 forward-only migration 檔，不套用到 Preview 或 Production Supabase。

### 開始前 checkpoint

- base branch / HEAD / tree: `main` / `ff9512813b7607572335987ced490e5b7b87e826` / `7c342dc367bd002203721e24ee516dba64e17e33`
- feature branch: `codex/member-capability-cutover`
- tested implementation HEAD / tree: `d8d2002664c0b834b37c2cf3605a504d45963ac7` / `ca81edaed881869420227f71cb5c77282400a0c3`
- Draft PR: #25 `Member capability cutover`

### 已完成

#### 前端 / Auth / Sync

- `docs/capability-layer.js` 已由 monkey-patch / `MutationObserver` compatibility layer 收斂成無 DOM 攔截的正式 capability model。
- `docs/index.html` 明確在 `account-auth.js` 前載入 capability client；PWA cache version 已同步更新。
- `docs/app.js` 已移除 `service_level`、`hasFullService()`、`isTimetableOnly()` 與 `applyServiceAccess()` 的功能授權 gate，tab、home action、會員摘要、問校務、課表、行事曆／待辦、訂閱／通知皆依 capability map 控制。
- 管理介面已改成五項 capability checkbox；owner / co_admin 顯示唯讀全開狀態，不能由 capability editor 修改。
- `docs/account-auth.js` 已正式封裝 `current_account_capabilities()`、`admin_account_capabilities(...)`、`admin_set_account_capabilities(...)` 與 atomic `admin_update_account_capabilities_v2(...)`。
- `docs/supabase-sync.js` 已移除 `serviceLevel` 正式授權 fallback；subscriptions / reads / preferences / tasks 只依五項 capability 決定讀寫。

#### Forward-only migration / RLS

- 新增 `supabase/migrations/20260912165735_member_capability_cutover_v2.sql`。
- `account_access.status` 維持最外層 gate；`account_capabilities` 為五項會員功能唯一授權來源；`service_level` 只在缺列初始化時作 legacy preset，既有 rows 以 `ON CONFLICT DO NOTHING` 完整保留。
- owner / co_admin 有效產品功能相容為全開；admin 降級後讀回原本保存的 capability，不重算。
- atomic approval v2 在同一 transaction 更新 status 與完整五項 capability；拒絕／移除存取權不覆寫保存的 capability。
- `user_reminder_rules`、`user_push_subscriptions` 已切到 `notifications` capability，並移除會與 capability policy OR 放行的舊 owner / approved permissive policies。
- Security Definer functions 固定 `search_path`；PUBLIC / anon EXECUTE 已 revoke，只 grant 必要的 `authenticated` function。

#### 測試

- 新增 `tests/test_capability_cutover.js`、`tests/test_capability_rpc_client.js`。
- 新增 `supabase/tests/database/capability_cutover_rls.test.sql` 30 項 matrix，涵蓋 capability matrix、owner / co_admin effective-full 與 protection、admin downgrade restore、atomic approval / rejection、missing-row initialization、existing-row preservation、service_level 不覆寫、reminder / push RLS、舊 policy 移除、EXECUTE grant 與 search_path contract。
- 更新既有 reminder / user_tasks fixture，明確賦予 notifications / calendar capability；更新 frontend / sync / PWA contract tests 與 CI test list。

### 驗證

- capability-focused Node suite：9 / 9 PASS。
- full Node regression：42 / 43 PASS；唯一 failure 為既有 `tests/test_assistant_qa.js:26` 仍期待「北港高中」查詢回傳 `null`，但 main 的 school registry 已回傳 PKSH。依本輪禁止事項只歸因，未修改 PKSH baseline。
- `tests/test_rls_sql_contract.js`：PASS。
- search ranking strict：train 8 / 8、validation 8 / 8；PASS。
- assistant evaluation strict：train 6 / 6、validation 6 / 6；PASS。
- legal preview gate：PASS（仍維持 `PREVIEW_ONLY_REVIEW_REQUIRED`；未做 Production deployment）。
- 本機 DB reset：此 runner 無 Docker，無法在本機執行；不是 migration failure。
- GitHub Actions `Local RLS database tests` run #122：PASS。
  - isolated `supabase db reset --local --no-seed`：PASS，包含新 migration。
  - user_tasks RLS：25 / 25 PASS。
  - reminder RLS：22 / 22 PASS。
  - capability cutover RLS：30 / 30 PASS。
- 前一 run #121 的唯一 failure 是 PUBLIC grant 測試以 `proacl` 字串搜尋 `=X/`，誤命中 `authenticated=X/...`；改用 `aclexplode(...).grantee = 0` 後 run #122 全綠，產品 grant 未改動。
- Vercel Preview：latest commit check SUCCESS；deployment dashboard `7zoQUfdPkasdmHsKoeXJohMmMEo6`。

### Preview / Production 寫入邊界

- Preview Supabase migration：NO。
- Production Supabase migration：NO。
- Preview / Production `account_access`：NO WRITE。
- Preview / Production `account_capabilities`：NO WRITE。
- Auth users：NO WRITE。
- Preview / Production backfill：NO。
- merge main / Production deployment：NO。
- 唯一資料庫 mutation 是 GitHub Actions runner 的隔離 ephemeral local Supabase，job 結束後已 `supabase stop`。

### 精確失敗點（若有）

- 本機隔離 DB 無法啟動：`docker` 不存在；已由 GitHub Actions ephemeral Supabase 完整替代驗證並通過。
- repo HTTPS push 首次因 runner 無 Git credential 失敗：`fatal: could not read Username for 'https://github.com'`；改由已授權 GitHub connector 建立同名 branch / commits / Draft PR，遠端成功。
- 完整 Node regression 的唯一既有 baseline failure：`tests/test_assistant_qa.js:26` PKSH 舊預期；未修。

### 已排除原因

- 新 migration 本身可由乾淨 reset 依序套用，非 migration ordering / syntax failure。
- capability、reminder 與 push RLS matrix 全綠，未留下舊 permissive policy OR bypass。
- PUBLIC / anon EXECUTE 與 Security Definer search_path 已由資料庫 catalog 測試確認。
- 既有 capability rows、admin downgrade row 與 service_level 非覆寫行為已由 matrix 確認。
- Vercel Preview build 成功；沒有 Production deployment。

### 尚待驗證

- 尚未在 Preview 或 Production Supabase 套用 migration；這是本輪明確禁止事項，不是遺漏。
- 尚未對真實 Preview / Production 帳號執行 after-cutover 行為驗證；必須等後續另行授權 migration 與只讀驗證窗口。
- staging validation 的全套 Node workflow 未由本 branch 自動觸發；本機已執行相同 Node regression，並保留唯一既有 PKSH baseline failure。

### 禁止重做

- 不以 `service_level='full'` 重算或覆寫任何既有 capability。
- 不套用 migration 到 Preview / Production，不修改其 account / capability / Auth 資料。
- 不修 PKSH、user_tasks 舊 baseline、classification 或 Archive，不開始附件解析、Reference Knowledge 或問校務 v2。
- 不 merge main，不做 Production deployment。

### 下一個唯一允許動作

等待使用者審閱 Draft PR #25 與成功的隔離 CI / Vercel Preview；未取得新的明確授權前，不套用任何 Supabase migration，也不合併 main。

### 最終狀態
【已完成】
