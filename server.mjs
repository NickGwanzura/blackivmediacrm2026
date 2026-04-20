import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DIST = new URL('./dist/', import.meta.url).pathname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.map':  'application/json; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
};

async function resolveFile(urlPath) {
  const safe = normalize(urlPath).replace(/^(\.\.[\\/])+/, '');
  let candidate = join(DIST, safe);
  try {
    const s = await stat(candidate);
    if (s.isDirectory()) candidate = join(candidate, 'index.html');
    await stat(candidate);
    return candidate;
  } catch {
    return join(DIST, 'index.html');
  }
}

const server = createServer(async (req, res) => {
  const started = Date.now();
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const file = await resolveFile(decodeURIComponent(url.pathname));
    const data = await readFile(file);
    const ct = MIME[extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': ct, 'cache-control': 'public, max-age=60' });
    res.end(data);
    console.log(`[req] ${req.method} ${req.url} 200 ${Date.now() - started}ms`);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Internal Server Error');
    console.error(`[req] ${req.method} ${req.url} 500`, err?.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[ready] static server listening on http://${HOST}:${PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[shutdown] received ${sig}`);
    server.close(() => process.exit(0));
  });
}
