-- Training only. Raw content lives only in private Storage.
CREATE TABLE public.autonomous_allowed_commits (
  sha text PRIMARY KEY CHECK (sha ~ '^[a-f0-9]{40}$'),
  expires_at timestamptz NOT NULL
);
CREATE TABLE public.autonomous_backend_access (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.autonomous_allowed_commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autonomous_backend_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.autonomous_allowed_commits, public.autonomous_backend_access FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.autonomous_allowed_commits, public.autonomous_backend_access TO service_role;
-- No policies grant browser roles access to control tables or Storage.
-- Generate a scoped backend token server-side; never return its plaintext.
DO $$ DECLARE token text; BEGIN
  token := encode(extensions.gen_random_bytes(32),'hex');
  PERFORM vault.create_secret(token,'autonomous-corpus-control','Training corpus backend control; rotate after experiment');
  INSERT INTO public.autonomous_backend_access VALUES
    (encode(extensions.digest(token,'sha256'),'hex'),now()+interval '2 days');
END $$;
