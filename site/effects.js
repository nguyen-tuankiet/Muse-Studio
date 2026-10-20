// Hiệu ứng cho trang giới thiệu: hiện dần khi cuộn, đốm sáng theo chuột trên thẻ, thanh tiến độ cuộn trang.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Hiện dần khi cuộn tới (mỗi phần tử trong cùng một nhóm trễ thêm chút để lần lượt hiện)
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.stat, .card, .step, .row .text, .row .shot, details, .dl, .video, section h2, section .lead, .final .cta').forEach(function (el) {
      if (el.closest('.hero')) return;
      var index = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
      el.style.setProperty('--d', Math.min(index, 6) * 0.08 + 's');
      el.classList.add('rv');
      io.observe(el);
    });
  }

  // Đốm sáng đi theo con trỏ chuột trên các thẻ
  document.querySelectorAll('.card, .stat, .step').forEach(function (el) {
    el.addEventListener('mousemove', function (event) {
      var rect = el.getBoundingClientRect();
      el.style.setProperty('--mx', event.clientX - rect.left + 'px');
      el.style.setProperty('--my', event.clientY - rect.top + 'px');
    });
  });

  // Thanh tiến độ cuộn trang
  var bar = document.createElement('div');
  bar.className = 'scroll-progress';
  document.body.appendChild(bar);
  var root = document.documentElement;
  function progress() {
    var total = root.scrollHeight - root.clientHeight;
    bar.style.setProperty('--p', (total > 0 ? (root.scrollTop / total) * 100 : 0) + '%');
  }
  window.addEventListener('scroll', progress, { passive: true });
  progress();
})();
