-- Keep the archive publication date derived from the immutable source snapshot.
-- This also corrects rows written by the initial Preview migration.
create or replace function private.set_archive_publish_date()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, private
as $$
begin
  if coalesce(new.original_metadata->>'date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    new.original_publish_date := (new.original_metadata->>'date')::date;
  end if;
  return new;
end;
$$;

drop trigger if exists announcement_archive_publish_date_guard on private.announcement_archive;
create trigger announcement_archive_publish_date_guard
before insert or update of original_metadata on private.announcement_archive
for each row execute function private.set_archive_publish_date();

update private.announcement_archive
set original_publish_date=(original_metadata->>'date')::date
where coalesce(original_metadata->>'date','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  and original_publish_date is distinct from (original_metadata->>'date')::date;

revoke all on function private.set_archive_publish_date() from public, anon, authenticated;
