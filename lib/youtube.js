'use strict';
// YouTube Data API v3 cho nhiều kênh: OAuth (PKCE), upload resumable, đọc thống kê, đếm quota.
// Mỗi "slot" kênh trong app có refresh token riêng. Không dùng thư viện ngoài.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');

const AUTH_URL = process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const REVOKE_URL = process.env.GOOGLE_REVOKE_URL || 'https://oauth2.googleapis.com/revoke';
const API = process.env.YT_API_BASE || 'https://www.googleapis.com/youtube/v3';
const UPLOAD = process.env.YT_UPLOAD_BASE || 'https://www.googleapis.com/upload/youtube/v3';
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];
const DAILY_QUOTA = 10000; // mặc định của một Google Cloud project
const COST = { upload: 1600, list: 1 };

class YouTubeError extends Error {
  constructor(message, code = 'API_ERROR') { super(message); this.code = code; }
}

const b64url = (buffer) => buffer.toString('base64url');
// Quota YouTube reset lúc nửa đêm giờ Thái Bình Dương.
const quotaDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());

function createYouTube({ dataDir, redirectUri }) {
  const clientFile = path.join(dataDir, 'youtube-client.json');
  const tokenFile = path.join(dataDir, 'youtube-tokens.json');
  const quotaFile = path.join(dataDir, 'youtube-quota.json');
  const pending = new Map(); // state -> { slotId, verifier, at }

  const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
  const writeJson = (file, value) => { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(value), { mode: 0o600 }); };

  // ---- OAuth client (Google Cloud) do người dùng tự tạo
  const loadClient = () => readJson(clientFile, null);
  function clientInfo() {
    const client = loadClient();
    return { configured: Boolean(client), clientId: client?.clientId || '', redirectUri };
  }
  function setClient(clientId, clientSecret) {
    const id = String(clientId || '').trim(); const secret = String(clientSecret || '').trim();
    if (!id || !secret) throw new YouTubeError('Cần nhập cả Client ID và Client Secret.', 'BAD_REQUEST');
    writeJson(clientFile, { clientId: id, clientSecret: secret });
    return clientInfo();
  }
  function clearClient() { try { fs.unlinkSync(clientFile); } catch {} }
  const needClient = () => { const client = loadClient(); if (!client) throw new YouTubeError('Chưa nhập Google OAuth Client ID/Secret trong trang Kênh YouTube.', 'NOT_CONFIGURED'); return client; };

  // ---- quota
  function quota() {
    const saved = readJson(quotaFile, null); const day = quotaDay();
    return { date: day, used: saved?.date === day ? saved.used : 0, limit: DAILY_QUOTA };
  }
  function spend(units) { const current = quota(); writeJson(quotaFile, { date: current.date, used: current.used + units }); }

  // ---- token
  const loadTokens = () => readJson(tokenFile, {});
  const hasTokens = (slotId) => Boolean(loadTokens()[slotId]?.refresh_token);
  function saveToken(slotId, patch) { const all = loadTokens(); all[slotId] = { ...all[slotId], ...patch }; writeJson(tokenFile, all); }

  async function tokenRequest(params) {
    const client = needClient();
    const res = await fetch(TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret, ...params }), signal: AbortSignal.timeout(30000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const revoked = data.error === 'invalid_grant';
      throw new YouTubeError(revoked ? 'Quyền truy cập YouTube đã hết hạn hoặc bị thu hồi. Hãy kết nối lại kênh.' : `Google từ chối: ${data.error_description || data.error || res.status}`, revoked ? 'NEEDS_AUTH' : 'API_ERROR');
    }
    return data;
  }
  async function accessToken(slotId, { force = false } = {}) {
    const token = loadTokens()[slotId];
    if (!token?.refresh_token) throw new YouTubeError('Kênh chưa được kết nối YouTube.', 'NEEDS_AUTH');
    if (!force && token.access_token && token.expires_at - 60000 > Date.now()) return token.access_token;
    const data = await tokenRequest({ grant_type: 'refresh_token', refresh_token: token.refresh_token });
    saveToken(slotId, { access_token: data.access_token, expires_at: Date.now() + Number(data.expires_in || 3600) * 1000 });
    return data.access_token;
  }

  function authUrl(slotId) {
    const client = needClient();
    for (const [state, entry] of pending) if (Date.now() - entry.at > 10 * 60 * 1000) pending.delete(state);
    const state = b64url(crypto.randomBytes(16)); const verifier = b64url(crypto.randomBytes(32));
    pending.set(state, { slotId, verifier, at: Date.now() });
    const params = new URLSearchParams({
      client_id: client.clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '),
      access_type: 'offline', prompt: 'select_account consent', state,
      code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256',
    });
    return `${AUTH_URL}?${params}`;
  }

  // ---- API call
  async function call(slotId, method, pathname, { query, body, cost = COST.list } = {}) {
    if (quota().used + cost > DAILY_QUOTA) throw new YouTubeError(`Đã dùng gần hết quota YouTube hôm nay (${quota().used}/${DAILY_QUOTA}).`, 'QUOTA');
    const url = `${API}${pathname}?${new URLSearchParams(query || {})}`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await fetch(url, {
        method, signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${await accessToken(slotId, { force: attempt > 0 })}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      spend(cost);
      if (res.status === 401 && attempt === 0) continue; // access token có thể vừa bị thu hồi
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw apiError(res.status, data);
      return data;
    }
    throw new YouTubeError('Google từ chối token.', 'NEEDS_AUTH');
  }
  function apiError(status, data) {
    const reason = data.error?.errors?.[0]?.reason || '';
    const message = data.error?.message || `HTTP ${status}`;
    if (status === 401) return new YouTubeError('Google từ chối token. Hãy kết nối lại kênh.', 'NEEDS_AUTH');
    if (['quotaExceeded', 'rateLimitExceeded', 'uploadLimitExceeded', 'dailyLimitExceeded'].includes(reason)) return new YouTubeError(`YouTube báo hết hạn mức (${reason}).`, 'QUOTA');
    return new YouTubeError(`YouTube lỗi: ${message}${reason ? ` (${reason})` : ''}`, 'API_ERROR');
  }

  const mapChannel = (item) => ({
    youtubeChannelId: item.id, title: item.snippet?.title || '', handle: item.snippet?.customUrl || '',
    thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
    stats: { subscribers: Number(item.statistics?.subscriberCount || 0), hiddenSubscribers: Boolean(item.statistics?.hiddenSubscriberCount), views: Number(item.statistics?.viewCount || 0), videos: Number(item.statistics?.videoCount || 0) },
  });
  async function channelInfo(slotId) {
    const data = await call(slotId, 'GET', '/channels', { query: { part: 'snippet,statistics', mine: 'true' } });
    if (!data.items?.length) throw new YouTubeError('Tài khoản Google này chưa có kênh YouTube.', 'API_ERROR');
    return mapChannel(data.items[0]);
  }
  async function videosInfo(slotId, ids) {
    const result = new Map();
    for (let i = 0; i < ids.length; i += 50) {
      const data = await call(slotId, 'GET', '/videos', { query: { part: 'statistics,status', id: ids.slice(i, i + 50).join(',') } });
      for (const item of data.items || []) {
        result.set(item.id, {
          views: Number(item.statistics?.viewCount || 0), likes: Number(item.statistics?.likeCount || 0), comments: Number(item.statistics?.commentCount || 0),
          privacy: item.status?.privacyStatus || '', uploadStatus: item.status?.uploadStatus || '', publishAt: item.status?.publishAt || null,
        });
      }
    }
    return result;
  }

  // Thẻ kênh gắn với phiên đăng nhập này (để dọn thẻ tạm khi người dùng hủy hoặc lỗi); không tiêu thụ state.
  const slotFor = (state) => pending.get(state)?.slotId;
  const forget = (state) => { pending.delete(state); };

  async function completeAuth(code, state) {
    const entry = pending.get(state);
    if (!entry || Date.now() - entry.at > 10 * 60 * 1000) throw new YouTubeError('Phiên kết nối không hợp lệ hoặc đã hết hạn. Hãy thử lại.', 'BAD_REQUEST');
    pending.delete(state);
    const data = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: entry.verifier });
    if (!data.refresh_token) throw new YouTubeError('Google không trả refresh token. Vào myaccount.google.com/permissions gỡ quyền của app rồi kết nối lại.', 'API_ERROR');
    saveToken(entry.slotId, { refresh_token: data.refresh_token, access_token: data.access_token, expires_at: Date.now() + Number(data.expires_in || 3600) * 1000 });
    try { return { slotId: entry.slotId, channel: await channelInfo(entry.slotId) }; } catch (error) { removeToken(entry.slotId); throw error; }
  }

  function sanitize(meta) {
    const clean = (text, max) => String(text || '').replace(/[<>]/g, '').trim().slice(0, max);
    const tags = (Array.isArray(meta.tags) ? meta.tags : []).map((tag) => clean(tag, 30)).filter(Boolean).slice(0, 15);
    return { title: clean(meta.title, 100) || 'Untitled', description: clean(meta.description, 5000), tags };
  }

  // Upload resumable một lượt (không tự nối lại): lỗi thì người dùng bấm thử lại.
  async function upload(slotId, file, meta) {
    if (quota().used + COST.upload > DAILY_QUOTA) throw new YouTubeError(`Không đủ quota YouTube hôm nay để upload (cần ${COST.upload}, đã dùng ${quota().used}/${DAILY_QUOTA}).`, 'QUOTA');
    const { size } = fs.statSync(file); const mime = meta.mime || 'video/mp4';
    const { title, description, tags } = sanitize(meta);
    const scheduled = Boolean(meta.publishAt);
    const status = { privacyStatus: scheduled ? 'private' : meta.privacy || 'private', selfDeclaredMadeForKids: false, containsSyntheticMedia: meta.synthetic !== false };
    if (scheduled) status.publishAt = new Date(meta.publishAt).toISOString();
    const init = await fetch(`${UPLOAD}/videos?${new URLSearchParams({ uploadType: 'resumable', part: 'snippet,status' })}`, {
      method: 'POST', signal: AbortSignal.timeout(60000),
      headers: { Authorization: `Bearer ${await accessToken(slotId)}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': mime },
      body: JSON.stringify({ snippet: { title, description, tags, categoryId: meta.categoryId || '22' }, status }),
    });
    if (!init.ok) throw apiError(init.status, await init.json().catch(() => ({})));
    spend(COST.upload);
    const location = init.headers.get('location');
    if (!location) throw new YouTubeError('YouTube không trả địa chỉ upload.', 'API_ERROR');
    const put = await fetch(location, {
      method: 'PUT', signal: AbortSignal.timeout(60 * 60 * 1000), duplex: 'half',
      headers: { 'Content-Type': mime, 'Content-Length': String(size) },
      body: Readable.toWeb(fs.createReadStream(file)),
    });
    const data = await put.json().catch(() => ({}));
    if (!put.ok || !data.id) throw apiError(put.status, data);
    return { videoId: data.id, privacy: data.status?.privacyStatus || status.privacyStatus };
  }

  function removeToken(slotId) { const all = loadTokens(); delete all[slotId]; writeJson(tokenFile, all); }
  async function disconnect(slotId) {
    const token = loadTokens()[slotId];
    removeToken(slotId);
    if (token?.refresh_token) { try { await fetch(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: token.refresh_token }), signal: AbortSignal.timeout(10000) }); } catch {} }
  }

  return { clientInfo, setClient, clearClient, authUrl, slotFor, forget, completeAuth, hasTokens, channelInfo, videosInfo, upload, disconnect, quota };
}

module.exports = { createYouTube, YouTubeError, DAILY_QUOTA, COST };
