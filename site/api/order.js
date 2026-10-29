// POST /api/order  {email?}  → tạo đơn: mã đơn, mã QR chuyển khoản
// GET  /api/order?code=&token= → trạng thái đơn (pending | paid | expired); đã trả tiền thì kèm link tải
const lib = require('./_lib');

module.exports = async (req, res) => {
  lib.noStore(res);
  try {
    if (req.method === 'POST') return await create(req, res);
    if (req.method === 'GET') return await status(req, res);
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (error) {
    console.error('order:', error.message);
    return res.status(500).json({ error: 'server_error', message: 'Hệ thống thanh toán đang gặp lỗi, vui lòng thử lại sau.' });
  }
};

async function create(req, res) {
  const cfg = lib.settings();
  if (!cfg.bankAccount) return res.status(503).json({ error: 'not_configured', message: 'Cửa hàng chưa mở thanh toán.' });
  // Chặn tạo đơn dồn dập từ một địa chỉ IP
  const limitKey = `rl:${lib.clientIp(req)}`;
  const count = await lib.redis(['INCR', limitKey]);
  if (count === 1) await lib.redis(['EXPIRE', limitKey, '3600']);
  if (count > 20) return res.status(429).json({ error: 'rate_limited', message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.' });

  const body = lib.parseBody(req);
  const email = String(body.email || '').trim().slice(0, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'bad_email', message: 'Email không hợp lệ.' });

  let code; let tries = 0;
  do { code = lib.randomCode(); tries += 1; } while (tries < 5 && await lib.getOrder(code));
  const plan = lib.planOf(body.plan);
  const order = { code, token: lib.randomToken(), email, plan, amount: lib.planPrice(plan, cfg), status: 'pending', createdAt: new Date().toISOString() };
  await lib.saveOrder(order, lib.ORDER_PENDING_TTL);
  await lib.redis(['LPUSH', 'orders:recent', code]).catch(() => {});
  await lib.redis(['LTRIM', 'orders:recent', '0', '199']).catch(() => {});
  await lib.statInc(plan === 'pro' ? { orders: 1, orders_pro: 1 } : { orders: 1 });
  return res.status(201).json(view(order, cfg));
}

async function status(req, res) {
  const code = String(req.query?.code || '').toUpperCase(); const token = String(req.query?.token || '');
  const order = /^MS[A-Z0-9]{8}$/.test(code) ? await lib.getOrder(code) : null;
  if (!order || !lib.safeEqual(order.token, token)) return res.status(404).json({ status: 'expired', message: 'Không tìm thấy đơn hàng hoặc đơn đã hết hạn.' });
  return res.status(200).json(view(order, lib.settings()));
}

function view(order, cfg) {
  const out = { code: order.code, token: order.token, status: order.status, plan: order.plan || 'basic', amount: order.amount, email: order.email || '' };
  if (order.status === 'pending') {
    out.bank = { name: cfg.bankName, account: cfg.bankAccount, holder: cfg.bankHolder };
    out.content = order.code;
    out.qrUrl = `${cfg.qrBase}?acc=${encodeURIComponent(cfg.bankAccount)}&bank=${encodeURIComponent(cfg.bankName)}&amount=${order.amount}&des=${encodeURIComponent(order.code)}`;
    if (order.underpaid) out.note = `Đã nhận ${Number(order.underpaid.amount).toLocaleString('vi-VN')}đ nhưng chưa đủ ${order.amount.toLocaleString('vi-VN')}đ. Vui lòng chuyển thêm phần còn thiếu với cùng nội dung hoặc liên hệ hỗ trợ.`;
  } else if (order.status === 'paid') {
    out.downloadUrl = `/api/download?code=${order.code}&token=${order.token}`;
    out.downloadLimit = cfg.downloadLimit;
    out.emailed = Boolean(order.emailed);
  }
  return out;
}
