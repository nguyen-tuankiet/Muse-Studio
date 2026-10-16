import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { App as AntApp, Button } from 'antd';
import { api } from './api.js';
import { fmtDate } from './format.js';
import { privacyLabel } from './constants.js';
import { navigate } from './router.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const EMPTY = { projects: [], jobs: [], media: [], settings: null, dashboard: null, channelData: { channels: [], posts: [], schedules: [], quota: { used: 0, limit: 10000 }, client: { configured: false } } };
const EVENTS = [
  'job.updated', 'job.retried', 'job.cancelled', 'batch.created', 'project.created', 'project.updated', 'project.deleted',
  'prompt.created', 'prompt.updated', 'prompt.deleted', 'prompts.imported', 'prompts.generated', 'settings.updated', 'post.updated',
  'channels.changed', 'channels.synced', 'schedules.changed', 'media.deleted',
];

export function AppProvider({ children }) {
  const [data, setData] = useState(EMPTY);
  const [status, setStatus] = useState({ ready: false, error: null });
  const [tick, setTick] = useState(0); // tăng mỗi lần dữ liệu đổi để các trang tự tải lại phần riêng của mình
  const mounted = useRef(true);
  const { notification } = AntApp.useApp();
  const postStates = useRef(null); // trạng thái bài đăng ở lần tải trước, để báo khi upload xong

  // Báo ngay khi một bài upload xong (kèm link YouTube) hoặc thất bại. Lần tải đầu tiên không báo gì.
  const announcePosts = useCallback((posts) => {
    const before = postStates.current;
    if (before) {
      for (const post of posts) {
        const prev = before.get(post.id);
        const justUploaded = post.status === 'UPLOADED' && (prev ? prev !== 'UPLOADED' : Date.now() - new Date(post.uploadedAt || 0).getTime() < 120000);
        if (justUploaded && post.url) {
          const scheduled = post.publishAt && new Date(post.publishAt).getTime() > Date.now();
          notification.success({
            key: post.id, duration: 25, message: 'Đã đăng lên YouTube',
            description: (
              <div>
                <div style={{ fontWeight: 500 }}>{post.title}</div>
                <div>{post.channelName} · {scheduled ? `đang riêng tư, YouTube sẽ tự công khai lúc ${fmtDate(post.publishAt)}` : privacyLabel[post.youtubePrivacy || post.privacy]}</div>
                <div style={{ opacity: 0.7, fontSize: 13 }}>YouTube có thể mất vài phút để xử lý xong video.</div>
              </div>
            ),
            btn: <Button type="primary" size="small" href={post.url} target="_blank" rel="noreferrer">Xem trên YouTube</Button>,
          });
        } else if (prev && ['QUEUED', 'UPLOADING'].includes(prev) && ['FAILED', 'NEEDS_AUTH'].includes(post.status)) {
          notification.error({
            key: post.id, duration: 0, message: 'Đăng lên YouTube thất bại',
            description: <div><div style={{ fontWeight: 500 }}>{post.title}</div><div>{post.error}</div></div>,
            btn: <Button size="small" onClick={() => { notification.destroy(post.id); navigate('/channels', { tab: 'posts' }); }}>Mở danh sách bài đăng</Button>,
          });
        }
      }
    }
    postStates.current = new Map(posts.map((post) => [post.id, post.status]));
  }, [notification]);

  const refresh = useCallback(async () => {
    try {
      const [projects, jobs, media, settings, dashboard, channelData] = await Promise.all([
        api('/api/projects'), api('/api/jobs'), api('/api/media'), api('/api/settings'), api('/api/dashboard'), api('/api/channels'),
      ]);
      if (!mounted.current) return;
      setData({ projects, jobs, media, settings, dashboard, channelData });
      announcePosts(channelData.posts);
      setStatus({ ready: true, error: null });
      setTick((value) => value + 1);
    } catch (error) {
      if (mounted.current) setStatus((current) => ({ ...current, error: error.message }));
    }
  }, [announcePosts]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    let timer;
    const bump = () => { clearTimeout(timer); timer = setTimeout(refresh, 300); };
    const stream = new EventSource('/api/events');
    EVENTS.forEach((name) => stream.addEventListener(name, bump));
    return () => { mounted.current = false; clearTimeout(timer); stream.close(); };
  }, [refresh]);

  const value = useMemo(() => ({ data, status, tick, refresh }), [data, status, tick, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Chạy một thao tác bất đồng bộ: báo lỗi/thành công bằng message của Ant Design và trả về true/false.
export function useRun() {
  const { message } = AntApp.useApp();
  return useCallback(async (task, success) => {
    try {
      const result = await task();
      if (success) message.success(success);
      return result === undefined ? true : result;
    } catch (error) {
      message.error(error.message || 'Có lỗi xảy ra.');
      return false;
    }
  }, [message]);
}
