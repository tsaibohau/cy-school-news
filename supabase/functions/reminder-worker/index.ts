import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"
import webpush from "web-push"

type ClaimedDelivery = {
  delivery_id: string
  delivery_lease_token: string
  endpoint: string
  p256dh: string
  auth: string
  target_kind: string
  target_id: string
  target_at: string
  offset_days: number
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

function outcomeForStatus(status: number | undefined): "invalid" | "retry" | "dead" {
  if (status === 404 || status === 410) return "invalid"
  if (status === 408 || status === 429 || (status !== undefined && status >= 500)) return "retry"
  return "dead"
}

function payloadFor(delivery: ClaimedDelivery): string {
  const labels: Record<string, string> = {
    announcement_deadline: "公告截止提醒",
    announcement_event: "公告活動提醒",
    official_calendar_event: "校曆提醒",
    task_due: "任務到期提醒",
    manual: "手動提醒",
  }
  const targetTime = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(delivery.target_at))
  return JSON.stringify({
    title: labels[delivery.target_kind] || "提醒",
    body: `${targetTime} · ${delivery.target_id}`,
    tag: `reminder:${delivery.delivery_id}`,
    data: {
      kind: "reminder",
      targetKind: delivery.target_kind,
      targetId: delivery.target_id,
      targetAt: delivery.target_at,
      offsetDays: delivery.offset_days,
    },
  })
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 })
  }
  const expectedToken = required("REMINDER_WORKER_TOKEN")
  if (req.headers.get("x-reminder-worker-token") !== expectedToken) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { batchSize?: number }
  const batchSize = Number.isInteger(body.batchSize) ? Math.min(100, Math.max(1, body.batchSize!)) : 25
  const client = createClient(required("SUPABASE_URL"), secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  webpush.setVapidDetails(
    required("VAPID_SUBJECT"),
    required("VAPID_PUBLIC_KEY"),
    required("VAPID_PRIVATE_KEY"),
  )

  const { data, error } = await client.rpc("claim_reminder_deliveries", {
    batch_size: batchSize,
    lease_seconds: 90,
  })
  if (error) throw new Error(`claim_failed:${error.code || "unknown"}`)

  const deliveries = (data || []) as ClaimedDelivery[]
  const summary = { claimed: deliveries.length, sent: 0, invalid: 0, retry: 0, dead: 0, finalizeFailed: 0 }
  for (const delivery of deliveries) {
    let outcome: "sent" | "invalid" | "retry" | "dead" = "sent"
    let httpStatus: number | null = null
    let errorCode: string | null = null
    try {
      const result = await webpush.sendNotification({
        endpoint: delivery.endpoint,
        keys: { p256dh: delivery.p256dh, auth: delivery.auth },
      }, payloadFor(delivery), { TTL: 86400 })
      httpStatus = result.statusCode
    } catch (error) {
      const pushError = error as { statusCode?: number; code?: string; name?: string }
      httpStatus = pushError.statusCode ?? null
      errorCode = pushError.code || pushError.name || "web_push_failed"
      outcome = outcomeForStatus(pushError.statusCode)
    }

    const { data: finalized, error: finishError } = await client.rpc("finish_reminder_delivery", {
      delivery_id: delivery.delivery_id,
      delivery_lease_token: delivery.delivery_lease_token,
      outcome,
      http_status: httpStatus,
      error_code: errorCode,
    })
    if (finishError || finalized !== true) summary.finalizeFailed += 1
    else summary[outcome] += 1
  }
  return Response.json(summary)
})
