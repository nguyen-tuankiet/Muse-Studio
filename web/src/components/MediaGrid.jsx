import React, { useState } from 'react';
import { Card, Col, Empty, Popconfirm, Row, Space, Tooltip, Typography } from 'antd';
import { DeleteOutlined, DownloadOutlined, YoutubeOutlined } from '@ant-design/icons';
import { api } from '../api.js';
import { useApp, useRun } from '../store.jsx';
import { fmtBytes, fmtDate } from '../format.js';
import { MediaView, PostTag } from './common.jsx';
import PostModal from './PostModal.jsx';

// Lưới video/ảnh đã tạo, dùng ở Thư viện media và tab Video của kênh.
export default function MediaGrid({ items, empty, showProject = true }) {
  const { data, refresh } = useApp();
  const run = useRun();
  const [posting, setPosting] = useState(null);
  const postsOf = (asset) => data.channelData.posts.filter((post) => post.mediaId === asset.id && post.status !== 'REJECTED');
  if (!items.length) return <Empty style={{ padding: '64px 0' }} description={empty} />;
  return (
    <>
      <Row gutter={[16, 16]}>
        {items.map((asset) => {
          const isVideo = String(asset.mimeType).startsWith('video/');
          const posts = postsOf(asset);
          return (
            <Col key={asset.id} xs={24} sm={12} lg={8} xl={6}>
              <Card hoverable={false} cover={<MediaView asset={asset} height={210} />} styles={{ body: { padding: 16 } }}
                actions={[
                  <Tooltip key="dl" title="Tải xuống"><a href={asset.url} download aria-label="Tải xuống"><DownloadOutlined /></a></Tooltip>,
                  isVideo ? <Tooltip key="yt" title="Đăng lên YouTube"><YoutubeOutlined onClick={() => setPosting(asset)} aria-label="Đăng lên YouTube" /></Tooltip> : <span key="yt" />,
                  <Popconfirm key="rm" title="Xóa file này khỏi máy?" okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }} onConfirm={() => run(() => api(`/api/media/${asset.id}`, { method: 'DELETE' }), 'Đã xóa.').then(refresh)}>
                    <DeleteOutlined aria-label="Xóa" style={{ color: 'var(--ant-color-error)' }} />
                  </Popconfirm>,
                ]}>
                <Typography.Paragraph style={{ margin: 0, fontWeight: 500 }} ellipsis={{ rows: 2, tooltip: asset.prompt }}>{asset.prompt || 'Không có prompt'}</Typography.Paragraph>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>{showProject ? `${asset.project} · ` : ''}{fmtBytes(asset.size)}<br />{fmtDate(asset.createdAt)}</Typography.Text>
                {posts.length > 0 && <Space size={[4, 4]} wrap style={{ marginTop: 8, display: 'flex' }}>{posts.map((post) => <Tooltip key={post.id} title={post.url ? `${post.channelName} · mở trên YouTube` : post.channelName}>{post.url ? <a href={post.url} target="_blank" rel="noreferrer"><PostTag status={post.status} /></a> : <span><PostTag status={post.status} /></span>}</Tooltip>)}</Space>}
              </Card>
            </Col>
          );
        })}
      </Row>
      {posting && <PostModal asset={posting} onClose={() => setPosting(null)} />}
    </>
  );
}
