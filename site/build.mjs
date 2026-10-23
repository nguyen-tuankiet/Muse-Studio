// Đóng gói trang giới thiệu thành site/dist (thư mục sẵn sàng để đưa lên hosting). KHÔNG đưa file zip mã nguồn vào dist vì trang bán thu phí.
// Thêm --zip để tạo file bản cài site/release/muse-studio.zip: tải file này lên nơi bán (Lemon Squeezy, Gumroad...) để gửi cho khách sau khi thanh toán.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const site = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(site, '..');
const dist = path.join(site, 'dist');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

// Xóa nội dung cũ nhưng giữ lại .git (nếu bạn dùng thư mục dist làm repo riêng để deploy)
fs.mkdirSync(dist, { recursive: true });
for (const entry of fs.readdirSync(dist)) if (entry !== '.git') fs.rmSync(path.join(dist, entry), { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });

for (const file of ['index.html', 'site.config.js', 'effects.css', 'effects.js', 'pay.css', 'pay.js', 'analytics.js']) fs.copyFileSync(path.join(site, file), path.join(dist, file));
// Trang quản trị
fs.mkdirSync(path.join(dist, 'admin'), { recursive: true });
fs.copyFileSync(path.join(site, 'admin', 'index.html'), path.join(dist, 'admin', 'index.html'));
// Các hàm thanh toán (Vercel Functions): sao chép vào dist/api, bỏ file tự kiểm thử
fs.mkdirSync(path.join(dist, 'api'), { recursive: true });
for (const file of fs.readdirSync(path.join(site, 'api'))) if (file.endsWith('.js')) fs.copyFileSync(path.join(site, 'api', file), path.join(dist, 'api', file));
for (const file of fs.readdirSync(path.join(site, 'assets'))) fs.copyFileSync(path.join(site, 'assets', file), path.join(dist, 'assets', file));
for (const file of ['demo.mp4', 'demo-poster.jpg']) fs.copyFileSync(path.join(root, 'docs', file), path.join(dist, 'assets', file));

// Zip mã nguồn (chỉ khi có --zip): lấy từ commit hiện tại, không có data/, cookie hay token. Lưu ngoài dist.
let zipInfo = '';
if (process.argv.includes('--zip')) {
  const release = path.join(site, 'release');
  fs.mkdirSync(release, { recursive: true });
  const zip = path.join(release, 'muse-studio.zip');
  execFileSync('git', ['archive', '--format=zip', '--prefix=MuseStudio/', '-o', zip, 'HEAD', '--', '.', ':(exclude)docs', ':(exclude)site'], { cwd: root, stdio: 'inherit' });
  const sha = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
  zipInfo = `\n  file bản cài: ${zip} (${(fs.statSync(zip).size / 1048576).toFixed(1)} MB)\n  SHA-256: ${sha}`;
}
// Đồng bộ số phiên bản vào cấu hình trong dist
const cfgFile = path.join(dist, 'site.config.js');
fs.writeFileSync(cfgFile, fs.readFileSync(cfgFile, 'utf8').replace(/version: '[^']*'/, `version: '${version}'`));

console.log(`Đã tạo ${dist} (v${version}, không kèm file tải về)${zipInfo}`);
