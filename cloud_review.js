/* Cloud adapter for the existing Review UI v0.2. Human decisions remain in
 * human_reviews; this adapter never writes to Production or machine_predictions. */
"use strict";
(async function bootCloudReview() {
  const $ = (id) => document.getElementById(id);
  const setMessage = (message, error = false) => {
    const el = $("cloudMessage");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("error", error);
  };
  const setQueueState = (message) => { if ($("queueState")) $("queueState").textContent = message; };
  const cfg = window.CLOUD_REVIEW_CONFIG;
  if (!cfg?.supabaseUrl || !cfg?.publishableKey) {
    setMessage("Review Station 設定缺失。", true);
    return;
  }

  let supabase;
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    supabase = createClient(cfg.supabaseUrl, cfg.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  } catch (error) {
    setMessage("無法載入安全登入元件；請檢查網路後重試。", true);
    return;
  }

  let reviewer = null;
  let reviewerApproved = false;
  let activeSnapshot = null;
  let activeManifest = null;
  let snapshotById = new Map();
  let activeSession = null;
  let cloudMode = "blind";
  let debounce = null;
  let persistChain = Promise.resolve();
  const dirtyHumanRows = new Map();
  window.cloudHydrating = false;
  window.cloudReviewActive = false;
  window.onReviewSaved = () => {
    if (!window.cloudReviewActive || window.cloudHydrating) return;
    const currentRow = current();
    if (currentRow && ((currentRow.human_reviewed_fields || []).length > 0 || Boolean(currentRow.human_notes))) {
      dirtyHumanRows.set(currentRow.announcement_id, clone(currentRow));
    }
    try {
      localStorage.setItem("cloud-review-position", JSON.stringify({
        snapshotId: activeSnapshot,
        sessionId: activeSession?.id,
        index: typeof index === "number" ? index : 0,
        savedAt: new Date().toISOString(),
      }));
    } catch { /* Supabase remains the canonical store. */ }
    clearTimeout(debounce);
    debounce = setTimeout(() => { persistCloud().catch(reportSaveError); }, 350);
  };

  async function verifyReviewer(session) {
    if (!session) return false;
    const { data, error } = await supabase.rpc("is_approved_reviewer");
    reviewer = session.user;
    $("cloudSignedOut").classList.add("hidden");
    $("cloudSignedIn").classList.remove("hidden");
    $("authIdentity").textContent = `已登入：${reviewer.email || reviewer.id}`;
    if (error || data !== true) {
      reviewerApproved = false;
      $("reviewerPending").classList.remove("hidden");
      $("reviewerUid").textContent = reviewer.id;
      $("snapshotSelect").disabled = true;
      $("cloudMode").disabled = true;
      $("loadQueue").disabled = true;
      $("importSnapshot").disabled = true;
      setMessage(error
        ? `登入成功，但核准狀態暫時無法確認：${error.message}。review 資料未載入。`
        : "登入成功，但 reviewer UID 尚未核准。複製上方 UID 傳給管理者；核准前不會讀取 review 資料。");
      return false;
    }
    reviewerApproved = true;
    $("reviewerPending").classList.add("hidden");
    $("cloudMode").disabled = false;
    setMessage("已登入。公告與人工答案只會從 Training Supabase 載入。未覆核欄位仍保持 unreviewed。");
    await refreshSnapshotList();
    return true;
  }

  async function refreshSnapshotList() {
    const { data, error } = await supabase.from("snapshots")
      .select("id,captured_at,record_count,manifest")
      .eq("source_project_ref", cfg.productionProjectRef)
      .order("captured_at", { ascending: false }).limit(20);
    if (error) {
      setMessage(`無法讀取 Training snapshot：${error.message}`, true);
      return;
    }
    const latest = data?.[0];
    if (!latest) {
      $("snapshotNotice").textContent = "目前 Training 尚無公告 snapshot。可從唯讀 Production 靜態 feed 建立本輪驗證 snapshot。";
      setQueueState("沒有 snapshot");
      $("loadQueue").disabled = true;
      $("importSnapshot").disabled = false;
      return;
    }
    snapshotById = new Map(data.map((s) => [s.id, s]));
    const select = $("snapshotSelect");
    select.innerHTML = data.map((s) => `<option value="${s.id}">${new Date(s.captured_at).toLocaleString()} · ${s.record_count} 筆 · ${s.id.slice(0,8)}</option>`).join("");
    select.disabled = false;
    select.value = latest.id;
    activeSnapshot = latest.id;
    activeManifest = latest.manifest || {};
    $("snapshotNotice").textContent = `最新 immutable snapshot：${latest.captured_at} · ${latest.record_count} 筆 · ${activeManifest.source?.repository || "source metadata missing"} · ${activeManifest.source?.commit_sha?.slice(0,8) || "no commit"}`;
    $("loadQueue").disabled = Number(latest.record_count) === 0;
    setQueueState(`${latest.record_count} 筆待載入`);
    $("importSnapshot").disabled = true;
  }

  function latestRunPredictionFields(p) {
    const bool = (v) => v === "true" ? true : v === "false" ? false : null;
    return {
      machine_label: p.machine_label,
      machine_temporal_status: p.machine_temporal_status,
      machine_confidence: p.machine_confidence,
      machine_reasons: p.machine_reasons || [],
      machine_teacher_related: p.machine_teacher_related,
      machine_announcement_missing: bool(p.machine_announcement_missing),
      machine_affected_audience: p.machine_affected_audience || [],
      machine_announcement_type: p.machine_announcement_type,
      machine_regulatory_basis: p.machine_regulatory_basis,
      machine_availability: p.machine_availability,
      machine_post_expiry_reference_value: p.machine_post_expiry_reference_value,
      deadline_date: p.deadline_date,
      event_date: p.event_date,
      application_start: p.application_start,
      application_end: p.application_end,
      effective_until: p.effective_until,
      long_lived_information: p.long_lived_information,
      machine_temporal_spans: p.machine_temporal_spans || [],
    };
  }

  async function loadQueue() {
    if (!reviewerApproved) { setMessage("reviewer UID 尚未核准；沒有讀取任何 review 資料。", true); return; }
    activeSnapshot = $("snapshotSelect").value || activeSnapshot;
    if (!reviewer || !activeSnapshot) return;
    activeManifest = snapshotById.get(activeSnapshot)?.manifest || activeManifest || {};
    cloudMode = $("cloudMode").value;
    setQueueState("載入中…");
    const queueIds = activeManifest.review_queue?.announcement_ids;
    if (!Array.isArray(queueIds) || !queueIds.length) {
      setQueueState("缺少 validation queue manifest");
      setMessage("此 snapshot 沒有受限的驗證 queue manifest；不會載入整份公告資料。", true);
      return;
    }
    const { data: items, error: itemError } = await supabase.from("snapshot_announcements")
      .select("snapshot_id,announcement_id,school,title,content,published_date,first_seen_date,date_source,category,source_category,source_url,attachment_metadata,captured_at,content_availability,source_check_status,attachment_availability")
      .eq("snapshot_id", activeSnapshot).in("announcement_id", queueIds)
      .order("published_date", { ascending: false, nullsFirst: false });
    if (itemError) { setQueueState("載入失敗"); setMessage(`公告佇列載入失敗：${itemError.message}`, true); return; }
    if (!items?.length) { setQueueState("snapshot 為空"); return; }

    const { data: observations, error: observationError } = await supabase.from("snapshot_content_observations")
      .select("announcement_id,observed_at,source_url,content,content_sha256,extraction_status,attachment_metadata,metadata")
      .eq("snapshot_id", activeSnapshot).in("announcement_id", queueIds)
      .order("observed_at", { ascending: false });
    if (observationError) { setQueueState("載入失敗"); setMessage(`官方頁面觀察資料載入失敗：${observationError.message}`, true); return; }
    const observationById = new Map();
    for (const obs of observations || []) if (!observationById.has(obs.announcement_id)) observationById.set(obs.announcement_id, obs);

    const { data: existingReviews, error: reviewError } = await supabase.from("human_reviews")
      .select("*").eq("snapshot_id", activeSnapshot).eq("reviewer_id", reviewer.id);
    if (reviewError) { setQueueState("載入失敗"); setMessage(`人工進度載入失敗：${reviewError.message}`, true); return; }
    const reviewById = new Map((existingReviews || []).map((r) => [r.announcement_id, r]));

    let predictionsById = new Map();
    if (cloudMode === "machine_review") {
      const { data: runs, error: runError } = await supabase.from("machine_runs")
        .select("id,created_at").eq("snapshot_id", activeSnapshot).order("created_at", { ascending: false }).limit(1);
      if (runError) { setMessage(`machine run metadata 載入失敗：${runError.message}`, true); return; }
      if (runs?.[0]) {
        const { data: preds, error: predError } = await supabase.from("machine_predictions")
          .select("*").eq("machine_run_id", runs[0].id).eq("snapshot_id", activeSnapshot);
        if (predError) { setMessage(`machine prediction 載入失敗：${predError.message}`, true); return; }
        predictionsById = new Map((preds || []).map((p) => [p.announcement_id, p]));
      }
      if (!predictionsById.size) {
        setMessage("此 snapshot 沒有 machine predictions。沒有建立任何預測；若要開始複查，請切換 Blind mode。", true);
      }
    }

    const records = items.map((a) => {
      const h = reviewById.get(a.announcement_id) || {};
      const p = cloudMode === "machine_review" ? predictionsById.get(a.announcement_id) : null;
      const observation = observationById.get(a.announcement_id);
      const r = {
        announcement_id: a.announcement_id, school: a.school, title: a.title,
        content: observation?.content || a.content, content_availability: observation?.extraction_status || a.content_availability,
        source_check_status: observation?.metadata?.source_check || a.source_check_status,
        attachment_availability: (observation?.attachment_metadata?.length ? "links_present" : a.attachment_availability),
        published_date: a.published_date, first_seen_date: a.first_seen_date,
        date_source: a.date_source, category: a.category, source_category: a.source_category,
        official_url: a.source_url, attachment_metadata: observation?.attachment_metadata?.length ? observation.attachment_metadata : (a.attachment_metadata || []),
        source_observation_status: observation?.extraction_status || null,
        snapshot_id: a.snapshot_id,
        human_label: h.human_label ?? null,
        human_affected_audience: h.human_affected_audience || [],
        human_teacher_related: h.human_teacher_related ?? null,
        human_announcement_type: h.human_announcement_type ?? null,
        human_regulatory_basis: h.human_regulatory_basis ?? null,
        human_availability: h.human_availability ?? null,
        human_announcement_missing: h.human_announcement_missing ?? null,
        human_post_expiry_reference_value: h.human_post_expiry_reference_value ?? null,
        human_temporal_status: h.human_temporal_status ?? null,
        human_deadline_date: h.human_deadline_date ?? null,
        human_event_date: h.human_event_date ?? null,
        human_application_start: h.human_application_start ?? null,
        human_application_end: h.human_application_end ?? null,
        human_effective_until: h.human_effective_until ?? null,
        human_long_lived_information: h.human_long_lived_information ?? null,
        human_temporal_spans: h.human_temporal_spans || [],
        human_audience_reasons: h.human_audience_reasons || [],
        human_temporal_reasons: h.human_temporal_reasons || [],
        human_availability_reasons: h.human_availability_reasons || [],
        human_action_reasons: h.human_action_reasons || [],
        human_importance_reasons: h.human_importance_reasons || [],
        human_post_expiry_reasons: h.human_post_expiry_reasons || [],
        human_reasons: h.human_reasons || [],
        human_reason_review: h.human_reason_review || { confirmed: [], rejected: [], added: [] },
        human_reviewed_machine_reasons: h.reviewed_machine_reasons || [],
        human_reviewed_fields: h.human_reviewed_fields || [],
        human_machine_review: h.human_machine_review || {},
        modified_fields: h.modified_fields || [],
        disagreement_fields: h.disagreement_fields || [],
        disagreement_details: h.disagreement_details || {},
        correction_reason: h.correction_reason || [],
        human_notes: h.human_notes || "",
        review_status: h.review_status || "unreviewed",
        label_source: h.label_source || "machine_prediction",
        reviewed_at: h.reviewed_at || null,
      };
      if (p) Object.assign(r, latestRunPredictionFields(p));
      return r;
    });

    const { data: sessions, error: sessionError } = await supabase.from("human_review_sessions")
      .select("*").eq("reviewer_id", reviewer.id).eq("snapshot_id", activeSnapshot)
      .eq("review_mode", cloudMode).is("closed_at", null)
      .order("last_active_at", { ascending: false }).limit(1);
    if (sessionError) { setMessage(`複查工作階段載入失敗：${sessionError.message}`, true); return; }
    activeSession = sessions?.[0] || null;
    if (!activeSession) {
      const { data: made, error: createError } = await supabase.from("human_review_sessions").insert({
        reviewer_id: reviewer.id, snapshot_id: activeSnapshot, review_mode: cloudMode,
      }).select("*").single();
      if (createError) { setMessage(`無法建立複查工作階段：${createError.message}`, true); return; }
      activeSession = made;
    }

    window.cloudHydrating = true;
    window.cloudReviewActive = true;
    window.cloudSnapshotId = activeSnapshot;
    startReview({ source: "training_supabase", snapshot_id: activeSnapshot, as_of: new Date().toISOString().slice(0,10), records });
    const savedSession = activeSession.queue_state || {};
    index = Math.min(Number(activeSession.current_position || 0), records.length - 1);
    undoStack = Array.isArray(savedSession.undo_stack) ? savedSession.undo_stack : [];
    const cached = JSON.parse(localStorage.getItem("cloud-review-position") || "null");
    if (cached?.sessionId === activeSession.id && Number.isInteger(cached.index)) index = Math.min(cached.index, records.length - 1);
    $("blindMode").checked = cloudMode === "blind";
    showModel = cloudMode === "machine_review";
    $("showModel").classList.toggle("hidden", cloudMode === "blind");
    window.cloudHydrating = false;
    render();
    setQueueState(`${records.length} 筆已從 Training Supabase 載入`);
    setMessage(cloudMode === "blind"
      ? "Blind mode：machine tables were not queried; labels、confidence、reasons 與 ranking 資訊沒有傳到此瀏覽器。"
      : "Machine review mode：僅顯示已存在的 machine predictions；目前沒有建立新的 prediction。 ");
    save();
  }

  $("importSnapshot").onclick = async () => {
    if (!reviewer || !reviewerApproved) return;
    $("importSnapshot").disabled = true;
    setMessage("正在唯讀檢查正式公告 feed，並將 validation-only snapshot 匯入 Training…");
    const { data, error } = await supabase.functions.invoke("import-production-static-feed", { body: {} });
    if (error) {
      $("importSnapshot").disabled = false;
      setMessage(`Snapshot 匯入失敗：${error.message}`, true);
      return;
    }
    setMessage(`Snapshot ${data.snapshot_id} 已建立；${data.count} 筆 source metadata，queue ${data.queue_count} 筆，detail 狀態：${JSON.stringify(data.source_check_results || {})}。`);
    await refreshSnapshotList();
  };

  function toHumanRow(r) {
    return {
      snapshot_id: activeSnapshot,
      announcement_id: r.announcement_id,
      reviewer_id: reviewer.id,
      session_id: activeSession.id,
      human_label: r.human_label,
      human_affected_audience: r.human_affected_audience || [],
      human_teacher_related: r.human_teacher_related == null ? null : String(r.human_teacher_related),
      human_announcement_type: r.human_announcement_type,
      human_regulatory_basis: r.human_regulatory_basis,
      human_availability: r.human_availability,
      human_announcement_missing: r.human_announcement_missing,
      human_post_expiry_reference_value: r.human_post_expiry_reference_value,
      human_temporal_status: r.human_temporal_status,
      human_deadline_date: r.human_deadline_date,
      human_event_date: r.human_event_date,
      human_application_start: r.human_application_start,
      human_application_end: r.human_application_end,
      human_effective_until: r.human_effective_until,
      human_long_lived_information: r.human_long_lived_information,
      human_temporal_spans: r.human_temporal_spans || [],
      human_audience_reasons: r.human_audience_reasons || [],
      human_temporal_reasons: r.human_temporal_reasons || [],
      human_availability_reasons: r.human_availability_reasons || [],
      human_action_reasons: r.human_action_reasons || [],
      human_importance_reasons: r.human_importance_reasons || [],
      human_post_expiry_reasons: r.human_post_expiry_reasons || [],
      human_reasons: r.human_reasons || [],
      human_reason_review: r.human_reason_review || { confirmed: [], rejected: [], added: [] },
      reviewed_machine_reasons: r.human_reviewed_machine_reasons || [],
      human_reviewed_fields: r.human_reviewed_fields || [],
      human_machine_review: r.human_machine_review || {},
      modified_fields: Object.entries(r.human_machine_review || {}).filter(([, state]) => state === "corrected").map(([field]) => field).sort(),
      disagreement_fields: r.disagreement_fields || [],
      disagreement_details: r.disagreement_details || {},
      correction_reason: r.correction_reason || [],
      human_notes: r.human_notes || "",
      review_status: r.review_status || "unreviewed",
      label_source: r.label_source || "machine_prediction",
      reviewed_at: r.human_label ? new Date().toISOString() : null,
    };
  }

  function selectionRows(r, reviewId) {
    const machineReasons = new Set(r.machine_reasons || []);
    const reasonGroup = (code) => Object.keys(TAX).find((group) => Object.hasOwn(TAX[group], code)) || "other";
    const rr = r.human_reason_review || { confirmed: [], rejected: [], added: [] };
    const reviewed = new Set(r.human_reviewed_machine_reasons || []);
    const rows = [];
    for (const code of reviewed) {
      rows.push({ reason_code: code, reason_group: reasonGroup(code), origin: "machine",
        decision: (rr.rejected || []).includes(code) ? "rejected" : "accepted" });
    }
    const humanReasons = new Set([
      ...(r.human_audience_reasons || []), ...(r.human_temporal_reasons || []),
      ...(r.human_availability_reasons || []), ...(r.human_action_reasons || []),
      ...(r.human_importance_reasons || []), ...(r.human_post_expiry_reasons || []),
    ]);
    for (const code of humanReasons) if (!machineReasons.has(code))
      rows.push({ reason_code: code, reason_group: reasonGroup(code), origin: "human", decision: "supplemented" });
    return rows;
  }

  async function persistCloud() {
    if (!reviewer || !activeSession || !window.cloudReviewActive) return;
    persistChain = persistChain.catch(() => {}).then(async () => {
      const row = current();
      const state = {
        current_announcement_id: row?.announcement_id || null,
        current_position: Number(index || 0),
        queue_state: { undo_stack: (undoStack || []).slice(-40), mode: cloudMode },
        last_active_at: new Date().toISOString(),
      };
      const { error: sessionError } = await supabase.from("human_review_sessions")
        .update(state).eq("id", activeSession.id).eq("reviewer_id", reviewer.id);
      if (sessionError) throw sessionError;
      for (const [announcementId, dirtyRow] of [...dirtyHumanRows.entries()]) {
        computeDisagreements(dirtyRow);
        const { data: saved, error: reviewError } = await supabase.from("human_reviews")
          .upsert(toHumanRow(dirtyRow), { onConflict: "snapshot_id,announcement_id,reviewer_id" })
          .select("id").single();
        if (reviewError) throw reviewError;
        const { error: reasonError } = await supabase.rpc("replace_human_reason_selections", {
          p_human_review_id: saved.id,
          p_selections: selectionRows(dirtyRow, saved.id),
        });
        if (reasonError) throw reasonError;
        if (dirtyHumanRows.get(announcementId) === dirtyRow) dirtyHumanRows.delete(announcementId);
      }
    });
    await persistChain;
    $("saveState").textContent = "已同步至 Training Supabase";
    $("saveState").className = "pill state done";
  }

  async function exportCloud() {
    if (!activeSnapshot || !reviewer) return;
    try {
      await persistCloud();
      const pull = async (table, query) => {
        const { data, error } = await query;
        if (error) throw new Error(`${table}: ${error.message}`);
        return data || [];
      };
      const snapshots = await pull("snapshots", supabase.from("snapshots").select("*").eq("id", activeSnapshot));
      const raw = await pull("snapshot_announcements", supabase.from("snapshot_announcements").select("*").eq("snapshot_id", activeSnapshot));
      const contentObservations = await pull("snapshot_content_observations", supabase.from("snapshot_content_observations").select("*").eq("snapshot_id", activeSnapshot));
      const reviews = await pull("human_reviews", supabase.from("human_reviews").select("*").eq("snapshot_id", activeSnapshot).eq("reviewer_id", reviewer.id));
      const sessions = await pull("human_review_sessions", supabase.from("human_review_sessions").select("*").eq("snapshot_id", activeSnapshot).eq("reviewer_id", reviewer.id));
      const reviewIds = reviews.map((r) => r.id);
      const reasons = reviewIds.length ? await pull("human_reason_selections", supabase.from("human_reason_selections").select("*").in("human_review_id", reviewIds)) : [];
      const audit = reviewIds.length ? await pull("review_audit_events", supabase.from("review_audit_events").select("*").in("human_review_id", reviewIds).order("occurred_at")) : [];
      let runs = [], predictions = [], weights = [], evaluations = [];
      if (cloudMode === "machine_review") {
        runs = await pull("machine_runs", supabase.from("machine_runs").select("*").eq("snapshot_id", activeSnapshot).order("created_at"));
        const runIds = runs.map((r) => r.id);
        predictions = runIds.length ? await pull("machine_predictions", supabase.from("machine_predictions").select("*").in("machine_run_id", runIds)) : [];
        weights = await pull("weight_versions", supabase.from("weight_versions").select("*"));
        evaluations = await pull("evaluation_history", supabase.from("evaluation_history").select("*").eq("snapshot_id", activeSnapshot));
      }
      const bundle = {
        manifest: {
          format: "cloud-human-review-export-v1",
          exported_at: new Date().toISOString(),
          training_project_ref: "sshovpnepgswzvjwjuyz",
          production_source: { name: cfg.productionProjectName, ref: cfg.productionProjectRef, access: "read_only" },
          snapshot_id: activeSnapshot,
          review_mode: cloudMode,
          blind_export_omits_machine_artifacts: cloudMode === "blind",
          machine_labels_are_predictions_not_ground_truth: true,
          human_machine_separate: true,
        },
        raw_snapshot: { snapshots, snapshot_announcements: raw, snapshot_content_observations: contentObservations },
        machine_predictions: predictions,
        machine_runs: runs,
        human_reviews: reviews,
        human_review_sessions: sessions,
        human_reason_selections: reasons,
        review_audit_events: audit,
        weight_versions: weights,
        evaluation_history: evaluations,
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2) + "\n"], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `cloud-review-${activeSnapshot}-${cloudMode}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      note(cloudMode === "blind" ? "已匯出人工／snapshot 資料；盲測匯出未載入 machine artifacts" : "已匯出 snapshot、machine、human、audit 與版本資料");
    } catch (error) {
      reportSaveError(error);
    }
  }
  window.onCloudExport = exportCloud;

  function reportSaveError(error) {
    $("saveState").textContent = "雲端儲存失敗；本機暫存保留，請重試";
    $("saveState").className = "pill state corrected";
    setMessage(`雲端 autosave 失敗：${error?.message || error}`, true);
  }

  $("sendOtp").onclick = async () => {
    const email = $("authEmail").value.trim().toLowerCase();
    if (!email) { setMessage("請輸入你要登入的 email。", true); return; }
    $("sendOtp").disabled = true;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    $("sendOtp").disabled = false;
    if (error) { setMessage(`登入碼未寄出：${error.message}`, true); return; }
    $("otpWrap").classList.remove("hidden");
    setMessage(`登入碼已寄送至 ${email}。輸入登入碼後，系統會以登入 session 的 UID 判斷存取權；尚未核准時不會載入 review 資料。`);
  };
  $("verifyOtp").onclick = async () => {
    const email = $("authEmail").value.trim().toLowerCase();
    const token = $("authOtp").value.trim();
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error) { setMessage(`登入失敗：${error.message}`, true); return; }
    await verifyReviewer(data.session);
  };
  $("signOut").onclick = async () => {
    await supabase.auth.signOut();
    reviewer = null; reviewerApproved = false; activeSession = null; window.cloudReviewActive = false; data = null;
    $("reviewerPending").classList.add("hidden");
    $("cloudMode").disabled = true;
    $("cloudSignedIn").classList.add("hidden"); $("cloudSignedOut").classList.remove("hidden");
    $("workspace").classList.add("hidden"); setMessage("已登出；Training 資料不再載入。");
  };
  $("copyReviewerUid").onclick = async () => {
    const uid = $("reviewerUid").textContent;
    try { await navigator.clipboard.writeText(uid); setMessage("reviewer UID 已複製。核准前不會載入 review 資料。"); }
    catch { setMessage("請長按選取上方 UID 後複製；核准前不會載入 review 資料。", true); }
  };
  $("loadQueue").onclick = loadQueue;
  $("snapshotSelect").onchange = () => {
    activeSnapshot = $("snapshotSelect").value || null;
    activeManifest = snapshotById.get(activeSnapshot)?.manifest || null;
    $("loadQueue").disabled = !activeSnapshot;
    setQueueState(activeManifest?.review_queue?.announcement_ids?.length
      ? `${activeManifest.review_queue.announcement_ids.length} 筆 validation queue 待載入` : "未選取有效 snapshot");
  };
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session && !reviewer) verifyReviewer(session).catch((error) => setMessage(error.message, true));
  });
  const { data: initial } = await supabase.auth.getSession();
  if (initial.session) await verifyReviewer(initial.session);
})();
