// GET /api/admin-stats?days=30 (cần đăng nhập quản trị): số liệu theo ngày, tổng, nguồn truy cập, quốc gia, thiết bị, đơn gần đây.
const lib = require('./_lib');

const COUNTERS = ['views', 'uniq', 'pricing_view', 'buy_click', 'demo_play', 'orders', 'paid', 'revenue', 'downloads', 'orders_pro', 'paid_pro', 'revenue_pro'];
const FIELD = { views: 'view' };

module.exports = async (req, res) => {
  lib.noStore(res);
  if (!lib.isAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const days = Math.min(90, Math.max(1, Number.parseInt(req.query?.days, 10) || 30));
    const keys = Array.from({ length: days }, (_, index) => lib.dayKey(days - 1 - index));
    const rows = await lib.pipeline(keys.map((day) => ['HGETALL', `st:${day}`]));

    const series = []; const totals = Object.fromEntries(COUNTERS.map((name) => [name, 0]));
    const groups = { ref: {}, geo: {}, dev: {} };
    rows.forEach((flat, index) => {
      const hash = {};
      for (let i = 0; i < (flat || []).length; i += 2) hash[flat[i]] = Number(flat[i + 1]) || 0;
      const point = { date: keys[index] };
      for (const name of COUNTERS) {
        point[name] = hash[FIELD[name] || name] ?? (name === 'views' ? hash.view || 0 : 0);
        totals[name] += point[name];
      }
      for (const [field, value] of Object.entries(hash)) {
        const [group, ...rest] = field.split(':');
        if (groups[group] && rest.length) groups[group][rest.join(':')] = (groups[group][rest.join(':')] || 0) + value;
      }
      series.push(point);
    });
    const top = (map, limit = 8) => Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, limit);

    // Đơn gần đây (chỉ lấy đơn còn trong kho: đơn chưa trả tiền tự xóa sau 2 ngày)
    const codes = (await lib.redis(['LRANGE', 'orders:recent', '0', '29'])) || [];
    const fetched = await lib.pipeline(codes.flatMap((code) => [['GET', `order:${code}`], ['GET', `dl:${code}`]]));
    const recent = [];
    codes.forEach((code, index) => {
      const order = fetched[index * 2] ? JSON.parse(fetched[index * 2]) : null;
      if (!order) return;
      recent.push({ code, email: order.email || '', status: order.status, plan: order.plan || 'basic', amount: order.paidAmount || order.amount, createdAt: order.createdAt, paidAt: order.paidAt || null, downloads: Number(fetched[index * 2 + 1]) || 0, underpaid: Boolean(order.underpaid) });
    });

    return res.status(200).json({ days, series, totals, referrers: top(groups.ref), countries: top(groups.geo), devices: top(groups.dev), recent, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('admin-stats:', error.message);
    return res.status(500).json({ error: 'server_error', message: 'Không đọc được thống kê.' });
  }
};
