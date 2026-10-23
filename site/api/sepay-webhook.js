// POST /api/sepay-webhook: SePay gọi vào đây mỗi khi có tiền vào tài khoản. Xác thực bằng API Key, chống xử lý trùng,
// khớp mã đơn trong nội dung chuyển khoản, đủ tiền thì đánh dấu đơn đã trả và gửi email (nếu có).
const lib = require('./_lib');

module.exports = async (req, res) => {
  lib.noStore(res);
  if (req.method !== 'POST') return res.status(405).json({ success: false });
  const key = lib.env('SEPAY_API_KEY');
  if (!key) return res.status(503).json({ success: false, error: 'not_configured' });
  const given = String(req.headers.authorization || '').replace(/^Apikey\s+/i, '');
  if (!lib.safeEqual(given, key)) return res.status(401).json({ success: false });

  const body = lib.parseBody(req);
  if (body.transferType !== 'in') return res.status(200).json({ success: true, ignored: 'not_incoming' });
  const txId = String(body.id ?? body.referenceCode ?? '');
  if (!txId) return res.status(200).json({ success: true, ignored: 'no_id' });

  // SePay có thể gửi lại cùng một giao dịch: chỉ xử lý lần đầu
  const fresh = await lib.redis(['SET', `tx:${txId}`, '1', 'NX', 'EX', String(60 * 60 * 24 * 30)]);
  if (fresh !== 'OK') return res.status(200).json({ success: true, duplicate: true });

  try {
    const amount = Number(body.transferAmount || 0);
    let matched = null;
    for (const code of lib.findCodes(body.code, body.content, body.description)) {
      const order = await lib.getOrder(code);
      if (order) { matched = order; break; }
    }
    if (!matched) return res.status(200).json({ success: true, matched: false });
    if (matched.status === 'paid') return res.status(200).json({ success: true, matched: true, already: true });

    if (amount < matched.amount) {
      matched.underpaid = { amount, txId, at: new Date().toISOString() };
      await lib.saveOrder(matched, lib.ORDER_PENDING_TTL);
      return res.status(200).json({ success: true, matched: true, underpaid: true });
    }
    Object.assign(matched, { status: 'paid', paidAt: new Date().toISOString(), txId, paidAmount: amount });
    delete matched.underpaid;
    await lib.saveOrder(matched, lib.ORDER_PAID_TTL);
    await lib.statInc({ paid: 1, revenue: amount });
    if (await lib.sendDownloadEmail(matched)) { matched.emailed = true; await lib.saveOrder(matched, lib.ORDER_PAID_TTL); }
    return res.status(200).json({ success: true, matched: true, paid: true });
  } catch (error) {
    // Xử lý lỗi giữa chừng: bỏ dấu "đã xử lý" để SePay gọi lại sau
    await lib.redis(['DEL', `tx:${txId}`]).catch(() => {});
    console.error('sepay-webhook:', error.message);
    return res.status(500).json({ success: false });
  }
};
