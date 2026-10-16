import React, { useState } from 'react';
import { Alert, Form, InputNumber, Modal, Radio, Select } from 'antd';
import { api } from '../api.js';
import { sizeOptions } from '../constants.js';
import { useApp, useRun } from '../store.jsx';
import { navigate } from '../router.js';

// Tạo hàng loạt: mỗi prompt đã chọn thành một job, hàng đợi chạy tuần tự. Mặc định lấy theo hồ sơ kênh.
export default function BatchModal({ promptIds, channel, onClose, onDone }) {
  const { data } = useApp();
  const run = useRun();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const type = Form.useWatch('type', form) ?? 'video';
  const hasCookie = data.dashboard?.provider?.status === 'connected';
  const toReview = channel?.connected && type === 'video';

  const submit = async (values) => {
    setSaving(true);
    const result = await run(() => api('/api/batches', {
      method: 'POST',
      body: { promptIds, type: values.type, size: values.size || undefined, duration: values.type === 'video' ? values.duration || undefined : undefined },
    }), `Đã đưa ${promptIds.length} prompt vào hàng đợi.`);
    setSaving(false);
    if (result) { onDone?.(); onClose(); navigate('/queue'); }
  };

  return (
    <Modal open title={`Tạo video từ ${promptIds.length} prompt`} onCancel={onClose} okText="Bắt đầu tạo" cancelText="Hủy" confirmLoading={saving} onOk={() => form.submit()} width={520} maskClosable={false}>
      {!hasCookie && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="Chưa có cookie Muse" description="Job sẽ dừng ở trạng thái Cần cookie cho tới khi bạn dán cookie trong Cài đặt." />}
      <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} initialValues={{ type: 'video', size: channel?.brief?.size || undefined, duration: channel?.brief?.duration || undefined }} style={{ marginTop: 8 }}>
        <Form.Item name="type" label="Loại nội dung">
          <Radio.Group optionType="button" buttonStyle="solid" options={[{ value: 'video', label: 'Video' }, { value: 'image', label: 'Ảnh' }]} />
        </Form.Item>
        <Form.Item name="size" label="Khung hình"><Select allowClear placeholder="Mặc định của Muse" options={sizeOptions} /></Form.Item>
        {type === 'video' && <Form.Item name="duration" label="Thời lượng (giây)"><InputNumber min={1} max={60} placeholder="Mặc định" style={{ width: '100%' }} /></Form.Item>}
        <Alert type="info" showIcon message={toReview ? 'Video tạo xong sẽ vào mục Chờ duyệt (đã điền sẵn tiêu đề, mô tả) để bạn xem lại rồi đăng.' : 'Mỗi prompt dùng quota Muse của bạn. Hàng đợi chạy lần lượt từng job.'} />
      </Form>
    </Modal>
  );
}
