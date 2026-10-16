import { useEffect, useState } from 'react';

// Router tối giản dựa trên hash (#/channels?tab=review) để không cần thư viện ngoài và server không phải xử lý route.
const parse = () => {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(query)) };
};

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path, query) {
  const search = query ? `?${new URLSearchParams(query)}` : '';
  window.location.hash = `${path}${search}`;
}

// Đổi hash mà không thêm vào lịch sử (dùng để xóa tham số ?yt=ok sau khi đã hiển thị thông báo).
export function replaceRoute(path, query) {
  const search = query ? `?${new URLSearchParams(query)}` : '';
  window.history.replaceState(null, '', `#${path}${search}`);
  window.dispatchEvent(new Event('hashchange'));
}
