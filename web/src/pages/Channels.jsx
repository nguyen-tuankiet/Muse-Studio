import React, { useEffect, useState } from 'react';
import { App as AntApp, Alert, Avatar, Badge, Button, Card, Col, Empty, Flex, Progress, Row, Select, Space, Statistic, Tabs, Tag, Tooltip, Typography } from 'antd';
import { PlusOutlined, RightOutlined, SyncOutlined, YoutubeOutlined } from '@ant-design/icons';
import { api } from '../api.js';
import { num } from '../format.js';
import { navigate, replaceRoute, useRoute } from '../router.js';
import { useApp, useRun } from '../store.jsx';
import { PageHeader, Sparkline } from '../components/common.jsx';
import OAuthClientForm from '../components/OAuthClientForm.jsx';
import OAuthGuide from '../components/OAuthGuide.jsx';
import PostsTab from '../components/PostsTab.jsx';
import SchedulesTab from '../components/Schedules.jsx';

/* ----------------------------------------------------------------- Thiết lập Google OAuth lần đầu */
function SetupWizard({ client }) {
  return (
    <Card>
      <Row gutter={[40, 24]}>
        <Col xs={24} xl={13}>
          <Typography.Title level={4} style={{ marginTop: 0 }}>Kết nối ứng dụng với Google (làm một lần)</Typography.Title>
          <Typography.Paragraph type="secondary">Google yêu cầu bạn tự tạo thông tin xác thực để tool được phép đăng video và đọc số liệu kênh của bạn.</Typography.Paragraph>
          <OAuthGuide redirectUri={client.redirectUri} />
        </Col>
        <Col xs={24} xl={11}>
          <Card type="inner" title="Dán Client ID và Client Secret"><OAuthClientForm client={client} compact /></Card>
        </Col>
      </Row>
    </Card>
  );
}

/* ----------------------------------------------------------------- Thẻ kênh (bấm để vào trang của kênh) */
function ChannelCard({ channel, pendingVideos }) {
  const stats = channel.stats; const history = channel.history || [];
  const delta = history.length > 1 ? history[history.length - 1].views - history[history.length - 2].views : null;
  const statusTag = channel.needsAuth ? <Tag color="warning">Cần kết nối lại</Tag> : channel.connected ? <Tag color="success">Đã kết nối</Tag> : <Tag>Chưa kết nối</Tag>;
  const counts = channel.promptCounts || {};
  const hasBrief = Boolean(channel.brief.niche || channel.brief.topic);
  return (
    <Card hoverable onClick={() => navigate(`/channel/${channel.id}`)} styles={{ body: { padding: 20 } }} style={{ height: '100%' }}>
      <Flex justify="space-between" align="flex-start" gap={12}>
        <Flex gap={12} align="center" style={{ minWidth: 0 }}>
          <Avatar size={56} src={channel.avatarUrl || undefined} icon={<YoutubeOutlined />} style={{ background: channel.avatarUrl ? undefined : '#ff0033', flex: 'none' }} />
          <div style={{ minWidth: 0 }}>
            <Typography.Text strong style={{ fontSize: 16 }} ellipsis>{channel.name}</Typography.Text>
            <div><Typography.Text type="secondary" ellipsis>{channel.youtube ? `${channel.youtube.title}${channel.youtube.handle ? ` · ${channel.youtube.handle}` : ''}` : 'Kết nối để lấy thông tin kênh'}</Typography.Text></div>
          </div>
        </Flex>
        {statusTag}
      </Flex>
      <div style={{ margin: '14px 0 4px', minHeight: 28 }}>
        {hasBrief ? <Tag color="blue" style={{ whiteSpace: 'normal' }}>{channel.brief.niche || channel.brief.topic.slice(0, 60)}</Tag> : <Tag color="gold">Chưa điền chủ đề kênh</Tag>}
      </div>
      {stats ? (
        <>
          <Row gutter={12} style={{ margin: '8px 0' }}>
            <Col span={8}><Statistic title="Subscriber" value={stats.hiddenSubscribers ? 'Ẩn' : num(stats.subscribers)} valueStyle={{ fontSize: 20 }} /></Col>
            <Col span={8}><Statistic title="Lượt xem" value={num(stats.views)} valueStyle={{ fontSize: 20 }} /></Col>
            <Col span={8}><Statistic title="Video" value={num(stats.videos)} valueStyle={{ fontSize: 20 }} /></Col>
          </Row>
          <Sparkline values={history.map((entry) => entry.views)} />
          {delta !== null && <Typography.Text type={delta >= 0 ? 'success' : 'danger'} style={{ fontSize: 13 }}>{delta >= 0 ? '+' : ''}{num(delta)} lượt xem so với hôm trước</Typography.Text>}
        </>
      ) : <div style={{ height: 24 }} />}
      <Flex justify="space-between" align="center" style={{ marginTop: 16 }} wrap gap={8}>
        <Space size={6} wrap>
          <Tooltip title="Prompt Muse gợi ý đang chờ bạn duyệt"><Badge count={counts.DRAFT || 0} color="#faad14" showZero={false}><Tag style={{ marginInlineEnd: 0 }}>Prompt chờ duyệt</Tag></Badge></Tooltip>
          <Tag color="green" style={{ marginInlineEnd: 0 }}>{counts.APPROVED || 0} sẵn sàng</Tag>
          {pendingVideos > 0 && <Tag color="orange" style={{ marginInlineEnd: 0 }}>{pendingVideos} video chờ duyệt</Tag>}
        </Space>
        <Typography.Text type="secondary">Mở kênh <RightOutlined /></Typography.Text>
      </Flex>
    </Card>
  );
}

// Project cũ chưa thuộc kênh nào (còn sót từ phiên bản trước hoặc sau khi xóa kênh): gắn vào một kênh để dùng tiếp.
function Orphans({ channels }) {
  const { data, refresh } = useApp();
  const run = useRun();
  const [target, setTarget] = useState({});
  const orphans = data.projects.filter((project) => !project.channelId);
  if (!orphans.length || !channels.length) return null;
  return (
    <Alert type="info" showIcon style={{ marginBottom: 20 }} message="Có prompt và video chưa thuộc kênh nào"
      description={(
        <Flex vertical gap={10} style={{ marginTop: 8 }}>
          {orphans.map((project) => (
            <Flex key={project.id} gap={8} wrap align="center">
              <Typography.Text strong>{project.name}</Typography.Text>
              <Typography.Text type="secondary">{project.promptCount} prompt · {project.jobCount} job</Typography.Text>
              <Select size="small" style={{ minWidth: 180 }} placeholder="Gắn vào kênh..." value={target[project.id]} onChange={(value) => setTarget({ ...target, [project.id]: value })} options={channels.map((channel) => ({ value: channel.id, label: channel.name }))} />
              <Button size="small" type="primary" disabled={!target[project.id]} onClick={() => run(() => api(`/api/projects/${project.id}/attach`, { method: 'POST', body: { channelId: target[project.id] } }), 'Đã gắn vào kênh.').then(refresh)}>Gắn</Button>
            </Flex>
          ))}
        </Flex>
      )} />
  );
}

/* ----------------------------------------------------------------- Trang */
export default function Channels() {
  const { data, refresh } = useApp();
  const run = useRun();
  const { message } = AntApp.useApp();
  const { query } = useRoute();
  const { channels, posts, schedules, quota, client } = data.channelData;
  const [syncing, setSyncing] = useState(false);
  const tab = ['channels', 'schedules', 'posts'].includes(query.tab) ? query.tab : 'channels';

  useEffect(() => {
    if (!query.yt) return;
    if (query.yt === 'ok') {
      message.success('Đã kết nối kênh YouTube.');
      // Kênh vừa thêm: sang thẳng trang kênh để điền chủ đề / ngách.
      if (query.channel) { replaceRoute(`/channel/${query.channel}`, { tab: 'brief' }); return; }
    } else message.error(query.msg || 'Kết nối YouTube thất bại.');
    replaceRoute('/channels', query.tab ? { tab: query.tab } : undefined);
  }, [query.yt]); // eslint-disable-line react-hooks/exhaustive-deps

  const sync = async () => { setSyncing(true); await run(() => api('/api/youtube/sync', { method: 'POST' }), 'Đã đồng bộ số liệu.'); setSyncing(false); refresh(); };
  const quotaPct = Math.round((quota.used / quota.limit) * 100);
  const subtitle = 'Mỗi kênh YouTube là một project riêng với chủ đề, prompt, video và lịch đăng của nó.';

  if (!client.configured) return (<><PageHeader title="Kênh YouTube" subtitle={subtitle} /><SetupWizard client={client} /></>);

  const items = [
    {
      key: 'channels', label: `Kênh (${channels.length})`,
      children: (
        <>
          <Orphans channels={channels} />
          {channels.length
            ? <Row gutter={[16, 16]}>{channels.map((channel) => <Col key={channel.id} xs={24} md={12} xl={8}><ChannelCard channel={channel} pendingVideos={posts.filter((post) => post.channelId === channel.id && post.status === 'PENDING_REVIEW').length} /></Col>)}</Row>
            : <Empty style={{ padding: '48px 0' }} description="Chưa có kênh nào. Bấm để chuyển sang Google, chọn tài khoản và kênh YouTube muốn kết nối."><Button type="primary" size="large" icon={<PlusOutlined />} href="/oauth/youtube/start?new=1">Thêm kênh đầu tiên</Button></Empty>}
        </>
      ),
    },
    { key: 'schedules', label: `Tất cả lịch (${schedules.length})`, children: <SchedulesTab schedules={schedules} channels={channels} /> },
    { key: 'posts', label: `Tất cả bài đăng (${posts.length})`, children: <PostsTab posts={posts} /> },
  ];

  return (
    <>
      <PageHeader title="Kênh YouTube" subtitle={subtitle}
        extra={<><Button size="large" icon={<SyncOutlined spin={syncing} />} onClick={sync} disabled={syncing}>Đồng bộ số liệu</Button><Button type="primary" size="large" icon={<PlusOutlined />} href="/oauth/youtube/start?new=1">Thêm kênh</Button></>} />
      <Card size="small" style={{ marginBottom: 20 }}>
        <Flex align="center" gap={16} wrap>
          <Typography.Text strong>Hạn mức YouTube hôm nay</Typography.Text>
          <Progress percent={quotaPct} style={{ flex: 1, minWidth: 180, margin: 0 }} status={quotaPct >= 90 ? 'exception' : 'normal'} />
          <Tooltip title="Mỗi lần upload tốn 1.600 đơn vị. Hạn mức reset lúc 0h giờ Thái Bình Dương (khoảng 14–15h giờ Việt Nam)."><Typography.Text type="secondary">{num(quota.used)} / {num(quota.limit)}</Typography.Text></Tooltip>
        </Flex>
      </Card>
      <Tabs size="large" activeKey={tab} items={items} onChange={(key) => navigate('/channels', { tab: key })} />
    </>
  );
}
