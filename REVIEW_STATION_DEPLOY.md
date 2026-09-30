# Round 1 Re-review Batch A No-Auth Review Station

This hosting branch serves a static, no-auth review station and the current adjudication batch.

- Entry: `index.html`
- Dataset source: `round-001-rereview-batch-a-data.js`, validated at build time and embedded as hidden HTML text for a single-file browser load
- Parent snapshot: `c7db661b-181a-4cd3-b869-b39f7edb3048`
- Parent round: `round_001`
- Batch: `round_001_rereview_a` (13 unique announcements)
- Browser fields: announcement ID, school, published date and date source, title, categories, available body, official URL, objective source/content/attachment status
- Browser storage: isolated localStorage key containing the batch ID and snapshot ID; reload restore and undo
- Export: `human_rereview_round_001_batch_a.json`; iPhone Safari uses the Web Share API
- Network: no Supabase browser client or browser writes
- Build output: `index.html` plus a separate adjudication page; the 13-record blind dataset stays embedded in its page and is not reused by adjudication

## Round 1 Adjudication — Batch A

- Entry: `/adjudication-round-001-batch-a.html`
- Queue: exactly 5 disagreements: `cygsh-147014`, `cygsh-185224`, `cysh-136699`, `cygsh-186125`, `cysh-136634`
- Browser data: frozen announcement metadata plus the original and re-review human records; no machine/evaluation data or selection reasons
- Storage: isolated key `cyNews.adjudication.round_001_adjudication_a.c7db661b`; independent of both review batches
- Export: `human_adjudication_round_001_batch_a.json`; iPhone Safari Share API retained
- Build output: adjudication page embeds only the five adjudication records; comparison artifact and private manifests are not part of the deployed output
- Future completed re-review exports set both the record and answer `review_status` to `completed` once the batch is complete
- No browser database client or writes; adjudication remains local until its JSON is separately validated

The private audit manifest is stored separately and is not part of the repository's Vercel output. It contains selection reasons; neither the manifest nor evaluation metadata is loaded by the browser.

Round 1 original human labels and the frozen machine predictions are not modified. Re-review answers remain local until exported and later validated server-side. No Training Supabase migration or import is part of this deployment.
