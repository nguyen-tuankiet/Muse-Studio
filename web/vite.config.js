import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Khi phát triển giao diện (npm run dev trong web/), chuyển tiếp API sang server Node đang chạy ở cổng 3000.
const target = 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': target, '/media': target, '/oauth': target } },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/antd') || id.includes('node_modules/@ant-design') || id.includes('node_modules/rc-')) return 'antd';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
});
