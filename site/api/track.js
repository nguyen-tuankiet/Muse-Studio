// POST /api/track {event, ref?}: ghi lượt truy cập và các hành động của khách (không cookie, không lưu IP thô).
// Khách duy nhất được đếm bằng một mã băm (IP + trình duyệt + ngày) chỉ tồn tại trong 2 ngày.
const crypto = require('crypto');
const lib = require('./_lib');

const EVENTS = new Set(['view', 'pricing_view', 'buy_click', 'demo_play']);

module.exports = async (req, res) => {
  lib.noStore(res);
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
    const ua = String(req.headers['user-agent'] || '');
    const body = lib.parseBody(req);
    const event = String(body.event || '');
    if (!EVENTS.has(event) || lib.isBot(ua)) return res.status(204).end();

    const ip = lib.clientIp(req);
    const limitKey = `rt:${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16)}`;
    const count = await lib.redis(['INCR', limitKey]);
    if (count === 1) await lib.redis(['EXPIRE', limitKey, '60']);
    if (count > 60) return res.status(204).end(); // quá nhiều sự kiện trong một phút: bỏ qua, không báo lỗi

    const fields = { [event]: 1 };
    if (event === 'view') {
      const day = lib.dayKey();
      const visitor = crypto.createHash('sha256').update(`${ip}|${ua}|${day}`).digest('hex').slice(0, 24);
      const isNew = await lib.redis(['SADD', `uv:${day}`, visitor]);
      if (isNew === 1) { fields.uniq = 1; await lib.redis(['EXPIRE', `uv:${day}`, '172800']); }
      fields[`dev:${lib.deviceOf(ua)}`] = 1;
      const country = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
      fields[`geo:${/^[A-Z]{2}$/.test(country) ? country : '??'}`] = 1;
      const host = String(body.ref || '').toLowerCase().replace(/^www\./, '');
      const own = String(req.headers.host || '').toLowerCase().replace(/^www\./, '');
      fields[`ref:${/^[a-z0-9.-]{3,60}$/.test(host) && host !== own ? host : 'direct'}`] = 1;
    }
    await lib.statInc(fields);
    return res.status(204).end();
  } catch (error) {
    console.error('track:', error.message);
    return res.status(204).end();
  }
};
