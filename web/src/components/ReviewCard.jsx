import React, { useState } from 'react';
import { Button, Card, Col, DatePicker, Empty, Flex, Form, Input, Popconfirm, Row, Select, Tag } from 'antd';
import { CheckOutlined, ClockCircleOutlined, CloseOutlined, ReloadOutlined, YoutubeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../api.js';
import { privacyOptions } from '../constants.js';
import { useApp, useRun } from '../store.jsx';
import { MediaView } from './common.jsx';
import AiSuggest from './AiSuggest.jsx';

// Thẻ duyệt một video trước khi đăng lên YouTube.
export default function ReviewCard({ post }) {
  const { data, refresh } = useApp();
  const run = useRun(); const [form] = Form.useForm(); const [busy, setBusy] = useState(false);
  const asset = data.media.find((item) => item.id === post.mediaId);
  const approve = async (values) => {
    setBusy(true);
    const ok = await run(() => api(`/api/posts/${post.id}/approve`, { method: 'POST', body: { title: values.title, description: values.description || '', tags: values.tags || [], privacy: values.privacy, publishAt: values.publishAt ? values.publishAt.toISOString() : null } }), 'Đã duyệt, video đang được upload.');
    setBusy(false); if (ok) refresh();
  };
  return (
    <Card styles={{ body: { padding: 0 } }} style={{ overflow: 'hidden' }}>
      <Row>
        <Col xs={24} md={9} style={{ background: '#0b0f19' }}>{asset ? <MediaView asset={asset} height={320} /> : <Empty style={{ padding: 40 }} description="Không còn file video" />}</Col>
        <Col xs={24} md={15}>
          <Form form={form} layout="vertical" requiredMark={false} onFinish={approve} style={{ padding: 24 }}
            initialValues={{ title: post.title, description: post.description, tags: post.tags || [], privacy: post.privacy, publishAt: post.suggestedPublishAt ? dayjs(post.suggestedPublishAt) : null }}>
            <Flex gap={8} wrap style={{ marginBottom: 16 }}>
              <Tag icon={<YoutubeOutlined />} color="red">{post.channelName}</Tag>
              {post.scheduleName && <Tag icon={<ClockCircleOutlined />}>Lịch: {post.scheduleName}</Tag>}
            </Flex>
            <div style={{ marginBottom: 20 }}>
              <AiSuggest mediaId={post.mediaId} channelId={post.channelId} onApply={(result) => form.setFieldsValue({ title: result.title, description: result.description, tags: result.tags })} />
            </div>
            <Form.Item name="title" label="Tiêu đề" rules={[{ required: true, message: 'Nhập tiêu đề.' }]}><Input maxLength={100} showCount size="large" /></Form.Item>
            <Form.Item name="description" label="Mô tả"><Input.TextArea rows={3} maxLength={5000} /></Form.Item>
            <Form.Item name="tags" label="Tag"><Select mode="tags" tokenSeparators={[',']} placeholder="Gõ tag rồi nhấn Enter" open={false} /></Form.Item>
            <Row gutter={16}>
              <Col xs={24} sm={14}><Form.Item name="publishAt" label="Hẹn giờ đăng công khai" extra="Để trống để đăng ngay."><DatePicker showTime={{ format: 'HH:mm' }} format="DD/MM/YYYY HH:mm" style={{ width: '100%' }} placeholder="Chọn ngày giờ" disabledDate={(day) => day.isBefore(dayjs().startOf('day'))} /></Form.Item></Col>
              <Col xs={24} sm={10}><Form.Item name="privacy" label="Nếu đăng ngay"><Select options={privacyOptions} /></Form.Item></Col>
            </Row>
            <Flex gap={8} wrap>
              <Button type="primary" size="large" htmlType="submit" icon={<CheckOutlined />} loading={busy}>Duyệt và upload</Button>
              <Button size="large" icon={<CloseOutlined />} onClick={() => run(() => api(`/api/posts/${post.id}/reject`, { method: 'POST' }), 'Đã từ chối video.').then(refresh)}>Từ chối</Button>
              <Popconfirm title="Từ chối và tạo lại video?" description="Dùng cùng prompt và tốn thêm quota Muse." okText="Tạo lại" cancelText="Hủy" onConfirm={() => run(() => api(`/api/posts/${post.id}/regenerate`, { method: 'POST' }), 'Đã đưa video tạo lại vào hàng đợi.').then(refresh)}>
                <Button size="large" icon={<ReloadOutlined />}>Từ chối và tạo lại</Button>
              </Popconfirm>
            </Flex>
          </Form>
        </Col>
      </Row>
    </Card>
  );
}
