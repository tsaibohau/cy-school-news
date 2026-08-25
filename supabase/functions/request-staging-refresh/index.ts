import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"

const STAGING_ORIGIN = "https://cy-school-news-staging.vercel.app"
const REPOSITORY = "tsaibohau/cy-school-news"
const WORKFLOW = "staging-user-refresh.yml"

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

function publishableKey(): string {
  const keys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>
    if (parsed.default) return parsed.default
  }
  return required("SUPABASE_ANON_KEY")
}

function response(body: Record<string, unknown>, status: number, origin: string): Response {
  return Response.json(body, { status, headers: {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, apikey, content-type, x-idempotency-key",
    "access-control-allow-methods": "POST, OPTIONS",
    "vary": "origin",
  } })
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || ""
  if (origin !== STAGING_ORIGIN) return Response.json({ error: "origin_denied" }, { status: 403 })
  if (req.method === "OPTIONS") return response({ ok: true }, 200, origin)
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405, origin)

  const authorization = req.headers.get("authorization") || ""
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : ""
  const idempotencyKey = req.headers.get("x-idempotency-key") || ""
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return response({ error: "invalid_idempotency_key" }, 400, origin)
  }
  if (!token) return response({ error: "unauthorized" }, 401, origin)

  const authClient = createClient(required("SUPABASE_URL"), publishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: authData, error: authError } = await authClient.auth.getUser(token)
  if (authError || !authData.user?.id) return response({ error: "unauthorized" }, 401, origin)

  const server = createClient(required("SUPABASE_URL"), secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await server.rpc("claim_staging_refresh", {
    requested_user_id: authData.user.id,
    requested_idempotency_key: idempotencyKey,
    per_user_cooldown_seconds: 300,
    global_cooldown_seconds: 120,
  })
  if (error || !Array.isArray(data) || !data[0]) return response({ error: "claim_failed" }, 503, origin)
  const claim = data[0] as { request_id: string; decision: string; retry_after_seconds: number }
  if (claim.decision === "rate_limited") {
    return response({ status: "rate_limited", retryAfterSeconds: Math.max(1, claim.retry_after_seconds || 1) }, 429, origin)
  }
  if (claim.decision === "duplicate") return response({ status: "already_requested" }, 202, origin)
  if (claim.decision !== "accepted") return response({ error: "claim_rejected" }, 503, origin)

  let dispatchStatus = 0
  try {
    const dispatch = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      headers: {
        "accept": "application/vnd.github+json",
        "authorization": `Bearer ${required("GITHUB_REFRESH_TOKEN")}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "cy-school-news-staging-refresh",
      },
      body: JSON.stringify({ ref: "staging", inputs: { request_id: claim.request_id } }),
      signal: AbortSignal.timeout(10000),
    })
    dispatchStatus = dispatch.status
  } catch (_) {
    dispatchStatus = 0
  }

  const dispatched = dispatchStatus >= 200 && dispatchStatus < 300
  await server.rpc("finish_staging_refresh_dispatch", {
    refresh_request_id: claim.request_id,
    dispatch_succeeded: dispatched,
    safe_error_code: dispatched ? null : `github_${dispatchStatus || "network"}`,
  })
  return dispatched
    ? response({ status: "accepted" }, 202, origin)
    : response({ error: "dispatch_failed" }, 502, origin)
})
