-- Enforce capability checks on protected member announcement RPCs and tighten RPC grants.
create or replace function public.member_announcement_index(page_size integer default 200, page_offset integer default 0)
returns table(announcement_id text, summary text, snippet text, source_hash text, updated_at timestamptz)
language plpgsql stable security definer set search_path='pg_catalog','public','private' as $$
begin
  if auth.uid() is null or not public.has_account_capability('member_content') then return; end if;
  if page_size < 1 or page_size > 500 or page_offset < 0 or page_offset > 100000 then raise exception 'invalid announcement page' using errcode='22023'; end if;
  return query select c.announcement_id,c.summary,c.snippet,c.source_hash,c.updated_at from private.announcement_member_content c order by c.announcement_id limit page_size offset page_offset;
end; $$;
create or replace function public.member_announcement_detail(target_announcement_id text)
returns table(announcement_id text, detail jsonb, source_hash text, updated_at timestamptz)
language plpgsql stable security definer set search_path='pg_catalog','public','private' as $$
begin
  if auth.uid() is null or not public.has_account_capability('member_content') then return; end if;
  if target_announcement_id is null or char_length(target_announcement_id)<1 or char_length(target_announcement_id)>180 then raise exception 'invalid announcement id' using errcode='22023'; end if;
  return query select c.announcement_id,c.detail,c.source_hash,c.updated_at from private.announcement_member_content c where c.announcement_id=target_announcement_id;
end; $$;
revoke execute on function public.has_account_capability(text) from public,anon;
revoke execute on function public.current_account_capabilities() from public,anon;
revoke execute on function public.admin_set_account_capabilities(uuid,jsonb) from public,anon;
revoke execute on function public.member_announcement_index(integer,integer) from public,anon;
revoke execute on function public.member_announcement_detail(text) from public,anon;
grant execute on function public.has_account_capability(text), public.current_account_capabilities(), public.admin_set_account_capabilities(uuid,jsonb), public.member_announcement_index(integer,integer), public.member_announcement_detail(text) to authenticated;
