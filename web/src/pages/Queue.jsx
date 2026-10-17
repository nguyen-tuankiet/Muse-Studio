import React, { useMemo, useState } from 'react';
import { Badge, Button, Empty, Flex, Modal, Progress, Segmented, Space, Table, Tooltip, Typography } from 'antd';
import { CloseCircleOutlined, PlayCircleOutlined, ReloadOutlined, VideoCameraOutlined, PictureOutlined } from '@ant-design/icons';
import { api } from '../api.js';
import { useApp, useRun } from '../store.jsx';
import { fmtDate } from '../format.js';
import { JobTag, MediaView, PageHeader } from '../components/common.jsx';

const FILTERS = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'ACTIVE', label: 'Đang chạy' },
  { value: 'COMPLETED', label: 'Hoàn thành' },
  { value: 'PROBLEM', label: 'Cần xử lý' },
];
const ACTIVE = ['QUEUED', 'SUBMITTED', 'GENERATING'];
const PROBLEM = ['FAILED', 'AUTH_REQUIRED', 'INTERRUPTED', 'CANCELLED'];

export default function Queue() {
  const { data, refresh } = useApp();
  const run = useRun();
  const [filter, setFilter] = useState('ALL');
  const [preview, setPreview] = useState(null);

  const counts = useMemo(() => ({
    ACTIVE: data.jobs.filter((job) => ACTIVE.includes(job.status)).length,
    PROBLEM: data.jobs.filter((job) => PROBLEM.includes(job.status) && job.status !== 'CANCELLED').length,
  }), [data.jobs]);
  const rows = data.jobs.filter((job) => (filter === 'ALL' ? true : filter === 'ACTIVE' ? ACTIVE.includes(job.status) : filter === 'COMPLETED' ? job.status === 'COMPLETED' : PROBLEM.includes(job.status)));
  const worker = data.jobs.some((job) => ['SUBMITTED', 'GENERATING'].includes(job.status));

  const act = (job, action, success) => run(() => api(`/api/jobs/${job.id}/${action}`, { method: 'POST' }), success).then(refresh);
  const columns = [
    { title: 'Loại', dataIndex: 'type', width: 70, align: 'center', render: (type) => (type === 'video' ? <VideoCameraOutlined style={{ fontSize: 18 }} /> : <PictureOutlined style={{ fontSize: 18 }} />) },
    {
      title: 'Prompt', dataIndex: 'prompt',
      render: (prompt, job) => (
        <>
          <Typography.Paragraph style={{ margin: 0 }} ellipsis={{ rows: 2, tooltip: prompt }}>{prompt}</Typography.Paragraph>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>{job.project}{job.size ? ` · ${job.size}` : ''}{job.duration ? ` · ${job.duration}s` : ''}</Typography.Text>
          {job.error && <div><Typography.Text type="danger" style={{ fontSize: 13 }}>{job.error}</Typography.Text></div>}
        </>
      ),
    },
    {
      title: 'Trạng thái', dataIndex: 'status', width: 170,
      render: (status, job) => (<Flex vertical gap={6}><JobTag status={status} />{status === 'GENERATING' && <Progress percent={job.progress || 0} size="small" showInfo={false} />}</Flex>),
    },
    { title: 'Tạo lúc', dataIndex: 'createdAt', width: 150, responsive: ['lg'], render: fmtDate },
    {
      title: '', width: 150, align: 'right',
      render: (_, job) => (
        <Space>
          {job.status === 'COMPLETED' && job.mediaId && <Button type="primary" ghost icon={<PlayCircleOutlined />} onClick={() => setPreview(data.media.find((item) => item.id === job.mediaId))}>Xem</Button>}
          {job.status === 'QUEUED' && <Button icon={<CloseCircleOutlined />} onClick={() => act(job, 'cancel', 'Đã hủy job.')}>Hủy</Button>}
          {['FAILED', 'AUTH_REQUIRED', 'INTERRUPTED', 'CANCELLED'].includes(job.status) && <Tooltip title="Chạy lại job này (dùng thêm quota Muse)"><Button icon={<ReloadOutlined />} onClick={() => act(job, 'retry', 'Đã đưa job vào hàng đợi.')}>Thử lại</Button></Tooltip>}
        </Space>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Hàng đợi" subtitle="Theo dõi từng job tạo video/ảnh. Cập nhật theo thời gian thực."
        extra={<Badge status={worker ? 'processing' : 'default'} text={<Typography.Text>{worker ? 'Đang tạo' : 'Rảnh'}</Typography.Text>} />} />
      <div style={{ maxWidth: '100%', overflowX: 'auto', marginBottom: 16 }}><Segmented size="large" value={filter} onChange={setFilter}
        options={FILTERS.map((item) => ({ value: item.value, label: counts[item.value] ? `${item.label} (${counts[item.value]})` : item.label }))} /></div>
      <Table rowKey="id" columns={columns} dataSource={rows} scroll={{ x: 720 }} pagination={rows.length > 15 ? { pageSize: 15, showSizeChanger: false } : false}
        locale={{ emptyText: <Empty description="Không có job nào" style={{ padding: '32px 0' }} /> }} />
      <Modal open={Boolean(preview)} onCancel={() => setPreview(null)} footer={null} width={720} centered destroyOnClose title={preview ? preview.prompt : ''}>
        {preview && <MediaView asset={preview} height={Math.min(520, window.innerHeight * 0.6)} />}
      </Modal>
    </>
  );
}
