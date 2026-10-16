export const jobStatus = {
  QUEUED: { label: 'Đang chờ', color: 'default' },
  SUBMITTED: { label: 'Đã gửi', color: 'processing' },
  GENERATING: { label: 'Đang tạo', color: 'processing' },
  COMPLETED: { label: 'Hoàn thành', color: 'success' },
  FAILED: { label: 'Lỗi', color: 'error' },
  AUTH_REQUIRED: { label: 'Cần cookie', color: 'warning' },
  CANCELLED: { label: 'Đã hủy', color: 'default' },
  INTERRUPTED: { label: 'Gián đoạn', color: 'warning' },
};

export const postStatus = {
  PENDING_REVIEW: { label: 'Chờ duyệt', color: 'gold' },
  QUEUED: { label: 'Chờ upload', color: 'default' },
  UPLOADING: { label: 'Đang upload', color: 'processing' },
  UPLOADED: { label: 'Đã lên YouTube', color: 'success' },
  FAILED: { label: 'Lỗi', color: 'error' },
  NEEDS_AUTH: { label: 'Cần kết nối lại', color: 'warning' },
  REJECTED: { label: 'Đã từ chối', color: 'default' },
};

export const privacyOptions = [
  { value: 'private', label: 'Riêng tư' },
  { value: 'unlisted', label: 'Không công khai' },
  { value: 'public', label: 'Công khai' },
];
export const privacyLabel = Object.fromEntries(privacyOptions.map((item) => [item.value, item.label]));

export const sizeOptions = [
  { value: '16:9', label: '16:9 · Ngang (YouTube)' },
  { value: '9:16', label: '9:16 · Dọc (Shorts)' },
  { value: '1:1', label: '1:1 · Vuông' },
];

// Thứ tự hiển thị thứ Hai → Chủ nhật; giá trị theo Date.getDay() (0 = Chủ nhật).
export const dayOptions = [
  { value: 1, label: 'T2' }, { value: 2, label: 'T3' }, { value: 3, label: 'T4' }, { value: 4, label: 'T5' },
  { value: 5, label: 'T6' }, { value: 6, label: 'T7' }, { value: 0, label: 'CN' },
];
