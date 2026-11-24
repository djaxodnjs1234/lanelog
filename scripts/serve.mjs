// 개발용 정적 서버: node scripts/serve.mjs [--host] [--port 5173]
// --host 를 붙이면 같은 와이파이의 휴대폰에서도 열 수 있다 (http라서 오프라인 기능과 클립보드는 꺼짐).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';

const args = process.argv.slice(2);
const host = args.includes('--host') ? '0.0.0.0' : '127.0.0.1';
const port = Number(args[args.indexOf('--port') + 1]) || 5173;
const root = new URL('../web/', import.meta.url).pathname;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}).listen(port, host, () => {
  console.log(`레인로그 개발 서버: http://127.0.0.1:${port}/`);
  if (host === '0.0.0.0') {
    for (const list of Object.values(networkInterfaces())) for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) console.log(`같은 와이파이의 휴대폰에서: http://${n.address}:${port}/`);
    }
  }
});
