// POST /api/admin-login {password} → đặt cookie đăng nhập quản trị (12 giờ). DELETE → đăng xuất. GET → kiểm tra đã đăng nhập chưa.
const lib = require('./_lib');

module.exports = async (req, res) => {
  lib.noStore(res);
  if (!lib.env('ADMIN_PASSWORD')) return res.status(503).json({ error: 'not_configured', message: 'Chưa đặt ADMIN_PASSWORD trên máy chủ.' });
  if (req.method === 'GET') return res.status(200).json({ loggedIn: lib.isAdmin(req) });
  if (req.method === 'DELETE') { res.setHeader('Set-Cookie', lib.adminCookie(req, '', 0)); return res.status(200).json({ loggedIn: false }); }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    // Chặn dò mật khẩu: tối đa 8 lần sai mỗi 15 phút cho mỗi địa chỉ IP
    const key = `adm:${lib.clientIp(req)}`;
    const tries = await lib.redis(['INCR', key]);
    if (tries === 1) await lib.redis(['EXPIRE', key, '900']);
    if (tries > 8) return res.status(429).json({ error: 'rate_limited', message: 'Nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.' });
    const password = String(lib.parseBody(req).password || '');
    if (!lib.safeEqual(password, lib.env('ADMIN_PASSWORD'))) return res.status(401).json({ error: 'bad_password', message: 'Mật khẩu không đúng.' });
    await lib.redis(['DEL', key]);
    res.setHeader('Set-Cookie', lib.adminCookie(req, lib.adminToken(12), 12 * 3600));
    return res.status(200).json({ loggedIn: true });
  } catch (error) {
    console.error('admin-login:', error.message);
    return res.status(500).json({ error: 'server_error', message: 'Hệ thống đang gặp lỗi, vui lòng thử lại.' });
  }
};
