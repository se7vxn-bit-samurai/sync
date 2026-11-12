'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { assemble, leaks } = require('./build');

const host = '127.0.0.1';
const port = 4174;
const url = `http://${host}:${port}/`;
const icon = fs.readFileSync(path.join(__dirname, '..', 'apple-touch-icon.png'));
const pages = new Map([['/', 'index'], ['/index.html', 'index'], ['/me.html', 'me']]);
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const pathname = (req.url || '/').split('?')[0];
  if (pathname === '/apple-touch-icon.png') {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': icon.length });
    res.end(req.method === 'HEAD' ? undefined : icon);
    return;
  }
  const page = pages.get(pathname);
  if (!page) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    // Build on each request so refreshing previews the latest local source edits.
    const { html, missing } = assemble('dev', page);
    if (missing) throw new Error(`Missing source parts: ${missing.join(', ')}`);
    const problems = leaks('dev', html);
    if (problems.length) throw new Error(problems.join('; '));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : html);
  } catch (error) {
    console.error(error.message);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Sync preview build failed. Check the preview terminal.');
  }
});

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. If Sync Preview is running, open ${url}` : error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => console.log(`Sync Preview is running at ${url}`));
