// Phần dùng chung cho các hàm thanh toán (chạy dạng Vercel Function, cũng chạy được ở site/dev.mjs).
// Không có thư viện ngoài: chỉ dùng fetch có sẵn của Node. Mọi cấu hình bí mật nằm trong biến môi trường, không nằm trong mã.
const crypto = require('crypto');
const fs = require('fs');

const env = (name, fallback = '') => process.env[name] || fallback;

function settings() {
  return {
    priceVnd: Number(env('PRICE_VND', '125000')),
    bankName: env('BANK_NAME', 'BIDV'),
    bankAccount: env('BANK_ACCOUNT'),
    bankHolder: env('BANK_HOLDER'),
    downloadLimit: Number(env('DOWNLOAD_LIMIT', '5')),
    qrBase: env('QR_BASE', 'https://vietqr.app/img'),
    siteUrl: env('SITE_URL').replace(/\/+$/, ''),
  };
}

// ---------------------------------------------------------------- Redis (Upstash, gọi qua HTTP)
const memory = new Map(); // chỉ dùng khi DEV_MEMORY=1 (chạy thử trên máy)
function memoryCommand([cmd, key, ...args]) {
  const now = Date.now();
  const entry = memory.get(key);
  const alive = entry && (!entry.expires || entry.expires > now) ? entry : null;
  switch (String(cmd).toUpperCase()) {
    case 'GET': return alive ? alive.value : null;
    case 'SET': {
      const nx = args.map(String).some((item) => item.toUpperCase() === 'NX');
      if (nx && alive) return null;
      const exIndex = args.findIndex((item) => String(item).toUpperCase() === 'EX');
      memory.set(key, { value: String(args[0]), expires: exIndex >= 0 ? now + Number(args[exIndex + 1]) * 1000 : 0 });
      return 'OK';
    }
    case 'INCR': { const next = (alive ? Number(alive.value) : 0) + 1; memory.set(key, { value: String(next), expires: alive ? alive.expires : 0 }); return next; }
    case 'DECR': { const next = (alive ? Number(alive.value) : 0) - 1; memory.set(key, { value: String(next), expires: alive ? alive.expires : 0 }); return next; }
    case 'EXPIRE': if (alive) alive.expires = now + Number(args[0]) * 1000; return alive ? 1 : 0;
    case 'DEL': memory.delete(key); return 1;
    default: throw new Error(`Lệnh Redis chưa hỗ trợ: ${cmd}`);
  }
}
async function redis(command) {
  if (env('DEV_MEMORY') === '1') return memoryCommand(command);
  const url = env('UPSTASH_REDIS_REST_URL') || env('KV_REST_API_URL');
  const token = env('UPSTASH_REDIS_REST_TOKEN') || env('KV_REST_API_TOKEN');
  if (!url || !token) throw new Error('Chưa cấu hình Upstash Redis (UPSTASH_REDIS_REST_URL và UPSTASH_REDIS_REST_TOKEN).');
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(`Redis lỗi: ${data.error || response.status}`);
  return data.result;
}

const ORDER_PENDING_TTL = 60 * 60 * 24 * 2; // đơn chưa trả tiền giữ 2 ngày
const ORDER_PAID_TTL = 60 * 60 * 24 * 90; // đơn đã trả giữ 90 ngày để khách tải lại
async function getOrder(code) {
  const raw = await redis(['GET', `order:${code}`]);
  return raw ? JSON.parse(raw) : null;
}
const saveOrder = (order, ttl) => redis(['SET', `order:${order.code}`, JSON.stringify(order), 'EX', String(ttl)]);

// ---------------------------------------------------------------- tiện ích
const sha = (value) => crypto.createHash('sha256').update(String(value)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ ký tự dễ nhầm: O, 0, I, 1
const randomCode = () => `MS${Array.from({ length: 8 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('')}`;
const randomToken = () => crypto.randomBytes(24).toString('hex');
const noStore = (res) => res.setHeader('Cache-Control', 'no-store');
const parseBody = (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
};

// Ngân hàng có thể đổi chữ hoa/thường, bỏ dấu cách, nên tìm mã đơn trong nội dung đã làm sạch.
function findCodes(...texts) {
  const flat = texts.map((text) => String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '')).join(' ');
  return [...new Set(flat.match(/MS[A-HJ-NP-Z2-9]{8}/g) || [])];
}

// ---------------------------------------------------------------- file bản cài (giữ riêng tư, không nằm trong trang)
async function readRelease() {
  const local = env('RELEASE_FILE');
  if (local) return fs.readFileSync(local);
  const repo = env('RELEASE_REPO'); const token = env('GITHUB_TOKEN');
  if (!repo || !token) throw new Error('Chưa cấu hình file bản cài (RELEASE_REPO và GITHUB_TOKEN).');
  const ref = env('RELEASE_REF'); const file = env('RELEASE_PATH', 'muse-studio.zip');
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${file.split('/').map(encodeURIComponent).join('/')}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw+json', 'User-Agent': 'muse-studio-site', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!response.ok) throw new Error(`Không đọc được file bản cài (GitHub ${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

// ---------------------------------------------------------------- email (tùy chọn, dùng Resend)
async function sendDownloadEmail(order) {
  const key = env('RESEND_API_KEY'); const from = env('MAIL_FROM');
  if (!key || !from || !order.email) return false;
  const base = settings().siteUrl;
  const link = `${base}/?order=${order.code}&token=${order.token}#mua`;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to: [order.email], subject: 'Muse Studio: link tải về của bạn',
        html: `<p>Cảm ơn bạn đã mua Muse Studio. Mã đơn: <b>${order.code}</b>.</p><p><a href="${link}">Bấm vào đây để tải về</a> (tải tối đa ${settings().downloadLimit} lần). Hãy giữ kín link này.</p><p>Sau khi tải, giải nén rồi bấm đúp Start.bat. Hướng dẫn chi tiết nằm trong README.md.</p>`,
      }),
    });
    return response.ok;
  } catch { return false; }
}

module.exports = { env, settings, redis, getOrder, saveOrder, ORDER_PENDING_TTL, ORDER_PAID_TTL, safeEqual, clientIp, randomCode, randomToken, noStore, parseBody, findCodes, readRelease, sendDownloadEmail, memory };
