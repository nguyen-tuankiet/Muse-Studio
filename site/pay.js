// Thanh toán chuyển khoản ngay trên trang: tạo mã đơn + QR, tự chờ tiền vào, rồi hiện nút Tải về.
// Chỉ chạy khi site.config.js đặt bankCheckout: true. Gọi các hàm /api/order (xem site/api).
(function () {
  var cfg = window.SITE || {};
  if (!cfg.bankCheckout) return;

  var KEY = 'muse_order';
  var overlay; var box; var timer = null; var current = null;
  var money = function (n) { return Number(n).toLocaleString('vi-VN') + 'đ'; };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var store = {
    get: function () { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
    set: function (v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* trình duyệt chặn lưu thì bỏ qua */ } },
    clear: function () { try { localStorage.removeItem(KEY); } catch (e) { /* bỏ qua */ } },
  };

  function api(url, options) {
    return fetch(url, options).then(function (r) { return r.json().catch(function () { return {}; }).then(function (data) { return { ok: r.ok, status: r.status, data: data }; }); });
  }

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'pay-overlay';
    overlay.innerHTML = '<div class="pay-box" role="dialog" aria-modal="true" aria-label="Thanh toán"><button class="pay-close" type="button" aria-label="Đóng">×</button><div class="pay-body"></div></div>';
    document.body.appendChild(overlay);
    box = overlay.querySelector('.pay-body');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('.pay-close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });
    // Ảnh QR tải lỗi (mạng, dịch vụ tạo QR ngừng): thay bằng lời nhắn, khách vẫn chuyển khoản theo thông tin bên cạnh
    box.addEventListener('error', function (e) {
      if (e.target && e.target.tagName === 'IMG') { var note = document.createElement('p'); note.className = 'pay-hint'; note.textContent = 'Không tải được mã QR. Hãy chuyển khoản theo thông tin bên cạnh.'; e.target.replaceWith(note); }
    }, true);
    box.addEventListener('click', function (e) {
      var copy = e.target.closest('[data-copy]');
      if (copy) { navigator.clipboard && navigator.clipboard.writeText(copy.getAttribute('data-copy')).then(function () { var old = copy.textContent; copy.textContent = 'Đã chép'; setTimeout(function () { copy.textContent = old; }, 1400); }); }
      if (e.target.closest('[data-new]')) { store.clear(); current = null; showForm(); }
    });
  }

  function open() {
    if (!overlay) build();
    overlay.classList.add('open'); document.body.style.overflow = 'hidden';
    var saved = store.get();
    if (saved && saved.code) resume(saved); else showForm();
  }
  function close() {
    if (!overlay) return;
    overlay.classList.remove('open'); document.body.style.overflow = '';
    clearTimeout(timer); timer = null;
  }

  function showForm(message) {
    clearTimeout(timer);
    box.innerHTML = '<h3>Mua Muse Studio</h3><p class="pay-sub">Thanh toán <b>' + esc(cfg.priceVndLabel || cfg.price || '') + '</b> một lần bằng chuyển khoản ngân hàng. Chuyển xong, nút tải về hiện ra ngay trên trang này.</p>' +
      '<label class="pay-field" for="pay-email">Email nhận link tải (nên điền)</label><input class="pay-input" id="pay-email" type="email" autocomplete="email" placeholder="ten@email.com">' +
      '<p class="pay-hint">Link tải cũng được gửi qua email để bạn tải lại sau này. Có thể bỏ trống.</p>' +
      (message ? '<div class="pay-error">' + esc(message) + '</div>' : '') +
      '<div class="pay-actions"><button class="btn btn-primary" type="button" id="pay-go">Tạo mã thanh toán</button></div>';
    var go = box.querySelector('#pay-go');
    go.addEventListener('click', function () {
      go.disabled = true; go.textContent = 'Đang tạo mã...';
      api('/api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: box.querySelector('#pay-email').value }) }).then(function (res) {
        if (!res.ok) return showForm(res.data.message || 'Không tạo được đơn hàng, vui lòng thử lại.');
        store.set({ code: res.data.code, token: res.data.token });
        poll.started = Date.now();
        show(res.data);
        poll({ code: res.data.code, token: res.data.token }, false);
      }).catch(function () { showForm('Không kết nối được máy chủ, vui lòng thử lại.'); });
    });
  }

  function resume(saved) {
    box.innerHTML = '<div class="pay-status"><span class="pay-spin"></span>Đang kiểm tra đơn hàng...</div>';
    poll(saved, true);
  }

  function show(order) {
    current = order;
    if (order.status === 'paid') return showPaid(order);
    var bank = order.bank || {};
    box.innerHTML = '<h3>Chuyển khoản để nhận file</h3><p class="pay-sub">Quét mã QR bằng app ngân hàng hoặc chuyển khoản theo thông tin bên dưới. Giữ nguyên số tiền và nội dung.</p>' +
      '<div class="pay-grid"><div class="pay-qr"><img src="' + esc(order.qrUrl) + '" alt="Mã QR chuyển khoản" width="230" height="230"></div><div class="pay-rows">' +
      row('Ngân hàng', bank.name) + row('Số tài khoản', bank.account, true) + (bank.holder ? row('Chủ tài khoản', bank.holder) : '') + row('Số tiền', money(order.amount), true, String(order.amount)) +
      '<div class="pay-row key"><div><small>Nội dung chuyển khoản (bắt buộc)</small><b>' + esc(order.content) + '</b></div><button class="pay-copy" type="button" data-copy="' + esc(order.content) + '">Chép</button></div></div></div>' +
      '<div class="pay-warn">Nhập <b>đúng nội dung</b> <b>' + esc(order.content) + '</b>. Nội dung sai thì hệ thống không nhận ra khoản chuyển và bạn sẽ không thấy nút tải.</div>' +
      (order.note ? '<div class="pay-error">' + esc(order.note) + '</div>' : '') +
      '<div class="pay-status"><span class="pay-spin"></span><span>Đang chờ thanh toán... trang tự cập nhật, bạn không cần tải lại.</span></div>' +
      '<p class="pay-hint">Đã chuyển nhưng chờ quá vài phút? ' + (cfg.contactUrl ? '<a href="' + esc(cfg.contactUrl) + '" target="_blank" rel="noreferrer">Liên hệ hỗ trợ</a> kèm mã đơn ' : (cfg.supportEmail ? '<a href="mailto:' + esc(cfg.supportEmail) + '?subject=' + encodeURIComponent('Hỗ trợ đơn ' + order.code) + '">Gửi email hỗ trợ</a> kèm mã đơn ' : 'Liên hệ hỗ trợ kèm mã đơn ')) + '<b>' + esc(order.code) + '</b>. <button class="pay-link" type="button" data-new>Tạo mã khác</button></p>';
  }
  function row(label, value, copyable, copyValue) {
    return '<div class="pay-row"><div><small>' + esc(label) + '</small><b>' + esc(value || '') + '</b></div>' + (copyable ? '<button class="pay-copy" type="button" data-copy="' + esc(copyValue || value || '') + '">Chép</button>' : '') + '</div>';
  }

  function showPaid(order) {
    clearTimeout(timer);
    box.innerHTML = '<div class="pay-ok"><div class="tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>' +
      '<h3 style="padding:0">Thanh toán thành công</h3><p class="pay-sub">Cảm ơn bạn! Mã đơn <b>' + esc(order.code) + '</b>.</p>' +
      '<a class="btn btn-primary" href="' + esc(order.downloadUrl) + '" download>Tải về Muse Studio (.zip)</a>' +
      '<p class="pay-hint">' + (order.emailed && order.email ? 'Link tải cũng đã được gửi tới ' + esc(order.email) + '. ' : '') + 'Link này lưu trên trình duyệt của bạn, tải được tối đa ' + esc(order.downloadLimit || '') + ' lần. Sau khi tải: giải nén rồi bấm đúp Start.bat.' + (cfg.supportEmail ? ' Cần hỗ trợ? Gửi email tới <a href="mailto:' + esc(cfg.supportEmail) + '?subject=' + encodeURIComponent('Hỗ trợ đơn ' + order.code) + '">' + esc(cfg.supportEmail) + '</a> kèm mã đơn.' : '') + '</p></div>';
  }

  function poll(saved, first) {
    clearTimeout(timer);
    var started = poll.started || (poll.started = Date.now());
    api('/api/order?code=' + encodeURIComponent(saved.code) + '&token=' + encodeURIComponent(saved.token)).then(function (res) {
      if (!overlay.classList.contains('open')) return;
      if (res.status === 404) { store.clear(); return showForm('Đơn trước đã hết hạn. Hãy tạo mã mới.'); }
      if (!res.ok) { timer = setTimeout(function () { poll(saved, false); }, 8000); return; }
      var order = res.data;
      order.token = order.token || saved.token;
      if (order.status === 'paid') { store.set({ code: order.code, token: order.token }); return showPaid(order); }
      if (first || !current || current.code !== order.code || order.note !== current.note) show(order);
      var waited = Date.now() - started;
      timer = setTimeout(function () { poll(saved, false); }, waited > 10 * 60 * 1000 ? 10000 : 4000);
    }).catch(function () { timer = setTimeout(function () { poll(saved, false); }, 8000); });
  }

  // Mọi nút "Mua ngay" mở cửa sổ thanh toán
  document.addEventListener('click', function (e) {
    var button = e.target.closest('.js-buy');
    if (!button) return;
    e.preventDefault(); poll.started = Date.now(); open();
  });
  // Link trong email: /?order=...&token=... mở thẳng đơn đó
  var params = new URLSearchParams(location.search);
  if (params.get('order') && params.get('token')) {
    store.set({ code: params.get('order'), token: params.get('token') });
    history.replaceState(null, '', location.pathname + location.hash);
    window.addEventListener('load', open);
  }
})();
