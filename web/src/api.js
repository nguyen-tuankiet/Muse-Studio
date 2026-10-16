// Gọi API của server cục bộ. Server trả { data } khi thành công, { error: { message } } khi lỗi.
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  try { payload = await res.json(); } catch { /* không phải JSON */ }
  if (!res.ok) throw new Error(payload?.error?.message || `Lỗi ${res.status}`);
  return payload?.data;
}
