import React, { useState } from 'react';
import { Alert, Col, DatePicker, Form, Input, Modal, Row, Select } from 'antd';
import dayjs from 'dayjs';
import { api } from '../api.js';
import { privacyOptions } from '../constants.js';
import { useApp, useRun } from '../store.jsx';
import { navigate } from '../router.js';
import AiSuggest from './AiSuggest.jsx';
import { MediaView } from './common.jsx';

// Đăng một video đã tạo lên một kênh YouTube (đăng ngay hoặc hẹn giờ). Hai cột: nội dung bên trái, kênh/lịch/chế độ bên phải.
export default function PostModal({ asset, onClose }) {
  const { data } = useApp();
  const run = useRun();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const channels = data.channelData.channels.filter((channel) => channel.connected && !channel.needsAuth);
  const channelId = Form.useWatch('channelId', form);

  if (!channels.length) {
    return (
      <Modal open title="Đăng lên YouTube" onCancel={onClose} okText="Mở trang Kênh YouTube" cancelText="Đóng" onOk={() => { onClose(); navigate('/channels'); }}>
        <Alert type="info" showIcon message="Chưa có kênh nào đã kết nối" description="Hãy kết nối ít nhất một kênh YouTube trước khi đăng video." />
      </Modal>
    );
  }

  const submit = async (values) => {
    setSaving(true);
    const ok = await run(() => api('/api/posts', {
      method: 'POST',
      body: {
        mediaId: asset.id, channelId: values.channelId, title: values.title, description: values.description || '',
        tags: values.tags || [], privacy: values.privacy, publishAt: values.publishAt ? values.publishAt.toISOString() : null,
      },
    }), 'Đã đưa vào hàng đợi upload. Có link YouTube ngay khi upload xong.');
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal open title="Đăng lên YouTube" onCancel={onClose} okText="Đưa vào hàng đợi upload" cancelText="Hủy" confirmLoading={saving} onOk={() => form.submit()}
      width={1000} centered maskClosable={false} styles={{ body: { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto', overflowX: 'hidden', paddingRight: 8 } }}>
      <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} style={{ marginTop: 16 }}
        initialValues={{ channelId: channels[0].id, title: String(asset.prompt || '').slice(0, 100), privacy: channels[0].defaultPrivacy }}>
        <Row gutter={32}>
          <Col xs={24} lg={14}>
            <div style={{ marginBottom: 20 }}>
              <AiSuggest mediaId={asset.id} channelId={channelId} onNavigate={onClose}
                onApply={(result) => form.setFieldsValue({ title: result.title, description: result.description, tags: result.tags })} />
            </div>
            <Form.Item name="title" label="Tiêu đề" rules={[{ required: true, message: 'Nhập tiêu đề.' }]}>
              <Input maxLength={100} showCount />
            </Form.Item>
            <Form.Item name="description" label="Mô tả"><Input.TextArea rows={6} maxLength={5000} /></Form.Item>
            <Form.Item name="tags" label="Tag"><Select mode="tags" tokenSeparators={[',']} placeholder="Gõ tag rồi nhấn Enter" open={false} /></Form.Item>
            <Alert type="info" showIcon message="Video được khai báo là nội dung do AI tạo/chỉnh sửa theo yêu cầu của YouTube." />
          </Col>
          <Col xs={24} lg={10}>
            <div style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 20, background: '#0b0f19' }}><MediaView asset={asset} height={170} /></div>
            <Form.Item name="channelId" label="Kênh đăng" rules={[{ required: true }]}>
              <Select options={channels.map((channel) => ({ value: channel.id, label: channel.name }))} onChange={(id) => form.setFieldValue('privacy', channels.find((item) => item.id === id)?.defaultPrivacy)} />
            </Form.Item>
            <Form.Item name="publishAt" label="Hẹn giờ đăng công khai" extra="Để trống để đăng ngay. Có hẹn giờ thì video tải lên ở chế độ riêng tư và YouTube tự công khai đúng giờ, không cần bật máy lúc đó.">
              <DatePicker showTime={{ format: 'HH:mm' }} format="DD/MM/YYYY HH:mm" style={{ width: '100%' }} disabledDate={(day) => day.isBefore(dayjs().startOf('day'))} placeholder="Chọn ngày giờ" />
            </Form.Item>
            <Form.Item name="privacy" label="Chế độ khi đăng ngay" style={{ marginBottom: 0 }}><Select options={privacyOptions} /></Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
