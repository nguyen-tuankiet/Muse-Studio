import React from 'react';
import { Flex, Tag, Typography } from 'antd';
import { jobStatus, postStatus } from '../constants.js';

export function PageHeader({ title, subtitle, extra }) {
  return (
    <Flex justify="space-between" align="flex-start" wrap gap={16} style={{ marginBottom: 24 }}>
      <div style={{ minWidth: 0 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>{title}</Typography.Title>
        {subtitle && <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0', fontSize: 15 }}>{subtitle}</Typography.Paragraph>}
      </div>
      {extra && <Flex gap={8} wrap>{extra}</Flex>}
    </Flex>
  );
}

export const JobTag = ({ status }) => {
  const info = jobStatus[status] || { label: status, color: 'default' };
  return <Tag color={info.color} style={{ marginInlineEnd: 0 }}>{info.label}</Tag>;
};

export const PostTag = ({ status }) => {
  const info = postStatus[status] || { label: status, color: 'default' };
  return <Tag color={info.color} style={{ marginInlineEnd: 0 }}>{info.label}</Tag>;
};

// Biểu đồ đường nhỏ cho lượt xem theo ngày của kênh.
export function Sparkline({ values, height = 44 }) {
  if (!values || values.length < 2) return <Typography.Text type="secondary" style={{ fontSize: 13 }}>Biểu đồ sẽ hiện khi có số liệu từ 2 ngày.</Typography.Text>;
  const min = Math.min(...values); const max = Math.max(...values); const span = max - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 200},${height - 4 - ((value - min) / span) * (height - 10)}`).join(' ');
  return (
    <svg viewBox={`0 0 200 ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block', color: 'var(--ant-color-primary)' }} aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Video hoặc ảnh đã tạo. Nền đen để khung dọc (9:16) không bị kéo giãn.
export function MediaView({ asset, height, controls = true }) {
  const frame = { width: '100%', height, background: '#0b0f19', display: 'block', objectFit: 'contain' };
  if (String(asset.mimeType).startsWith('video/')) return <video src={asset.url || `/media/${asset.storageKey}`} controls={controls} preload="metadata" style={frame} />;
  return <img src={asset.url || `/media/${asset.storageKey}`} alt="" style={frame} />;
}
