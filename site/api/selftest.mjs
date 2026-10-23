// Tự kiểm thử luồng thanh toán bằng SePay giả: node site/api/selftest.mjs (tự bật site/dev.mjs ở cổng 3799).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 3799; const base = `http://127.0.0.1:${port}`; const key = 'test-key';
const server = spawn(process.execPath, [path.join(site, 'dev.mjs')], { env: { ...process.env, PORT: String(port), SEPAY_API_KEY: key, PRICE_VND: '125000', DOWNLOAD_LIMIT: '2', ADMIN_PASSWORD: 'test-admin' }, stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); if (!ok) failed += 1; };
const call = async (url, options = {}) => { const response = await fetch(base + url, options); const type = response.headers.get('content-type') || ''; return { status: response.status, type, body: type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) }; };
const post = (url, body, headers = {}) => call(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const hook = (body, auth = `Apikey ${key}`) => post('/api/sepay-webhook', body, { Authorization: auth });
let txCounter = 1000;
const tx = (content, amount, extra = {}) => ({ id: (txCounter += 1), gateway: 'Techcombank', transferType: 'in', transferAmount: amount, content, description: content, accountNumber: '19036999999999', referenceCode: `FT${txCounter}`, ...extra });

try {
  for (let i = 0; i < 30; i += 1) { try { if ((await fetch(base + '/')).status) break; } catch { await sleep(200); } }

  // --- tạo đơn
  let r = await post('/api/order', { email: 'khach@example.com' });
  const order = r.body;
  check('tạo đơn: có mã MSxxxxxxxx, token, số tiền, QR, thông tin ngân hàng', r.status === 201 && /^MS[A-Z2-9]{8}$/.test(order.code) && order.token.length === 48 && order.amount === 125000 && order.qrUrl.includes('amount=125000') && order.qrUrl.includes(`des=${order.code}`) && order.bank.account && order.status === 'pending', JSON.stringify(order).slice(0, 120));
  check('email sai bị từ chối', (await post('/api/order', { email: 'khong-hop-le' })).status === 400);

  // --- trạng thái ban đầu
  r = await call(`/api/order?code=${order.code}&token=${order.token}`);
  check('trạng thái: đang chờ, chưa có link tải', r.status === 200 && r.body.status === 'pending' && !r.body.downloadUrl);
  check('sai token → không xem được đơn', (await call(`/api/order?code=${order.code}&token=sai`)).status === 404);
  check('chưa trả tiền → không tải được file', (await call(`/api/download?code=${order.code}&token=${order.token}`)).status === 402);

  // --- webhook
  check('webhook sai khóa → 401', (await hook(tx(order.code, 125000), 'Apikey sai')).status === 401);
  check('webhook không có khóa → 401', (await post('/api/sepay-webhook', tx(order.code, 125000))).status === 401);
  r = await hook({ ...tx(order.code, 125000), transferType: 'out' });
  check('giao dịch tiền ra bị bỏ qua', r.status === 200 && r.body.ignored === 'not_incoming');
  r = await hook(tx('CHUYEN TIEN KHONG CO MA', 125000));
  check('giao dịch không có mã đơn: trả success, không khớp (SePay không gọi lại)', r.status === 200 && r.body.success === true && r.body.matched === false);
  r = await hook(tx(order.code, 50000));
  check('chuyển thiếu tiền: chưa mở khóa, có ghi chú', r.body.underpaid === true && (await call(`/api/order?code=${order.code}&token=${order.token}`)).body.status === 'pending');
  check('ghi chú thiếu tiền hiện cho khách', /chưa đủ/.test((await call(`/api/order?code=${order.code}&token=${order.token}`)).body.note || ''));

  // --- thanh toán đủ, nội dung bị ngân hàng đổi định dạng (chữ thường, thêm chữ, bỏ dấu cách)
  const messy = `mbvcb.ibft ${order.code.toLowerCase().slice(0, 4)} ${order.code.toLowerCase().slice(4)} thanh toan`;
  const paying = tx(messy, 125000);
  r = await hook(paying);
  check('thanh toán đủ, nội dung bị đổi định dạng vẫn khớp', r.status === 200 && r.body.paid === true, JSON.stringify(r.body));
  r = await hook(paying);
  check('SePay gửi lại cùng giao dịch: bỏ qua, không xử lý lại', r.status === 200 && r.body.duplicate === true);

  // --- sau khi trả tiền
  r = await call(`/api/order?code=${order.code}&token=${order.token}`);
  check('trạng thái: đã trả, có link tải', r.body.status === 'paid' && r.body.downloadUrl === `/api/download?code=${order.code}&token=${order.token}` && r.body.downloadLimit === 2);
  r = await call(r.body.downloadUrl);
  check('tải được file zip đúng định dạng', r.status === 200 && r.type.includes('zip') && r.body.length > 1000 && r.body.slice(0, 2).toString() === 'PK', `${r.body.length} byte`);
  await call(`/api/download?code=${order.code}&token=${order.token}`);
  r = await call(`/api/download?code=${order.code}&token=${order.token}`);
  check('quá số lần tải cho phép → 429', r.status === 429 && /đủ 2 lần/.test(r.body.message));
  check('sai token → không tải được', (await call(`/api/download?code=${order.code}&token=sai`)).status === 404);

  // --- đơn thứ hai: trả thừa, và giao dịch thứ hai cho đơn đã trả
  const second = (await post('/api/order', {})).body;
  r = await hook(tx(second.code, 200000));
  check('trả thừa tiền vẫn mở khóa', r.body.paid === true);
  r = await hook(tx(second.code, 125000));
  check('chuyển thêm lần nữa cho đơn đã trả: ghi nhận không đổi trạng thái', r.status === 200 && r.body.already === true);
  check('mã đơn khác nhau hoàn toàn độc lập', order.code !== second.code && (await call(`/api/order?code=${order.code}&token=${second.token}`)).status === 404);

  // --- giới hạn tạo đơn
  let last = 201; for (let i = 0; i < 25 && last === 201; i += 1) last = (await post('/api/order', {})).status;
  check('tạo quá nhiều đơn từ một IP → 429', last === 429);

  // --- thống kê và trang quản trị
  const human = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };
  const track = (event, extra = {}, headers = human) => post('/api/track', { event, ...extra }, headers);
  await track('view', { ref: 'www.facebook.com' }); await track('view'); await track('pricing_view'); await track('buy_click'); await track('demo_play');
  check('khách giả (bot) và sự kiện lạ bị bỏ qua', (await track('view', {}, { 'User-Agent': 'Googlebot/2.1' })).status === 204 && (await track('hack_the_planet')).status === 204);
  check('GET /api/track không được phép', (await call('/api/track')).status === 405);
  check('chưa đăng nhập → không xem được thống kê', (await call('/api/admin-stats')).status === 401);
  check('cookie giả → không xem được thống kê', (await call('/api/admin-stats', { headers: { Cookie: 'muse_admin=9999999999999.abc' } })).status === 401);
  let login = await fetch(base + '/api/admin-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'sai' }) });
  check('sai mật khẩu quản trị → 401', login.status === 401);
  login = await fetch(base + '/api/admin-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-admin' }) });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const setCookie = login.headers.get('set-cookie') || '';
  check('đăng nhập đúng: cookie HttpOnly + SameSite=Strict', login.status === 200 && cookie.startsWith('muse_admin=') && /HttpOnly/.test(setCookie) && /SameSite=Strict/.test(setCookie));
  const stats = await call('/api/admin-stats?days=7', { headers: { Cookie: cookie } });
  const totals = stats.body.totals || {};
  check('thống kê: 2 lượt xem, 1 khách duy nhất, 1 thấy giá, 1 bấm mua, 1 xem demo', totals.views === 2 && totals.uniq === 1 && totals.pricing_view === 1 && totals.buy_click === 1 && totals.demo_play === 1, JSON.stringify(totals));
  check('thống kê: 2 đơn đã trả, doanh thu 325.000đ, 2 lượt tải', totals.paid === 2 && totals.revenue === 325000 && totals.downloads === 2, JSON.stringify(totals));
  check('thống kê: nguồn truy cập, thiết bị và quốc gia', stats.body.referrers.some((r) => r.name === 'facebook.com' && r.count === 1) && stats.body.referrers.some((r) => r.name === 'direct') && stats.body.devices[0].name === 'desktop' && stats.body.countries[0].name === '??');
  check('thống kê: có đơn gần đây, email và trạng thái', stats.body.recent.some((o) => o.status === 'paid' && o.email === 'khach@example.com' && o.downloads === 2) && stats.body.recent.length >= 2);
  check('chuỗi 7 ngày, ngày cuối là hôm nay', stats.body.series.length === 7 && stats.body.series[6].views === 2);
  check('GET admin-login báo đã đăng nhập', (await call('/api/admin-login', { headers: { Cookie: cookie } })).body.loggedIn === true);
  const out = await fetch(base + '/api/admin-login', { method: 'DELETE', headers: { Cookie: cookie } });
  check('đăng xuất xóa cookie', /Max-Age=0/.test(out.headers.get('set-cookie') || ''));
  let blocked = 0; for (let i = 0; i < 10; i += 1) blocked = (await post('/api/admin-login', { password: 'sai' })).status;
  check('nhập sai mật khẩu liên tục → 429', blocked === 429);
} catch (error) { console.error(error); failed += 1; }
server.kill();
console.log(failed ? `\n${failed} lỗi` : '\nTẤT CẢ ĐẠT');
process.exit(failed ? 1 : 0);
