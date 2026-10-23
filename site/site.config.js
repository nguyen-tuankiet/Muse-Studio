// Cấu hình trang giới thiệu: sửa file này, không cần đụng vào index.html.
window.SITE = {
  version: '2.0.0',
  // Giá hiển thị trên trang (chuỗi bất kỳ, ví dụ '$5').
  price: '$5',
  // true: thanh toán chuyển khoản ngay trên trang (cần cấu hình các hàm trong site/api, xem site/HUONG-DAN-THANH-TOAN.md).
  // false: nút Mua ngay dẫn tới checkoutUrl hoặc contactUrl.
  bankCheckout: true,
  // Giá hiển thị trong cửa sổ thanh toán (số tiền thật lấy từ biến môi trường PRICE_VND trên máy chủ).
  priceVndLabel: '125.000đ (khoảng $5)',
  // Link thanh toán nơi khách trả tiền rồi nhận file (Lemon Squeezy, Gumroad, Payhip, Stripe Payment Link, PayPal...).
  // Để rỗng '' thì nút Mua ngay dùng contactUrl; không có cả hai thì nút hiện "Sắp mở bán".
  checkoutUrl: '',
  // Link liên hệ/mua (Zalo, Facebook, Telegram, email dạng mailto:...). Để rỗng '' để ẩn nút liên hệ.
  contactUrl: '',
  contactLabel: 'Liên hệ mua',
  // Dòng ghi chú dưới nút tải (ví dụ giá, chính sách hỗ trợ). Để rỗng nếu không cần.
  note: 'Thanh toán một lần bằng chuyển khoản. Chạy trên máy của bạn, dữ liệu không rời khỏi máy.',
  // Email hỗ trợ cho người đã mua (hiện trong cửa sổ sau khi thanh toán, chân trang, hỏi đáp, email gửi khách). Để rỗng '' thì ẩn.
  supportEmail: '',
  // Tên hiển thị ở chân trang.
  author: 'Nguyễn Tuấn Kiệt',
  // Link khi bấm vào tên tác giả.
  authorUrl: 'https://github.com/nguyen-tuankiet',
  // Biểu tượng mạng xã hội ở chân trang: điền link thì hiện, để rỗng thì ẩn. email: điền địa chỉ email hoặc mailto:...
  socials: { youtube: '', discord: '', email: '' },
};
