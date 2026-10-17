const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { createProvider } = require('./lib/muse');
const { createYouTube } = require('./lib/youtube');
const { createAssistant } = require('./lib/ai');

const port = Number(process.env.PORT || 3000);
// Server giữ cookie đăng nhập Muse, nên mặc định chỉ nghe trên máy này.
const host = process.env.HOST || '127.0.0.1';
const root = __dirname;
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
const mediaDir = path.join(dataDir, 'media');
const storeFile = path.join(dataDir, 'store.json');
const clients = new Set();
const muse = createProvider({ dataDir });
const redirectBase = (process.env.OAUTH_REDIRECT_BASE || `http://127.0.0.1:${port}`).replace(/\/+$/, '');
const yt = createYouTube({ dataDir, redirectUri: `${redirectBase}/oauth/youtube/callback` });
const ai = createAssistant({ muse, getHeadless: () => Boolean(store.settings.headless) });
const running = new Map(); // jobId -> AbortController, chỉ cho job live đang chạy
let processing = false;
let uploading = false;
let syncing = false;

// Giao diện React được build sẵn vào web/dist; chỉ phục vụ file nằm trong thư mục này (không lộ data/ hay mã server).
const webDist = path.join(root, 'web', 'dist');
const staticTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json' };
const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', ...String(process.env.ALLOWED_HOSTS || '').split(',').map((item) => item.trim()).filter(Boolean)]);

const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const extFor = (mime) => ({ 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[String(mime).split(';')[0]] || 'bin');
const mimeOf = (asset) => asset.mimeType || 'application/octet-stream';

function seedStore() {
  return { settings: { concurrency: 1, headless: false }, projects: [], prompts: [], jobs: [], media: [], events: [], channels: [], posts: [], schedules: [] };
}

let store;
function ensureStorage() {
  fs.mkdirSync(mediaDir, { recursive: true });
  if (!fs.existsSync(storeFile)) { store = seedStore(); persist(); return; }
  try { store = JSON.parse(fs.readFileSync(storeFile, 'utf8')); } catch { store = seedStore(); }
  store.settings = { headless: false, ...store.settings };
  dropDemoData();
  store.channels = store.channels || [];
  store.posts = store.posts || [];
  store.schedules = store.schedules || [];
  store.channels = store.channels.filter((channel) => !channel.pending);
  migrateModel();
  for (const post of store.posts) if (post.status === 'UPLOADING') { post.status = 'FAILED'; post.error = 'Server đã dừng khi đang upload; kiểm tra kênh YouTube rồi thử lại (có thể video đã lên).'; }
  // Server tắt giữa chừng thì job đang chạy không còn tiến trình nào theo dõi.
  for (const job of store.jobs) {
    if (job.status === 'SUBMITTED' || job.status === 'GENERATING') { job.status = 'INTERRUPTED'; job.error = 'Server đã dừng khi job đang chạy.'; job.updatedAt = now(); }
  }
  persist();
}
// Chế độ Demo đã bị bỏ: dọn dữ liệu giả còn sót lại từ các phiên bản trước.
function dropDemoData() {
  delete store.settings.mode; delete store.settings.timeout; delete store.settings.retryLimit;
  for (const asset of store.media.filter((item) => item.demo)) { try { fs.unlinkSync(path.join(mediaDir, asset.storageKey)); } catch {} }
  store.media = store.media.filter((item) => !item.demo);
  store.jobs = store.jobs.filter((job) => job.provider !== 'mock');
  const sample = store.projects.find((project) => project.id === 'project_demo');
  const samplePrompts = sample ? store.prompts.filter((prompt) => prompt.projectId === sample.id) : [];
  if (sample && !store.jobs.some((job) => job.projectId === sample.id) && samplePrompts.every((prompt) => /^prompt_demo_\d$/.test(prompt.id) && prompt.version === 1)) {
    store.projects = store.projects.filter((project) => project.id !== sample.id);
    store.prompts = store.prompts.filter((prompt) => prompt.projectId !== sample.id);
  }
}
// ---------------------------------------------------------------- Mô hình "mỗi kênh = một project"
// Kênh có hồ sơ (ngách, chủ đề...) để Muse nghĩ prompt đúng hướng; prompt/job/video của kênh nằm trong project của kênh.
const DEFAULT_BRIEF = { niche: '', topic: '', audience: '', tone: '', language: 'vi', size: null, duration: null, avoid: '', notes: '' };
function readBrief(input = {}, base = DEFAULT_BRIEF) {
  const next = { ...DEFAULT_BRIEF, ...base };
  const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  if ('niche' in input) next.niche = text(input.niche, 120);
  if ('topic' in input) next.topic = text(input.topic, 600);
  if ('audience' in input) next.audience = text(input.audience, 200);
  if ('tone' in input) next.tone = text(input.tone, 120);
  if ('language' in input) next.language = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(String(input.language)) ? String(input.language) : 'vi';
  if ('avoid' in input) next.avoid = text(input.avoid, 400);
  if ('notes' in input) next.notes = text(input.notes, 800);
  if ('size' in input) next.size = ['16:9', '9:16', '1:1'].includes(input.size) ? input.size : null;
  if ('duration' in input) { const value = Number(input.duration); next.duration = Number.isInteger(value) && value >= 1 && value <= 60 ? value : null; }
  return next;
}
function ensureChannelProject(channel) {
  let project = projectById(channel.projectId);
  if (!project) {
    project = { id: id('project'), name: String(channel.name || 'Kênh').slice(0, 80), description: '', channelId: channel.id, createdAt: now(), updatedAt: now() };
    store.projects.unshift(project);
    channel.projectId = project.id;
  }
  project.channelId = channel.id;
  return project;
}
// Gộp toàn bộ prompt/job/video của project nguồn vào project đích rồi xóa project nguồn.
function mergeProject(fromId, toId) {
  if (!fromId || fromId === toId) return;
  for (const list of [store.prompts, store.jobs, store.media]) for (const item of list) if (item.projectId === fromId) item.projectId = toId;
  store.projects = store.projects.filter((project) => project.id !== fromId);
}
// Nâng dữ liệu từ các phiên bản trước lên mô hình mới (chạy mỗi lần khởi động, an toàn khi lặp lại).
function migrateModel() {
  for (const prompt of store.prompts) {
    if (!prompt.status) prompt.status = store.jobs.some((job) => job.promptId === prompt.id) ? 'USED' : 'APPROVED';
    prompt.source = prompt.source || 'manual';
  }
  for (const channel of store.channels) {
    channel.brief = readBrief({}, channel.brief || {});
    if (channel.autoMetadata === undefined) channel.autoMetadata = true;
  }
  // Project cũ chưa gắn kênh: nếu chỉ có đúng một project và một kênh chưa có project thì ghép với nhau.
  const scheduleProjects = new Set(store.schedules.map((schedule) => schedule.projectId).filter(Boolean));
  const orphans = store.projects.filter((project) => !channelById(project.channelId) && !scheduleProjects.has(project.id));
  const bare = store.channels.filter((channel) => !projectById(channel.projectId));
  if (orphans.length === 1 && bare.length === 1) { orphans[0].channelId = bare[0].id; bare[0].projectId = orphans[0].id; }
  for (const channel of store.channels) ensureChannelProject(channel);
  // Lịch cũ nhập chủ đề tay: đổi thành prompt đã duyệt trong project của kênh; project riêng của lịch gộp vào project kênh.
  for (const schedule of store.schedules) {
    const channel = channelById(schedule.channelId);
    const project = channel ? ensureChannelProject(channel) : null;
    if (project && Array.isArray(schedule.topics)) {
      const start = Math.max(0, schedule.nextIndex || 0);
      let order = store.prompts.filter((prompt) => prompt.projectId === project.id).length;
      schedule.topics.forEach((topic, index) => {
        order += 1;
        store.prompts.push({ id: id('prompt'), projectId: project.id, content: String(topic), order, version: 1, status: index < start ? 'USED' : 'APPROVED', source: 'manual', createdAt: now(), updatedAt: now() });
      });
    }
    if (project && schedule.projectId && schedule.projectId !== project.id) mergeProject(schedule.projectId, project.id);
    schedule.source = schedule.source || 'queue';
    schedule.mediaIds = schedule.mediaIds || [];
    if (schedule.autoFill === undefined) schedule.autoFill = true;
    for (const key of ['topics', 'nextIndex', 'loop', 'projectId']) delete schedule[key];
  }
}

function persist() {
  fs.mkdirSync(dataDir, { recursive: true });
  const temp = `${storeFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2));
  fs.renameSync(temp, storeFile);
}
function emit(type, payload = {}) {
  const event = { id: id('event'), type, at: now(), ...payload };
  store.events = [event, ...(store.events || [])].slice(0, 100);
  persist();
  const message = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) client.write(message);
}
const projectById = (projectId) => store.projects.find((item) => item.id === projectId);
const promptById = (promptId) => store.prompts.find((item) => item.id === promptId);
const jobById = (jobId) => store.jobs.find((item) => item.id === jobId);
const publicProject = (project) => ({ ...project, channelName: store.channels.find((item) => item.id === project.channelId)?.name || null, promptCount: store.prompts.filter((item) => item.projectId === project.id).length, jobCount: store.jobs.filter((item) => item.projectId === project.id).length });
const publicJob = (job) => ({ ...job, prompt: promptById(job.promptId)?.content || '(prompt đã xóa)', project: projectById(job.projectId)?.name || '(project đã xóa)' });
function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}
const fail = (res, status, message, code = 'bad_request') => json(res, status, { error: { code, message } });
function body(req) {
  return new Promise((resolve, reject) => {
    let raw = ''; let tooLarge = false;
    req.on('data', (chunk) => {
      if (tooLarge) return;
      raw += chunk;
      if (raw.length > 2_000_000) { tooLarge = true; raw = ''; reject(new Error('Payload quá lớn.')); }
    });
    req.on('end', () => {
      if (tooLarge) return;
      if (!raw) return resolve({});
      try { const value = JSON.parse(raw); resolve(value && typeof value === 'object' && !Array.isArray(value) ? value : {}); } catch { resolve({ raw }); }
    });
    req.on('error', reject);
  });
}
function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] && /^prompt(?:,|$)/i.test(lines[0])) lines.shift();
  return lines.map((line) => line.split(',')[0].trim().replace(/^"|"$/g, '').replace(/""/g, '"')).filter(Boolean);
}


function touch(job, patch = {}) { Object.assign(job, patch, { updatedAt: now() }); persist(); emit('job.updated', { job: publicJob(job) }); }


async function runLive(job) {
  const prompt = promptById(job.promptId)?.content;
  if (!prompt) return touch(job, { status: 'FAILED', error: 'Prompt đã bị xóa.' });
  touch(job, { status: 'GENERATING', progress: 0, error: null });
  const controller = new AbortController();
  running.set(job.id, controller);
  let lastEmit = 0; let lastProgress = 0;
  try {
    const result = await muse.generate({
      type: job.type, prompt, size: job.size, duration: job.duration, headless: Boolean(store.settings.headless), signal: controller.signal,
      onProgress(value) {
        job.progress = value;
        if (value - lastProgress >= 5 && Date.now() - lastEmit > 3000) { lastProgress = value; lastEmit = Date.now(); touch(job); }
      },
    });
    const filename = `${job.id}.${extFor(result.mime)}`;
    fs.writeFileSync(path.join(mediaDir, filename), result.data);
    const media = { id: id('media'), projectId: job.projectId, promptId: job.promptId, jobId: job.id, type: job.type, storageKey: filename, mimeType: result.mime, size: result.data.length, width: result.width, height: result.height, createdAt: now() };
    store.media.unshift(media);
    Object.assign(job, { status: 'COMPLETED', progress: 100, mediaId: media.id, completedAt: now(), updatedAt: now() });
    persist(); emit('job.updated', { job: publicJob(job), media });
    afterJobCompleted(job, media).catch((error) => console.error(error));
  } catch (error) {
    const needsAuth = error.code === 'AUTH_REQUIRED';
    touch(job, { status: needsAuth ? 'AUTH_REQUIRED' : 'FAILED', error: error.message || 'Lỗi không xác định.' });
  } finally { running.delete(job.id); }
}

async function runJob(job) {
  processing = true;
  try {
    touch(job, { status: 'SUBMITTED', startedAt: now() });
    await runLive(job);
  } catch (error) {
    console.error(error);
    touch(job, { status: 'FAILED', error: error.message || 'Lỗi không xác định.' });
  } finally { processing = false; }
}
async function processQueue() {
  if (processing) return;
  // Job tạo sớm nhất chạy trước; sort ổn định nên cùng thời điểm thì giữ thứ tự prompt trong batch.
  const next = store.jobs.filter((job) => job.status === 'QUEUED').sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))[0];
  if (next) await runJob(next);
}


// ---------------------------------------------------------------- Avatar kênh: tải về máy một lần rồi phục vụ từ server
const avatarDir = path.join(dataDir, 'avatars');
const visibleChannels = () => store.channels.filter((channel) => !channel.pending);
function avatarHostOk(url) {
  try {
    const parsedUrl = new URL(url);
    if (String(process.env.AVATAR_EXTRA_HOSTS || '').split(',').filter(Boolean).includes(parsedUrl.hostname)) return true; // dùng cho kiểm thử
    return parsedUrl.protocol === 'https:' && /(^|\.)(ggpht\.com|googleusercontent\.com|ytimg\.com)$/.test(parsedUrl.hostname);
  } catch { return false; }
}
async function cacheAvatar(channel, url) {
  if (!url || !avatarHostOk(url)) return;
  if (channel.avatar?.src === url && fs.existsSync(path.join(avatarDir, channel.id))) return;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const type = String(res.headers.get('content-type') || '').split(';')[0];
    if (!res.ok || !type.startsWith('image/')) return;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length || bytes.length > 2_000_000) return;
    fs.mkdirSync(avatarDir, { recursive: true });
    fs.writeFileSync(path.join(avatarDir, channel.id), bytes);
    channel.avatar = { src: url, mime: type, at: now() };
  } catch { /* không có avatar thì giao diện dùng biểu tượng mặc định */ }
}
function dropChannel(channelId) {
  store.channels = store.channels.filter((channel) => channel.id !== channelId);
  try { fs.unlinkSync(path.join(avatarDir, channelId)); } catch {}
  persist();
}

// ---------------------------------------------------------------- YouTube: kênh, bài đăng, thống kê
const channelById = (channelId) => store.channels.find((item) => item.id === channelId);
const postById = (postId) => store.posts.find((item) => item.id === postId);
const privacyValues = ['private', 'unlisted', 'public'];
function promptCounts(projectId) {
  const counts = { DRAFT: 0, APPROVED: 0, USED: 0 };
  for (const prompt of store.prompts) if (prompt.projectId === projectId) counts[prompt.status || 'APPROVED'] = (counts[prompt.status || 'APPROVED'] || 0) + 1;
  return counts;
}
function publicChannel(channel) {
  const posts = store.posts.filter((post) => post.channelId === channel.id);
  return {
    id: channel.id, name: channel.name, defaultPrivacy: channel.defaultPrivacy, createdAt: channel.createdAt,
    avatarUrl: channel.avatar ? `/avatar/${channel.id}?v=${Date.parse(channel.avatar.at)}` : null,
    connected: yt.hasTokens(channel.id), needsAuth: Boolean(channel.needsAuth), youtube: channel.youtube || null,
    stats: channel.stats || null, history: (channel.history || []).slice(-30), syncedAt: channel.syncedAt || null, syncError: channel.syncError || null,
    postCount: posts.length, uploadedCount: posts.filter((post) => post.status === 'UPLOADED').length,
    projectId: channel.projectId || null, brief: channel.brief || DEFAULT_BRIEF, autoMetadata: channel.autoMetadata !== false,
    promptCounts: promptCounts(channel.projectId),
  };
}
function publicPost(post) {
  const channel = channelById(post.channelId); const asset = store.media.find((item) => item.id === post.mediaId);
  return { ...post, suggestedPublishAt: post.status === 'PENDING_REVIEW' ? suggestPublishAt(scheduleById(post.scheduleId)) : null, scheduleName: scheduleById(post.scheduleId)?.name || null, channelName: channel?.name || '(kênh đã xóa)', url: post.youtubeVideoId ? `https://youtu.be/${post.youtubeVideoId}` : null, mediaUrl: asset ? `/media/${asset.storageKey}` : null };
}
function markAuth(channel, error) {
  if (error.code === 'NEEDS_AUTH') { channel.needsAuth = true; channel.syncError = error.message; return true; }
  return false;
}
async function syncChannel(channel) {
  try {
    const info = await yt.channelInfo(channel.id);
    channel.youtube = { channelId: info.youtubeChannelId, title: info.title, handle: info.handle, thumbnail: info.thumbnail };
    channel.stats = info.stats;
    await cacheAvatar(channel, info.thumbnail);
    const day = now().slice(0, 10);
    channel.history = (channel.history || []).filter((entry) => entry.day !== day);
    channel.history.push({ day, subscribers: info.stats.subscribers, views: info.stats.views, videos: info.stats.videos });
    channel.history = channel.history.slice(-90);
    const posts = store.posts.filter((post) => post.channelId === channel.id && post.youtubeVideoId);
    if (posts.length) {
      const infos = await yt.videosInfo(channel.id, posts.map((post) => post.youtubeVideoId));
      for (const post of posts) {
        const found = infos.get(post.youtubeVideoId);
        post.youtubeMissing = !found;
        if (found) { post.stats = { views: found.views, likes: found.likes, comments: found.comments }; post.youtubePrivacy = found.privacy; post.youtubePublishAt = found.publishAt; }
        post.syncedAt = now();
      }
    }
    channel.needsAuth = false; channel.syncError = null; channel.syncedAt = now();
  } catch (error) { if (!markAuth(channel, error)) channel.syncError = error.message; }
}
async function syncAll(onlyId) {
  if (syncing) return;
  syncing = true;
  try {
    for (const channel of store.channels) {
      if ((onlyId && channel.id !== onlyId) || !yt.hasTokens(channel.id)) continue;
      await syncChannel(channel);
    }
    persist(); emit('channels.synced');
  } finally { syncing = false; }
}
async function processPosts() {
  if (uploading) return;
  const post = store.posts.filter((item) => item.status === 'QUEUED').sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
  if (!post) return;
  uploading = true;
  const patch = (changes) => { Object.assign(post, changes, { updatedAt: now() }); persist(); emit('post.updated', { postId: post.id }); };
  try {
    const channel = channelById(post.channelId); const asset = store.media.find((item) => item.id === post.mediaId);
    if (!channel) return patch({ status: 'FAILED', error: 'Kênh đã bị xóa.' });
    const file = asset && path.join(mediaDir, asset.storageKey);
    if (!file || !fs.existsSync(file)) return patch({ status: 'FAILED', error: 'File video không còn trên máy.' });
    patch({ status: 'UPLOADING', error: null });
    const result = await yt.upload(channel.id, file, { title: post.title, description: post.description, tags: post.tags, privacy: post.privacy, publishAt: post.publishAt, mime: asset.mimeType });
    patch({ status: 'UPLOADED', youtubeVideoId: result.videoId, youtubePrivacy: result.privacy, uploadedAt: now(), error: null });
    syncAll(channel.id).catch((error) => console.error(error));
  } catch (error) {
    const channel = channelById(post.channelId);
    if (channel && markAuth(channel, error)) patch({ status: 'NEEDS_AUTH', error: error.message });
    else patch({ status: 'FAILED', error: error.message || 'Upload thất bại.' });
  } finally { uploading = false; }
}

// ---------------------------------------------------------------- Lịch tự động + duyệt trước khi đăng
const scheduleById = (scheduleId) => store.schedules.find((item) => item.id === scheduleId);
const scheduleTickMs = Number(process.env.SCHEDULE_TICK_MS || 30000);
const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const toMinutes = (hhmm) => { const [hour, minute] = String(hhmm).split(':').map(Number); return hour * 60 + minute; };
const sizes = ['16:9', '9:16', '1:1'];
const scheduleSources = ['auto', 'queue', 'media']; // auto: Muse tự nghĩ prompt mỗi ngày · queue: lấy prompt đã duyệt trong project · media: đăng video đã tạo sẵn
const runningSchedules = new Set();
const ATTEMPTS_PER_DAY = 3; // Muse lỗi thì thử lại sau ít phút, tối đa số lần này mỗi ngày (mỗi lần thử tốn một tin nhắn Muse)
const RETRY_MINUTES = 10;
const aiHttpStatus = (error) => ({ AUTH: 409, NOT_CONFIGURED: 409, QUOTA: 429, TIMEOUT: 504 }[error.code] || 502);

// Giờ đăng công khai kế tiếp (giờ máy này), cách hiện tại ít nhất 15 phút.
function suggestPublishAt(schedule) {
  if (!schedule?.publishTime) return null;
  const [hour, minute] = schedule.publishTime.split(':').map(Number);
  const when = new Date(); when.setHours(hour, minute, 0, 0);
  if (when.getTime() < Date.now() + 15 * 60 * 1000) when.setDate(when.getDate() + 1);
  return when.toISOString();
}
const readyPrompts = (projectId) => store.prompts
  .filter((prompt) => prompt.projectId === projectId && (prompt.status || 'APPROVED') === 'APPROVED')
  .sort((a, b) => ((a.order || 0) - (b.order || 0)) || (a.createdAt < b.createdAt ? -1 : 1));
const alreadyPosted = (channelId, mediaId) => store.posts.some((post) => post.channelId === channelId && post.mediaId === mediaId && !['FAILED', 'NEEDS_AUTH', 'REJECTED'].includes(post.status));
const dedupeKey = (text) => String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 80);
function publicSchedule(schedule) {
  const channel = channelById(schedule.channelId); const lastJob = jobById(schedule.lastJobId);
  let queueSize = null; let remaining = null; let nextItem = null;
  if (schedule.source === 'queue') { const ready = readyPrompts(channel?.projectId); queueSize = ready.length; nextItem = ready[0]?.content || null; }
  if (schedule.source === 'media') {
    const left = (schedule.mediaIds || []).filter((mediaId) => store.media.some((item) => item.id === mediaId) && !alreadyPosted(schedule.channelId, mediaId));
    remaining = left.length; nextItem = promptById(store.media.find((item) => item.id === left[0])?.promptId)?.content || null;
  }
  return { ...schedule, channelName: channel?.name || '(kênh đã xóa)', queueSize, remaining, nextItem, running: runningSchedules.has(schedule.id), lastJobStatus: lastJob?.status || null, lastJobError: lastJob?.error || null };
}
const newJob = (prompt, extra) => ({ id: id('job'), projectId: prompt.projectId, promptId: prompt.id, type: 'video', provider: 'muse', status: 'QUEUED', attempts: 0, createdAt: now(), updatedAt: now(), ...extra });
// Tạo job từ prompt và đánh dấu prompt đã dùng (chưa thêm vào store.jobs để batch có thể chèn cả cụm theo đúng thứ tự).
function createJob(prompt, { type = 'video', channelId = null, scheduleId = null, size = null, duration = null } = {}) {
  const job = newJob(prompt, { type, channelId, scheduleId, size, duration });
  Object.assign(prompt, { status: 'USED', usedAt: now(), jobId: job.id, updatedAt: now() });
  return job;
}
function liveBlocker(channelId, { needMuse = true } = {}) {
  if (needMuse && !muse.credentialInfo().configured) return 'Chưa có cookie Muse.';
  if (channelId !== undefined && !channelById(channelId)) return 'Kênh đã bị xóa.';
  if (channelId !== undefined && !yt.hasTokens(channelId)) return 'Kênh YouTube chưa kết nối.';
  return null;
}

// Nhờ Muse nghĩ prompt theo hồ sơ kênh và lưu vào project của kênh (mặc định ở trạng thái chờ duyệt).
async function generatePrompts(channel, { count = 5, hint = '', status = 'DRAFT', source = 'muse' } = {}) {
  const project = ensureChannelProject(channel);
  const existing = store.prompts.filter((prompt) => prompt.projectId === project.id);
  const texts = await ai.ideas({
    channel: { name: channel.name, title: channel.youtube?.title, handle: channel.youtube?.handle }, brief: channel.brief,
    existing: existing.slice(-25).map((prompt) => prompt.content),
    recentTitles: store.posts.filter((post) => post.channelId === channel.id && post.status !== 'REJECTED').slice(0, 8).map((post) => post.title),
    count, size: channel.brief.size, duration: channel.brief.duration, hint, threadKey: `ideas:${channel.id}`,
  });
  const seen = new Set(existing.map((prompt) => dedupeKey(prompt.content)));
  let order = existing.reduce((max, prompt) => Math.max(max, prompt.order || 0), 0);
  const created = []; let skipped = 0;
  for (const content of texts.slice(0, count)) {
    const key = dedupeKey(content);
    if (seen.has(key)) { skipped += 1; continue; }
    seen.add(key); order += 1;
    created.push({ id: id('prompt'), projectId: project.id, content, order, version: 1, status, source, createdAt: now(), updatedAt: now() });
  }
  if (!created.length) throw Object.assign(new Error('Muse chỉ đưa ra các ý tưởng trùng với prompt đã có. Thử lại hoặc thêm yêu cầu riêng.'), { code: 'DUPLICATE' });
  store.prompts.push(...created); persist(); emit('prompts.generated', { channelId: channel.id, count: created.length });
  return { created, skipped };
}

// Chạy một lịch một lần. Ném lỗi nếu không tạo được gì (Muse lỗi, hết prompt...); trả về thông tin job/bài vừa tạo.
async function executeSchedule(schedule) {
  const channel = channelById(schedule.channelId);
  if (!channel) throw new Error('Kênh đã bị xóa.');
  if (schedule.source === 'media') {
    const mediaId = (schedule.mediaIds || []).find((candidate) => store.media.some((item) => item.id === candidate) && !alreadyPosted(channel.id, candidate));
    if (!mediaId) { schedule.enabled = false; schedule.lastError = 'Đã đăng hết video đã chọn; lịch tự tắt.'; return { exhausted: true }; }
    const post = await createPostForMedia({ channel, media: store.media.find((item) => item.id === mediaId), schedule });
    Object.assign(schedule, { lastRunAt: now(), lastJobId: null, lastPostId: post.id, lastError: null });
    return { postId: post.id };
  }
  const project = ensureChannelProject(channel);
  let prompt = schedule.source === 'queue' ? readyPrompts(project.id)[0] : null;
  if (!prompt) {
    if (schedule.source === 'queue' && !schedule.autoFill) throw new Error('Hết prompt đã duyệt trong project. Hãy thêm hoặc duyệt prompt, hoặc bật "Muse tự sinh thêm khi hết".');
    [prompt] = (await generatePrompts(channel, { count: 1, hint: schedule.hint || '', status: 'APPROVED', source: 'muse-auto' })).created;
  }
  const job = createJob(prompt, { channelId: channel.id, scheduleId: schedule.id, size: schedule.size || channel.brief.size || null, duration: schedule.duration || channel.brief.duration || null });
  store.jobs.unshift(job);
  Object.assign(schedule, { lastRunAt: now(), lastJobId: job.id, lastError: null });
  persist(); emit('batch.created', { count: 1, jobIds: [job.id] }); processQueue().catch((error) => console.error(error));
  return { jobId: job.id, promptId: prompt.id };
}
async function runScheduleAsync(schedule, today) {
  runningSchedules.add(schedule.id); emit('schedules.changed');
  try {
    await executeSchedule(schedule);
    Object.assign(schedule, { lastRunDay: today, attempts: 0, nextAttemptAt: null });
  } catch (error) {
    schedule.attempts = (schedule.attempts || 0) + 1;
    schedule.lastError = error.message || 'Lỗi không xác định.';
    if (schedule.attempts >= ATTEMPTS_PER_DAY) { Object.assign(schedule, { attempts: 0, nextAttemptAt: null, lastRunDay: today, lastError: `${schedule.lastError} (đã thử ${ATTEMPTS_PER_DAY} lần, bỏ qua hôm nay)` }); }
    else schedule.nextAttemptAt = new Date(Date.now() + RETRY_MINUTES * 60000).toISOString();
  } finally { runningSchedules.delete(schedule.id); persist(); emit('schedules.changed'); }
}
function scheduleTick() {
  const current = new Date(); const today = dayKey(current); const minutes = current.getHours() * 60 + current.getMinutes();
  let changed = false;
  for (const schedule of store.schedules) {
    if (!schedule.enabled || schedule.lastRunDay === today || runningSchedules.has(schedule.id) || !schedule.days.includes(current.getDay()) || minutes < toMinutes(schedule.time)) continue;
    if (schedule.nextAttemptAt && Date.now() < Date.parse(schedule.nextAttemptAt)) continue;
    const blocker = liveBlocker(schedule.channelId, { needMuse: schedule.source !== 'media' || schedule.aiMetadata });
    if (blocker) { if (schedule.lastError !== blocker) { schedule.lastError = blocker; changed = true; } continue; } // chưa đánh dấu đã chạy: sửa xong là chạy tiếp trong ngày
    runScheduleAsync(schedule, today);
  }
  if (changed) { persist(); emit('schedules.changed'); }
}

// Tạo bài đăng cho một video: chờ duyệt, hoặc vào hàng đợi upload luôn nếu lịch bật tự đăng.
// Bật AI thì nhờ Muse điền tiêu đề/mô tả/tag trước (lỗi chỉ làm mất phần gợi ý, không chặn bài đăng).
async function createPostForMedia({ channel, media, schedule = null, job = null }) {
  const auto = Boolean(schedule?.autoPublish);
  const useAi = Boolean(schedule?.aiMetadata) || channel.autoMetadata !== false;
  let meta = { title: (promptById(media.promptId)?.content || 'Video').replace(/\s+/g, ' ').slice(0, 100), description: '', tags: [] };
  if (useAi && ai.status().configured) {
    try { meta = { ...meta, ...(await suggestMetadata(media.id, channel.id)), aiGenerated: true }; } catch (error) { console.error('Muse gợi ý thất bại:', error.message); }
  }
  const post = {
    id: id('post'), channelId: channel.id, mediaId: media.id, jobId: job?.id || null, scheduleId: schedule?.id || null,
    title: meta.title, description: meta.description, tags: meta.tags, aiGenerated: Boolean(meta.aiGenerated),
    privacy: schedule?.privacy || channel.defaultPrivacy, publishAt: auto ? suggestPublishAt(schedule) : null,
    status: auto ? 'QUEUED' : 'PENDING_REVIEW', createdAt: now(), updatedAt: now(),
  };
  store.posts.unshift(post); persist(); emit('post.updated', { postId: post.id });
  return post;
}
// Video của kênh vừa tạo xong (từ lịch hoặc từ prompt trong project của kênh) tự vào hộp chờ duyệt.
async function afterJobCompleted(job, media) {
  const channel = channelById(job.channelId);
  if (!channel) return;
  await createPostForMedia({ channel, media, schedule: scheduleById(job.scheduleId), job });
}
// Ngữ cảnh gửi cho Muse: prompt tạo video, hồ sơ kênh, tiêu đề gần đây của kênh, khung hình/thời lượng.
function suggestMetadata(mediaId, channelId, extra = '') {
  const asset = store.media.find((item) => item.id === mediaId);
  if (!asset) throw Object.assign(new Error('Không tìm thấy video.'), { status: 404 });
  const channel = channelById(channelId);
  const job = store.jobs.find((item) => item.mediaId === asset.id);
  return ai.suggest({
    prompt: promptById(asset.promptId)?.content || '',
    channel: { name: channel?.name, title: channel?.youtube?.title, handle: channel?.youtube?.handle }, brief: channel?.brief || DEFAULT_BRIEF,
    recentTitles: store.posts.filter((post) => post.channelId === channelId && post.status !== 'REJECTED').slice(0, 8).map((post) => post.title),
    size: job?.size || null, duration: job?.duration || null, extra: String(extra || '').slice(0, 500), threadKey: `meta:${channelId || 'default'}`,
  });
}

function readSchedule(input, base = {}) {
  const value = { ...base };
  if (input.name !== undefined) { value.name = String(input.name).trim().slice(0, 80); if (!value.name) return { error: 'Tên lịch không được để trống.' }; }
  if (input.channelId !== undefined) { if (!channelById(input.channelId)) return { error: 'Không tìm thấy kênh.' }; value.channelId = input.channelId; }
  for (const key of ['time', 'publishTime']) {
    if (input[key] === undefined) continue;
    const text = String(input[key] || '');
    if (key === 'publishTime' && !text) { value.publishTime = null; continue; }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) return { error: 'Giờ phải có dạng HH:MM.' };
    value[key] = text;
  }
  if (input.days !== undefined) {
    const days = [...new Set((Array.isArray(input.days) ? input.days : []).map(Number))].filter((day) => Number.isInteger(day) && day >= 0 && day <= 6).sort();
    if (!days.length) return { error: 'Chọn ít nhất một ngày trong tuần.' };
    value.days = days;
  }
  if (input.source !== undefined) { if (!scheduleSources.includes(input.source)) return { error: 'Nguồn nội dung không hợp lệ.' }; value.source = input.source; }
  if (input.mediaIds !== undefined) {
    const ids = [...new Set((Array.isArray(input.mediaIds) ? input.mediaIds : []).map(String))].slice(0, 200);
    if (ids.some((mediaId) => !String(store.media.find((item) => item.id === mediaId)?.mimeType || '').startsWith('video/'))) return { error: 'Có video không tồn tại hoặc không phải video.' };
    value.mediaIds = ids;
  }
  if (input.autoFill !== undefined) value.autoFill = Boolean(input.autoFill);
  if (input.hint !== undefined) value.hint = String(input.hint || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (input.autoPublish !== undefined) value.autoPublish = Boolean(input.autoPublish);
  if (input.aiMetadata !== undefined) value.aiMetadata = Boolean(input.aiMetadata);
  if (input.size !== undefined) value.size = sizes.includes(input.size) ? input.size : null;
  if (input.duration !== undefined) { const duration = Number(input.duration); value.duration = Number.isInteger(duration) && duration >= 1 && duration <= 60 ? duration : null; }
  if (input.privacy !== undefined) value.privacy = privacyValues.includes(input.privacy) ? input.privacy : null;
  if (!value.name || !value.channelId || !value.time || !value.days) return { error: 'Thiếu tên, kênh, giờ chạy hoặc ngày chạy.' };
  value.source = value.source || 'queue';
  if (value.source === 'media' && !(value.mediaIds || []).length) return { error: 'Chọn ít nhất một video đã tạo để đăng theo lịch.' };
  return { value };
}

// Kiểm tra các trường đăng bài khi duyệt.
function readPublishFields(input, post, channel) {
  const privacy = privacyValues.includes(input.privacy) ? input.privacy : post.privacy || channel.defaultPrivacy;
  let publishAt = null;
  if (input.publishAt) {
    const when = new Date(input.publishAt);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 2 * 60 * 1000) return { error: 'Giờ đăng phải ở tương lai (ít nhất vài phút nữa).' };
    publishAt = when.toISOString();
  }
  const title = String(input.title ?? post.title).trim().slice(0, 100);
  if (!title) return { error: 'Tiêu đề không được để trống.' };
  return { value: { title, description: String(input.description ?? post.description ?? '').slice(0, 5000), tags: Array.isArray(input.tags) ? input.tags.slice(0, 15) : post.tags || [], privacy, publishAt } };
}

function providerStatus() {
  const cred = muse.credentialInfo();
  return cred.configured
    ? { status: 'connected', label: 'Đã có cookie Muse', detail: 'Cookie chưa được kiểm tra; bấm "Kiểm tra kết nối" để xác minh phiên còn sống.' }
    : { status: 'auth_required', label: 'Chưa có cookie Muse', detail: 'Dán cookie Muse trong Cài đặt để tạo video.' };
}

async function handleApi(req, res, parsed) {
  const parts = parsed.pathname.split('/').filter(Boolean);
  const method = req.method || 'GET';
  if (parsed.pathname === '/api/events' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`event: connected\ndata: ${JSON.stringify({ at: now() })}\n\n`);
    clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (parsed.pathname === '/api/health' && method === 'GET') return json(res, 200, { ok: true, queue: store.jobs.filter((job) => job.status === 'QUEUED').length, worker: processing ? 'processing' : 'idle' });
  if (parsed.pathname === '/api/dashboard' && method === 'GET') {
    const counts = Object.fromEntries(['DRAFT', 'QUEUED', 'SUBMITTED', 'GENERATING', 'COMPLETED', 'FAILED', 'AUTH_REQUIRED', 'CANCELLED', 'INTERRUPTED'].map((status) => [status, store.jobs.filter((job) => job.status === status).length]));
    const status = providerStatus();
    return json(res, 200, { data: { projects: store.projects.length, prompts: store.prompts.length, media: store.media.length, counts, recentJobs: store.jobs.slice(0, 8).map(publicJob), provider: status, ai: ai.status(), channels: store.channels.length, pendingReview: store.posts.filter((post) => post.status === 'PENDING_REVIEW').length, pendingPrompts: store.prompts.filter((prompt) => prompt.status === 'DRAFT').length } });
  }
  if (parsed.pathname === '/api/projects' && method === 'GET') return json(res, 200, { data: store.projects.map(publicProject) });
  if (parts[0] === 'api' && parts[1] === 'projects' && parts[2] && !parts[3]) {
    const project = projectById(parts[2]); if (!project) return fail(res, 404, 'Không tìm thấy project.', 'not_found');
    if (method === 'GET') return json(res, 200, { data: { ...publicProject(project), prompts: store.prompts.filter((prompt) => prompt.projectId === project.id).sort((a, b) => (a.order || 0) - (b.order || 0)), jobs: store.jobs.filter((job) => job.projectId === project.id).map(publicJob) } });
    if (method === 'PATCH') {
      const input = await body(req);
      project.name = input.name?.trim() || project.name;
      if (input.description !== undefined) project.description = String(input.description).trim();
      project.updatedAt = now(); persist(); emit('project.updated', { project }); return json(res, 200, { data: publicProject(project) });
    }
    if (method === 'DELETE') {
      if (channelById(project.channelId)) return fail(res, 409, 'Project này thuộc về một kênh. Xóa kênh trước (dữ liệu sẽ chuyển thành project chưa gắn kênh).');
      for (const job of store.jobs.filter((item) => item.projectId === project.id)) running.get(job.id)?.abort();
      for (const asset of store.media.filter((item) => item.projectId === project.id)) { try { fs.unlinkSync(path.join(mediaDir, asset.storageKey)); } catch {} }
      store.projects = store.projects.filter((item) => item.id !== project.id);
      store.prompts = store.prompts.filter((item) => item.projectId !== project.id);
      store.jobs = store.jobs.filter((item) => item.projectId !== project.id);
      store.media = store.media.filter((item) => item.projectId !== project.id);
      persist(); emit('project.deleted', { projectId: project.id }); return json(res, 200, { data: { ok: true } });
    }
  }
  // Gắn project cũ (chưa thuộc kênh nào) vào một kênh: gộp prompt, job và video vào project của kênh đó.
  if (parts[0] === 'api' && parts[1] === 'projects' && parts[2] && parts[3] === 'attach' && method === 'POST') {
    const project = projectById(parts[2]); if (!project) return fail(res, 404, 'Không tìm thấy project.', 'not_found');
    const channel = channelById((await body(req)).channelId); if (!channel) return fail(res, 404, 'Không tìm thấy kênh.', 'not_found');
    if (channelById(project.channelId)) return fail(res, 409, 'Project này đã thuộc về một kênh.');
    const target = projectById(channel.projectId);
    if (target) mergeProject(project.id, target.id); else { project.channelId = channel.id; channel.projectId = project.id; }
    ensureChannelProject(channel); persist(); emit('project.updated', { projectId: channel.projectId }); emit('channels.changed');
    return json(res, 200, { data: { projectId: channel.projectId } });
  }
  if (parts[0] === 'api' && parts[1] === 'projects' && parts[2] && parts[3] === 'prompts') {
    const project = projectById(parts[2]); if (!project) return fail(res, 404, 'Không tìm thấy project.', 'not_found');
    if (method === 'GET') return json(res, 200, { data: store.prompts.filter((prompt) => prompt.projectId === project.id).sort((a, b) => (a.order || 0) - (b.order || 0)) });
    if (method === 'POST') {
      const input = await body(req); if (!input.content?.trim()) return fail(res, 400, 'Prompt không được để trống.');
      const order = store.prompts.filter((item) => item.projectId === project.id).reduce((max, item) => Math.max(max, item.order || 0), 0) + 1;
      // Prompt tự viết coi như đã duyệt (bạn là người viết); chỉ prompt do Muse sinh mới chờ duyệt.
      const prompt = { id: id('prompt'), projectId: project.id, content: input.content.trim().slice(0, 4000), order, version: 1, status: input.status === 'DRAFT' ? 'DRAFT' : 'APPROVED', source: 'manual', createdAt: now(), updatedAt: now() };
      store.prompts.push(prompt); persist(); emit('prompt.created', { prompt }); return json(res, 201, { data: prompt });
    }
  }
  if (parsed.pathname === '/api/prompts/import' && method === 'POST') {
    const input = await body(req); const project = projectById(input.projectId); if (!project) return fail(res, 404, 'Không tìm thấy project.', 'not_found');
    const start = store.prompts.filter((item) => item.projectId === project.id).reduce((max, item) => Math.max(max, item.order || 0), 0);
    const created = parseCsv(input.csv).map((content, index) => ({ id: id('prompt'), projectId: project.id, content: content.slice(0, 4000), order: start + index + 1, version: 1, status: 'APPROVED', source: 'manual', createdAt: now(), updatedAt: now() }));
    store.prompts.push(...created); persist(); emit('prompts.imported', { projectId: project.id, count: created.length });
    return json(res, 201, { data: { imported: created.length, prompts: created } });
  }
  // Thao tác hàng loạt: duyệt hoặc xóa nhiều prompt.
  if (parsed.pathname === '/api/prompts/bulk' && method === 'POST') {
    const input = await body(req); const ids = new Set(Array.isArray(input.ids) ? input.ids : []);
    const targets = store.prompts.filter((prompt) => ids.has(prompt.id));
    if (input.action === 'approve') { for (const prompt of targets) if ((prompt.status || 'APPROVED') === 'DRAFT') { prompt.status = 'APPROVED'; prompt.updatedAt = now(); } }
    else if (input.action === 'delete') store.prompts = store.prompts.filter((prompt) => !ids.has(prompt.id));
    else return fail(res, 400, 'Thao tác không hợp lệ.');
    persist(); emit('prompt.updated', { count: targets.length }); return json(res, 200, { data: { count: targets.length } });
  }
  if (parts[0] === 'api' && parts[1] === 'prompts' && parts[2] && !parts[3]) {
    const prompt = promptById(parts[2]); if (!prompt) return fail(res, 404, 'Không tìm thấy prompt.', 'not_found');
    if (method === 'PATCH') {
      const input = await body(req);
      if (input.content !== undefined) {
        const content = String(input.content).trim().slice(0, 4000);
        if (!content) return fail(res, 400, 'Prompt không được để trống.');
        if (content !== prompt.content) { prompt.content = content; prompt.version = (prompt.version || 1) + 1; }
      }
      if (['DRAFT', 'APPROVED'].includes(input.status) && (prompt.status || 'APPROVED') !== 'USED') prompt.status = input.status;
      prompt.updatedAt = now(); persist(); emit('prompt.updated', { prompt }); return json(res, 200, { data: prompt });
    }
    if (method === 'DELETE') { store.prompts = store.prompts.filter((item) => item.id !== prompt.id); persist(); emit('prompt.deleted', { promptId: prompt.id }); return json(res, 200, { data: { ok: true } }); }
  }
  // Tạo video/ảnh từ các prompt đã chọn. Kênh, khung hình và thời lượng lấy theo hồ sơ kênh nếu không chỉ định.
  if (parsed.pathname === '/api/batches' && method === 'POST') {
    const input = await body(req); const promptIds = Array.isArray(input.promptIds) ? input.promptIds : [];
    if (!promptIds.length) return fail(res, 400, 'Chưa chọn prompt để tạo video.');
    const type = input.type === 'image' ? 'image' : 'video';
    const jobs = promptIds.map(promptById).filter(Boolean).map((prompt) => {
      const channel = channelById(projectById(prompt.projectId)?.channelId); const brief = channel?.brief || DEFAULT_BRIEF;
      const duration = Number.isInteger(input.duration) && input.duration >= 1 && input.duration <= 60 ? input.duration : brief.duration;
      return createJob(prompt, { type, channelId: channel?.id || null, size: sizes.includes(input.size) ? input.size : brief.size, duration: type === 'video' ? duration || null : null });
    });
    if (!jobs.length) return fail(res, 404, 'Không tìm thấy prompt nào trong danh sách đã chọn.', 'not_found');
    store.jobs = [...jobs, ...store.jobs]; persist(); emit('batch.created', { count: jobs.length, jobIds: jobs.map((job) => job.id) }); processQueue().catch((error) => console.error(error));
    return json(res, 201, { data: { batchId: id('batch'), count: jobs.length, jobs: jobs.map(publicJob) } });
  }
  if (parsed.pathname === '/api/jobs' && method === 'GET') {
    const status = parsed.searchParams.get('status'); const projectId = parsed.searchParams.get('projectId');
    return json(res, 200, { data: store.jobs.filter((job) => (!status || status === 'ALL' || job.status === status) && (!projectId || job.projectId === projectId)).map(publicJob) });
  }
  if (parts[0] === 'api' && parts[1] === 'jobs' && parts[2] && parts[3] === 'retry' && method === 'POST') {
    const job = jobById(parts[2]); if (!job) return fail(res, 404, 'Không tìm thấy job.', 'not_found');
    if (!['FAILED', 'AUTH_REQUIRED', 'INTERRUPTED', 'CANCELLED'].includes(job.status)) return fail(res, 409, 'Chỉ có thể thử lại job đã dừng.');
    Object.assign(job, { status: 'QUEUED', attempts: job.attempts + 1, error: null, progress: 0, updatedAt: now() });
    persist(); emit('job.retried', { job: publicJob(job) }); processQueue(); return json(res, 200, { data: publicJob(job) });
  }
  if (parts[0] === 'api' && parts[1] === 'jobs' && parts[2] && parts[3] === 'cancel' && method === 'POST') {
    const job = jobById(parts[2]); if (!job) return fail(res, 404, 'Không tìm thấy job.', 'not_found');
    if (job.status !== 'QUEUED') return fail(res, 409, 'Chỉ có thể hủy job đang chờ, chưa gửi lên provider.');
    job.status = 'CANCELLED'; job.updatedAt = now(); persist(); emit('job.cancelled', { job: publicJob(job) }); return json(res, 200, { data: publicJob(job) });
  }
  if (parsed.pathname === '/api/media' && method === 'GET') return json(res, 200, { data: store.media.map((asset) => ({ ...asset, url: `/media/${asset.storageKey}`, prompt: promptById(asset.promptId)?.content || '', project: projectById(asset.projectId)?.name || '' })) });
  if (parts[0] === 'api' && parts[1] === 'media' && parts[2] && !parts[3] && method === 'DELETE') {
    const asset = store.media.find((item) => item.id === parts[2]); if (!asset) return fail(res, 404, 'Không tìm thấy media.', 'not_found');
    if (store.posts.some((post) => post.mediaId === asset.id && ['QUEUED', 'UPLOADING', 'PENDING_REVIEW'].includes(post.status))) return fail(res, 409, 'Video đang chờ duyệt hoặc đang đăng lên YouTube; xử lý bài đăng trước.');
    try { fs.unlinkSync(path.join(mediaDir, asset.storageKey)); } catch {}
    store.media = store.media.filter((item) => item.id !== asset.id);
    store.posts = store.posts.filter((post) => post.mediaId !== asset.id || post.youtubeVideoId); // bài đã lên YouTube giữ lại để còn theo dõi số liệu
    persist(); emit('media.deleted', { mediaId: asset.id }); return json(res, 200, { data: { ok: true } });
  }
  if (parsed.pathname === '/api/settings' && method === 'GET') return json(res, 200, { data: store.settings });
  if (parsed.pathname === '/api/settings' && method === 'PATCH') {
    const input = await body(req);
    // Worker hiện chạy tuần tự (một cửa sổ trình duyệt, một tài khoản); giá trị này chỉ được lưu lại.
    if (Number.isInteger(input.concurrency) && input.concurrency > 0 && input.concurrency <= 4) store.settings.concurrency = input.concurrency;
    if (typeof input.headless === 'boolean' && input.headless !== store.settings.headless) { store.settings.headless = input.headless; if (!processing) muse.stop(); }
    persist(); emit('settings.updated', { settings: store.settings }); return json(res, 200, { data: store.settings });
  }
  if (parsed.pathname === '/api/youtube/client') {
    if (method === 'GET') return json(res, 200, { data: yt.clientInfo() });
    if (method === 'PUT') { const input = await body(req); try { return json(res, 200, { data: yt.setClient(input.clientId, input.clientSecret) }); } catch (error) { return fail(res, 400, error.message); } }
    if (method === 'DELETE') { yt.clearClient(); return json(res, 200, { data: yt.clientInfo() }); }
  }
  if (parsed.pathname === '/api/channels' && method === 'GET') return json(res, 200, { data: { channels: visibleChannels().map(publicChannel), posts: store.posts.map(publicPost), schedules: store.schedules.map(publicSchedule), quota: yt.quota(), client: yt.clientInfo() } });
  if (parsed.pathname === '/api/channels' && method === 'POST') {
    const input = await body(req); if (!input.name?.trim()) return fail(res, 400, 'Tên kênh không được để trống.');
    const channel = { id: id('channel'), name: input.name.trim().slice(0, 80), defaultPrivacy: 'private', brief: readBrief(input.brief || {}), autoMetadata: true, createdAt: now() };
    ensureChannelProject(channel); store.channels.push(channel); persist(); emit('channels.changed'); return json(res, 201, { data: publicChannel(channel) });
  }
  if (parts[0] === 'api' && parts[1] === 'channels' && parts[2] && !parts[3]) {
    const channel = channelById(parts[2]); if (!channel) return fail(res, 404, 'Không tìm thấy kênh.', 'not_found');
    if (method === 'GET') return json(res, 200, { data: publicChannel(channel) });
    if (method === 'PATCH') {
      const input = await body(req);
      if (input.name?.trim()) { channel.name = input.name.trim().slice(0, 80); const project = projectById(channel.projectId); if (project) project.name = channel.name; }
      if (privacyValues.includes(input.defaultPrivacy)) channel.defaultPrivacy = input.defaultPrivacy;
      if (typeof input.autoMetadata === 'boolean') channel.autoMetadata = input.autoMetadata;
      if (input.brief && typeof input.brief === 'object') {
        const before = JSON.stringify(channel.brief); channel.brief = readBrief(input.brief, channel.brief);
        // Hồ sơ đổi thì các cuộc chat cũ với Muse (đã nhớ hồ sơ cũ) không còn đúng: bắt đầu chat mới ở lần sau.
        if (JSON.stringify(channel.brief) !== before) ai.resetThreads([`ideas:${channel.id}`, `meta:${channel.id}`]);
      }
      persist(); emit('channels.changed'); return json(res, 200, { data: publicChannel(channel) });
    }
    if (method === 'DELETE') {
      await yt.disconnect(channel.id);
      try { fs.unlinkSync(path.join(avatarDir, channel.id)); } catch {}
      // Prompt và video của kênh được giữ lại: project chuyển thành "chưa gắn kênh" (có thể gắn vào kênh khác).
      const project = projectById(channel.projectId); if (project) project.channelId = null;
      store.channels = store.channels.filter((item) => item.id !== channel.id);
      store.schedules = store.schedules.filter((item) => item.channelId !== channel.id);
      store.posts = store.posts.filter((post) => post.channelId !== channel.id); // chỉ xóa bản ghi cục bộ, video trên YouTube giữ nguyên
      ai.resetThreads([`ideas:${channel.id}`, `meta:${channel.id}`]);
      persist(); emit('channels.changed'); return json(res, 200, { data: { ok: true } });
    }
  }
  // Nhờ Muse nghĩ prompt video mới cho kênh theo hồ sơ của kênh; kết quả vào project của kênh ở trạng thái chờ duyệt.
  if (parts[0] === 'api' && parts[1] === 'channels' && parts[2] && parts[3] === 'ideas' && method === 'POST') {
    const channel = channelById(parts[2]); if (!channel) return fail(res, 404, 'Không tìm thấy kênh.', 'not_found');
    const input = await body(req);
    if (!muse.credentialInfo().configured) return fail(res, 409, 'Chưa có cookie Muse. Dán cookie trong Cài đặt để dùng gợi ý.', 'ai_not_configured');
    if (!channel.brief.niche && !channel.brief.topic) return fail(res, 400, 'Hãy điền ngách hoặc chủ đề của kênh trước khi nhờ Muse gợi ý prompt.', 'brief_required');
    const count = Math.min(10, Math.max(1, Number.parseInt(input.count, 10) || 5));
    try { const result = await generatePrompts(channel, { count, hint: String(input.hint || '').replace(/\s+/g, ' ').trim().slice(0, 300) }); return json(res, 201, { data: result }); }
    catch (error) { return fail(res, error.code === 'DUPLICATE' ? 409 : aiHttpStatus(error), error.message || 'Gợi ý prompt thất bại.', 'ai_error'); }
  }
  if (parts[0] === 'api' && parts[1] === 'channels' && parts[2] && parts[3] === 'disconnect' && method === 'POST') {
    const channel = channelById(parts[2]); if (!channel) return fail(res, 404, 'Không tìm thấy kênh.', 'not_found');
    await yt.disconnect(channel.id); Object.assign(channel, { youtube: null, stats: null, needsAuth: false, syncError: null });
    persist(); emit('channels.changed'); return json(res, 200, { data: publicChannel(channel) });
  }
  if (parsed.pathname === '/api/youtube/sync' && method === 'POST') { await syncAll(); return json(res, 200, { data: { channels: visibleChannels().map(publicChannel), quota: yt.quota() } }); }
  if (parsed.pathname === '/api/posts' && method === 'POST') {
    const input = await body(req);
    const channel = channelById(input.channelId); if (!channel) return fail(res, 404, 'Không tìm thấy kênh.', 'not_found');
    if (!yt.hasTokens(channel.id)) return fail(res, 409, 'Kênh chưa kết nối YouTube.');
    const asset = store.media.find((item) => item.id === input.mediaId);
    if (!asset || !String(asset.mimeType).startsWith('video/')) return fail(res, 400, 'Chỉ đăng được video đã tạo.');
    if (store.posts.some((post) => post.mediaId === asset.id && post.channelId === channel.id && !['FAILED', 'NEEDS_AUTH', 'REJECTED'].includes(post.status))) return fail(res, 409, 'Video này đã có bài đăng cho kênh này.');
    const privacy = privacyValues.includes(input.privacy) ? input.privacy : channel.defaultPrivacy;
    let publishAt = null;
    if (input.publishAt) {
      const when = new Date(input.publishAt);
      if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 2 * 60 * 1000) return fail(res, 400, 'Giờ đăng phải ở tương lai (ít nhất vài phút nữa).');
      publishAt = when.toISOString();
    }
    const prompt = promptById(asset.promptId)?.content || '';
    const post = {
      id: id('post'), channelId: channel.id, mediaId: asset.id, title: String(input.title || prompt || 'Video').trim().slice(0, 100),
      description: String(input.description || '').slice(0, 5000), tags: Array.isArray(input.tags) ? input.tags.slice(0, 15) : [],
      privacy, publishAt, status: 'QUEUED', createdAt: now(), updatedAt: now(),
    };
    store.posts.unshift(post); persist(); emit('post.updated', { postId: post.id }); processPosts().catch((error) => console.error(error));
    return json(res, 201, { data: publicPost(post) });
  }
  if (parts[0] === 'api' && parts[1] === 'posts' && parts[2] && parts[3] === 'retry' && method === 'POST') {
    const post = postById(parts[2]); if (!post) return fail(res, 404, 'Không tìm thấy bài đăng.', 'not_found');
    if (post.youtubeVideoId) return fail(res, 409, 'Video này đã lên YouTube; không đăng lại để tránh trùng.');
    if (!['FAILED', 'NEEDS_AUTH'].includes(post.status)) return fail(res, 409, 'Chỉ thử lại bài đăng đã lỗi.');
    Object.assign(post, { status: 'QUEUED', error: null, updatedAt: now() }); persist(); emit('post.updated', { postId: post.id }); processPosts().catch((error) => console.error(error));
    return json(res, 200, { data: publicPost(post) });
  }
  if (parts[0] === 'api' && parts[1] === 'posts' && parts[2] && !parts[3] && method === 'DELETE') {
    const post = postById(parts[2]); if (!post) return fail(res, 404, 'Không tìm thấy bài đăng.', 'not_found');
    if (post.status === 'UPLOADING') return fail(res, 409, 'Đang upload, chưa thể xóa.');
    store.posts = store.posts.filter((item) => item.id !== post.id); persist(); emit('post.updated', { postId: post.id });
    return json(res, 200, { data: { ok: true, note: 'Chỉ xóa bản ghi trong tool, video trên YouTube không bị xóa.' } });
  }
  if (parsed.pathname === '/api/schedules' && method === 'POST') {
    const result = readSchedule(await body(req), { days: [0, 1, 2, 3, 4, 5, 6], source: 'queue', mediaIds: [], autoFill: true, hint: '', autoPublish: false, aiMetadata: false, publishTime: null, size: null, duration: null, privacy: null });
    if (result.error) return fail(res, 400, result.error);
    // Giờ chạy hôm nay đã qua thì bắt đầu từ lần kế tiếp, không chạy bù ngay (tránh tốn token ngoài ý muốn).
    const created = new Date(); const startedToday = toMinutes(result.value.time) <= created.getHours() * 60 + created.getMinutes();
    const schedule = { id: id('schedule'), ...result.value, enabled: true, lastRunDay: startedToday ? dayKey(created) : null, lastRunAt: null, lastJobId: null, lastError: null, createdAt: now() };
    store.schedules.push(schedule); persist(); emit('schedules.changed'); return json(res, 201, { data: publicSchedule(schedule) });
  }
  if (parts[0] === 'api' && parts[1] === 'schedules' && parts[2] && !parts[3]) {
    const schedule = scheduleById(parts[2]); if (!schedule) return fail(res, 404, 'Không tìm thấy lịch.', 'not_found');
    if (method === 'PATCH') {
      const input = await body(req);
      const result = readSchedule(input, schedule); if (result.error) return fail(res, 400, result.error);
      Object.assign(schedule, result.value);
      if (input.time !== undefined) { const edited = new Date(); if (toMinutes(schedule.time) <= edited.getHours() * 60 + edited.getMinutes()) schedule.lastRunDay = dayKey(edited); }
      if (typeof input.enabled === 'boolean') { schedule.enabled = input.enabled; if (input.enabled) Object.assign(schedule, { lastError: null, attempts: 0, nextAttemptAt: null }); }
      persist(); emit('schedules.changed'); return json(res, 200, { data: publicSchedule(schedule) });
    }
    if (method === 'DELETE') { store.schedules = store.schedules.filter((item) => item.id !== schedule.id); persist(); emit('schedules.changed'); return json(res, 200, { data: { ok: true } }); }
  }
  // Chạy ngay một lần (không đánh dấu "đã chạy hôm nay"). Có thể mất 30-60 giây nếu cần Muse nghĩ prompt.
  if (parts[0] === 'api' && parts[1] === 'schedules' && parts[2] && parts[3] === 'run' && method === 'POST') {
    const schedule = scheduleById(parts[2]); if (!schedule) return fail(res, 404, 'Không tìm thấy lịch.', 'not_found');
    const blocker = liveBlocker(schedule.channelId, { needMuse: schedule.source !== 'media' || schedule.aiMetadata }); if (blocker) return fail(res, 409, blocker);
    if (runningSchedules.has(schedule.id)) return fail(res, 409, 'Lịch này đang chạy.');
    runningSchedules.add(schedule.id);
    try {
      const outcome = await executeSchedule(schedule);
      if (outcome.exhausted) { persist(); emit('schedules.changed'); return fail(res, 409, schedule.lastError); }
      persist(); emit('schedules.changed'); return json(res, 201, { data: { schedule: publicSchedule(schedule), ...outcome } });
    } catch (error) { return fail(res, error.code ? aiHttpStatus(error) : 409, error.message || 'Không chạy được lịch.', 'schedule_error'); }
    finally { runningSchedules.delete(schedule.id); }
  }
  if (parts[0] === 'api' && parts[1] === 'posts' && parts[2] && parts[3] === 'approve' && method === 'POST') {
    const post = postById(parts[2]); if (!post) return fail(res, 404, 'Không tìm thấy bài đăng.', 'not_found');
    if (post.status !== 'PENDING_REVIEW') return fail(res, 409, 'Bài này không ở trạng thái chờ duyệt.');
    const channel = channelById(post.channelId); if (!channel || !yt.hasTokens(channel.id)) return fail(res, 409, 'Kênh chưa kết nối YouTube.');
    const result = readPublishFields(await body(req), post, channel); if (result.error) return fail(res, 400, result.error);
    Object.assign(post, result.value, { status: 'QUEUED', error: null, approvedAt: now(), updatedAt: now() });
    persist(); emit('post.updated', { postId: post.id }); processPosts().catch((error) => console.error(error));
    return json(res, 200, { data: publicPost(post) });
  }
  if (parts[0] === 'api' && parts[1] === 'posts' && parts[2] && parts[3] === 'reject' && method === 'POST') {
    const post = postById(parts[2]); if (!post) return fail(res, 404, 'Không tìm thấy bài đăng.', 'not_found');
    if (post.status !== 'PENDING_REVIEW') return fail(res, 409, 'Bài này không ở trạng thái chờ duyệt.');
    Object.assign(post, { status: 'REJECTED', updatedAt: now() }); persist(); emit('post.updated', { postId: post.id });
    return json(res, 200, { data: publicPost(post) });
  }
  // Tạo lại video: chỉ khi người dùng chủ động bấm, vì mỗi lần tốn thêm quota Muse.
  if (parts[0] === 'api' && parts[1] === 'posts' && parts[2] && parts[3] === 'regenerate' && method === 'POST') {
    const post = postById(parts[2]); if (!post) return fail(res, 404, 'Không tìm thấy bài đăng.', 'not_found');
    if (!['PENDING_REVIEW', 'REJECTED'].includes(post.status)) return fail(res, 409, 'Chỉ tạo lại được video đang chờ duyệt hoặc đã từ chối.');
    const blocker = liveBlocker(); if (blocker) return fail(res, 409, blocker);
    const previous = jobById(post.jobId); const prompt = promptById(previous?.promptId);
    if (!prompt) return fail(res, 404, 'Không còn prompt gốc của video này.', 'not_found');
    if (store.jobs.some((item) => item.regeneratedFrom === previous.id && ['QUEUED', 'SUBMITTED', 'GENERATING'].includes(item.status))) return fail(res, 409, 'Đang có một video tạo lại từ video này.');
    const job = newJob(prompt, { scheduleId: post.scheduleId, channelId: post.channelId, size: previous.size || null, duration: previous.duration || null, regeneratedFrom: previous.id });
    store.jobs.unshift(job); Object.assign(post, { status: 'REJECTED', updatedAt: now() });
    persist(); emit('batch.created', { count: 1, jobIds: [job.id] }); emit('post.updated', { postId: post.id }); processQueue().catch((error) => console.error(error));
    return json(res, 201, { data: { jobId: job.id } });
  }
  if (parsed.pathname === '/api/ai/threads' && method === 'DELETE') { ai.resetThreads(); return json(res, 200, { data: { ok: true } }); }
  if (parsed.pathname === '/api/ai/suggest' && method === 'POST') {
    const input = await body(req);
    if (!ai.status().configured) return fail(res, 409, 'Chưa có cookie Muse. Dán cookie trong Cài đặt để dùng gợi ý.', 'ai_not_configured');
    if (!store.media.some((item) => item.id === input.mediaId)) return fail(res, 404, 'Không tìm thấy video.', 'not_found');
    try { return json(res, 200, { data: await suggestMetadata(input.mediaId, input.channelId, input.extra) }); }
    catch (error) { return fail(res, { AUTH: 409, QUOTA: 429, TIMEOUT: 504 }[error.code] || 502, error.message || 'Gợi ý thất bại.', 'ai_error'); }
  }
  if (parsed.pathname === '/api/provider/status' && method === 'GET') return json(res, 200, { data: providerStatus() });
  if (parsed.pathname === '/api/provider/credential') {
    if (method === 'GET') return json(res, 200, { data: muse.credentialInfo() });
    if (method === 'PUT') {
      const input = await body(req);
      try { return json(res, 200, { data: muse.setCredential(input.credential) }); } catch (error) { return fail(res, 400, error.message, 'bad_credential'); }
    }
    if (method === 'DELETE') { muse.clearCredential(); return json(res, 200, { data: { configured: false } }); }
  }
  if (parsed.pathname === '/api/provider/test' && method === 'POST') {
    if (processing) return json(res, 200, { data: { ok: false, message: 'Đang có job chạy; thử lại khi queue rảnh.' } });
    try { await muse.checkSession({ headless: Boolean(store.settings.headless) }); return json(res, 200, { data: { ok: true, message: 'Cookie hợp lệ: trang chat Muse đã mở được.' } }); }
    catch (error) { return json(res, 200, { data: { ok: false, message: error.message } }); }
  }
  return fail(res, 404, 'Không tìm thấy API endpoint.', 'not_found');
}

function sendFile(req, res, file, mime) {
  const { size } = fs.statSync(file);
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { 'Content-Type': mime, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-store' });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': mime, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
  return fs.createReadStream(file).pipe(res);
}

// Chặn DNS-rebinding và CSRF từ trang web khác tới server cục bộ đang giữ cookie Muse.
function trusted(req) {
  const hostname = String(req.headers.host || '').replace(/:\d+$/, '');
  if (!allowedHosts.has(hostname)) return false;
  const origin = req.headers.origin;
  if (!origin || req.method === 'GET' || req.method === 'HEAD') return true;
  try { return allowedHosts.has(new URL(origin).hostname); } catch { return false; }
}

function serve(req, res) {
  if (!trusted(req)) return fail(res, 403, 'Host hoặc Origin không được phép.', 'forbidden');
  let parsed; let pathname;
  try { parsed = new URL(req.url || '/', 'http://localhost'); pathname = decodeURIComponent(parsed.pathname); } catch { return fail(res, 400, 'URL không hợp lệ.'); }
  parsed.pathname = pathname;
  if (pathname === '/oauth/youtube/start' && req.method === 'GET') {
    // ?new=1: tạo thẻ kênh tạm rồi sang Google luôn; tên và avatar lấy từ YouTube sau khi kết nối.
    let channel = channelById(parsed.searchParams.get('channel') || ''); let created = false;
    if (!channel && parsed.searchParams.get('new') === '1') {
      channel = { id: id('channel'), name: 'Kênh mới', defaultPrivacy: 'private', brief: readBrief({}), autoMetadata: true, createdAt: now(), pending: true };
      store.channels.push(channel); created = true;
    }
    if (!channel) return fail(res, 404, 'Không tìm thấy kênh.', 'not_found');
    try { const url = yt.authUrl(channel.id); if (created) persist(); res.writeHead(302, { Location: url, 'Cache-Control': 'no-store' }); return res.end(); }
    catch (error) { if (created) dropChannel(channel.id); res.writeHead(302, { Location: '/#/channels?yt=error&msg=' + encodeURIComponent(error.message) }); return res.end(); }
  }
  if (pathname === '/oauth/youtube/callback' && req.method === 'GET') {
    const back = (query) => { res.writeHead(302, { Location: '/#/channels?' + query, 'Cache-Control': 'no-store' }); res.end(); };
    const fail302 = (message) => back('yt=error&msg=' + encodeURIComponent(message));
    const state = parsed.searchParams.get('state') || ''; const code = parsed.searchParams.get('code');
    const slotId = yt.slotFor(state);
    // Hủy giữa chừng hoặc lỗi thì bỏ thẻ kênh tạm, không để lại thẻ rỗng.
    const abandon = () => { const slot = channelById(slotId); if (slot?.pending) { dropChannel(slotId); emit('channels.changed'); } };
    if (!code) { yt.forget(state); abandon(); return fail302(parsed.searchParams.get('error') === 'access_denied' ? 'Bạn đã từ chối cấp quyền.' : parsed.searchParams.get('error') || 'Bạn đã từ chối cấp quyền.'); }
    yt.completeAuth(code, state).then(async ({ slotId: sid, channel: info }) => {
      const channel = channelById(sid);
      if (!channel) { await yt.disconnect(sid); return fail302('Kênh trong tool đã bị xóa.'); }
      const duplicate = store.channels.find((item) => item.id !== sid && !item.pending && item.youtube?.channelId === info.youtubeChannelId);
      if (duplicate) { await yt.disconnect(sid); abandon(); return fail302('Kênh YouTube này đã được kết nối ở mục "' + duplicate.name + '".'); }
      channel.youtube = { channelId: info.youtubeChannelId, title: info.title, handle: info.handle, thumbnail: info.thumbnail };
      channel.stats = info.stats; channel.needsAuth = false; channel.syncError = null; channel.syncedAt = now();
      const isNew = Boolean(channel.pending);
      if (channel.pending) { delete channel.pending; channel.name = (info.title || 'Kênh YouTube').slice(0, 80); }
      ensureChannelProject(channel);
      await cacheAvatar(channel, info.thumbnail);
      persist(); emit('channels.changed'); back(isNew ? `yt=ok&channel=${channel.id}` : 'yt=ok');
    }).catch((error) => { abandon(); fail302(error.message); });
    return;
  }
  if (pathname.startsWith('/avatar/')) {
    const channel = channelById(path.basename(pathname)); const file = channel?.avatar && path.join(avatarDir, channel.id);
    if (!file || !fs.existsSync(file)) return fail(res, 404, 'Không có avatar.', 'not_found');
    res.writeHead(200, { 'Content-Type': channel.avatar.mime, 'Cache-Control': 'public, max-age=86400' });
    return fs.createReadStream(file).pipe(res);
  }
  if (pathname.startsWith('/api/')) return handleApi(req, res, parsed).catch((error) => fail(res, 500, error.message || 'Lỗi máy chủ.', 'server_error'));
  if (pathname.startsWith('/media/')) {
    const asset = store.media.find((item) => item.storageKey === path.basename(pathname));
    const file = asset && path.join(mediaDir, asset.storageKey);
    if (!file || !fs.existsSync(file)) return fail(res, 404, 'Không tìm thấy media.', 'not_found');
    return sendFile(req, res, file, mimeOf(asset));
  }
  return serveStatic(req, res, pathname);
}

// SPA: file có thật trong web/dist thì trả về, còn lại trả index.html (giao diện tự điều hướng bằng hash).
function serveStatic(req, res, pathname) {
  if (!fs.existsSync(path.join(webDist, 'index.html'))) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<meta charset="utf-8"><body style="font:16px system-ui;padding:40px"><h2>Giao diện chưa được build</h2><p>Chạy <code>npm run build</code> trong thư mục dự án rồi tải lại trang.</p>');
  }
  const requested = path.resolve(webDist, '.' + (pathname === '/' ? '/index.html' : pathname));
  const inside = requested.startsWith(webDist + path.sep);
  const isFile = inside && fs.existsSync(requested) && fs.statSync(requested).isFile();
  if (!isFile && path.extname(pathname)) return fail(res, 404, 'Không tìm thấy tài nguyên.', 'not_found');
  const file = isFile ? requested : path.join(webDist, 'index.html');
  const immutable = isFile && pathname.startsWith('/assets/');
  res.writeHead(200, { 'Content-Type': staticTypes[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' });
  return fs.createReadStream(file).pipe(res);
}

ensureStorage();
setInterval(() => { processQueue().catch((error) => console.error(error)); processPosts().catch((error) => console.error(error)); }, 350);
setInterval(scheduleTick, scheduleTickMs);
setInterval(() => { syncAll().catch((error) => console.error(error)); }, 30 * 60 * 1000);
setTimeout(() => { if (store.channels.some((channel) => yt.hasTokens(channel.id))) syncAll().catch((error) => console.error(error)); }, 10000);
const server = http.createServer(serve);
server.listen(port, host, () => console.log(`Muse Studio chạy tại http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await muse.stop(); process.exit(0); });
