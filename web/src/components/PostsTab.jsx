import React from 'react';
import { Button, Empty, Popconfirm, Space, Table, Tooltip, Typography } from 'antd';
import { DeleteOutlined, EyeOutlined, LikeOutlined, LinkOutlined, MessageOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api.js';
import { privacyLabel } from '../constants.js';
import { fmtDate, num } from '../format.js';
import { useApp, useRun } from '../store.jsx';
import { PostTag } from './common.jsx';

export default function PostsTab({ posts, showChannel = true }) {
  const run = useRun(); const { refresh } = useApp();
  const stuck = (post) => {
    if (post.status !== 'UPLOADED' || !post.youtubePrivacy) return false;
    const when = post.publishAt ? new Date(post.publishAt).getTime() : 0;
    return post.youtubePrivacy === 'private' && (post.privacy !== 'private' || when) && (!when || when < Date.now() - 10 * 60 * 1000);
  };
  const columns = [
    {
      title: 'Video', dataIndex: 'title',
      render: (title, post) => (
        <>
          {post.url ? <a href={post.url} target="_blank" rel="noreferrer"><Typography.Text strong style={{ color: 'inherit' }}>{title}</Typography.Text></a> : <Typography.Text strong>{title}</Typography.Text>}
          {post.error && <div><Typography.Text type="danger" style={{ fontSize: 13 }}>{post.error}</Typography.Text></div>}
          {post.youtubeMissing && <div><Typography.Text type="danger" style={{ fontSize: 13 }}>Không còn thấy video này trên YouTube (đã xóa?).</Typography.Text></div>}
          {stuck(post) && <div><Typography.Text type="warning" style={{ fontSize: 13 }}>Vẫn riêng tư dù đã đến giờ đăng: có thể project Google Cloud chưa được audit nên YouTube khóa upload ở chế độ riêng tư.</Typography.Text></div>}
        </>
      ),
    },
    ...(showChannel ? [{ title: 'Kênh', dataIndex: 'channelName', width: 160, responsive: ['md'] }] : []),
    { title: 'Trạng thái', dataIndex: 'status', width: 150, render: (status) => <PostTag status={status} /> },
    { title: 'Lịch / Chế độ', width: 180, responsive: ['lg'], render: (_, post) => (<>{post.publishAt ? `Hẹn ${fmtDate(post.publishAt)}` : fmtDate(post.uploadedAt || post.createdAt)}<div><Typography.Text type="secondary" style={{ fontSize: 13 }}>{privacyLabel[post.youtubePrivacy || post.privacy]}</Typography.Text></div></>) },
    { title: 'Số liệu', width: 200, responsive: ['md'], render: (_, post) => (post.stats ? (<Space size={12}><Tooltip title="Lượt xem"><span><EyeOutlined /> {num(post.stats.views)}</span></Tooltip><Tooltip title="Lượt thích"><span><LikeOutlined /> {num(post.stats.likes)}</span></Tooltip><Tooltip title="Bình luận"><span><MessageOutlined /> {num(post.stats.comments)}</span></Tooltip></Space>) : '—') },
    {
      title: '', width: 200, align: 'right',
      render: (_, post) => (
        <Space>
          {post.url && <Button type="primary" ghost icon={<LinkOutlined />} href={post.url} target="_blank" rel="noreferrer">Xem video</Button>}
          {['FAILED', 'NEEDS_AUTH'].includes(post.status) && !post.youtubeVideoId && <Button icon={<ReloadOutlined />} onClick={() => run(() => api(`/api/posts/${post.id}/retry`, { method: 'POST' })).then(refresh)}>Thử lại</Button>}
          {post.status !== 'UPLOADING' && <Popconfirm title="Xóa bản ghi này?" description="Chỉ xóa trong tool, video đã lên YouTube không bị xóa." okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }} onConfirm={() => run(() => api(`/api/posts/${post.id}`, { method: 'DELETE' })).then(refresh)}><Button type="text" danger icon={<DeleteOutlined />} aria-label="Xóa" /></Popconfirm>}
        </Space>
      ),
    },
  ];
  return <Table rowKey="id" columns={columns} dataSource={posts} scroll={{ x: 600 }} pagination={posts.length > 15 ? { pageSize: 15, showSizeChanger: false } : false} locale={{ emptyText: <Empty description="Chưa có bài đăng. Đăng từ tab Video hoặc để lịch tự tạo." style={{ padding: '32px 0' }} /> }} />;
}
