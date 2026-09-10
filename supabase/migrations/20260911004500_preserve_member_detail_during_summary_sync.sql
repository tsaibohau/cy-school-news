-- Preserve previously verified private detail when a later metadata-only sync
-- has no fresh detail sidecar. This allows bounded attachment backfill to
-- accumulate safely across scrape runs instead of being erased by null rows.
create or replace function public.upsert_announcement_member_content(records jsonb)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, private
as $$
declare
  affected integer;
begin
  if jsonb_typeof(records) <> 'array' or jsonb_array_length(records) > 500 then
    raise exception 'invalid announcement batch' using errcode = '22023';
  end if;

  insert into private.announcement_member_content as existing
    (announcement_id, summary, snippet, detail, source_hash, updated_at)
  select btrim(row.announcement_id), left(coalesce(row.summary, ''), 1200),
         left(coalesce(row.snippet, ''), 2000), row.detail,
         left(coalesce(row.source_hash, ''), 160), now()
  from jsonb_to_recordset(records) as row(
    announcement_id text, summary text, snippet text, detail jsonb, source_hash text
  )
  where char_length(btrim(coalesce(row.announcement_id, ''))) between 1 and 180
  on conflict (announcement_id) do update set
    summary = excluded.summary,
    snippet = excluded.snippet,
    detail = coalesce(excluded.detail, existing.detail),
    source_hash = case
      when excluded.detail is null and excluded.source_hash = ''
        then existing.source_hash
      else excluded.source_hash
    end,
    updated_at = excluded.updated_at;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.upsert_announcement_member_content(jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_announcement_member_content(jsonb) to service_role;
