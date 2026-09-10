import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"

type RecordInput = {
  announcement_id: string
  summary: string
  snippet: string
  detail: Record<string, unknown> | null
  source_hash: string
}

const MAX_BODY_BYTES = 2_000_000
const MAX_DETAIL_BYTES = 600_000
const MAX_ATTACHMENTS = 40
const MAX_ATTACHMENT_TEXT = 120_000

function required(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`missing_${name.toLowerCase()}`)
  return value
}

function validCallerKey(req: Request): boolean {
  const supplied = req.headers.get("apikey")
  if (!supplied) return false
  const configured = new Set<string>()
  const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")
  if (publishableKeys) {
    for (const value of Object.values(JSON.parse(publishableKeys) as Record<string, string>)) {
      if (value) configured.add(value)
    }
  }
  const legacyAnonKey = Deno.env.get("SUPABASE_ANON_KEY")
  if (legacyAnonKey) configured.add(legacyAnonKey)
  return configured.has(supplied)
}

function secretKey(): string {
  const legacyServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (legacyServiceRoleKey) return legacyServiceRoleKey
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS")
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>
    if (parsed.default) return parsed.default
  }
  throw new Error("missing_supabase_admin_key")
}

function validDetail(detail: unknown, announcementId: string, sourceHash: string): detail is Record<string, unknown> {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return false
  const row = detail as Record<string, unknown>
  if (row.provenance !== "official_article") return false
  if (row.announcement_id !== announcementId) return false
  if (typeof row.source_hash !== "string" || row.source_hash.length > 160) return false
  if (sourceHash && row.source_hash !== sourceHash) return false
  const attachments = row.attachments
  if (attachments != null && !Array.isArray(attachments)) return false
  if (Array.isArray(attachments)) {
    if (attachments.length > MAX_ATTACHMENTS) return false
    for (const value of attachments) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false
      const attachment = value as Record<string, unknown>
      if (attachment.provenance !== "official_attachment") return false
      if (attachment.embedded_text != null &&
          (typeof attachment.embedded_text !== "string" || attachment.embedded_text.length > MAX_ATTACHMENT_TEXT)) return false
    }
  }
  try {
    return new TextEncoder().encode(JSON.stringify(row)).byteLength <= MAX_DETAIL_BYTES
  } catch (_error) {
    return false
  }
}

function validRecord(value: unknown): value is RecordInput {
  const row = value as Partial<RecordInput>
  if (!row || typeof row.announcement_id !== "string" || row.announcement_id.length < 1 || row.announcement_id.length > 180) return false
  if (typeof row.summary !== "string" || row.summary.length > 1200) return false
  if (typeof row.snippet !== "string" || row.snippet.length > 2000) return false
  if (typeof row.source_hash !== "string" || row.source_hash.length > 160) return false
  return row.detail === null || validDetail(row.detail, row.announcement_id, row.source_hash)
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 })
  if (!validCallerKey(req)) {
    return Response.json({ error: "invalid_apikey" }, { status: 401 })
  }
  if (req.headers.get("x-announcement-content-sync-token") !== required("ANNOUNCEMENT_CONTENT_SYNC_TOKEN")) {
    return Response.json({ error: "invalid_sync_token" }, { status: 401 })
  }

  const raw = await req.text().catch(() => "")
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413 })
  }
  let body: { schema_version?: number; records?: unknown[] } | null = null
  try {
    body = JSON.parse(raw)
  } catch (_error) {
    return Response.json({ error: "invalid_json" }, { status: 400 })
  }
  if (!body || body.schema_version !== 1 || !Array.isArray(body.records) || body.records.length > 400 || !body.records.every(validRecord)) {
    return Response.json({ error: "invalid_manifest" }, { status: 400 })
  }

  const client = createClient(required("SUPABASE_URL"), secretKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.rpc("upsert_announcement_member_content", { records: body.records })
  if (error) throw new Error(`upsert_failed:${error.code || "unknown"}`)
  return Response.json({ accepted: Number(data) || 0 })
})
