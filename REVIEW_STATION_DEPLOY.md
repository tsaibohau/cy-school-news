# Round 1 Re-review Batch A No-Auth Review Station

This hosting branch serves one static, no-auth human re-review batch.

- Entry: `index.html`
- Dataset: `round-001-rereview-batch-a-data.js`
- Parent snapshot: `c7db661b-181a-4d3c-b869-b39f7edb3048`
- Parent round: `round_001`
- Batch: `round_001_rereview_a` (13 unique announcements)
- Browser fields: announcement ID, school, published date and date source, title, categories, available body, official URL, objective source/content/attachment status
- Browser storage: isolated localStorage key containing the batch ID and snapshot ID; reload restore and undo
- Export: `human_rereview_round_001_batch_a.json`; iPhone Safari uses the Web Share API
- Network: no Supabase browser client or browser writes
- Build output: only `index.html` and the 13-record dataset

The private audit manifest is stored separately and is not part of the repository's Vercel output. It contains selection reasons; neither the manifest nor evaluation metadata is loaded by the browser.

Round 1 original human labels and the frozen machine predictions are not modified. Re-review answers remain local until exported and later validated server-side. No Training Supabase migration or import is part of this deployment.
