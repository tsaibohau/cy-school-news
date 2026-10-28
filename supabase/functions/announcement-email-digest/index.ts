import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"
import {
  DEFAULTS,
  buildEmail,
  isDue,
  selectItems,
  unsubscribeToken,
  verifyUnsubscribeToken,
} from "./digest.js"

type Recipient = {
  user_id: string
  email: string
  frequency: "instant" | "daily"
  enabled_at: string
  keywords: string[]
  sent_ids: string[]
  last_sent_at: string | null
}

const SITE_URL = "https://tsaibohau.github.io/cy-school-news/"

function required(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`missing_${name.toLowerCase()}`)
  return value
}

function optionalInt(name: string, fallback: number): number {
  const value = Number(Deno.env.get(name))
  return Number.isInteger(value) && value >= 0 ? value : fallback
}

function secretKey(): string {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS")
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>
    if (parsed.default) return parsed.default
  }
  return required("SUPABASE_SERVICE_ROLE_KEY")
}

function adminClient() {
  return createClient(required("SUPABASE_URL"), secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function page(message: string, status = 200): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>嘉校快訊</title><body style="font-family:system-ui,sans-serif;padding:32px;color:#17332d">` +
      `<p>${message}</p><p><a href="${SITE_URL}">回到嘉校快訊</a></p></body>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  )
}

async function handleUnsubscribe(url: URL): Promise<Response> {
  const userId = url.searchParams.get("u") || ""
  const token = url.searchParams.get("t") || ""
  if (!(await verifyUnsubscribeToken(required("EMAIL_DIGEST_UNSUBSCRIBE_SECRET"), userId, token))) {
    return page("取消連結無效或已過期，請到網站「我的 → 關鍵字追蹤」關閉 Email 通知。", 400)
  }
  const { error } = await adminClient().rpc("email_digest_unsubscribe", { target_user_id: userId })
  if (error) return page("暫時無法處理，請稍後再試。", 500)
  return page("已取消 Email 通知。之後可在網站重新開啟。")
}

async function loadAnnouncements(): Promise<{ items: unknown[]; schoolNames: Record<string, string> }> {
  const source = Deno.env.get("EMAIL_DIGEST_ANNOUNCEMENTS_URL") || `${SITE_URL}data/announcements.json`
  const response = await fetch(`${source}?_=${Date.now()}`, { signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`announcements_http_${response.status}`)
  const data = await response.json() as { items?: unknown[]; schools?: { id: string; short?: string; name?: string }[] }
  const schoolNames: Record<string, string> = {}
  for (const school of data.schools || []) schoolNames[school.id] = school.short || school.name || school.id
  return { items: Array.isArray(data.items) ? data.items : [], schoolNames }
}

async function runDigest(dryRun: boolean): Promise<Response> {
  const now = new Date()
  const client = adminClient()
  const options = {
    schools: (Deno.env.get("EMAIL_DIGEST_SCHOOLS") || DEFAULTS.schools.join(","))
      .split(",").map((value) => value.trim()).filter(Boolean),
    dailyHourTaipei: optionalInt("EMAIL_DIGEST_DAILY_HOUR", DEFAULTS.dailyHourTaipei),
  }
  // Stay under the email provider's daily quota (Resend free plan: 100/day).
  const dailyCap = optionalInt("EMAIL_DIGEST_DAILY_CAP", 90)
  const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const { data: sentToday, error: countError } = await client.rpc("email_digest_sent_since", { since: dayStart.toISOString() })
  if (countError) throw new Error(`count_failed:${countError.code || "unknown"}`)
  let remaining = Math.max(0, dailyCap - Number(sentToday || 0))

  const { data, error } = await client.rpc("email_digest_recipients")
  if (error) throw new Error(`recipients_failed:${error.code || "unknown"}`)
  const recipients = (data || []) as Recipient[]
  const due = recipients.filter((recipient) => isDue(recipient, now, options))
  const summary = { recipients: recipients.length, due: due.length, sent: 0, empty: 0, failed: 0, quota_skipped: 0, dry_run: dryRun }
  if (!due.length) return Response.json(summary)

  const { items, schoolNames } = await loadAnnouncements()
  const secret = required("EMAIL_DIGEST_UNSUBSCRIBE_SECRET")
  const functionUrl = required("EMAIL_DIGEST_FUNCTION_URL")
  for (const recipient of due) {
    const picked = selectItems(items, recipient, now, options)
    if (!picked.length) { summary.empty += 1; continue }
    if (remaining <= 0) { summary.quota_skipped += 1; continue }
    if (dryRun) { summary.sent += 1; continue }

    const token = await unsubscribeToken(secret, recipient.user_id)
    const unsubscribeUrl = `${functionUrl}?action=unsubscribe&u=${recipient.user_id}&t=${token}`
    const content = buildEmail(picked, { siteUrl: SITE_URL, unsubscribeUrl, frequency: recipient.frequency, schoolNames })
    const ids = picked.map(({ item }: { item: { id: string } }) => item.id)
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${required("RESEND_API_KEY")}`,
          "content-type": "application/json",
          "idempotency-key": `cynews-digest-${recipient.user_id}-${ids[0]}-${ids.length}`,
        },
        body: JSON.stringify({
          from: Deno.env.get("EMAIL_DIGEST_FROM") || required("ACCOUNT_EMAIL_FROM"),
          to: [recipient.email],
          subject: content.subject,
          html: content.html,
          text: content.text,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) { summary.failed += 1; continue }
    } catch {
      summary.failed += 1
      continue
    }
    remaining -= 1
    const { error: recordError } = await client.rpc("record_email_digest", {
      target_user_id: recipient.user_id,
      digest_frequency: recipient.frequency,
      announcement_ids: ids,
    })
    if (recordError) summary.failed += 1
    else summary.sent += 1
  }
  return Response.json(summary)
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  // Unsubscribe links work from the email (GET) and from mail clients' one-click POST.
  if (url.searchParams.get("action") === "unsubscribe" && (req.method === "GET" || req.method === "POST")) {
    return handleUnsubscribe(url)
  }
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 })
  if (req.headers.get("x-email-digest-worker-token") !== required("EMAIL_DIGEST_WORKER_TOKEN")) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  const body = await req.json().catch(() => ({})) as { dryRun?: boolean }
  try {
    return await runDigest(body.dryRun === true)
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "digest_failed" }, { status: 500 })
  }
})
