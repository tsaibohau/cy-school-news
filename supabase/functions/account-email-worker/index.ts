import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"

type OutboxMessage = {
  id: number
  recipient_email: string
  template: string
  payload: Record<string, unknown>
}

function required(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`missing_${name.toLowerCase()}`)
  return value
}

function secretKey(): string {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS")
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>
    if (parsed.default) return parsed.default
  }
  return required("SUPABASE_SERVICE_ROLE_KEY")
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!)
}

function contentFor(message: OutboxMessage): { subject: string; html: string } {
  const applicant = escapeHtml(message.payload?.applicant_email)
  const service = message.payload?.service_level === "timetable_only" ? "僅課表服務" : "完整服務"
  const templates: Record<string, { subject: string; body: string }> = {
    registration_notice: { subject: "嘉校快訊：有新的帳號申請", body: `新的帳號申請：${applicant || "請到管理介面查看"}` },
    access_reapplied: { subject: "嘉校快訊：帳號重新送審", body: `帳號已重新提出申請：${applicant || "請到管理介面查看"}` },
    access_approved: { subject: "嘉校快訊：帳號已核准", body: `你的帳號已核准，可使用${service}。` },
    access_rejected: { subject: "嘉校快訊：本次申請未通過", body: "你的本次申請未通過或存取權已移除。帳號沒有被列入黑名單，之後仍可重新送審。" },
    service_changed: { subject: "嘉校快訊：服務權限已更新", body: `你的服務權限已調整為「${service}」。` },
    coadmin_granted: { subject: "嘉校快訊：你已成為聯席管理員", body: "你現在可以審核一般帳號與調整服務，但不能新增或移除管理員。" },
    coadmin_revoked: { subject: "嘉校快訊：聯席管理員權限已移除", body: "你的聯席管理員權限已移除，一般帳號使用權不受影響。" },
  }
  const selected = templates[message.template] || { subject: "嘉校快訊：帳號異動", body: "你的嘉校快訊帳號狀態有新的異動。" }
  return {
    subject: selected.subject,
    html: `<div style="font-family:system-ui,sans-serif;line-height:1.7;color:#17332d"><h2>${escapeHtml(selected.subject)}</h2><p>${selected.body}</p><p><a href="https://tsaibohau.github.io/cy-school-news/">開啟嘉校快訊</a></p><p style="color:#667b76;font-size:13px">這是帳號管理通知，請勿直接回覆。</p></div>`,
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 })
  if (req.headers.get("x-account-email-worker-token") !== required("ACCOUNT_EMAIL_WORKER_TOKEN")) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { batchSize?: number }
  const batchSize = Number.isInteger(body.batchSize) ? Math.min(50, Math.max(1, body.batchSize!)) : 20
  const client = createClient(required("SUPABASE_URL"), secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.rpc("claim_account_email_outbox", { batch_size: batchSize })
  if (error) throw new Error(`claim_failed:${error.code || "unknown"}`)

  const messages = (data || []) as OutboxMessage[]
  const summary = { claimed: messages.length, sent: 0, failed: 0 }
  for (const message of messages) {
    const content = contentFor(message)
    let delivered = false
    let failure: string | null = null
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${required("RESEND_API_KEY")}`,
          "content-type": "application/json",
          "idempotency-key": `cynews-account-email-${message.id}`,
        },
        body: JSON.stringify({
          from: required("ACCOUNT_EMAIL_FROM"),
          to: [message.recipient_email],
          subject: content.subject,
          html: content.html,
        }),
        signal: AbortSignal.timeout(15000),
      })
      delivered = response.ok
      if (!response.ok) failure = `resend_http_${response.status}`
    } catch (error) {
      failure = error instanceof Error ? error.name : "delivery_failed"
    }

    const { error: finishError } = await client.rpc("finish_account_email_outbox", {
      message_id: message.id,
      delivered,
      failure,
    })
    if (finishError || !delivered) summary.failed += 1
    else summary.sent += 1
  }
  return Response.json(summary)
})
