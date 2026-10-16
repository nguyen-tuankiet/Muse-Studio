import React, { useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Card, Col, Collapse, Divider, Flex, Form, Input, Popconfirm, Row, Space, Steps, Switch, Tabs, Tag, Typography } from 'antd';
import { CheckCircleFilled, CheckOutlined, DeleteOutlined, ExperimentOutlined, LockOutlined, SaveOutlined, SnippetsOutlined } from '@ant-design/icons';
import { api } from '../api.js';
import { useApp, useRun } from '../store.jsx';
import { fmtDate } from '../format.js';
import { PageHeader } from '../components/common.jsx';
import OAuthClientForm from '../components/OAuthClientForm.jsx';
import OAuthGuide from '../components/OAuthGuide.jsx';

const REQUIRED_COOKIES = ['hatch_sess', 'hatch_gw', 'hatch_vml', 'hatch_native_auth_device'];

function CookieHelp() {
  const ext = (
    <Flex vertical gap={16}>
      <Steps direction="vertical" size="small" items={[
        { title: 'Cài extension quản lý cookie', description: <>Ví dụ <b>Cookie-Editor</b> (có trên Chrome Web Store và Edge Add-ons, mã nguồn mở). Chỉ cài từ cửa hàng chính thức, vì extension cookie đọc được toàn bộ phiên đăng nhập của bạn.</> },
        { title: 'Đăng nhập muse.ai', description: 'Dùng Chrome/Edge như bình thường, đăng nhập đúng tài khoản Muse muốn dùng.' },
        { title: 'Xuất cookie bằng một cú bấm', description: <>Đang ở trang muse.ai, mở extension → bấm <b>Export</b> → chọn <b>JSON</b>. Extension tự sao chép vào clipboard, gồm cả cookie HttpOnly.</> },
        { title: 'Dán vào đây', description: <>Quay lại ô bên dưới, bấm <b>Dán từ clipboard</b> (hoặc <b>Ctrl+V</b>), kiểm tra đủ 4 cookie rồi bấm <b>Lưu cookie</b>.</> },
      ].map((item) => ({ ...item, status: 'process' }))} />
    </Flex>
  );
  const devtools = (
    <Steps direction="vertical" size="small" items={[
      { title: 'Mở DevTools', description: <>Ở trang muse.ai nhấn <b>F12</b>, chọn tab <b>Network</b> rồi tải lại trang (F5).</> },
      { title: 'Sao chép header cookie', description: <>Bấm một request tới muse.ai, mở <b>Request Headers</b> và sao chép giá trị dòng <b>cookie</b>.</> },
      { title: 'Dán vào đây', description: 'Dán nguyên chuỗi vào ô bên dưới. Chấp nhận cả dạng name=value; name=value.' },
    ].map((item) => ({ ...item, status: 'process' }))} />
  );
  return (
    <Tabs size="middle" items={[
      { key: 'ext', label: 'Dùng extension (nhanh nhất)', children: ext },
      { key: 'devtools', label: 'Không cần extension', children: devtools },
    ]} />
  );
}

function MuseAccount() {
  const { refresh } = useApp();
  const run = useRun();
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [credential, setCredential] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [help, setHelp] = useState([]);
  const pasted = Form.useWatch('credential', form) || '';

  const load = () => api('/api/provider/credential').then(setCredential).catch(() => setCredential({ configured: false }));
  useEffect(() => { load(); }, []);
  useEffect(() => { if (credential) setHelp(credential.configured ? [] : ['help']); }, [credential?.configured]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (values) => {
    setSaving(true);
    const result = await run(() => api('/api/provider/credential', { method: 'PUT', body: { credential: values.credential } }), 'Đã lưu cookie Muse.');
    setSaving(false);
    if (result) { form.resetFields(); load(); refresh(); }
  };
  const test = async () => {
    setTesting(true);
    const hide = message.loading('Đang kiểm tra: Chrome sẽ mở một cửa sổ…', 0);
    try {
      const result = await api('/api/provider/test', { method: 'POST' });
      if (result.ok) message.success(result.message, 5); else message.error(result.message, 8);
    } catch (error) { message.error(error.message); }
    hide(); setTesting(false);
  };
  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return message.warning('Clipboard đang trống. Hãy xuất cookie từ extension trước.');
      form.setFieldValue('credential', text.trim());
      message.success('Đã dán từ clipboard.');
    } catch { message.warning('Trình duyệt không cho đọc clipboard. Hãy bấm vào ô và nhấn Ctrl+V.'); }
  };
  const missing = REQUIRED_COOKIES.filter((name) => !pasted.includes(name));

  return (
    <Card title="Tài khoản Muse" extra={credential && <Tag color={credential.configured ? 'success' : 'warning'}>{credential.configured ? 'Đã có cookie' : 'Chưa có cookie'}</Tag>}>
      {credential?.configured
        ? <Alert type="success" showIcon icon={<CheckCircleFilled />} style={{ marginBottom: 20 }} message="Đã lưu cookie Muse" description={<>Cập nhật {fmtDate(credential.updatedAt)} · {credential.cookieNames.join(', ')}<br />Cookie không hiển thị lại. Dán cookie mới nếu muốn thay.</>} />
        : <Alert type="warning" showIcon style={{ marginBottom: 20 }} message="Chưa có cookie Muse" description="Cần cookie đăng nhập để tool tạo video bằng tài khoản Muse của bạn." />}

      <Collapse ghost activeKey={help} onChange={setHelp} style={{ marginBottom: 8, marginInline: -16 }}
        items={[{ key: 'help', label: <Typography.Text strong style={{ fontSize: 16 }}>Cách lấy cookie</Typography.Text>, children: <CookieHelp /> }]} />

      <Form form={form} layout="vertical" requiredMark={false} onFinish={save}>
        <Form.Item name="credential" label={<Flex justify="space-between" align="center" style={{ width: '100%' }}><span>Cookie Muse</span></Flex>} rules={[{ required: true, whitespace: true, message: 'Dán cookie vào đây.' }]}
          extra="Chấp nhận JSON xuất từ extension, chuỗi name=value; ... hoặc header cookie sao chép từ DevTools.">
          <Input.TextArea rows={5} autoComplete="off" spellCheck={false} placeholder="Bấm “Dán từ clipboard” hoặc nhấn Ctrl+V để dán cookie vào đây" style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 14 }} />
        </Form.Item>
        {pasted.trim() && (
          <Flex gap={8} wrap align="center" style={{ marginBottom: 20, marginTop: -8 }}>
            <Typography.Text type="secondary">Phát hiện:</Typography.Text>
            {REQUIRED_COOKIES.map((name) => <Tag key={name} color={pasted.includes(name) ? 'success' : 'error'} icon={pasted.includes(name) ? <CheckOutlined /> : undefined} style={{ marginInlineEnd: 0 }}>{name}</Tag>)}
            {missing.length > 0 && <Typography.Text type="danger">Thiếu {missing.length} cookie, hãy xuất lại từ extension.</Typography.Text>}
          </Flex>
        )}
        <Space wrap size={12}>
          <Button size="large" icon={<SnippetsOutlined />} onClick={paste}>Dán từ clipboard</Button>
          <Button type="primary" size="large" htmlType="submit" icon={<SaveOutlined />} loading={saving} disabled={Boolean(pasted.trim()) && missing.length > 0}>{credential?.configured ? 'Thay cookie' : 'Lưu cookie'}</Button>
          <Button size="large" icon={<ExperimentOutlined />} onClick={test} loading={testing} disabled={!credential?.configured}>Kiểm tra kết nối</Button>
          {credential?.configured && (
            <Popconfirm title="Xóa cookie Muse khỏi máy?" okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }} onConfirm={() => run(() => api('/api/provider/credential', { method: 'DELETE' }), 'Đã xóa cookie.').then(() => { load(); refresh(); })}>
              <Button size="large" danger icon={<DeleteOutlined />}>Xóa cookie</Button>
            </Popconfirm>
          )}
        </Space>
      </Form>
      <Alert style={{ marginTop: 20 }} type="warning" showIcon message="Ai có cookie này là vào được tài khoản Muse của bạn. Chỉ dán ở đây; đừng gửi qua chat hay email." />
    </Card>
  );
}

function Browser() {
  const { data, refresh } = useApp();
  const run = useRun();
  return (
    <Card title="Trình duyệt tạo video">
      <Flex justify="space-between" align="center" gap={16}>
        <div>
          <Typography.Text strong style={{ fontSize: 16 }}>Ẩn cửa sổ trình duyệt</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>Tool điều khiển Chrome/Edge trên máy bạn để dùng Muse. Nên tắt tùy chọn này khi chạy thật lần đầu để quan sát Muse đang làm gì.</Typography.Paragraph>
        </div>
        <Switch checked={Boolean(data.settings?.headless)} onChange={(checked) => run(() => api('/api/settings', { method: 'PATCH', body: { headless: checked } }), 'Đã lưu.').then(refresh)} />
      </Flex>
      <Divider style={{ margin: '20px 0' }} />
      <Flex justify="space-between" align="center" gap={16}>
        <div>
          <Typography.Text strong style={{ fontSize: 16 }}>Cuộc chat gợi ý tiêu đề</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>Tool dùng lại một cuộc chat riêng cho mỗi kênh trên Muse nên không phải tạo chat mới hay nhắc lại hướng dẫn. Đặt lại nếu Muse bắt đầu gợi ý lạc đề.</Typography.Paragraph>
        </div>
        <Popconfirm title="Bắt đầu cuộc chat gợi ý mới?" description="Lần gợi ý kế tiếp sẽ mở chat mới trên Muse." okText="Đặt lại" cancelText="Hủy" onConfirm={() => run(() => api('/api/ai/threads', { method: 'DELETE' }), 'Đã đặt lại. Lần gợi ý kế tiếp dùng chat mới.')}>
          <Button size="large">Đặt lại</Button>
        </Popconfirm>
      </Flex>
    </Card>
  );
}

function Youtube() {
  const { data } = useApp();
  const client = data.channelData.client;
  const [open, setOpen] = useState(null);
  const active = open ?? (client.configured ? [] : ['guide']); // chưa cấu hình thì mở sẵn hướng dẫn
  return (
    <Card title="Google OAuth (YouTube)" extra={<Tag color={client.configured ? 'success' : 'warning'}>{client.configured ? 'Đã cấu hình' : 'Chưa cấu hình'}</Tag>}>
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        Để đăng video và xem số liệu kênh, bạn cần tự tạo một "OAuth client" trên Google Cloud (miễn phí, làm một lần). Client ID và Secret chỉ nhận diện ứng dụng của bạn; kênh nào được kết nối thì chọn ở bước <b>Thêm kênh</b>.
      </Typography.Paragraph>
      <Collapse ghost activeKey={active} onChange={setOpen} style={{ marginInline: -16, marginBottom: 8 }}
        items={[{ key: 'guide', label: <Typography.Text strong style={{ fontSize: 16 }}>Hướng dẫn lấy Client ID và Client Secret</Typography.Text>, children: <OAuthGuide redirectUri={client.redirectUri} /> }]} />
      <OAuthClientForm client={client} compact />
    </Card>
  );
}

export default function Settings({ dark, setDark }) {
  return (
    <>
      <PageHeader title="Cài đặt" subtitle="Tài khoản Muse, trình duyệt tự động và kết nối YouTube." />
      <Row gutter={[24, 24]}>
        <Col xs={24} xl={16}>
          <Flex vertical gap={24}><MuseAccount /><Browser /><Youtube /></Flex>
        </Col>
        <Col xs={24} xl={8}>
          <Flex vertical gap={24}>
            <Card title="Giao diện">
              <Flex justify="space-between" align="center"><Typography.Text style={{ fontSize: 16 }}>Chế độ tối</Typography.Text><Switch checked={dark} onChange={setDark} /></Flex>
            </Card>
            <Card title={<Space><LockOutlined />Bảo mật</Space>}>
              <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 1.9 }}>
                <li>Cookie và token lưu trong thư mục <Typography.Text code>data/</Typography.Text> trên máy này, không gửi đi đâu khác.</li>
                <li>Server chỉ nghe ở 127.0.0.1 và từ chối Host/Origin lạ.</li>
                <li>Cookie không bao giờ được trả về giao diện.</li>
                <li>Cookie lưu dạng văn bản trong file cục bộ (chưa mã hóa).</li>
                <li>Tool không vượt CAPTCHA hay xác thực hai bước.</li>
              </ul>
            </Card>
          </Flex>
        </Col>
      </Row>
    </>
  );
}
