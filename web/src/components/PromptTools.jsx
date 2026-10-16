import React, { useState } from 'react';
import { Alert, Form, Input, InputNumber, Modal, Tag, Typography } from 'antd';
import { api } from '../api.js';
import { useRun } from '../store.jsx';

export const promptStatus = {
  DRAFT: { label: 'Chờ duyệt', color: 'gold' },
  APPROVED: { label: 'Đã duyệt', color: 'green' },
  USED: { label: 'Đã tạo video', color: 'default' },
};
export const promptSource = { muse: 'Muse gợi ý', 'muse-auto': 'Muse tự sinh', manual: 'Tự viết' };

export const PromptStatusTag = ({ status }) => {
  const info = promptStatus[status || 'APPROVED'];
  return <Tag color={info.color} style={{ marginInlineEnd: 0 }}>{info.label}</Tag>;
};

export function PromptModal({ projectId, prompt, onClose, onSaved }) {
  const run = useRun();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const submit = async (values) => {
    setSaving(true);
    const ok = await run(() => (prompt
      ? api(`/api/prompts/${prompt.id}`, { method: 'PATCH', body: { content: values.content } })
      : api(`/api/projects/${projectId}/prompts`, { method: 'POST', body: values })), prompt ? 'Đã lưu prompt.' : 'Đã thêm prompt (đã duyệt sẵn).');
    setSaving(false);
    if (ok) { onSaved?.(); onClose(); }
  };
  return (
    <Modal open title={prompt ? 'Sửa prompt' : 'Thêm prompt'} onCancel={onClose} okText={prompt ? 'Lưu' : 'Thêm prompt'} cancelText="Hủy" confirmLoading={saving} onOk={() => form.submit()} width={640} maskClosable={false}>
      <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} initialValues={prompt || {}} style={{ marginTop: 16 }}>
        <Form.Item name="content" label="Nội dung prompt" rules={[{ required: true, whitespace: true, message: 'Nhập nội dung prompt.' }]}>
          <Input.TextArea rows={7} autoFocus placeholder="Mô tả cảnh bạn muốn Muse tạo: bối cảnh, ánh sáng, chuyển động, phong cách..." showCount maxLength={4000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function ImportModal({ projectId, onClose, onSaved }) {
  const run = useRun();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const submit = async (values) => {
    setSaving(true);
    const result = await run(() => api('/api/prompts/import', { method: 'POST', body: { projectId, csv: values.csv } }));
    setSaving(false);
    if (result) { Modal.success({ title: `Đã nhập ${result.imported} prompt`, content: 'Các prompt nhập tay được xem là đã duyệt.' }); onSaved?.(); onClose(); }
  };
  return (
    <Modal open title="Nhập nhiều prompt" onCancel={onClose} okText="Nhập" cancelText="Hủy" confirmLoading={saving} onOk={() => form.submit()} width={640} maskClosable={false}>
      <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} style={{ marginTop: 16 }}>
        <Form.Item name="csv" label="Danh sách prompt" rules={[{ required: true, whitespace: true, message: 'Dán ít nhất một dòng.' }]} extra={<>Mỗi dòng là một prompt. Dòng đầu có thể là tiêu đề cột <Typography.Text code>prompt</Typography.Text> (sẽ được bỏ qua).</>}>
          <Input.TextArea rows={10} autoFocus placeholder={'Một cảnh hoàng hôn trên biển\nPhố cổ Hà Nội sau cơn mưa\nRừng thông trong sương sớm'} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// Nhờ Muse nghĩ prompt mới theo hồ sơ kênh. Mất khoảng 30–60 giây vì Muse phải trả lời trong khung chat.
export function IdeasModal({ channel, onClose, onSaved }) {
  const run = useRun();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const submit = async (values) => {
    setSaving(true);
    const result = await run(() => api(`/api/channels/${channel.id}/ideas`, { method: 'POST', body: { count: values.count, hint: values.hint || '' } }));
    setSaving(false);
    if (result) {
      Modal.success({ title: `Muse đã gợi ý ${result.created.length} prompt`, content: `${result.skipped ? `Bỏ qua ${result.skipped} ý trùng với prompt đã có. ` : ''}Các prompt đang chờ bạn duyệt, sửa lại rồi mới tạo video.` });
      onSaved?.(); onClose();
    }
  };
  return (
    <Modal open title="Muse gợi ý prompt cho kênh" onCancel={saving ? undefined : onClose} closable={!saving} okText={saving ? 'Muse đang nghĩ...' : 'Gợi ý prompt'} cancelText="Hủy" confirmLoading={saving} cancelButtonProps={{ disabled: saving }} onOk={() => form.submit()} width={560} maskClosable={false}>
      <Alert type="info" showIcon style={{ margin: '8px 0 20px' }} message={`Theo hồ sơ kênh: ${channel.brief.niche || channel.brief.topic}`} description="Muse đọc ngách, chủ đề và các prompt đã có của kênh để không lặp ý. Mỗi lần gợi ý tốn một tin nhắn Muse." />
      <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} initialValues={{ count: 5 }}>
        <Form.Item name="count" label="Số prompt muốn gợi ý"><InputNumber min={1} max={10} style={{ width: 140 }} /></Form.Item>
        <Form.Item name="hint" label="Yêu cầu thêm (tùy chọn)" extra="Ví dụ: tập trung vào mùa đông, mỗi video một địa danh khác nhau."><Input.TextArea rows={3} maxLength={300} showCount placeholder="Để trống nếu muốn Muse tự do sáng tạo" /></Form.Item>
      </Form>
    </Modal>
  );
}
