import React from 'react';
import { Alert, Flex, Steps, Typography } from 'antd';
import { ExportOutlined } from '@ant-design/icons';

const Ext = ({ href, children }) => <Typography.Link href={href} target="_blank" rel="noreferrer">{children} <ExportOutlined style={{ fontSize: 12 }} /></Typography.Link>;

// Hướng dẫn tạo Google OAuth client (làm một lần). Giao diện Google Cloud hay đổi tên mục, nên mỗi bước đều có link mở thẳng trang liên quan.
export default function OAuthGuide({ redirectUri }) {
  const steps = [
    {
      title: 'Tạo project trên Google Cloud',
      description: <>Mở <Ext href="https://console.cloud.google.com/projectcreate">Google Cloud Console</Ext>, đăng nhập bằng tài khoản Google đang quản lý các kênh YouTube, rồi tạo project mới (tên đặt tùy ý).</>,
    },
    {
      title: 'Bật YouTube Data API v3',
      description: <>Mở <Ext href="https://console.cloud.google.com/apis/library/youtube.googleapis.com">trang YouTube Data API v3</Ext> và bấm <b>Enable</b> (Bật). Nhớ kiểm tra thanh trên cùng đang chọn đúng project vừa tạo.</>,
    },
    {
      title: 'Cấu hình màn hình đồng ý OAuth',
      description: (
        <>
          Mở <Ext href="https://console.cloud.google.com/auth/overview">Google Auth Platform</Ext> (trước đây là <i>APIs &amp; Services → OAuth consent screen</i>).
          <ul style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.8 }}>
            <li>Loại người dùng chọn <b>External</b>, điền tên ứng dụng và email hỗ trợ bất kỳ.</li>
            <li>Ở mục <b>Audience / Test users</b>, thêm email của các tài khoản Google quản lý kênh.</li>
            <li>Chuyển trạng thái sang <b>In production</b> (Publish app). Nếu để <i>Testing</i>, phiên đăng nhập YouTube hết hạn sau 7 ngày.</li>
            <li>Nếu Google yêu cầu khai báo scope, thêm <Typography.Text code>youtube.upload</Typography.Text> và <Typography.Text code>youtube.readonly</Typography.Text>.</li>
          </ul>
        </>
      ),
    },
    {
      title: 'Tạo OAuth client',
      description: (
        <>
          Mở <Ext href="https://console.cloud.google.com/apis/credentials">Credentials</Ext> → <b>Create credentials → OAuth client ID</b> → loại ứng dụng <b>Web application</b>.
          Ở mục <b>Authorized redirect URIs</b> bấm Add URI và dán chính xác địa chỉ này:
          <div style={{ marginTop: 8 }}><Typography.Text code copyable style={{ fontSize: 14 }}>{redirectUri}</Typography.Text></div>
        </>
      ),
    },
    {
      title: 'Sao chép Client ID và Client Secret',
      description: <>Sau khi bấm Create, Google hiện hộp thoại chứa <b>Client ID</b> và <b>Client Secret</b>. Sao chép cả hai và dán vào form bên dưới. Có thể xem lại Secret bất cứ lúc nào trong trang Credentials.</>,
    },
  ].map((item) => ({ ...item, status: 'process' }));

  return (
    <Flex vertical gap={16}>
      <Steps direction="vertical" size="small" items={steps} />
      <Alert type="info" showIcon message="Khi bấm Kết nối YouTube lần đầu"
        description={<>Google sẽ cảnh báo "ứng dụng chưa được xác minh" vì đây là ứng dụng của riêng bạn. Bấm <b>Nâng cao → Tiếp tục</b> là được. Với tài khoản có nhiều kênh, Google hiện màn hình để bạn chọn đúng kênh cần kết nối.</>} />
      <Alert type="warning" showIcon message="Lỗi thường gặp"
        description={<ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li><Typography.Text code>redirect_uri_mismatch</Typography.Text>: địa chỉ ở bước 4 chưa khớp từng ký tự (đúng <b>http</b>, <b>127.0.0.1</b> và đúng cổng).</li>
          <li><Typography.Text code>access_denied</Typography.Text>: email đang đăng nhập chưa nằm trong Test users (ở bước 3).</li>
          <li>Đăng được tối đa khoảng 6 video mỗi ngày cho toàn bộ kênh, vì mỗi project Google có hạn mức 10.000 đơn vị/ngày.</li>
        </ul>} />
    </Flex>
  );
}
