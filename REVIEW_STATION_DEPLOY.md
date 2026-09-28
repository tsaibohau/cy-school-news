# Round 1 No-Auth Blind Review Station

This branch hosts the frozen Round 1 human blind review only.

- Entry: static `index.html`
- Dataset: `round-001-blind-review-data.js`
- Queue source: Training Supabase snapshot `c7db661b-181a-4d3-b869-b39f7edb3048`, only `manifest.review_queue.announcement_ids`
- Queue: 60 unique IDs, CYSH 30 and CYGSH 30
- Browser data: announcement metadata, available extracted body, content/source/attachment status, official links, and temporal evidence only
- Browser behavior: local autosave in localStorage, reload recovery, undo, JSON download
- Network behavior: no Supabase browser client and no browser writes
- Secrets: none

The Vercel build outputs only `index.html` and `round-001-blind-review-data.js`. It scans the output for model artifacts, Auth flows, and private credentials. This is a no-auth URL: anyone who has the URL can read the static review dataset. Human answers remain in the reviewing browser until exported.

After the user completes review and provides `human_review_round_001.json`, validate it server-side against the frozen manifest before any Training Supabase import. Do not import answers before that point. Training Supabase policies and Production remain unchanged.
