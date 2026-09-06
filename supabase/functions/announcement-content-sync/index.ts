import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"

type RecordInput = {
  announcement_id: string
  summary: string
  snippet: string
  detail: null
  source_hash: string
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

function validRecord(value: unknown): value is RecordInput {
  const row = value as Partial<RecordInput>
  return !!row && typeof row.announcement_id === "string" && row.announcement_id.length > 0 && row.announcement_id.length <= 180 &&
    typeof row.summary === "string" && row.summary.length <= 1200 &&
    typeof row.snippet === "string" && row.snippet.length <= 2000 &&
    row.detail === null && typeof row.source_hash === "string" && row.source_hash.length <= 160
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 })
  if (req.headers.get("x-announcement-content-sync-token") !== required("ANNOUNCEMENT_CONTENT_SYNC_TOKEN")) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  const body = await req.json().catch(() => null) as { schema_version?: number; records?: unknown[] } | null
  if (!body || body.schema_version !== 1 || !Array.isArray(body.records) || body.records.length > 400 || !body.records.every(validRecord)) {
    return Response.json({ error: "invalid_manifest" }, { status: 400 })
  }
  const client = createClient(required("SUPABASE_URL"), secretKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.rpc("upsert_announcement_member_content", { records: body.records })
  if (error) throw new Error(`upsert_failed:${error.code || "unknown"}`)
  return Response.json({ accepted: Number(data) || 0 })
})
