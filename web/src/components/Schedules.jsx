import React, { useState } from 'react';
import {
  Alert, Button, Checkbox, Col, Divider, Empty, Flex, Form, Input, InputNumber, Modal, Popconfirm, Radio, Row, Select, Space, Switch, Table, Tag, TimePicker, Tooltip, Typography,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../api.js';
import { dayOptions, privacyOptions, sizeOptions } from '../constants.js';
import { daysLabel, fmtDate } from '../format.js';
import { useApp, useRun } from '../store.jsx';

const sourceInfo = {
  auto: { label: 'Muse tự nghĩ', color: 'purple' },
  queue: { label: 'Prompt đã duyệt', color: 'blue' },
  media: { label: 'Video có sẵn', color: 'cyan' },
};

function ScheduleModal({ schedule, channels, fixedChannelId, onClose }) {
  const run = useRun(); const { refresh, data } = useApp();
  const aiReady = Boolean(data.dashboard?.ai?.configured);
  const [form] = Form.useForm(); const [saving, setSaving] = useState(false);
  const source = Form.useWatch('source', form) ?? schedule?.source ?? 'auto';
  const channelId = Form.useWatch('channelId', form) ?? schedule?.channelId ?? fixedChannelId ?? channels[0]?.id;
  const channel = channels.find((item) => item.id === channelId);
  const videos = data.media.filter((asset) => asset.projectId === channel?.projectId && String(asset.mimeType).startsWith('video/'));
  const initial = schedule
    ? { ...schedule, time: dayjs(schedule.time, 'HH:mm'), publishTime: schedule.publishTime ? dayjs(schedule.publishTime, 'HH:mm') : null, autoPublish: schedule.autoPublish ? 1 : 0, aiMetadata: Boolean(schedule.aiMetadata), size: schedule.size || undefined, duration: schedule.duration || undefined, privacy: schedule.privacy || undefined }
    : { channelId: fixedChannelId || channels[0]?.id, source: 'auto', autoFill: true, time: dayjs('08:00', 'HH:mm'), days: [0, 1, 2, 3, 4, 5, 6], autoPublish: 0, mediaIds: [] };
  const submit = async (values) => {
    const body = {
      name: values.name, channelId: values.channelId, time: values.time.format('HH:mm'), publishTime: values.publishTime ? values.publishTime.format('HH:mm') : '',
      days: values.days, source: values.source, mediaIds: values.source === 'media' ? values.mediaIds || [] : [], autoFill: values.source === 'queue' ? Boolean(values.autoFill) : true,
      hint: values.source === 'media' ? '' : values.hint || '', autoPublish: values.autoPublish === 1, aiMetadata: Boolean(values.aiMetadata),
      size: values.source === 'media' ? '' : values.size || '', duration: values.source === 'media' ? '' : values.duration || '', privacy: values.privacy || '',
    };
    setSaving(true);
    const ok = await run(() => (schedule ? api(`/api/schedules/${schedule.id}`, { method: 'PATCH', body }) : api('/api/schedules', { method: 'POST', body })), 'Đã lưu lịch.');
    setSaving(false); if (ok) { onClose(); refresh(); }
  };
  return (
    <Modal open title={schedule ? 'Sửa lịch' : 'Thêm lịch tự động'} onCancel={onClose} okText={schedule ? 'Lưu lịch' : 'Tạo lịch'} cancelText="Hủy" confirmLoading={saving} onOk={() => form.submit()} width={700} maskClosable={false} styles={{ body: { maxHeight: '70vh', overflowY: 'auto', paddingRight: 8 } }}>
      <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} initialValues={initial} style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col xs={24} sm={12}><Form.Item name="name" label="Tên lịch" rules={[{ required: true, whitespace: true, message: 'Nhập tên lịch.' }]}><Input size="large" maxLength={80} placeholder="Ví dụ: Video mỗi sáng" /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="channelId" label="Kênh đăng" rules={[{ required: true }]}><Select size="large" disabled={Boolean(fixedChannelId)} options={channels.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item></Col>
        </Row>

        <Divider orientation="left" orientationMargin={0}>Nội dung lấy từ đâu</Divider>
        <Form.Item name="source" style={{ marginBottom: 12 }}>
          <Radio.Group style={{ width: '100%' }}>
            <Flex vertical gap={10}>
              <Radio value="auto"><b>Muse tự nghĩ mỗi ngày</b> <Tag color="green">Tiện nhất</Tag><div style={{ marginLeft: 24, opacity: 0.7 }}>Đến giờ, Muse nghĩ prompt mới theo hồ sơ kênh rồi tạo video luôn. Không cần chuẩn bị gì.</div></Radio>
              <Radio value="queue"><b>Prompt đã duyệt trong project</b><div style={{ marginLeft: 24, opacity: 0.7 }}>Lấy lần lượt các prompt bạn đã duyệt ở tab Prompt của kênh.</div></Radio>
              <Radio value="media"><b>Video đã tạo sẵn</b><div style={{ marginLeft: 24, opacity: 0.7 }}>Chỉ đăng các video có sẵn trong kênh, mỗi ngày một video, không tốn quota Muse tạo video.</div></Radio>
            </Flex>
          </Radio.Group>
        </Form.Item>
        {source === 'queue' && (
          <Form.Item name="autoFill" valuePropName="checked" extra="Khi hết prompt đã duyệt, Muse tự nghĩ thêm cho ngày đó thay vì dừng lịch.">
            <Checkbox>Muse tự sinh thêm khi hết prompt</Checkbox>
          </Form.Item>
        )}
        {source === 'media' && (
          <Form.Item name="mediaIds" label={`Chọn video để đăng (${videos.length} video trong kênh)`} rules={[{ required: true, type: 'array', min: 1, message: 'Chọn ít nhất một video.' }]} extra="Đăng theo thứ tự đã chọn, mỗi ngày một video. Hết video thì lịch tự tắt.">
            <Select mode="multiple" size="large" placeholder="Chọn video đã tạo" optionFilterProp="label" maxTagCount="responsive"
              options={videos.map((asset) => ({ value: asset.id, label: `${(asset.prompt || 'Video').slice(0, 70)} · ${fmtDate(asset.createdAt)}` }))} />
          </Form.Item>
        )}
        {source !== 'media' && (
          <>
            <Form.Item name="hint" label="Yêu cầu thêm cho Muse (tùy chọn)" extra="Áp dụng mỗi lần Muse nghĩ prompt, ví dụ: ưu tiên cảnh đêm, không lặp địa điểm.">
              <Input maxLength={300} placeholder="Để trống nếu theo đúng hồ sơ kênh" />
            </Form.Item>
            <Row gutter={16}>
              <Col xs={24} sm={12}><Form.Item name="size" label="Khung hình"><Select allowClear placeholder={channel?.brief?.size ? `Theo hồ sơ kênh (${channel.brief.size})` : 'Mặc định của Muse'} options={sizeOptions} /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name="duration" label="Thời lượng (giây)"><InputNumber min={1} max={60} placeholder={channel?.brief?.duration ? `Theo hồ sơ kênh (${channel.brief.duration}s)` : 'Mặc định'} style={{ width: '100%' }} /></Form.Item></Col>
            </Row>
          </>
        )}

        <Divider orientation="left" orientationMargin={0}>Thời gian</Divider>
        <Row gutter={16}>
          <Col xs={24} sm={12}><Form.Item name="time" label={source === 'media' ? 'Giờ đưa video vào duyệt' : 'Giờ bắt đầu tạo video'} rules={[{ required: true, message: 'Chọn giờ.' }]} extra="Chạy mỗi ngày vào giờ này."><TimePicker format="HH:mm" size="large" style={{ width: '100%' }} allowClear={false} /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="publishTime" label="Giờ đăng công khai" extra="Tùy chọn. Để trống thì đăng ngay khi duyệt."><TimePicker format="HH:mm" size="large" style={{ width: '100%' }} /></Form.Item></Col>
        </Row>
        <Form.Item name="days" label="Chạy vào các ngày" rules={[{ required: true, type: 'array', min: 1, message: 'Chọn ít nhất một ngày.' }]}><Checkbox.Group options={dayOptions} /></Form.Item>

        <Divider orientation="left" orientationMargin={0}>Sau khi có video</Divider>
        <Form.Item name="autoPublish" label="Cách xử lý video">
          <Radio.Group>
            <Space direction="vertical"><Radio value={0}>Chờ tôi duyệt <Tag color="green">Khuyên dùng</Tag></Radio><Radio value={1}>Tự đăng, không cần duyệt</Radio></Space>
          </Radio.Group>
        </Form.Item>
        <Form.Item name="aiMetadata" valuePropName="checked" label="Muse đặt tiêu đề, mô tả và tag" extra={aiReady ? 'Thêm một tin nhắn Muse cho mỗi video. Nếu Muse lỗi, tool dùng prompt làm tiêu đề. Nếu tắt, tool theo cài đặt "tự điền tiêu đề" của kênh.' : 'Cần cookie Muse trong Cài đặt để dùng tính năng này.'}>
          <Switch disabled={!aiReady} checkedChildren="Bật" unCheckedChildren="Tắt" />
        </Form.Item>
        <Form.Item name="privacy" label="Chế độ nếu không hẹn giờ đăng"><Select allowClear placeholder="Mặc định của kênh" options={privacyOptions} /></Form.Item>
        <Alert type="info" showIcon message="Lịch tạo hôm nay đã quá giờ sẽ bắt đầu từ ngày kế tiếp. Nếu máy tắt đúng giờ chạy, lịch tự chạy bù khi bật máy trong cùng ngày. Nếu Muse lỗi, tool thử lại sau ít phút (tối đa 3 lần mỗi ngày)." />
      </Form>
    </Modal>
  );
}

// Danh sách lịch. fixedChannelId: dùng trong trang của một kênh (không cho chọn kênh khác).
export default function SchedulesTab({ schedules, channels, fixedChannelId }) {
  const run = useRun(); const { refresh } = useApp();
  const [modal, setModal] = useState(null);
  const [running, setRunning] = useState(null);
  const connected = channels.filter((channel) => channel.connected);
  const shown = fixedChannelId ? schedules.filter((item) => item.channelId === fixedChannelId) : schedules;
  const nextText = (item) => {
    if (item.source === 'auto') return item.hint ? `Muse tự nghĩ · "${item.hint}"` : 'Muse tự nghĩ prompt mới mỗi ngày';
    if (item.source === 'queue') return item.nextItem ? item.nextItem : item.autoFill ? 'Hết prompt đã duyệt: Muse sẽ tự nghĩ tiếp' : 'Hết prompt đã duyệt';
    return item.nextItem || 'Hết video';
  };
  const sub = (item) => {
    if (item.source === 'queue') return `${item.queueSize} prompt đã duyệt đang chờ${item.autoFill ? ', tự sinh thêm khi hết' : ''}`;
    if (item.source === 'media') return `Còn ${item.remaining} video`;
    return '';
  };
  const runNow = async (item) => {
    setRunning(item.id);
    await run(() => api(`/api/schedules/${item.id}/run`, { method: 'POST' }), item.source === 'media' ? 'Đã đưa video vào mục Chờ duyệt.' : 'Đã đưa video vào hàng đợi tạo.');
    setRunning(null); refresh();
  };
  const columns = [
    { title: 'Lịch', dataIndex: 'name', width: 220, render: (name, item) => (<><Typography.Text strong>{name}</Typography.Text><div><Typography.Text type="secondary">{item.channelName}</Typography.Text></div>{item.lastError && <Typography.Text type="danger" style={{ fontSize: 13 }}>{item.lastError}</Typography.Text>}</>) },
    { title: 'Nguồn', width: 150, responsive: ['md'], render: (_, item) => <Tag color={sourceInfo[item.source]?.color}>{sourceInfo[item.source]?.label}</Tag> },
    { title: 'Giờ chạy', width: 190, render: (_, item) => (<><Typography.Text strong>{item.time}</Typography.Text><div><Typography.Text type="secondary">{daysLabel(item.days)}{item.publishTime ? ` · đăng ${item.publishTime}` : ''}</Typography.Text></div></>) },
    { title: 'Lần tới dùng', width: 280, responsive: ['lg'], render: (_, item) => (<><Typography.Paragraph style={{ margin: 0 }} ellipsis={{ rows: 2, tooltip: nextText(item) }}>{nextText(item)}</Typography.Paragraph><Typography.Text type="secondary" style={{ fontSize: 13 }}>{sub(item)}{item.autoPublish ? ' · tự đăng' : ' · chờ duyệt'}</Typography.Text></>) },
    { title: 'Lần gần nhất', width: 170, responsive: ['xl'], render: (_, item) => (item.lastRunAt ? (<>{fmtDate(item.lastRunAt)}<div><Typography.Text type="secondary" style={{ fontSize: 13 }}>{item.lastJobStatus ? `Job: ${item.lastJobStatus.toLowerCase()}` : ''}</Typography.Text></div></>) : <Typography.Text type="secondary">Chưa chạy</Typography.Text>) },
    { title: 'Bật', width: 70, align: 'center', render: (_, item) => <Switch checked={item.enabled} onChange={(checked) => run(() => api(`/api/schedules/${item.id}`, { method: 'PATCH', body: { enabled: checked } })).then(refresh)} /> },
    {
      title: '', width: 190, align: 'right',
      render: (_, item) => (
        <Space>
          <Popconfirm title="Chạy lịch này ngay bây giờ?" description={item.source === 'media' ? 'Video kế tiếp sẽ chuyển sang chờ duyệt.' : 'Muse có thể mất 30–60 giây để nghĩ prompt, và việc này dùng quota Muse.'} okText="Chạy" cancelText="Hủy" onConfirm={() => runNow(item)}><Tooltip title="Chạy ngay"><Button icon={<PlayCircleOutlined />} loading={running === item.id || item.running} aria-label="Chạy ngay" /></Tooltip></Popconfirm>
          <Button icon={<EditOutlined />} onClick={() => setModal({ schedule: item })} aria-label="Sửa" />
          <Popconfirm title="Xóa lịch này?" description="Video và bài đăng đã tạo vẫn giữ nguyên." okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }} onConfirm={() => run(() => api(`/api/schedules/${item.id}`, { method: 'DELETE' }), 'Đã xóa lịch.').then(refresh)}><Button danger icon={<DeleteOutlined />} aria-label="Xóa" /></Popconfirm>
        </Space>
      ),
    },
  ];
  return (
    <>
      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 16 }}>
        <Typography.Text type="secondary" style={{ fontSize: 15, flex: 1, minWidth: 260 }}>Đặt lịch hằng ngày: Muse tự nghĩ prompt và tạo video, hoặc dùng prompt/video bạn đã chuẩn bị. Cần bật máy và cookie Muse còn hạn.</Typography.Text>
        <Button type="primary" size="large" icon={<PlusOutlined />} disabled={!connected.length} onClick={() => setModal({})}>Thêm lịch</Button>
      </Flex>
      {!connected.length && <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Cần kết nối kênh với YouTube trước khi tạo lịch." />}
      <Table rowKey="id" columns={columns} dataSource={shown} pagination={false} scroll={{ x: 1100 }} locale={{ emptyText: <Empty description="Chưa có lịch nào" style={{ padding: '32px 0' }} /> }} />
      {modal && <ScheduleModal schedule={modal.schedule} channels={connected} fixedChannelId={fixedChannelId} onClose={() => setModal(null)} />}
    </>
  );
}
