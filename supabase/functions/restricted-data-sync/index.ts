import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"
import { BUCKET, MAX_OBJECT_BYTES, checkAuth, checkUpload, route, safeError, sha256Hex } from "./logic.js"

// Private-bucket proxy for scraper state of non-public schools. Same caller auth as
// announcement-content-sync (publishable apikey + shared sync token); writes use the service role.

function required(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`missing_${name.toLowerCase()}`)
  return value
}

function parseMap(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    return Object.values(JSON.parse(raw) as Record<string, string>).filter(Boolean)
  } catch (_error) {
    return []
  }
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

const fail = (error: string, status: number) => Response.json({ error }, { status })

type Listed = { name: string; updated_at: string | null }

// Recursively list every object under prefix (folders come back with id === null).
// deno-lint-ignore no-explicit-any
async function listAll(bucket: any, prefix = ""): Promise<Listed[]> {
  const out: Listed[] = []
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await bucket.list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } })
    if (error) throw new Error("storage_list_failed")
    for (const item of data || []) {
      const full = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id === null) out.push(...(await listAll(bucket, full)))
      else out.push({ name: full, updated_at: item.updated_at ?? item.created_at ?? null })
    }
    if (!data || data.length < 100) break
  }
  return out
}

Deno.serve(async (req) => {
  try {
    const routed = route(req.method, new URL(req.url).searchParams)
    if (routed.error) return fail(routed.error, routed.status as number)

    const denied = checkAuth(req.headers, {
      publishableKeys: parseMap(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")),
      anonKey: Deno.env.get("SUPABASE_ANON_KEY") || undefined,
      token: Deno.env.get("ANNOUNCEMENT_CONTENT_SYNC_TOKEN") || undefined,
    })
    if (denied) return fail(denied.error, denied.status)

    const client = createClient(required("SUPABASE_URL"), secretKey(), { auth: { persistSession: false, autoRefreshToken: false } })
    const bucket = client.storage.from(BUCKET)

    if (routed.action === "list") {
      // Storage metadata has no content hash we control, so hash each object with native crypto
      // (sequentially: one object in memory at a time). Payloads are never JSON-parsed.
      const entries = []
      for (const item of await listAll(bucket)) {
        const { data, error } = await bucket.download(item.name)
        if (error || !data) return fail("storage_read_failed", 502)
        const bytes = new Uint8Array(await data.arrayBuffer())
        entries.push({ name: item.name, bytes: bytes.byteLength, sha256: await sha256Hex(bytes), updated_at: item.updated_at })
      }
      return Response.json(entries)
    }

    if (routed.action === "get") {
      const { data, error } = await bucket.download(routed.name)
      if (error || !data) return fail("not_found", 404)
      return new Response(data, { headers: { "content-type": "application/gzip", "cache-control": "no-store" } })
    }

    if (routed.action === "put") {
      if (Number(req.headers.get("content-length") || 0) > MAX_OBJECT_BYTES) return fail("payload_too_large", 413)
      const bytes = new Uint8Array(await req.arrayBuffer())
      const checked = await checkUpload(bytes, req.headers.get("x-sha256"))
      if (!checked.ok) return fail(checked.error, checked.status)
      const { error } = await bucket.upload(routed.name, bytes, { upsert: true, contentType: "application/gzip" })
      if (error) return fail("storage_write_failed", 502)
      return Response.json({ name: routed.name, bytes: bytes.byteLength, sha256: checked.sha256 })
    }

    const { error } = await bucket.remove([routed.name])
    if (error) return fail("storage_delete_failed", 502)
    return Response.json({ name: routed.name, deleted: true })
  } catch (error) {
    return fail(safeError(error), 500)
  }
})
