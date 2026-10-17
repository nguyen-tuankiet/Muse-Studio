import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, AutoComplete, Avatar, Badge, Button, Card, Col, Divider, Empty, Flex, Form, Input, InputNumber, Popconfirm, Radio, Result, Row, Segmented, Select, Space, Statistic, Switch, Table, Tabs, Tag, Tooltip, Typography,
} from 'antd';
import {
  CheckOutlined, DeleteOutlined, DisconnectOutlined, EditOutlined, ImportOutlined, LinkOutlined, PlayCircleOutlined, PlusOutlined, RobotOutlined, YoutubeOutlined,
} from '@ant-design/icons';
import { api } from '../api.js';
import { privacyOptions, sizeOptions } from '../constants.js';
import { fromNow, num } from '../format.js';
import { navigate, useRoute } from '../router.js';
import { useApp, useRun } from '../store.jsx';
import { PageHeader, Sparkline } from '../components/common.jsx';
import BatchModal from '../components/BatchModal.jsx';
import MediaGrid from '../components/MediaGrid.jsx';
import PostsTab from '../components/PostsTab.jsx';
import SchedulesTab from '../components/Schedules.jsx';
import { IdeasModal, ImportModal, PromptModal, PromptStatusTag, promptSource } from '../components/PromptTools.jsx';

const NICHES = ['Thiên nhiên & phong cảnh', 'Động vật dễ thương', 'Du lịch & ẩm thực', 'Khoa học & vũ trụ', 'Lịch sử & huyền thoại', 'Thư giãn & ASMR', 'Công nghệ & AI', 'Thể thao & hành động', 'Hoạt hình & fantasy', 'Kinh dị & bí ẩn'];
const TONES = ['Điện ảnh, hùng vĩ', 'Nhẹ nhàng, thư giãn', 'Hài hước, vui nhộn', 'Huyền bí, căng thẳng', 'Ấm áp, cảm xúc', 'Hiện đại, năng động'];

/* ----------------------------------------------------------------- Hồ sơ kênh */
function BriefTab({ channel }) {
  const run = useRun(); const { refresh } = useApp();
  const [form] = Form.useForm(); const [saving, setSaving] = useState(false);
  const brief = channel.brief;
  const submit = async (values) => {
    setSaving(true);
    const ok = await run(() => api(`/api/channels/${channel.id}`, {
      method: 'PATCH',
      body: { name: values.name, defaultPrivacy: values.defaultPrivacy, autoMetadata: values.autoMetadata, brief: { niche: values.niche, topic: values.topic, audience: values.audience, tone: values.tone, language: values.language, size: values.size || null, duration: values.duration || null, avoid: values.avoid, notes: values.notes } },
    }), 'Đã lưu hồ sơ kênh.');
    setSaving(false); if (ok) refresh();
  };
  return (
    <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} style={{ maxWidth: 900 }}
      initialValues={{ name: channel.name, defaultPrivacy: channel.defaultPrivacy, autoMetadata: channel.autoMetadata, ...brief, size: brief.size || undefined, duration: brief.duration || undefined }}>
      {!brief.niche && !brief.topic && <Alert type="info" showIcon style={{ marginBottom: 20 }} message="Điền ngách và chủ đề để Muse hiểu kênh của bạn" description="Từ hồ sơ này Muse sẽ gợi ý prompt cho từng video, đặt tiêu đề và mô tả đúng chất kênh. Chỉ cần ngách hoặc chủ đề là đủ để bắt đầu." />}
      <Card title="Chủ đề kênh" styles={{ body: { paddingBottom: 4 } }}>
        <Row gutter={16}>
          <Col xs={24} md={12}><Form.Item name="niche" label="Ngách" extra="Chọn gợi ý hoặc tự gõ."><AutoComplete size="large" maxLength={120} options={NICHES.map((value) => ({ value }))} placeholder="Ví dụ: Thiên nhiên & phong cảnh" /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="audience" label="Đối tượng người xem"><Input size="large" maxLength={200} placeholder="Ví dụ: người thích thư giãn, học sinh, sinh viên" /></Form.Item></Col>
        </Row>
        <Form.Item name="topic" label="Mô tả chủ đề" extra="Kênh nói về gì, phong cách hình ảnh ra sao. Càng cụ thể, prompt Muse gợi ý càng đúng ý."><Input.TextArea rows={4} maxLength={600} showCount placeholder="Ví dụ: Video ngắn về các cảnh thiên nhiên Việt Nam theo từng mùa, quay kiểu flycam điện ảnh, màu ấm." /></Form.Item>
        <Row gutter={16}>
          <Col xs={24} md={12}><Form.Item name="tone" label="Giọng điệu / phong cách"><AutoComplete size="large" maxLength={120} options={TONES.map((value) => ({ value }))} placeholder="Ví dụ: Điện ảnh, hùng vĩ" /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="language" label="Ngôn ngữ tiêu đề và mô tả"><Select size="large" options={[{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'English' }, { value: 'ja', label: '日本語' }, { value: 'ko', label: '한국어' }, { value: 'es', label: 'Español' }]} /></Form.Item></Col>
        </Row>
        <Form.Item name="avoid" label="Tránh" extra="Những thứ không muốn xuất hiện trong prompt."><Input size="large" maxLength={400} placeholder="Ví dụ: người thật, chữ trên hình, bạo lực" /></Form.Item>
        <Form.Item name="notes" label="Ghi chú thêm cho Muse"><Input.TextArea rows={2} maxLength={800} /></Form.Item>
      </Card>
      <Card title="Mặc định khi tạo video" style={{ marginTop: 16 }} styles={{ body: { paddingBottom: 4 } }}>
        <Row gutter={16}>
          <Col xs={24} md={8}><Form.Item name="size" label="Khung hình"><Select size="large" allowClear placeholder="Mặc định của Muse" options={sizeOptions} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="duration" label="Thời lượng (giây)"><InputNumber size="large" min={1} max={60} placeholder="Mặc định" style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="defaultPrivacy" label="Chế độ đăng mặc định"><Select size="large" options={privacyOptions} /></Form.Item></Col>
        </Row>
        <Form.Item name="autoMetadata" valuePropName="checked" label="Tự điền tiêu đề, mô tả, tag bằng Muse" extra="Video tạo xong sẽ có sẵn nội dung đăng để bạn chỉ cần xem lại rồi duyệt (tốn thêm một tin nhắn Muse mỗi video)."><Switch checkedChildren="Bật" unCheckedChildren="Tắt" /></Form.Item>
      </Card>
      <Card title="Tên kênh trong tool" style={{ marginTop: 16 }}>
        <Form.Item name="name" rules={[{ required: true, whitespace: true, message: 'Nhập tên.' }]} style={{ marginBottom: 0 }}><Input size="large" maxLength={80} style={{ maxWidth: 420 }} /></Form.Item>
      </Card>
      <Flex gap={12} style={{ marginTop: 24 }}><Button type="primary" size="large" htmlType="submit" loading={saving}>Lưu hồ sơ</Button>{(brief.niche || brief.topic) && <Typography.Text type="secondary" style={{ alignSelf: 'center' }}>Đổi hồ sơ sẽ làm Muse bắt đầu một cuộc chat mới cho kênh này.</Typography.Text>}</Flex>
    </Form>
  );
}

/* ----------------------------------------------------------------- Prompt */
function PromptsTab({ channel }) {
  const { data, tick, refresh } = useApp();
  const run = useRun();
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [selected, setSelected] = useState([]);
  const [modal, setModal] = useState(null); // { kind: 'prompt' | 'import' | 'ideas' | 'batch', prompt? }
  const hasCookie = data.dashboard?.provider?.status === 'connected';
  const hasBrief = Boolean(channel.brief.niche || channel.brief.topic);

  const load = useCallback(async () => {
    setLoading(true);
    try { const project = await api(`/api/projects/${channel.projectId}`); setPrompts(project.prompts); } catch { setPrompts([]); }
    setLoading(false);
  }, [channel.projectId]);
  useEffect(() => { load(); }, [load, tick]);

  const counts = { DRAFT: 0, APPROVED: 0, USED: 0 };
  prompts.forEach((prompt) => { counts[prompt.status || 'APPROVED'] += 1; });
  const shown = prompts.filter((prompt) => filter === 'ALL' || (prompt.status || 'APPROVED') === filter);
  const pickedDrafts = selected.filter((id) => prompts.find((prompt) => prompt.id === id)?.status === 'DRAFT');
  const approve = (ids) => run(() => api('/api/prompts/bulk', { method: 'POST', body: { ids, action: 'approve' } }), 'Đã duyệt.').then(() => { load(); refresh(); });

  const columns = [
    { title: 'Nội dung prompt', dataIndex: 'content', render: (content) => <Typography.Paragraph style={{ margin: 0 }} ellipsis={{ rows: 3, expandable: 'collapsible' }}>{content}</Typography.Paragraph> },
    { title: 'Trạng thái', width: 140, render: (_, prompt) => <><PromptStatusTag status={prompt.status} /><div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{promptSource[prompt.source] || ''}</Typography.Text></div></> },
    { title: 'Cập nhật', dataIndex: 'updatedAt', width: 130, responsive: ['lg'], render: fromNow },
    {
      title: '', width: 210, align: 'right',
      render: (_, prompt) => (
        <Space>
          {prompt.status === 'DRAFT' && <Tooltip title="Duyệt prompt"><Button type="primary" ghost icon={<CheckOutlined />} onClick={() => approve([prompt.id])} aria-label="Duyệt" /></Tooltip>}
          {prompt.status !== 'USED' && <Tooltip title="Tạo video từ prompt này"><Button icon={<PlayCircleOutlined />} onClick={() => { setSelected([prompt.id]); setModal({ kind: 'batch' }); }} aria-label="Tạo video" /></Tooltip>}
          <Button icon={<EditOutlined />} onClick={() => setModal({ kind: 'prompt', prompt })} aria-label="Sửa" />
          <Popconfirm title="Xóa prompt này?" okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }} onConfirm={() => run(() => api(`/api/prompts/${prompt.id}`, { method: 'DELETE' }), 'Đã xóa prompt.').then(() => { load(); refresh(); })}><Button danger icon={<DeleteOutlined />} aria-label="Xóa" /></Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      {!hasBrief && <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Muse cần biết kênh nói về gì để gợi ý prompt" action={<Button size="small" onClick={() => navigate(`/channel/${channel.id}`, { tab: 'brief' })}>Điền hồ sơ kênh</Button>} />}
      {hasBrief && !hasCookie && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="Chưa có cookie Muse nên chưa gợi ý hoặc tạo video được" action={<Button size="small" onClick={() => navigate('/settings')}>Mở cài đặt</Button>} />}
      <Flex wrap gap={12} justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <div style={{ maxWidth: '100%', overflowX: 'auto' }}><Segmented size="large" value={filter} onChange={setFilter} options={[{ value: 'ALL', label: `Tất cả ${prompts.length}` }, { value: 'DRAFT', label: `Chờ duyệt ${counts.DRAFT}` }, { value: 'APPROVED', label: `Đã duyệt ${counts.APPROVED}` }, { value: 'USED', label: `Đã dùng ${counts.USED}` }]} /></div>
        <Space wrap>
          <Button size="large" type="primary" icon={<RobotOutlined />} disabled={!hasBrief || !hasCookie} onClick={() => setModal({ kind: 'ideas' })}>Muse gợi ý prompt</Button>
          <Button size="large" icon={<PlusOutlined />} onClick={() => setModal({ kind: 'prompt' })}>Thêm</Button>
          <Button size="large" icon={<ImportOutlined />} onClick={() => setModal({ kind: 'import' })}>Nhập nhiều</Button>
        </Space>
      </Flex>
      {selected.length > 0 && (
        <Flex gap={8} wrap align="center" style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--ant-color-primary-bg)' }}>
          <Typography.Text strong>Đã chọn {selected.length}</Typography.Text>
          {pickedDrafts.length > 0 && <Button icon={<CheckOutlined />} onClick={() => approve(pickedDrafts)}>Duyệt {pickedDrafts.length} prompt chờ duyệt</Button>}
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => setModal({ kind: 'batch' })}>Tạo video</Button>
          <Popconfirm title={`Xóa ${selected.length} prompt?`} okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }} onConfirm={() => run(() => api('/api/prompts/bulk', { method: 'POST', body: { ids: selected, action: 'delete' } }), 'Đã xóa.').then(() => { setSelected([]); load(); refresh(); })}><Button danger icon={<DeleteOutlined />}>Xóa</Button></Popconfirm>
          <Button type="link" onClick={() => setSelected([])}>Bỏ chọn</Button>
        </Flex>
      )}
      <Table rowKey="id" columns={columns} dataSource={shown} loading={loading} pagination={shown.length > 20 ? { pageSize: 20, showSizeChanger: false } : false} scroll={{ x: 560 }}
        rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
        locale={{ emptyText: <Empty description={filter === 'ALL' ? 'Kênh chưa có prompt. Nhờ Muse gợi ý hoặc tự thêm.' : 'Không có prompt ở trạng thái này'} style={{ padding: '32px 0' }} /> }} />
      {modal?.kind === 'prompt' && <PromptModal projectId={channel.projectId} prompt={modal.prompt} onClose={() => setModal(null)} onSaved={() => { load(); refresh(); }} />}
      {modal?.kind === 'import' && <ImportModal projectId={channel.projectId} onClose={() => setModal(null)} onSaved={() => { load(); refresh(); }} />}
      {modal?.kind === 'ideas' && <IdeasModal channel={channel} onClose={() => setModal(null)} onSaved={() => { setFilter('DRAFT'); load(); refresh(); }} />}
      {modal?.kind === 'batch' && <BatchModal promptIds={selected} channel={channel} onClose={() => { setModal(null); }} onDone={() => setSelected([])} />}
    </>
  );
}

/* ----------------------------------------------------------------- Khung đầu trang */
function Header({ channel }) {
  const run = useRun(); const { refresh } = useApp();
  const stats = channel.stats; const history = channel.history || [];
  const statusTag = channel.needsAuth ? <Tag color="warning">Cần kết nối lại</Tag> : channel.connected ? <Tag color="success">Đã kết nối YouTube</Tag> : <Tag>Chưa kết nối</Tag>;
  return (
    <Card style={{ marginBottom: 20 }} styles={{ body: { padding: 20 } }}>
      <Row gutter={[24, 16]} align="middle">
        <Col xs={24} lg={10}>
          <Flex gap={16} align="center">
            <Avatar size={64} src={channel.avatarUrl || undefined} icon={<YoutubeOutlined />} style={{ background: channel.avatarUrl ? undefined : '#ff0033', flex: 'none' }} />
            <div style={{ minWidth: 0 }}>
              <Typography.Title level={3} style={{ margin: 0 }} ellipsis>{channel.name}</Typography.Title>
              <Typography.Text type="secondary" ellipsis>{channel.youtube ? `${channel.youtube.title}${channel.youtube.handle ? ` · ${channel.youtube.handle}` : ''}` : 'Kết nối để lấy thông tin kênh'}</Typography.Text>
              <div style={{ marginTop: 6 }}><Space wrap size={[6, 6]}>{statusTag}{channel.brief.niche && <Tag color="blue">{channel.brief.niche}</Tag>}</Space></div>
            </div>
          </Flex>
        </Col>
        <Col xs={24} lg={8}>
          {stats ? (
            <>
              <Row gutter={8}>
                <Col span={8}><Statistic title="Subscriber" value={stats.hiddenSubscribers ? 'Ẩn' : num(stats.subscribers)} valueStyle={{ fontSize: 20 }} /></Col>
                <Col span={8}><Statistic title="Lượt xem" value={num(stats.views)} valueStyle={{ fontSize: 20 }} /></Col>
                <Col span={8}><Statistic title="Video" value={num(stats.videos)} valueStyle={{ fontSize: 20 }} /></Col>
              </Row>
              <div style={{ marginTop: 6 }}><Sparkline values={history.map((entry) => entry.views)} /></div>
            </>
          ) : <Typography.Text type="secondary">Chưa có số liệu.</Typography.Text>}
        </Col>
        <Col xs={24} lg={6}>
          <Flex vertical gap={8} align="stretch">
            {channel.connected && !channel.needsAuth
              ? <Popconfirm title="Ngắt kết nối kênh khỏi YouTube?" description="Bài đã đăng vẫn còn trên YouTube." okText="Ngắt kết nối" cancelText="Hủy" onConfirm={() => run(() => api(`/api/channels/${channel.id}/disconnect`, { method: 'POST' })).then(refresh)}><Button icon={<DisconnectOutlined />}>Ngắt kết nối</Button></Popconfirm>
              : <Button type="primary" icon={<LinkOutlined />} href={`/oauth/youtube/start?channel=${channel.id}`}>{channel.needsAuth ? 'Kết nối lại' : 'Kết nối YouTube'}</Button>}
            <Popconfirm title="Xóa kênh khỏi tool?" description="Xóa lịch và bản ghi bài đăng. Prompt và video được giữ lại ở mục project chưa gắn kênh. Video trên YouTube không bị xóa." okText="Xóa kênh" cancelText="Hủy" okButtonProps={{ danger: true }}
              onConfirm={() => run(() => api(`/api/channels/${channel.id}`, { method: 'DELETE' }), 'Đã xóa kênh.').then((ok) => { if (ok) { refresh(); navigate('/channels'); } })}>
              <Button danger icon={<DeleteOutlined />}>Xóa kênh</Button>
            </Popconfirm>
          </Flex>
        </Col>
      </Row>
      {channel.syncError && <Alert type="warning" showIcon style={{ marginTop: 16 }} message={channel.syncError} />}
    </Card>
  );
}

/* ----------------------------------------------------------------- Trang */
export default function ChannelWorkspace({ channelId }) {
  const { data } = useApp();
  const { query } = useRoute();
  const channel = data.channelData.channels.find((item) => item.id === channelId);
  if (!channel) return <Result status="404" title="Không tìm thấy kênh" extra={<Button type="primary" onClick={() => navigate('/channels')}>Về danh sách kênh</Button>} />;

  const tabs = ['brief', 'prompts', 'videos', 'schedules', 'posts'];
  const tab = tabs.includes(query.tab) ? query.tab : (channel.brief.niche || channel.brief.topic ? 'prompts' : 'brief');
  const videos = data.media.filter((asset) => asset.projectId === channel.projectId);
  const posts = data.channelData.posts.filter((post) => post.channelId === channel.id);
  const schedules = data.channelData.schedules.filter((schedule) => schedule.channelId === channel.id);
  const review = posts.filter((post) => post.status === 'PENDING_REVIEW').length;
  const counts = channel.promptCounts || {};

  const items = [
    { key: 'brief', label: 'Hồ sơ kênh', children: <BriefTab key={`${channel.id}-${JSON.stringify(channel.brief)}`} channel={channel} /> },
    { key: 'prompts', label: <Space size={8}>Prompt<Badge count={counts.DRAFT || 0} size="small" /></Space>, children: <PromptsTab channel={channel} /> },
    { key: 'videos', label: <Space size={8}>{`Video (${videos.length})`}<Badge count={review} size="small" color="#fa8c16" /></Space>, children: <MediaGrid items={videos} showProject={false} empty="Kênh chưa có video. Duyệt prompt rồi bấm Tạo video, hoặc để lịch tự tạo." /> },
    { key: 'schedules', label: `Lịch tự động (${schedules.length})`, children: <SchedulesTab schedules={data.channelData.schedules} channels={data.channelData.channels.filter((item) => item.id === channel.id)} fixedChannelId={channel.id} /> },
    { key: 'posts', label: `Bài đăng (${posts.length})`, children: <PostsTab posts={posts} showChannel={false} /> },
  ];
  return (
    <>
      <PageHeader title={channel.name} subtitle="Mỗi kênh là một project: hồ sơ, prompt, video và lịch đăng nằm chung một chỗ." extra={<Button size="large" onClick={() => navigate('/channels')}>Tất cả kênh</Button>} />
      <Header channel={channel} />
      {review > 0 && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={`${review} video của kênh này đang chờ bạn duyệt`} action={<Button size="small" type="primary" onClick={() => navigate('/review')}>Duyệt ngay</Button>} />}
      <Tabs size="large" activeKey={tab} items={items} onChange={(key) => navigate(`/channel/${channel.id}`, { tab: key })} />
    </>
  );
}
