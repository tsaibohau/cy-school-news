// Pure logic for restricted-data-sync. No network or env access here,
// so the same file runs in the Edge Function (Deno) and in Node tests.

export const BUCKET = "restricted-data"
export const MAX_OBJECT_BYTES = 8 * 1024 * 1024
export const NAME_PATTERN = /^[A-Za-z0-9._/-]{1,160}$/
export const TOKEN_HEADER = "x-announcement-content-sync-token"

export function validName(name) {
  if (typeof name !== "string" || !NAME_PATTERN.test(name)) return false
  if (name.includes("..") || name.startsWith("/") || name.includes("//")) return false
  return true
}

// Constant-time comparison: never short-circuits on content.
export function constantTimeEqual(a, b) {
  const enc = new TextEncoder()
  const x = enc.encode(String(a ?? ""))
  const y = enc.encode(String(b ?? ""))
  let diff = x.length ^ y.length
  const n = Math.max(x.length, y.length)
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

// env: { publishableKeys: string[], anonKey?: string, token?: string }
// Returns null when authorised, otherwise { status, error } with a safe code.
export function checkAuth(headers, env) {
  const get = (k) => (typeof headers.get === "function" ? headers.get(k) : headers[k]) || ""
  const keys = [...(env.publishableKeys || []), env.anonKey].filter(Boolean)
  const apikey = get("apikey")
  let keyOk = false
  for (const key of keys) keyOk = constantTimeEqual(apikey, key) || keyOk
  if (!apikey || !keyOk) return { status: 401, error: "invalid_apikey" }
  const configured = env.token || ""
  const supplied = get(TOKEN_HEADER)
  if (!configured || !supplied || !constantTimeEqual(supplied, configured)) {
    return { status: 401, error: "invalid_sync_caller" }
  }
  return null
}

// Decide what a request asks for. Returns { action, name? } or { status, error }.
export function route(method, searchParams) {
  const m = String(method || "").toUpperCase()
  if (m !== "GET" && m !== "PUT" && m !== "DELETE") return { status: 405, error: "method_not_allowed" }
  if (m === "GET" && searchParams.get("list") === "1") return { action: "list" }
  const name = searchParams.get("name")
  if (!validName(name)) return { status: 400, error: "invalid_name" }
  if (m === "GET") return { action: "get", name }
  if (m === "PUT") return { action: "put", name }
  return { action: "delete", name }
}

export function isHexSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
}

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

// Validates an upload body against its declared hash and size cap.
// Returns { ok: true, sha256 } or { ok: false, status, error }.
export async function checkUpload(bytes, declaredSha) {
  if (!bytes || bytes.byteLength === 0) return { ok: false, status: 400, error: "empty_body" }
  if (bytes.byteLength > MAX_OBJECT_BYTES) return { ok: false, status: 413, error: "payload_too_large" }
  const declared = String(declaredSha || "").toLowerCase()
  if (!isHexSha256(declared)) return { ok: false, status: 400, error: "invalid_sha256" }
  const actual = await sha256Hex(bytes)
  if (actual !== declared) return { ok: false, status: 400, error: "sha256_mismatch" }
  return { ok: true, sha256: actual }
}

// Only these error strings may reach a response body.
export function safeError(error) {
  const message = error instanceof Error ? error.message : ""
  return /^missing_[a-z_]+$/.test(message) ? message : "internal_error"
}
