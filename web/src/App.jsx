import React, { useEffect, useState } from 'react';
import {
  App as AntApp, Badge, Button, ConfigProvider, Drawer, Flex, Grid, Layout, Menu, Result, Spin, Switch, Tag, Typography, theme as antTheme,
} from 'antd';
import viVN from 'antd/locale/vi_VN';
import {
  AuditOutlined, DashboardOutlined, MenuOutlined, MoonOutlined, PictureOutlined, SettingOutlined, SunOutlined,
  UnorderedListOutlined, YoutubeOutlined,
} from '@ant-design/icons';
import { AppProvider, useApp } from './store.jsx';
import { navigate, useRoute } from './router.js';
import Overview from './pages/Overview.jsx';
import Review from './pages/Review.jsx';
import ChannelWorkspace from './pages/ChannelWorkspace.jsx';
import Queue from './pages/Queue.jsx';
import Media from './pages/Media.jsx';
import Channels from './pages/Channels.jsx';
import Settings from './pages/Settings.jsx';

const { Sider, Header, Content } = Layout;

const FONT = '"Segoe UI", "Inter", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
const themeFor = (dark) => ({
  cssVar: true,
  hashed: false,
  algorithm: dark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
  token: { colorPrimary: '#2563eb', borderRadius: 10, fontSize: 15, fontSizeSM: 13, fontFamily: FONT, colorBgLayout: dark ? '#0b0f19' : '#f4f6fb', controlHeight: 40 },
  components: {
    Menu: { itemHeight: 46, itemBorderRadius: 10, itemMarginInline: 12, itemMarginBlock: 4, iconSize: 18 },
    Card: { headerFontSize: 17, headerHeight: 58 },
    Table: { headerBorderRadius: 10, cellPaddingBlock: 14 },
    Layout: { headerPadding: '0 24px', headerHeight: 64 },
  },
});

const routes = [
  { path: '/', title: 'Tổng quan', icon: <DashboardOutlined />, element: <Overview /> },
  { path: '/channels', title: 'Kênh YouTube', icon: <YoutubeOutlined />, element: <Channels /> },
  { path: '/review', title: 'Chờ duyệt', icon: <AuditOutlined />, element: <Review /> },
  { path: '/queue', title: 'Hàng đợi', icon: <UnorderedListOutlined />, element: <Queue /> },
  { path: '/media', title: 'Thư viện media', icon: <PictureOutlined />, element: <Media /> },
  { path: '/settings', title: 'Cài đặt', icon: <SettingOutlined />, element: null },
];

function Brand({ onClick }) {
  return (
    <Flex align="center" gap={12} onClick={onClick} style={{ padding: '20px 24px 16px', cursor: 'pointer' }}>
      <svg width="36" height="36" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#2563eb" /><path d="M9 22V10l7 8 7-8v12" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <div><Typography.Text strong style={{ fontSize: 18, display: 'block', lineHeight: 1.2 }}>Muse Studio</Typography.Text><Typography.Text type="secondary" style={{ fontSize: 13 }}>Tạo & đăng video tự động</Typography.Text></div>
    </Flex>
  );
}

function Shell({ dark, setDark }) {
  const { data, status, refresh } = useApp();
  const route = useRoute();
  const screens = Grid.useBreakpoint();
  const mobile = screens.lg === false;
  const [drawer, setDrawer] = useState(false);
  const { token } = antTheme.useToken();

  useEffect(() => setDrawer(false), [route.path]);
  const channelId = route.path.startsWith('/channel/') ? route.path.slice('/channel/'.length) : null;
  const current = channelId ? routes.find((item) => item.path === '/channels') : routes.find((item) => item.path === route.path) || routes[0];
  useEffect(() => { document.title = `${current.title} · Muse Studio`; }, [current.title]);

  if (!status.ready) {
    return status.error
      ? <Result status="error" title="Không kết nối được server" subTitle={status.error} extra={<Button type="primary" onClick={refresh}>Thử lại</Button>} style={{ paddingTop: 96 }} />
      : <Flex align="center" justify="center" style={{ minHeight: '100vh' }}><Spin size="large" /></Flex>;
  }

  const active = data.jobs.filter((job) => ['QUEUED', 'SUBMITTED', 'GENERATING'].includes(job.status)).length;
  const review = data.channelData.posts.filter((post) => post.status === 'PENDING_REVIEW').length + (data.dashboard?.pendingPrompts || 0);
  const badge = (count, color) => (count ? <Badge count={count} color={color} style={{ marginLeft: 8 }} /> : null);
  const items = routes.map((item) => ({
    key: item.path, icon: item.icon,
    label: <Flex justify="space-between" align="center"><span>{item.title}</span>{item.path === '/queue' && badge(active, '#2563eb')}{item.path === '/review' && badge(review, '#fa8c16')}</Flex>,
  }));
  const menu = <Menu mode="inline" selectedKeys={[current.path]} items={items} onClick={({ key }) => navigate(key)} style={{ border: 0, background: 'transparent' }} />;
  const cookieOk = data.dashboard?.provider?.status === 'connected';
  const page = channelId ? <ChannelWorkspace key={channelId} channelId={channelId} /> : current.path === '/settings' ? <Settings dark={dark} setDark={setDark} /> : current.element;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!mobile && (
        <Sider width={256} theme={dark ? 'dark' : 'light'} style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'auto', borderRight: `1px solid ${token.colorBorderSecondary}` }}>
          <Brand onClick={() => navigate('/')} />
          {menu}
        </Sider>
      )}
      <Layout>
        <Header style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          <Flex align="center" gap={12}>
            {mobile && <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawer(true)} aria-label="Mở menu" />}
            <Typography.Text strong style={{ fontSize: 17, whiteSpace: 'nowrap' }}>{current.title}</Typography.Text>
          </Flex>
          <Flex align="center" gap={12}>
            <Tag color={cookieOk ? 'success' : 'warning'} style={{ cursor: 'pointer', marginInlineEnd: 0 }} onClick={() => navigate('/settings')}>{mobile ? (cookieOk ? 'Muse ✓' : 'Muse ✗') : (cookieOk ? 'Muse: đã có cookie' : 'Muse: chưa có cookie')}</Tag>
            <Switch checked={dark} onChange={setDark} checkedChildren={<MoonOutlined />} unCheckedChildren={<SunOutlined />} aria-label="Chế độ tối" />
          </Flex>
        </Header>
        <Content style={{ padding: mobile ? 16 : 32, width: '100%', maxWidth: 1440, margin: '0 auto' }}>{page}</Content>
      </Layout>
      <Drawer open={drawer} onClose={() => setDrawer(false)} placement="left" width={280} styles={{ body: { padding: 0 } }} closable={false}>
        <Brand onClick={() => navigate('/')} />{menu}
      </Drawer>
    </Layout>
  );
}

export default function App() {
  const [dark, setDarkState] = useState(() => {
    try { return localStorage.getItem('muse-theme') ? localStorage.getItem('muse-theme') === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
  });
  const setDark = (value) => { setDarkState(value); try { localStorage.setItem('muse-theme', value ? 'dark' : 'light'); } catch { /* bỏ qua */ } };
  useEffect(() => { document.documentElement.style.colorScheme = dark ? 'dark' : 'light'; document.body.style.background = dark ? '#0b0f19' : '#f4f6fb'; }, [dark]);
  return (
    <ConfigProvider locale={viVN} theme={themeFor(dark)}>
      <AntApp>
        <AppProvider><Shell dark={dark} setDark={setDark} /></AppProvider>
      </AntApp>
    </ConfigProvider>
  );
}
