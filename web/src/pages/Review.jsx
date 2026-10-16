import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Flex, Space, Tag, Typography } from 'antd';
import { CheckOutlined, DeleteOutlined, EditOutlined, PlayCircleOutlined, YoutubeOutlined } from '@ant-design/icons';
import { api } from '../api.js';
import { navigate } from '../router.js';
import { useApp, useRun } from '../store.jsx';
import { PageHeader } from '../components/common.jsx';
import ReviewCard from '../components/ReviewCard.jsx';
import BatchModal from '../components/BatchModal.jsx';
import { PromptModal, promptSource } from '../components/PromptTools.jsx';

// Hộp thư duyệt chung: prompt Muse gợi ý (duyệt xong mới được tạo video) và video đã tạo (duyệt xong mới đăng).
function PromptReview({ channel }) {
  const { tick, refresh } = useApp();
  const run = useRun();
  const [drafts, setDrafts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [batch, setBatch] = useState(null);
  const load = useCallback(async () => {
    try { const project = await api(`/api/projects/${channel.projectId}`); setDrafts(project.prompts.filter((prompt) => prompt.status === 'DRAFT')); } catch { setDrafts([]); }
  }, [channel.projectId]);
  useEffect(() => { load(); }, [load, tick]);
  if (!drafts.length) return null;
  const approve = (ids) => run(() => api('/api/prompts/bulk', { method: 'POST', body: { ids, action: 'approve' } }), 'Đã duyệt.').then(() => { load(); refresh(); });
  return (
    <Card style={{ marginBottom: 16 }}
      title={<Flex gap={8} wrap align="center"><YoutubeOutlined style={{ color: '#ff0033' }} /><span>{channel.name}</span>{channel.brief.niche && <Tag color="blue" style={{ marginInlineEnd: 0 }}>{channel.brief.niche}</Tag>}<Tag color="gold" style={{ marginInlineEnd: 0 }}>{drafts.length} prompt chờ duyệt</Tag></Flex>}>
      <Flex gap={8} wrap style={{ marginBottom: 16 }}><Button icon={<CheckOutlined />} onClick={() => approve(drafts.map((prompt) => prompt.id))}>Duyệt tất cả</Button><Button type="primary" icon={<PlayCircleOutlined />} onClick={() => setBatch(drafts.map((prompt) => prompt.id))}>Duyệt và tạo video</Button></Flex>
      <Flex vertical gap={12}>
        {drafts.map((prompt) => (
          <Flex key={prompt.id} gap={12} align="flex-start" justify="space-between" style={{ padding: '12px 16px', border: '1px solid var(--ant-color-border-secondary)', borderRadius: 10 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <Typography.Paragraph style={{ margin: 0 }}>{prompt.content}</Typography.Paragraph>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{promptSource[prompt.source] || ''}</Typography.Text>
            </div>
            <Space>
              <Button type="primary" ghost icon={<CheckOutlined />} onClick={() => approve([prompt.id])}>Duyệt</Button>
              <Button icon={<EditOutlined />} onClick={() => setEditing(prompt)} aria-label="Sửa" />
              <Button danger icon={<DeleteOutlined />} aria-label="Xóa" onClick={() => run(() => api(`/api/prompts/${prompt.id}`, { method: 'DELETE' }), 'Đã xóa prompt.').then(() => { load(); refresh(); })} />
            </Space>
          </Flex>
        ))}
      </Flex>
      {editing && <PromptModal prompt={editing} onClose={() => setEditing(null)} onSaved={() => { load(); refresh(); }} />}
      {batch && <BatchModal promptIds={batch} channel={channel} onClose={() => setBatch(null)} />}
    </Card>
  );
}

export default function Review() {
  const { data } = useApp();
  const { channels, posts } = data.channelData;
  const pending = posts.filter((post) => post.status === 'PENDING_REVIEW');
  const withDrafts = channels.filter((channel) => (channel.promptCounts?.DRAFT || 0) > 0);
  const cookieOk = data.dashboard?.provider?.status === 'connected';
  return (
    <>
      <PageHeader title="Chờ duyệt" subtitle="Xem lại prompt Muse gợi ý và video đã tạo trước khi đi tiếp. Không có gì được tạo hay đăng khi bạn chưa duyệt." />
      {withDrafts.length > 0 && !cookieOk && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="Chưa có cookie Muse nên chưa tạo video được" action={<Button size="small" onClick={() => navigate('/settings')}>Mở cài đặt</Button>} />}
      {withDrafts.length > 0 && (
        <>
          <Typography.Title level={4}>Prompt chờ duyệt</Typography.Title>
          {withDrafts.map((channel) => <PromptReview key={channel.id} channel={channel} />)}
        </>
      )}
      {pending.length > 0 && (
        <>
          <Typography.Title level={4} style={{ marginTop: withDrafts.length ? 24 : 0 }}>Video chờ duyệt ({pending.length})</Typography.Title>
          <Flex vertical gap={16}>{pending.map((post) => <ReviewCard key={post.id} post={post} />)}</Flex>
        </>
      )}
      {!withDrafts.length && !pending.length && <Empty style={{ padding: '80px 0' }} description="Không có gì đang chờ duyệt. Nhờ Muse gợi ý prompt ở trang của từng kênh hoặc đặt lịch tự động." />}
    </>
  );
}
