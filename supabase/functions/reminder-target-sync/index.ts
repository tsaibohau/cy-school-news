import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"

type Target = {
  target_kind: "announcement_deadline" | "announcement_event" | "official_calendar_event"
  target_id: string
  target_at: string
  title: string
  source_url: string
  provenance: "official_announcement" | "official_calendar"
  source_revision: string
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

function validTarget(value: unknown): value is Target {
  const row = value as Partial<Target>
  return !!row && ["announcement_deadline", "announcement_event", "official_calendar_event"].includes(String(row.target_kind)) &&
    typeof row.target_id === "string" && row.target_id.length > 0 && row.target_id.length <= 240 &&
    typeof row.title === "string" && row.title.trim().length > 0 && row.title.length <= 500 &&
    typeof row.source_revision === "string" && row.source_revision.length > 0 && row.source_revision.length <= 240 &&
    typeof row.source_url === "string" && /^https:\/\//.test(row.source_url) &&
    typeof row.target_at === "string" && !Number.isNaN(new Date(row.target_at).getTime()) &&
    new Date(row.target_at) > new Date() &&
    ((row.target_kind === "official_calendar_event" && row.provenance === "official_calendar") ||
      (row.target_kind !== "official_calendar_event" && row.provenance === "official_announcement"))
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 })
  if (req.headers.get("x-reminder-target-sync-token") !== required("REMINDER_TARGET_SYNC_TOKEN")) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  const body = await req.json().catch(() => null) as { schema_version?: number; targets?: unknown[] } | null
  if (!body || body.schema_version !== 1 || !Array.isArray(body.targets) || body.targets.length > 1000 || !body.targets.every(validTarget)) {
    return Response.json({ error: "invalid_manifest" }, { status: 400 })
  }
  const client = createClient(required("SUPABASE_URL"), secretKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  for (const target of body.targets) {
    const { error: deactivateError } = await client.from("reminder_targets").update({ active: false })
      .is("owner_user_id", null).eq("target_kind", target.target_kind).eq("target_id", target.target_id)
      .neq("source_revision", target.source_revision)
    if (deactivateError) throw new Error(`deactivate_failed:${deactivateError.code || "unknown"}`)
    const { error: upsertError } = await client.from("reminder_targets").upsert({
      owner_user_id: null, ...target, timezone: "Asia/Taipei", active: true,
    }, { onConflict: "owner_user_id,target_kind,target_id,source_revision" })
    if (upsertError) throw new Error(`upsert_failed:${upsertError.code || "unknown"}`)
  }
  return Response.json({ accepted: body.targets.length })
})
