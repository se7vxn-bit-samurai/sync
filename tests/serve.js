// Minimal static server for the e2e suite. index.html is ~5MB, so it is streamed from disk on each
// request rather than held in memory across the run.
const http = require('http');
const fs = require('fs');
const path = require('path');

// Defaults to this repo (the single-file deploy artifact). SYNC_SERVE_ROOT points the same suite at
// the multi-file web build instead, so both artifacts are verified by identical tests.
const ROOT = path.resolve(process.env.SYNC_SERVE_ROOT || path.join(__dirname, '..'));
const PORT = Number(process.env.PORT || 4173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8' };

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const filePath = path.join(ROOT, rel);
    // Never serve outside the repo root.
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(filePath).pipe(res);
    });
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}`);
  });
