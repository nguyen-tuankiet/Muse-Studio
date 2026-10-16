import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { dayOptions } from './constants.js';

dayjs.extend(relativeTime);

export const fmtDate = (value) => (value ? dayjs(value).format('HH:mm DD/MM/YYYY') : '—');
export const fromNow = (value) => (value ? dayjs(value).fromNow() : '—');
export const num = (value) => new Intl.NumberFormat('vi-VN').format(value ?? 0);

export const fmtBytes = (value) => {
  if (!value) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value; let index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return `${size.toFixed(index ? 1 : 0)} ${units[index]}`;
};

export const daysLabel = (days = []) => (days.length === 7
  ? 'Hằng ngày'
  : dayOptions.filter((day) => days.includes(day.value)).map((day) => day.label).join(', '));

// Thời điểm lịch sẽ chạy tiếp theo (giờ máy này), có tính cả việc hôm nay đã chạy rồi.
export function nextRun(schedule) {
  if (!schedule.enabled) return null;
  const [hour, minute] = schedule.time.split(':').map(Number);
  const today = dayjs().format('YYYY-MM-DD');
  for (let offset = 0; offset < 8; offset += 1) {
    const day = dayjs().add(offset, 'day').hour(hour).minute(minute).second(0);
    if (!schedule.days.includes(day.day())) continue;
    if (offset === 0) {
      if (schedule.lastRunDay === today) continue; // hôm nay đã chạy rồi
      if (day.isBefore(dayjs())) return dayjs(); // quá giờ mà chưa chạy: sẽ chạy bù ngay khi đủ điều kiện
    }
    return day;
  }
  return null;
}
