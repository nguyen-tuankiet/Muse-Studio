import React, { useState } from 'react';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { api } from '../api.js';
import { useApp, useRun } from '../store.jsx';

// Nhập Client ID/Secret của OAuth client Google Cloud (tạo một lần). Secret chỉ lưu trên máy này.
export default function OAuthClientForm({ client, compact = false }) {
  const { refresh } = useApp();
  const run = useRun();
  const [saving, setSaving] = useState(false);

  const save = async (values) => {
    setSaving(true);
    const ok = await run(() => api('/api/youtube/client', { method: 'PUT', body: values }), 'Đã lưu Google OAuth.');
    setSaving(false);
    if (ok) refresh();
  };

  return (
    <Form layout="vertical" requiredMark={false} onFinish={save} initialValues={{ clientId: client.clientId }} style={{ maxWidth: 640 }}>
      {!compact && (
        <Form.Item label="Redirect URI cần khai báo trong Google Cloud">
          <Typography.Text code copyable style={{ fontSize: 14 }}>{client.redirectUri}</Typography.Text>
        </Form.Item>
      )}
      <Form.Item name="clientId" label="Client ID" rules={[{ required: true, message: 'Nhập Client ID.' }]}><Input size="large" autoComplete="off" placeholder="xxxx.apps.googleusercontent.com" /></Form.Item>
      <Form.Item name="clientSecret" label="Client Secret" rules={[{ required: true, message: 'Nhập Client Secret.' }]} extra="Chỉ lưu trên máy này và không hiển thị lại.">
        <Input.Password size="large" autoComplete="new-password" placeholder={client.configured ? 'Nhập lại để thay đổi' : 'GOCSPX-...'} />
      </Form.Item>
      <Button type="primary" size="large" htmlType="submit" loading={saving}>{client.configured ? 'Cập nhật' : 'Lưu và tiếp tục'}</Button>
      {client.configured && <Alert style={{ marginTop: 16 }} type="success" showIcon message="Đã cấu hình Google OAuth" />}
    </Form>
  );
}
