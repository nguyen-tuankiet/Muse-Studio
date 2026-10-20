// Cấu hình trang giới thiệu: sửa file này, không cần đụng vào index.html.
window.SITE = {
  version: '2.0.0',
  // Link nút "Tải về". Mặc định là file zip do `npm run site:build` tạo ra trong thư mục downloads/.
  // Nếu bán thu phí: đổi thành link thanh toán/nhận file của bạn, hoặc để chuỗi rỗng '' để ẩn nút tải và chỉ hiện nút liên hệ.
  downloadUrl: 'downloads/muse-studio.zip',
  // Link liên hệ/mua (Zalo, Facebook, Telegram, email dạng mailto:...). Để rỗng '' để ẩn nút liên hệ.
  contactUrl: '',
  contactLabel: 'Liên hệ nhận bản cài',
  // Dòng ghi chú dưới nút tải (ví dụ giá, chính sách hỗ trợ). Để rỗng nếu không cần.
  note: 'Miễn phí dùng thử. Chạy trên máy của bạn, dữ liệu không rời khỏi máy.',
};
