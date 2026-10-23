// Thống kê truy cập không cookie: gửi vài sự kiện nhỏ tới /api/track (lượt xem, thấy khung giá, bấm Mua, xem demo).
// Muốn lượt truy cập của chính bạn không bị tính: mở trang một lần với ?notrack=1 trên mỗi trình duyệt (bỏ bằng ?notrack=0).
(function () {
  try {
    var flag = new URLSearchParams(location.search).get('notrack');
    if (flag === '1') localStorage.setItem('muse_no_track', '1');
    if (flag === '0') localStorage.removeItem('muse_no_track');
    if (localStorage.getItem('muse_no_track')) return;
  } catch (e) { /* trình duyệt chặn lưu trữ thì vẫn thống kê */ }

  function send(event, extra) {
    var body = JSON.stringify(Object.assign({ event: event }, extra || {}));
    try { if (navigator.sendBeacon && navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }))) return; } catch (e) { /* dùng fetch bên dưới */ }
    fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
  }

  var ref = '';
  try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) { ref = ''; }
  send('view', { ref: ref });

  var pricing = document.getElementById('mua');
  if (pricing && 'IntersectionObserver' in window) {
    var seen = new IntersectionObserver(function (entries) {
      if (entries.some(function (entry) { return entry.isIntersecting; })) { send('pricing_view'); seen.disconnect(); }
    }, { threshold: 0.4 });
    seen.observe(pricing);
  }
  document.addEventListener('click', function (event) { if (event.target.closest && event.target.closest('.js-buy')) send('buy_click'); }, true);
  var demo = document.querySelector('#demo video');
  if (demo) demo.addEventListener('play', function () { send('demo_play'); }, { once: true });
})();
