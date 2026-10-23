// Cấu hình trang giới thiệu: sửa file này, không cần đụng vào index.html.
window.SITE = {
  version: '2.0.0',
  // Giá hiển thị trên trang (chuỗi bất kỳ, ví dụ '$5').
  price: '$5',
  // Link thanh toán nơi khách trả tiền rồi nhận file (Lemon Squeezy, Gumroad, Payhip, Stripe Payment Link, PayPal...).
  // Để rỗng '' thì nút Mua ngay dùng contactUrl; không có cả hai thì nút hiện "Sắp mở bán".
  checkoutUrl: '',
  // Link liên hệ/mua (Zalo, Facebook, Telegram, email dạng mailto:...). Để rỗng '' để ẩn nút liên hệ.
  contactUrl: '',
  contactLabel: 'Liên hệ mua',
  // Dòng ghi chú dưới nút tải (ví dụ giá, chính sách hỗ trợ). Để rỗng nếu không cần.
  note: 'Thanh toán một lần. Chạy trên máy của bạn, dữ liệu không rời khỏi máy.',
  // Tên hiển thị ở chân trang.
  author: 'Nguyễn Tuấn Kiệt',
  // Link khi bấm vào tên tác giả.
  authorUrl: 'https://github.com/nguyen-tuankiet',
  // Biểu tượng mạng xã hội ở chân trang: điền link thì hiện, để rỗng thì ẩn. email: điền địa chỉ email hoặc mailto:...
  socials: { youtube: '', discord: '', email: '' },
};
