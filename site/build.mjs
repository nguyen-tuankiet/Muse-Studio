// Đóng gói trang giới thiệu thành site/dist (thư mục sẵn sàng để đưa lên hosting) kèm file zip mã nguồn để tải.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const site = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(site, '..');
const dist = path.join(site, 'dist');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
fs.mkdirSync(path.join(dist, 'downloads'), { recursive: true });

for (const file of ['index.html', 'site.config.js']) fs.copyFileSync(path.join(site, file), path.join(dist, file));
for (const file of fs.readdirSync(path.join(site, 'assets'))) fs.copyFileSync(path.join(site, 'assets', file), path.join(dist, 'assets', file));
for (const file of ['demo.mp4', 'demo-poster.jpg']) fs.copyFileSync(path.join(root, 'docs', file), path.join(dist, 'assets', file));

// Zip mã nguồn từ commit hiện tại (chỉ file đã commit: không có data/, node_modules, cookie hay token).
const zip = path.join(dist, 'downloads', 'muse-studio.zip');
execFileSync('git', ['archive', '--format=zip', '--prefix=MuseStudio/', '-o', zip, 'HEAD', '--', '.', ':(exclude)docs', ':(exclude)site'], { cwd: root, stdio: 'inherit' });
const sha = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
fs.writeFileSync(path.join(dist, 'downloads', 'SHA256.txt'), `${sha}  muse-studio.zip\n`);
// Đồng bộ số phiên bản vào cấu hình trong dist
const cfgFile = path.join(dist, 'site.config.js');
fs.writeFileSync(cfgFile, fs.readFileSync(cfgFile, 'utf8').replace(/version: '[^']*'/, `version: '${version}'`));

const mb = (file) => (fs.statSync(file).size / 1048576).toFixed(1);
console.log(`Đã tạo ${dist}\n  zip mã nguồn: ${mb(zip)} MB (v${version})\n  SHA-256: ${sha}`);
