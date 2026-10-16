import React, { useState } from 'react';
import { Segmented, Select } from 'antd';
import { useApp } from '../store.jsx';
import { PageHeader } from '../components/common.jsx';
import MediaGrid from '../components/MediaGrid.jsx';

export default function Media() {
  const { data } = useApp();
  const [filter, setFilter] = useState('all');
  const [channelId, setChannelId] = useState('all');
  const channels = data.channelData.channels;
  const projectOf = (id) => channels.find((channel) => channel.id === id)?.projectId;
  const items = data.media.filter((asset) => (filter === 'all' || String(asset.mimeType).startsWith(`${filter}/`)) && (channelId === 'all' || asset.projectId === projectOf(channelId)));

  return (
    <>
      <PageHeader title="Thư viện media" subtitle="Video và ảnh đã tạo của mọi kênh, lưu trên máy của bạn."
        extra={(
          <>
            <Select size="large" value={channelId} onChange={setChannelId} style={{ minWidth: 200 }} options={[{ value: 'all', label: 'Tất cả kênh' }, ...channels.map((channel) => ({ value: channel.id, label: channel.name }))]} />
            <Segmented size="large" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Tất cả' }, { value: 'video', label: 'Video' }, { value: 'image', label: 'Ảnh' }]} />
          </>
        )} />
      <MediaGrid items={items} empty={filter === 'all' && channelId === 'all' ? 'Chưa có file nào. Video/ảnh tạo xong sẽ xuất hiện ở đây.' : 'Không có file phù hợp bộ lọc'} />
    </>
  );
}
