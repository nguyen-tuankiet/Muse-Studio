import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Alert, Avatar, Button, Card, Col, Empty, Flex, List, Progress, Row, Segmented, Space, Tag, Typography } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, RightOutlined, ThunderboltOutlined, YoutubeOutlined } from '@ant-design/icons';
import { useApp } from '../store.jsx';
import { navigate } from '../router.js';
import { privacyLabel } from '../constants.js';
import { daysLabel, fmtDate, fromNow, nextRun, num } from '../format.js';
import { JobTag, PostTag } from '../components/common.jsx';

const PALETTE = ['#2563eb', '#7c3aed', '#16a34a', '#f59e0b', '#ec4899', '#0891b2', '#64748b'];
const greeting = () => { const hour = new Date().getHours(); return hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'; };

// Tổng lượt xem của các kênh theo từng ngày (số liệu lưu mỗi ngày là tổng tích lũy) rồi lấy hiệu để ra lượt xem mỗi ngày.
function viewSeries(channels, span) {
  const days = Array.from({ length: span + 1 }, (_, index) => dayjs().subtract(span - index, 'day').format('YYYY-MM-DD'));
  const cumulative = days.map((day) => channels.reduce((sum, channel) => {
    const history = channel.history || [];
    if (!history.length) return sum;
    const entry = [...history].reverse().find((item) => item.day <= day) || history[0]; // chưa có số liệu ngày đó: coi như bằng ngày đầu tiên (không tạo bước nhảy)
    return sum + entry.views;
  }, 0));
  return days.slice(1).map((day, index) => ({ day, value: Math.max(0, cumulative[index + 1] - cumulative[index]) }));
}

function Stat({ title, value, note, onClick, spark }) {
  return (
    <Card hoverable onClick={onClick} styles={{ body: { padding: 20 } }} style={{ height: '100%' }}>
      <Flex justify="space-between" align="flex-start">
        <Typography.Text type="secondary" style={{ fontSize: 15 }}>{title}</Typography.Text>
        <RightOutlined style={{ opacity: 0.35 }} />
      </Flex>
      <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.25, margin: '4px 0 8px' }}>{value}</div>
      <Flex justify="space-between" align="center" style={{ minHeight: 24 }}>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>{note}</Typography.Text>
        {spark}
      </Flex>
    </Card>
  );
}

function MiniLine({ values, color }) {
  if (!values || values.length < 2 || Math.max(...values) === Math.min(...values)) return null;
  const min = Math.min(...values); const span = Math.max(...values) - min;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 70},${22 - ((value - min) / span) * 18}`).join(' ');
  return <svg width="70" height="24" viewBox="0 0 70 24" aria-hidden="true"><polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ViewsChart({ series }) {
  const [hover, setHover] = useState(null);
  const width = 640; const height = 230; const pad = { left: 44, right: 12, top: 14, bottom: 28 };
  const max = Math.max(1, ...series.map((point) => point.value));
  const top = Math.ceil(max / 4 / (10 ** Math.max(0, String(Math.ceil(max / 4)).length - 1))) * (10 ** Math.max(0, String(Math.ceil(max / 4)).length - 1)) * 4 || 4;
  const x = (index) => pad.left + (index / Math.max(1, series.length - 1)) * (width - pad.left - pad.right);
  const y = (value) => pad.top + (1 - value / top) * (height - pad.top - pad.bottom);
  const line = series.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
  const area = `${pad.left},${height - pad.bottom} ${line} ${x(series.length - 1)},${height - pad.bottom}`;
  const active = hover === null ? null : series[hover];
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block', color: 'var(--ant-color-primary)' }} role="img" aria-label="Lượt xem mỗi ngày" onMouseLeave={() => setHover(null)}>
        {[0, 1, 2, 3, 4].map((step) => {
          const value = (top / 4) * step;
          return (<g key={step}><line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} stroke="var(--ant-color-border-secondary)" strokeDasharray="3 4" /><text x={pad.left - 8} y={y(value) + 4} textAnchor="end" fontSize="11" fill="var(--ant-color-text-tertiary)">{num(value)}</text></g>);
        })}
        <polygon points={area} fill="currentColor" opacity="0.1" />
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {series.map((point, index) => (
          <g key={point.day} onMouseEnter={() => setHover(index)}>
            <rect x={x(index) - 20} y={pad.top} width="40" height={height - pad.top - pad.bottom} fill="transparent" />
            {(hover === index || series.length <= 8) && <circle cx={x(index)} cy={y(point.value)} r={hover === index ? 5 : 3.5} fill="var(--ant-color-bg-container)" stroke="currentColor" strokeWidth="2.5" />}
            {(series.length <= 8 || index % 2 === 0) && <text x={x(index)} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--ant-color-text-tertiary)">{dayjs(point.day).format('DD/MM')}</text>}
          </g>
        ))}
      </svg>
      {active && (
        <div style={{ position: 'absolute', top: 0, right: 8, padding: '6px 12px', borderRadius: 8, background: 'var(--ant-color-bg-elevated)', boxShadow: 'var(--ant-box-shadow-secondary)', fontSize: 13 }}>
          <div style={{ opacity: 0.65 }}>{dayjs(active.day).format('DD/MM/YYYY')}</div><b>{num(active.value)}</b> lượt xem
        </div>
      )}
    </div>
  );
}

function Donut({ items, total }) {
  const radius = 78; const circumference = 2 * Math.PI * radius; const biggest = Math.max(...items.map((item) => item.value));
  let offset = 0;
  return (
    <Flex vertical gap={24} align="center">
      <svg width="220" height="220" viewBox="0 0 220 220" role="img" aria-label="Tỷ lệ lượt xem theo kênh" style={{ maxWidth: '100%' }}>
        <circle cx="110" cy="110" r={radius} fill="none" stroke="var(--ant-color-fill-secondary)" strokeWidth="30" />
        {items.map((item, index) => {
          const length = (item.value / total) * circumference;
          const circle = <circle key={item.id} cx="110" cy="110" r={radius} fill="none" stroke={PALETTE[index % PALETTE.length]} strokeWidth="30" strokeDasharray={`${Math.max(0, length - (items.length > 1 ? 2 : 0))} ${circumference}`} strokeDashoffset={-offset} transform="rotate(-90 110 110)" />;
          offset += length; return circle;
        })}
        <text x="110" y="112" textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--ant-color-text)">{num(total)}</text>
        <text x="110" y="134" textAnchor="middle" fontSize="13" fill="var(--ant-color-text-tertiary)">Lượt xem</text>
      </svg>
      <Flex vertical gap={14} style={{ width: '100%' }}>
        {items.map((item, index) => (
          <Flex key={item.id} align="center" gap={12}>
            <span style={{ width: 16, height: 16, borderRadius: 4, background: PALETTE[index % PALETTE.length], flex: 'none' }} />
            <Typography.Text ellipsis style={{ flex: '0 1 38%', minWidth: 0 }}>{item.name}</Typography.Text>
            <div style={{ flex: 1, minWidth: 30, display: 'flex' }}><div style={{ width: `${Math.max(6, (item.value / biggest) * 100)}%`, height: 10, borderRadius: 6, background: PALETTE[index % PALETTE.length] }} /></div>
            <Typography.Text style={{ minWidth: 64, textAlign: 'right' }}>{num(item.value)}</Typography.Text>
          </Flex>
        ))}
      </Flex>
    </Flex>
  );
}

const Section = ({ title, extra, children, ...rest }) => (
  <Card title={title} extra={extra} style={{ height: '100%' }} styles={{ body: { padding: '16px 24px 20px' } }} {...rest}>{children}</Card>
);

export default function Overview() {
  const { data } = useApp();
  const { dashboard, channelData, jobs } = data;
  const [span, setSpan] = useState(7);
  const channels = channelData.channels;
  const connected = channels.filter((channel) => channel.connected);
  const subs = connected.reduce((sum, channel) => sum + (channel.stats?.subscribers || 0), 0);
  const views = connected.reduce((sum, channel) => sum + (channel.stats?.views || 0), 0);
  const pending = channelData.posts.filter((post) => post.status === 'PENDING_REVIEW');
  const active = jobs.filter((job) => ['QUEUED', 'SUBMITTED', 'GENERATING'].includes(job.status));
  const quotaPct = Math.round((channelData.quota.used / channelData.quota.limit) * 100);
  const upcoming = channelData.schedules.filter((schedule) => schedule.enabled).map((schedule) => ({ schedule, at: nextRun(schedule) })).filter((item) => item.at).sort((a, b) => a.at - b.at).slice(0, 5);
  const series = useMemo(() => viewSeries(connected, span), [connected, span]); // eslint-disable-line react-hooks/exhaustive-deps
  const gained7 = useMemo(() => viewSeries(connected, 7).reduce((sum, point) => sum + point.value, 0), [connected]); // eslint-disable-line react-hooks/exhaustive-deps
  const subDelta = connected.reduce((sum, channel) => { const h = channel.history || []; if (h.length < 2) return sum; const old = [...h].reverse().find((e) => e.day <= dayjs().subtract(7, 'day').format('YYYY-MM-DD')) || h[0]; return sum + (h[h.length - 1].subscribers - old.subscribers); }, 0);
  const share = connected.filter((channel) => channel.stats?.views).map((channel) => ({ id: channel.id, name: channel.name, value: channel.stats.views })).sort((a, b) => b.value - a.value);
  const uploaded = channelData.posts.filter((post) => post.status === 'UPLOADED').sort((a, b) => String(b.uploadedAt || b.createdAt).localeCompare(String(a.uploadedAt || a.createdAt)));
  const latest = uploaded[0];
  const hasHistory = series.some((point) => point.value > 0);
  const pendingPrompts = dashboard?.pendingPrompts || 0;

  return (
    <>
      <Flex justify="space-between" align="flex-end" wrap gap={12} style={{ marginBottom: 24 }}>
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>{greeting()} 👋</Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0', fontSize: 15 }}>Theo dõi hiệu suất các kênh YouTube và việc Muse đang làm cho bạn.</Typography.Paragraph>
        </div>
        <Typography.Text type="secondary"><ClockCircleOutlined /> {['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][dayjs().day()]}, {dayjs().format('DD/MM/YYYY')}</Typography.Text>
      </Flex>

      <Flex vertical gap={12} style={{ marginBottom: 20 }}>
        {dashboard?.provider?.status !== 'connected' && <Alert type="warning" showIcon message="Chưa có cookie Muse" description="Dán cookie đăng nhập Muse để bắt đầu tạo video." action={<Button type="primary" onClick={() => navigate('/settings')}>Mở cài đặt</Button>} />}
        {!channelData.client.configured && <Alert type="info" showIcon message="Chưa kết nối Google OAuth" description="Cần thiết lập một lần để đăng video và xem số liệu kênh YouTube." action={<Button onClick={() => navigate('/channels')}>Thiết lập</Button>} />}
        {(pending.length > 0 || pendingPrompts > 0) && (
          <Alert type="success" showIcon message={[pendingPrompts > 0 && `${pendingPrompts} prompt`, pending.length > 0 && `${pending.length} video`].filter(Boolean).join(' và ') + ' đang chờ bạn duyệt'} description="Xem lại prompt Muse gợi ý và video đã tạo rồi quyết định tạo, đăng, sửa hoặc từ chối." action={<Button type="primary" onClick={() => navigate('/review')}>Duyệt ngay</Button>} />
        )}
        {channels.some((channel) => !channel.brief?.niche && !channel.brief?.topic) && <Alert type="info" showIcon message="Có kênh chưa điền chủ đề / ngách" description="Điền hồ sơ kênh để Muse gợi ý prompt đúng hướng cho từng video." action={<Button onClick={() => navigate('/channels')}>Mở danh sách kênh</Button>} />}
      </Flex>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}><Stat title="Kênh đã kết nối" value={<>{connected.length}<span style={{ fontSize: 18, opacity: 0.5 }}> / {channels.length}</span></>} note={connected.length === channels.length && channels.length ? 'Tất cả đang hoạt động' : `${channels.length - connected.length} kênh chưa kết nối`} onClick={() => navigate('/channels')} /></Col>
        <Col xs={24} sm={12} xl={6}><Stat title="Tổng subscriber" value={num(subs)} note={<Typography.Text type={subDelta >= 0 ? 'success' : 'danger'}>{subDelta >= 0 ? '+' : ''}{num(subDelta)} so với tuần trước</Typography.Text>} onClick={() => navigate('/channels')} /></Col>
        <Col xs={24} sm={12} xl={6}><Stat title="Tổng lượt xem" value={num(views)} note={<Typography.Text type="success">+{num(gained7)} trong 7 ngày</Typography.Text>} spark={<MiniLine values={viewSeries(connected, 7).map((point) => point.value)} color="#16a34a" />} onClick={() => navigate('/channels')} /></Col>
        <Col xs={24} sm={12} xl={6}><Stat title="Job đang chạy / chờ" value={active.length} note={active.length ? 'Muse đang tạo video' : 'Không có job nào'} onClick={() => navigate('/queue')} /></Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={14}>
          <Section title="Lượt xem mỗi ngày" extra={<Segmented value={span} onChange={setSpan} options={[{ value: 7, label: '7 ngày' }, { value: 14, label: '14 ngày' }, { value: 30, label: '30 ngày' }]} />}>
            {hasHistory ? <ViewsChart series={series} /> : <Empty style={{ padding: '36px 0' }} description="Biểu đồ sẽ hiện sau khi tool đồng bộ số liệu từ 2 ngày (mỗi 30 phút một lần)." />}
          </Section>
        </Col>
        <Col xs={24} xl={10}>
          <Section title="Lượt xem theo kênh" extra={<Typography.Text type="secondary">Tổng từ trước đến nay</Typography.Text>}>
            {share.length ? <Donut items={share} total={share.reduce((sum, item) => sum + item.value, 0)} /> : <Empty style={{ padding: '36px 0' }} description="Chưa có số liệu kênh" />}
          </Section>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={14}>
          <Section title="Video đăng gần nhất" extra={<Button type="link" onClick={() => navigate('/channels', { tab: 'posts' })}>Xem tất cả</Button>}>
            {latest ? (
              <Flex gap={20} wrap>
                <a href={latest.url || undefined} target="_blank" rel="noreferrer" style={{ display: 'block', width: 240, maxWidth: '100%', flex: 'none' }}>
                  <div style={{ aspectRatio: '16 / 9', background: '#0b0f19', borderRadius: 12, overflow: 'hidden' }}>
                    {latest.mediaUrl ? <video src={`${latest.mediaUrl}#t=0.5`} muted preload="metadata" playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }} /> : null}
                  </div>
                </a>
                <Flex vertical justify="space-between" style={{ flex: 1, minWidth: 220 }} gap={16}>
                  <div>
                    {latest.url ? <a href={latest.url} target="_blank" rel="noreferrer"><Typography.Text strong style={{ fontSize: 17 }}>{latest.title}</Typography.Text></a> : <Typography.Text strong style={{ fontSize: 17 }}>{latest.title}</Typography.Text>}
                    <div style={{ marginTop: 4 }}><Typography.Text type="secondary">{latest.channelName} · {fromNow(latest.uploadedAt || latest.createdAt)}</Typography.Text></div>
                    <div style={{ marginTop: 8 }}><Space size={6}><PostTag status={latest.status} />{latest.youtubePrivacy && <Tag style={{ marginInlineEnd: 0 }}>{privacyLabel[latest.youtubePrivacy]}</Tag>}</Space></div>
                  </div>
                  <Row gutter={12}>
                    {[['Lượt xem', latest.stats?.views], ['Lượt thích', latest.stats?.likes], ['Bình luận', latest.stats?.comments]].map(([label, value]) => (
                      <Col span={8} key={label}><div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{latest.stats ? num(value) : '—'}</div><Typography.Text type="secondary" style={{ fontSize: 13 }}>{label}</Typography.Text></Col>
                    ))}
                  </Row>
                </Flex>
              </Flex>
            ) : <Empty style={{ padding: '28px 0' }} description="Chưa có video nào được đăng" />}
          </Section>
        </Col>
        <Col xs={24} xl={10}>
          <Section title="Lịch chạy sắp tới" extra={<Button type="link" onClick={() => navigate('/channels', { tab: 'schedules' })}>Quản lý lịch</Button>}>
            {upcoming.length ? (
              <List split={false} dataSource={upcoming} renderItem={({ schedule, at }) => (
                <List.Item style={{ padding: '8px 0' }} extra={<Tag icon={<ClockCircleOutlined />} color="blue" style={{ marginInlineEnd: 0 }}>{at.diff(dayjs(), 'minute') < 1 ? 'Sắp chạy' : at.format('HH:mm DD/MM')}</Tag>}>
                  <List.Item.Meta title={schedule.name} description={`${schedule.channelName} · ${daysLabel(schedule.days)}`} />
                </List.Item>
              )} />
            ) : <Empty style={{ padding: '28px 0' }} description="Chưa có lịch nào đang bật" />}
          </Section>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={14}>
          <Section title="Hoạt động gần đây" extra={<Button type="link" onClick={() => navigate('/queue')}>Xem hàng đợi</Button>}>
            {jobs.length ? (
              <List split={false} dataSource={jobs.slice(0, 6)} renderItem={(job) => (
                <List.Item style={{ padding: '10px 0' }} extra={<JobTag status={job.status} />}>
                  <List.Item.Meta
                    avatar={job.status === 'COMPLETED' ? <CheckCircleOutlined style={{ color: 'var(--ant-color-success)', fontSize: 22 }} /> : <ThunderboltOutlined style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 22 }} />}
                    title={<Typography.Text ellipsis style={{ maxWidth: 420 }}>{job.prompt}</Typography.Text>}
                    description={<>{job.type === 'video' ? 'Video' : 'Ảnh'} · {job.project} · {fromNow(job.createdAt)}{['SUBMITTED', 'GENERATING'].includes(job.status) && job.progress > 0 && <Progress percent={Math.round(job.progress)} size="small" style={{ maxWidth: 260, marginBottom: 0 }} />}</>}
                  />
                </List.Item>
              )} />
            ) : <Empty style={{ padding: '28px 0' }} description="Chưa có job nào" />}
          </Section>
        </Col>
        <Col xs={24} xl={10}>
          <Flex vertical gap={16} style={{ height: '100%' }}>
            <Section title="Kênh YouTube" extra={<Button type="link" onClick={() => navigate('/channels')}>Quản lý kênh</Button>}>
              {channels.length ? (
                <List split={false} dataSource={channels} renderItem={(channel) => (
                  <List.Item style={{ padding: '8px 0', cursor: 'pointer' }} onClick={() => navigate(`/channel/${channel.id}`)} extra={channel.connected ? <Tag color="success" style={{ marginInlineEnd: 0 }}>Hoạt động</Tag> : <Tag style={{ marginInlineEnd: 0 }}>Chưa kết nối</Tag>}>
                    <List.Item.Meta avatar={<Avatar src={channel.avatarUrl || undefined} icon={<YoutubeOutlined />} style={{ background: channel.avatarUrl ? undefined : '#ff0033' }} />} title={channel.name}
                      description={channel.stats ? `${num(channel.stats.videos)} video · ${num(channel.stats.subscribers)} sub` : (channel.brief?.niche || 'Chưa có số liệu')} />
                  </List.Item>
                )} />
              ) : <Empty style={{ padding: '20px 0' }} description="Chưa có kênh nào" />}
            </Section>
            <Card size="small" title="Hạn mức YouTube hôm nay" styles={{ body: { paddingTop: 12 } }}>
              <Progress percent={quotaPct} status={quotaPct >= 90 ? 'exception' : 'normal'} />
              <Typography.Text type="secondary">{num(channelData.quota.used)} / {num(channelData.quota.limit)} đơn vị · mỗi lần upload tốn 1.600</Typography.Text>
            </Card>
          </Flex>
        </Col>
      </Row>
    </>
  );
}
