// Chạy thử trang cùng các hàm thanh toán trên máy: node site/dev.mjs → http://127.0.0.1:3700 (chạy `npm run site:build` trước).
// Dùng bộ nhớ thay cho Redis và file site/release/muse-studio.zip thay cho kho riêng tư, nên KHÔNG đụng vào dịch vụ thật nào.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const site = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(site, 'dist');
const require = createRequire(import.meta.url);

process.env.DEV_MEMORY = '1';
process.env.SEPAY_API_KEY ||= 'dev-key';
process.env.BANK_ACCOUNT ||= '19036999999999';
process.env.BANK_HOLDER ||= 'NGUYEN TUAN KIET';
process.env.RELEASE_FILE ||= path.join(site, 'release', 'muse-studio.zip');
process.env.SITE_URL ||= `http://127.0.0.1:${process.env.PORT || 3700}`;

const handlers = { order: require('./api/order.js'), 'sepay-webhook': require('./api/sepay-webhook.js'), download: require('./api/download.js') };
const types = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.zip': 'application/zip', '.txt': 'text/plain; charset=utf-8' };
const port = Number(process.env.PORT || 3700);

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const route = /^\/api\/([a-z-]+)$/.exec(url.pathname);
  if (route) {
    const handler = handlers[route[1]];
    if (!handler) { res.writeHead(404); return res.end('{}'); }
    // Giả lập các tiện ích mà Vercel cung cấp: req.query, req.body, res.status().json()
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    req.query = Object.fromEntries(url.searchParams);
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)); return res; };
    return handler(req, res);
  }
  let p = decodeURIComponent(url.pathname); if (p.endsWith('/')) p += 'index.html';
  const file = path.join(dist, p);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  const size = fs.statSync(file).size; const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
  if (range) { const start = Number(range[1]); const end = range[2] ? Number(range[2]) : size - 1; res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 }); return fs.createReadStream(file, { start, end }).pipe(res); }
  res.writeHead(200, { ...headers, 'Content-Length': size }); fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Chạy thử trang + thanh toán (dữ liệu giả) tại http://127.0.0.1:${port}\nGiả lập SePay: node site/api/selftest.mjs hoặc POST /api/sepay-webhook với header Authorization: Apikey ${process.env.SEPAY_API_KEY}`));
