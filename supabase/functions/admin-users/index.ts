import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"

type Body = { action?: "status" | "list" | "invite"; email?: string; username?: string }
const USERNAME = /^[a-z][a-z0-9_]{2,31}$/

function required(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error("missing_" + name.toLowerCase())
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
function origin(req: Request): string | null {
  const value = req.headers.get("origin")
  return value === "https://cy-school-news-staging.vercel.app" ? value : null
}
function reply(req: Request, body: Record<string, unknown>, status: number): Response {
  const allowed = origin(req)
  return Response.json(body, { status, headers: allowed ? {
    "access-control-allow-origin": allowed,
    "access-control-allow-headers": "apikey, authorization, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "vary": "origin",
  } : {} })
}
function normalizeEmail(value: unknown): string | null {
  const result = String(value ?? "").trim().toLowerCase()
  return result.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) ? result : null
}
function normalizeUsername(value: unknown): string | null {
  const result = String(value ?? "").trim().toLowerCase()
  return USERNAME.test(result) ? result : null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return reply(req, { ok: true }, 200)
  if (req.method !== "POST" || !origin(req)) return reply(req, { error: "not_found" }, 404)
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    if (!token) return reply(req, { error: "unauthorized" }, 401)
    const url = required("SUPABASE_URL")
    const callerClient = createClient(url, publishableKey(), {
      global: { headers: { Authorization: "Bearer " + token } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: callerData, error: callerError } = await callerClient.auth.getUser(token)
    const caller = callerData.user
    if (callerError || !caller) return reply(req, { error: "unauthorized" }, 401)

    const server = createClient(url, secretKey(), { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: admin, error: adminError } = await server
      .from("app_admins").select("user_id, revoked_at").eq("user_id", caller.id).maybeSingle()
    if (adminError || !admin || admin.revoked_at) return reply(req, { error: "forbidden" }, 403)

    const body = await req.json().catch(() => null) as Body | null
    if (body?.action === "status") return reply(req, { admin: true }, 200)

    if (body?.action === "list") {
      const { data, error } = await server.auth.admin.listUsers({ page: 1, perPage: 200 })
      if (error) throw error
      return reply(req, { users: (data.users || []).map((user) => ({
        id: user.id, email: user.email || "", created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at, banned_until: user.banned_until,
      })) }, 200)
    }

    if (body?.action === "invite") {
      const email = normalizeEmail(body.email)
      const username = normalizeUsername(body.username)
      if (!email || !username) return reply(req, { error: "invalid_input" }, 400)
      const { data, error } = await server.auth.admin.inviteUserByEmail(email, {
        data: { pending_username: username },
        redirectTo: "https://cy-school-news-staging.vercel.app/",
      })
      if (error) return reply(req, { error: "invite_failed" }, 400)
      const audit = await server.from("admin_audit_log").insert({
        actor_id: caller.id, action: "invite_requested", target_user_id: data.user?.id ?? null, target_email: email,
      })
      if (audit.error) throw audit.error
      return reply(req, { invited: true }, 201)
    }
    return reply(req, { error: "invalid_action" }, 400)
  } catch (error) {
    console.error("admin-users failure", error)
    return reply(req, { error: "server_error" }, 500)
  }
})
