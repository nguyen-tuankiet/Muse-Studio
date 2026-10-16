import React, { useState } from 'react';
import { Alert, App as AntApp, Button, Flex, Input, Typography } from 'antd';
import { BulbOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { navigate } from '../router.js';

// Khung "Gợi ý bằng Muse": nhờ Muse (qua tài khoản đã kết nối) điền tiêu đề, mô tả, tag dựa trên prompt đã dùng tạo video.
// onApply nhận { title, description, tags } và tự đặt vào form của nơi gọi.
export default function AiSuggest({ mediaId, channelId, onApply, onNavigate }) {
  const { data } = useApp();
  const { message } = AntApp.useApp();
  const [extra, setExtra] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!data.dashboard?.ai?.configured) {
    return (
      <Alert type="info" showIcon icon={<BulbOutlined />} message="Gợi ý bằng Muse"
        description="Cần cookie Muse (trong Cài đặt) để Muse tự điền tiêu đề, mô tả và tag cho video."
        action={<Button size="small" onClick={() => { onNavigate?.(); navigate('/settings'); }}>Mở cài đặt</Button>} />
    );
  }

  const suggest = async () => {
    setLoading(true);
    try {
      const result = await api('/api/ai/suggest', { method: 'POST', body: { mediaId, channelId, extra: extra.trim() } });
      onApply(result);
      setDone(true);
      message.success('Muse đã điền gợi ý. Bạn có thể chỉnh lại trước khi đăng.');
    } catch (error) {
      message.error(error.message || 'Gợi ý thất bại.', 6);
    }
    setLoading(false);
  };

  return (
    <div style={{ background: 'var(--ant-color-primary-bg)', border: '1px solid var(--ant-color-primary-border)', borderRadius: 10, padding: '14px 16px' }}>
      <Flex gap={10} align="center">
        <BulbOutlined style={{ fontSize: 20, color: 'var(--ant-color-primary)' }} />
        <div>
          <Typography.Text strong>Gợi ý bằng Muse</Typography.Text>
          <div><Typography.Text type="secondary" style={{ fontSize: 13 }}>Muse đọc prompt của video rồi điền tiêu đề, mô tả, tag. Mỗi kênh dùng lại một cuộc chat nên nhớ phong cách các lần trước. Mất khoảng 30–60 giây, dùng một tin nhắn Muse.</Typography.Text></div>
        </div>
      </Flex>
      <Flex gap={8} style={{ marginTop: 12 }} wrap="wrap">
        <Input style={{ flex: '1 1 220px' }} value={extra} maxLength={200} onChange={(event) => setExtra(event.target.value)} onPressEnter={suggest}
          placeholder="Ghi chú thêm cho Muse (tùy chọn), ví dụ: giọng hài hước, nhắm tới khán giả trẻ" />
        <Button type="primary" icon={<ThunderboltOutlined />} loading={loading} onClick={suggest}>{loading ? 'Muse đang soạn…' : done ? 'Gợi ý lại' : 'Gợi ý'}</Button>
      </Flex>
    </div>
  );
}
