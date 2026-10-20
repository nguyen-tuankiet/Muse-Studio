// Xem thử trang giới thiệu trên máy: node site/serve.mjs  → http://127.0.0.1:3700 (chạy `npm run site:build` trước).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const port = Number(process.env.PORT || 3700);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.zip': 'application/zip', '.txt': 'text/plain; charset=utf-8' };
if (!fs.existsSync(root)) { console.error('Chưa có site/dist. Chạy: npm run site:build'); process.exit(1); }
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  const size = fs.statSync(file).size; const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
  if (range) { const start = Number(range[1]); const end = range[2] ? Number(range[2]) : size - 1; res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 }); return fs.createReadStream(file, { start, end }).pipe(res); }
  res.writeHead(200, { ...headers, 'Content-Length': size }); fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Xem thử trang giới thiệu tại http://127.0.0.1:${port}`));
