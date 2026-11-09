# restricted-data live check (manual, not run in CI)

Run after the migration and the `restricted-data-sync` function are deployed. Use shell variables only;
never paste real tokens into files or chat logs.

```
BASE=https://<project-ref>.supabase.co
PUB=<publishable key>            # public by design
TOKEN=<ANNOUNCEMENT_CONTENT_SYNC_TOKEN>   # from the GitHub secret / Supabase secret
FN=$BASE/functions/v1/restricted-data-sync
```

## 1. Edge Function auth
| Call | Expect |
|---|---|
| `curl -si "$FN?list=1"` | 401 (no apikey) |
| `curl -si -H "apikey: $PUB" "$FN?list=1"` | 401 `invalid_sync_caller` |
| `curl -si -H "apikey: $PUB" -H "x-announcement-content-sync-token: wrong" "$FN?list=1"` | 401 `invalid_sync_caller`, body must not contain either value |
| `curl -si -H "apikey: wrong" -H "x-announcement-content-sync-token: $TOKEN" "$FN?list=1"` | 401 |
| both headers correct, `?list=1` | 200 JSON array (`[]` before the first split) |
| `?name=../x`, `?name=/abs`, no name | 400 `invalid_name` |
| `POST` | 405 |

## 2. Round trip (use an invented object name)
```
printf '{"items":[]}' | gzip -c > t.gz; SHA=$(sha256sum t.gz | cut -d' ' -f1)
H=(-H "apikey: $PUB" -H "x-announcement-content-sync-token: $TOKEN")
curl -s -X PUT "${H[@]}" -H "x-sha256: $SHA" --data-binary @t.gz "$FN?name=zz-live-check/t.json.gz"   # {name,bytes,sha256}
curl -s -X PUT "${H[@]}" -H "x-sha256: $(printf 0%.0s {1..64})" --data-binary @t.gz "$FN?name=zz-live-check/t.json.gz"  # 400 sha256_mismatch
curl -s "${H[@]}" "$FN?name=zz-live-check/t.json.gz" | sha256sum    # equals $SHA
curl -s "${H[@]}" "$FN?list=1"                                      # contains the entry with same sha256
curl -s -X DELETE "${H[@]}" "$FN?name=zz-live-check/t.json.gz"
```
Re-upload one object first if you need something to read in step 3 (delete it afterwards).

## 3. Storage RLS (object `zz-live-check/t.json.gz` present)
Direct Storage API with a user JWT, `Authorization: Bearer <jwt>`, `apikey: $PUB`:
- Anon (publishable key only, no user JWT):
  - `GET $BASE/storage/v1/object/restricted-data/zz-live-check/t.json.gz` -> 400/404 (not found)
  - `GET $BASE/storage/v1/object/public/restricted-data/zz-live-check/t.json.gz` -> 400/404 (bucket not public)
  - `POST $BASE/storage/v1/object/list/restricted-data` body `{"prefix":"zz-live-check","limit":10}` -> `[]`
- Ordinary approved member (not in `app_admins`): same list call -> `[]`; authenticated object GET -> 400/404; PUT/DELETE -> denied.
- Active owner / co_admin: list -> contains `t.json.gz`; `GET $BASE/storage/v1/object/authenticated/restricted-data/zz-live-check/t.json.gz` -> 200 and the gzip bytes. PUT/DELETE as admin -> still denied (no write policies).
- Revoked admin (`revoked_at` set) -> `[]`.

## 4. SQL spot checks (read-only, SQL editor)
```
select id, public, file_size_limit from storage.buckets where id = 'restricted-data';   -- public=false, 8388608
select policyname, cmd, roles from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'restricted_data%';  -- one row, SELECT, {authenticated}
select has_function_privilege('anon','public.can_read_restricted_data()','execute');   -- false
```

Clean up: delete `zz-live-check/*` via the function (DELETE) when done.
