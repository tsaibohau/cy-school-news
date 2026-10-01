const fs = require('fs');
fs.mkdirSync('dist-autonomous-review', { recursive: true });
fs.copyFileSync('experiments/autonomous-corpus/review/index.html', 'dist-autonomous-review/index.html');
// Private content, model answers, and access tokens are never build inputs.
