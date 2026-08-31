import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"

type RequestBody = { action?: string; username?: string; password?: string }
const usernamePattern = /^[a-z][a-z0-9_]{2,31}$/

function required(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`missing_${name.toLowerCase()}`)
  return value
}
function secretKey(): string {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS")
  if (keys) { const parsed = JSON.parse(keys) as Record<string, string>; if (parsed.default) return parsed.default }
  return required("SUPABASE_SERVICE_ROLE_KEY")
}
function publishableKey(): string {
  const keys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")
  if (keys) { const parsed = JSON.parse(keys) as Record<string, string>; if (parsed.default) return parsed.default }
  return required("SUPABASE_ANON_KEY")
}
function reply(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status, headers: {
    "access-control-allow-origin": "https://cy-school-news-staging.vercel.app",
    "access-control-allow-headers": "apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "vary": "origin",
  } })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return reply({ ok: true }, 200)
  if (req.method !== "POST" || req.headers.get("origin") !== "https://cy-school-news-staging.vercel.app") return reply({ error: "not_found" }, 404)
  const body = await req.json().catch(() => null) as RequestBody | null
  const username = String(body?.username || "").trim().toLowerCase()
  const password = body?.password
  if (body?.action !== "sign_in" || !usernamePattern.test(username) || typeof password !== "string" || password.length < 12 || password.length > 72) {
    return reply({ error: "invalid_credentials" }, 400)
  }
  const url = required("SUPABASE_URL")
  const server = createClient(url, secretKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: email, error: lookupError } = await server.rpc("username_login_email", { requested_username: username })
  if (lookupError || typeof email !== "string") return reply({ error: "invalid_credentials" }, 400)
  const authResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey(), "content-type": "application/json" },
    body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(10000),
  })
  if (!authResponse.ok) return reply({ error: "invalid_credentials" }, 400)
  const tokens = await authResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string }
  if (!tokens.access_token || !tokens.refresh_token) return reply({ error: "invalid_credentials" }, 400)
  return reply({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_in: tokens.expires_in, token_type: tokens.token_type }, 200)
})
