# Việc còn lại

## Chưa kiểm chứng với dịch vụ thật
- Toàn bộ luồng đã được kiểm thử bằng Muse giả và Google giả. Cần chạy thử với tài khoản Muse và kênh YouTube thật, đặc biệt:
  - Muse có trả đúng JSON ý tưởng/tiêu đề trong khung chat hay không (nếu Muse đổi cách trả lời, chỉnh `lib/ai.js`).
  - Selector giao diện muse.ai trong `lib/muse.js` (khối DOM ở đầu file) nếu Muse đổi giao diện.
  - Upload thật lên YouTube với project Google chưa kiểm duyệt (có thể bị khóa riêng tư).

## Ý tưởng chưa làm
- Xem workflow/từng cảnh của Muse và làm lại riêng cảnh chưa ưng.
- Dọn file media cũ (video bị từ chối vẫn nằm trong `data/media`).
- Mã hóa cookie/token lưu trong `data/`.
