// GET /api/download?code=&token=: chỉ đơn đã thanh toán, đúng mã bí mật, còn lượt tải mới nhận được file.
const lib = require('./_lib');

module.exports = async (req, res) => {
  lib.noStore(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const code = String(req.query?.code || '').toUpperCase(); const token = String(req.query?.token || '');
  let counted = false;
  try {
    const order = /^MS[A-Z0-9]{8}$/.test(code) ? await lib.getOrder(code) : null;
    if (!order || !lib.safeEqual(order.token, token)) return res.status(404).json({ error: 'not_found', message: 'Link tải không hợp lệ hoặc đã hết hạn.' });
    if (order.status !== 'paid') return res.status(402).json({ error: 'not_paid', message: 'Đơn hàng chưa được thanh toán.' });

    const limit = lib.settings().downloadLimit;
    const used = await lib.redis(['INCR', `dl:${code}`]);
    counted = true;
    if (used > limit) {
      await lib.redis(['DECR', `dl:${code}`]);
      return res.status(429).json({ error: 'limit', message: `Bạn đã tải đủ ${limit} lần. Vui lòng liên hệ hỗ trợ nếu cần thêm.` });
    }
    const file = await lib.readRelease();
    await lib.statInc({ downloads: 1 });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="muse-studio.zip"');
    res.setHeader('Content-Length', String(file.length));
    return res.status(200).end(file);
  } catch (error) {
    if (counted) await lib.redis(['DECR', `dl:${code}`]).catch(() => {}); // không tính lượt khi hệ thống lỗi
    console.error('download:', error.message);
    return res.status(500).json({ error: 'server_error', message: 'Chưa tải được file, vui lòng thử lại sau.' });
  }
};
