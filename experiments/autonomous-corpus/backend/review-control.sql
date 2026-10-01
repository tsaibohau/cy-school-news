-- Apply only after private model inference freeze passes its audit.
CREATE TABLE public.autonomous_review_capabilities (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  batch_path text NOT NULL CHECK(batch_path ~ '^runs/[0-9]+/batch-[ab]-review\.json$'),
  expires_at timestamptz NOT NULL,
  enabled boolean NOT NULL DEFAULT false
);
ALTER TABLE public.autonomous_review_capabilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.autonomous_review_capabilities FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.autonomous_review_capabilities TO service_role;
