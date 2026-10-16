'use strict';
// Provider Muse chạy cục bộ: điều khiển Chrome/Edge qua CDP, dùng cookie đăng nhập của chính người dùng.
// Điều khiển Chrome/Edge qua CDP (cách làm gốc từ dự án muse2api). Mọi selector DOM nằm trong khối DOM bên dưới;
// khi muse.ai đổi giao diện thì thường chỉ cần sửa khối đó.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const SITE = (process.env.MUSE_SITE_URL || 'https://muse.ai').replace(/\/+$/, ''); // đổi chỉ để kiểm thử với trang giả
const NEW_THREAD_URL = `${SITE}/thread/new`;
const SESSION_COOKIES = ['hatch_sess', 'hatch_gw', 'hatch_vml', 'hatch_native_auth_device'];
const CDP_PORT = Number(process.env.MUSE_CDP_PORT || 19210);
const PAGE_READY_TIMEOUT = 45000;
const TIMEOUTS = { image: 240000, video: 600000 };
const OVERRUN_FACTOR = 2.5; // vẫn còn "đang tạo" thì cho chạy quá hạn mềm, tránh vứt thành phẩm sắp xong
const MEDIA_GRACE = { video: 90000, image: 8000 };
// Cuộc chat gợi ý được dùng lại cho tới khi đủ dài (trang Muse chậm dần khi thread quá nhiều tin nhắn).
const CHAT_THREAD_LIMIT = Number(process.env.MUSE_CHAT_THREAD_LIMIT || 14);

class MuseError extends Error {
  constructor(message, code = 'PROVIDER_ERROR') { super(message); this.code = code; }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------- DOM
const q = (value) => JSON.stringify(value);
const INPUT = 'textarea';
const AGENT_BUBBLE = 'div[class*="hatch-agent-bubble-bg"]';
const ATTACHMENT = '[data-testid^="hatch-chat-attachment-presentation-"]';
const STOP_BUTTON = 'button[aria-label*="Stop" i]';
const APPROVAL_CARD = '[data-testid="hatch-inline-approval-card"]';
const LOGIN_HINTS = ['log in', 'sign in', 'create an account', 'use another account'];
const QUOTA_HINTS = ['out of credits', 'usage limit', 'limit reached', 'token limit'];
const STALL_HINTS = ['Still sending', 'Connecting...'];

const DOM = {
  pageState: `(() => {
    const body = document.body ? document.body.innerText : '';
    const hydration = document.querySelector('[data-hatch-shell-hydration-state]');
    return {
      ready: document.readyState === 'complete' && !!document.querySelector(${q(INPUT)})
        && (!hydration || hydration.getAttribute('data-hatch-shell-hydration-state') === 'hydrated')
        && !body.includes('Connecting...'),
      hasInput: !!document.querySelector(${q(INPUT)}),
      path: location.pathname,
      head: body.slice(0, 800),
    };
  })()`,
  chatState: `(() => {
    const scrollers = [...document.querySelectorAll('*')].filter(e => {
      const s = getComputedStyle(e);
      return (s.overflowY === 'auto' || s.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 50;
    });
    scrollers.forEach(e => { e.scrollTop = e.scrollHeight; });
    const bubbles = [...document.querySelectorAll(${q(AGENT_BUBBLE)})];
    const last = bubbles.length ? (bubbles[bubbles.length - 1].innerText || '').trim() : '';
    const atts = [...document.querySelectorAll(${q(ATTACHMENT)})].map(a => {
      const v = a.querySelector('video'), i = a.querySelector('img');
      const m = v || i;
      return {
        tid: a.getAttribute('data-testid') || '',
        kind: v ? 'video' : (i ? 'image' : 'unknown'),
        src: m ? (m.currentSrc || m.src || '') : '',
        w: m ? (m.videoWidth || m.naturalWidth || 0) : 0,
        h: m ? (m.videoHeight || m.naturalHeight || 0) : 0,
      };
    });
    const tail = document.body ? document.body.innerText.slice(-600) : '';
    return { agentCount: bubbles.length, lastText: last,
      generating: !!document.querySelector(${q(STOP_BUTTON)}),
      approval: !!document.querySelector(${q(APPROVAL_CARD)}),
      attachments: atts, tail };
  })()`,
  denyApprovals: `(() => {
    const denied = [];
    for (const card of document.querySelectorAll(${q(APPROVAL_CARD)})) {
      const btn = [...card.querySelectorAll('button,[role=button]')]
        .find(b => /^(deny|decline|reject|don.t allow)$/i.test((b.innerText || '').trim()));
      if (btn && !btn.disabled) { btn.click(); denied.push(card.getAttribute('aria-label') || 'approval request'); }
    }
    return denied;
  })()`,
  lastBubbleMedia: `(() => {
    const bubbles = [...document.querySelectorAll(${q(AGENT_BUBBLE)})];
    const b = bubbles.length ? bubbles[bubbles.length - 1] : null;
    if (!b) return { links: [], html: '' };
    const urls = [];
    const push = (u) => { if (u && !urls.includes(u)) urls.push(u); };
    b.querySelectorAll('video, source').forEach(m => push(m.currentSrc || m.src || ''));
    b.querySelectorAll('a[href]').forEach(a => push(a.href || ''));
    b.querySelectorAll('img').forEach(m => push(m.currentSrc || m.src || ''));
    const re = /https?:\\/\\/[^\\s)<>"']+/g;
    let mm; const text = b.innerText || '';
    while ((mm = re.exec(text))) push(mm[0]);
    return { links: urls, html: (b.outerHTML || '').slice(0, 2000) };
  })()`,
  clickSend: `(() => {
    const btn = [...document.querySelectorAll('button,[role=button]')]
      .filter(b => b.offsetParent !== null)
      .find(b => /send|发送/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('data-testid') || '')));
    if (!btn) return 'missing';
    if (btn.disabled) return 'disabled';
    btn.click();
    return 'clicked';
  })()`,
  inputEmpty: `!(document.querySelector(${q(INPUT)}) || { value: '' }).value`,
  fillInput: (text) => `(() => {
    const ta = document.querySelector(${q(INPUT)});
    if (!ta) return { ok: false, err: 'no-input' };
    ta.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, ${q(text)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true, len: ta.value.length };
  })()`,
  // Tải blob trong ngữ cảnh trang rồi đọc ra từng đoạn, tránh một message CDP khổng lồ.
  fetchBlob: (url) => `(async () => {
    try {
      const r = await fetch(${q(url)});
      const b = await r.blob();
      window.__museDl = b;
      return { ok: true, mime: b.type || '', size: b.size };
    } catch (e) { return { ok: false, err: String(e) }; }
  })()`,
  readChunk: (offset, length) => `(async () => {
    const b = window.__museDl.slice(${offset}, ${offset + length});
    const buf = new Uint8Array(await b.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  })()`,
};

// ---------------------------------------------------------------- CDP
class CDP {
  constructor(ws) {
    this.ws = ws; this.nextId = 1; this.pending = new Map(); this.closed = false;
    ws.addEventListener('message', (event) => {
      let msg; try { msg = JSON.parse(event.data); } catch { return; }
      const entry = msg.id && this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.error) entry.reject(new MuseError(msg.error.message || 'cdp error', 'BROWSER'));
      else entry.resolve(msg.result || {});
    });
    ws.addEventListener('close', () => this.#shutdown());
    ws.addEventListener('error', () => this.#shutdown());
  }
  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new MuseError('Không kết nối được DevTools của trình duyệt', 'BROWSER')); }, 15000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(new CDP(ws)); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new MuseError('Không kết nối được DevTools của trình duyệt', 'BROWSER')); }, { once: true });
    });
  }
  #shutdown() {
    this.closed = true;
    for (const entry of this.pending.values()) entry.reject(new MuseError('Kết nối trình duyệt đã đóng', 'BROWSER'));
    this.pending.clear();
  }
  send(method, params = {}, timeout = 30000) {
    if (this.closed) return Promise.reject(new MuseError('Kết nối trình duyệt đã đóng', 'BROWSER'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new MuseError(`CDP timeout: ${method}`, 'TIMEOUT')); }, timeout);
      this.pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression, { awaitPromise = false, timeout = 30000 } = {}) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, timeout);
    if (res.exceptionDetails) throw new MuseError(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'js error', 'BROWSER');
    return res.result?.value;
  }
  close() { this.closed = true; try { this.ws.close(); } catch {} }
}

// ---------------------------------------------------------------- credential
function parseCredential(raw) {
  const text = String(raw || '').trim();
  const cookies = {}; const expires = {};
  if (!text) return { cookies, expires };
  if (text.startsWith('[') || text.startsWith('{')) {
    let value;
    try { value = JSON.parse(text); } catch { throw new MuseError('Credential JSON không hợp lệ', 'BAD_CREDENTIAL'); }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!item || !item.name || !item.value) continue;
        cookies[item.name] = String(item.value);
        const exp = Number(item.expirationDate || item.expires || 0);
        if (exp > 0) expires[item.name] = Math.floor(exp);
      }
    } else {
      for (const [name, val] of Object.entries(value)) if (name && val) cookies[name] = String(val);
    }
    return { cookies, expires };
  }
  for (const part of text.replace(/^cookie:\s*/i, '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) { const val = part.slice(index + 1).trim(); if (val) cookies[part.slice(0, index).trim()] = val; }
  }
  return { cookies, expires };
}
const missingSessionCookies = (cookies) => SESSION_COOKIES.filter((name) => !cookies[name]);

// ---------------------------------------------------------------- provider
function findBrowser() {
  const configured = process.env.MUSE_BROWSER_PATH;
  const candidates = [configured, ...({
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  }[process.platform] || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'])];
  const found = candidates.find((file) => file && fs.existsSync(file));
  if (!found) throw new MuseError('Không tìm thấy Chrome/Edge. Cài Chrome hoặc đặt biến môi trường MUSE_BROWSER_PATH.', 'BROWSER');
  return found;
}

function createProvider({ dataDir }) {
  const credFile = path.join(dataDir, 'muse-credential.json');
  const profileDir = path.join(dataDir, 'browser-profile');
  const threadFile = path.join(dataDir, 'muse-threads.json');
  let proc = null; let browser = null; let running = Promise.resolve(); let chatRunning = Promise.resolve();

  // ---- credential store (file cục bộ, đã nằm trong .gitignore)
  const loadCredential = () => { try { return JSON.parse(fs.readFileSync(credFile, 'utf8')); } catch { return null; } };
  const saveCredential = (value) => { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(credFile, JSON.stringify(value), { mode: 0o600 }); };
  function setCredential(raw) {
    const { cookies, expires } = parseCredential(raw);
    const missing = missingSessionCookies(cookies);
    if (missing.length) throw new MuseError(`Thiếu cookie bắt buộc: ${missing.join(', ')}`, 'BAD_CREDENTIAL');
    const hash = crypto.createHash('sha256').update(JSON.stringify([cookies, expires])).digest('hex');
    saveCredential({ cookies, expires, hash, appliedHash: null, updatedAt: new Date().toISOString() });
    return credentialInfo();
  }
  function clearCredential() { try { fs.unlinkSync(credFile); } catch {} }
  function credentialInfo() {
    const cred = loadCredential();
    return cred ? { configured: true, updatedAt: cred.updatedAt, cookieNames: Object.keys(cred.cookies) } : { configured: false };
  }

  // ---- trình duyệt
  async function httpJson(pathname) {
    try { const res = await fetch(`http://127.0.0.1:${CDP_PORT}${pathname}`, { signal: AbortSignal.timeout(2000) }); return await res.json(); } catch { return null; }
  }
  async function ensureBrowser({ headless }) {
    if (browser && !browser.closed) return browser;
    let info = await httpJson('/json/version');
    if (!info) {
      fs.mkdirSync(profileDir, { recursive: true });
      for (const lock of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { fs.unlinkSync(path.join(profileDir, lock)); } catch {} }
      const args = [
        `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${profileDir}`,
        '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
        '--autoplay-policy=no-user-gesture-required', '--window-size=1440,2200',
      ];
      if (headless) args.push('--headless=new', '--disable-gpu');
      args.push('about:blank');
      proc = spawn(findBrowser(), args, { stdio: 'ignore', windowsHide: false });
      proc.on('exit', () => { proc = null; });
      proc.on('error', () => { proc = null; });
      for (let i = 0; i < 60 && !info; i += 1) { await sleep(500); info = await httpJson('/json/version'); }
      if (!info) throw new MuseError('Trình duyệt không mở được cổng DevTools', 'BROWSER');
    }
    browser = await CDP.connect(info.webSocketDebuggerUrl);
    return browser;
  }
  async function stop() {
    if (browser) { browser.close(); browser = null; }
    if (proc) { try { proc.kill(); } catch {} proc = null; }
  }
  process.on('exit', () => { if (proc) { try { proc.kill(); } catch {} } });

  async function openTab({ headless }) {
    const cred = loadCredential();
    if (!cred) throw new MuseError('Chưa cấu hình cookie Muse. Dán cookie trong Settings.', 'AUTH_REQUIRED');
    const root = await ensureBrowser({ headless });
    const { targetId } = await root.send('Target.createTarget', { url: 'about:blank', newWindow: true });
    let page;
    try {
      page = await CDP.connect(`ws://127.0.0.1:${CDP_PORT}/devtools/page/${targetId}`);
      for (const domain of ['Page', 'Runtime', 'Network']) await page.send(`${domain}.enable`);
      await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      await page.send('Page.setWebLifecycleState', { state: 'active' });
      // Chỉ nạp cookie khi người dùng vừa dán mới: profile giữ lại cookie đã được muse.ai xoay vòng.
      if (cred.hash !== cred.appliedHash) {
        const floor = Date.now() / 1000 + 3600;
        for (const [name, value] of Object.entries(cred.cookies)) {
          const exp = cred.expires[name] || 0;
          const expires = exp > floor ? exp : Date.now() / 1000 + 7 * 86400;
          await page.send('Network.setCookie', SITE === 'https://muse.ai' ? { name, value, domain: '.muse.ai', path: '/', secure: true, expires } : { name, value, url: SITE, expires });
        }
        saveCredential({ ...cred, appliedHash: cred.hash });
      }
    } catch (error) { page?.close(); await root.send('Target.closeTarget', { targetId }).catch(() => {}); throw error; }
    return {
      page,
      async close() { page.close(); await root.send('Target.closeTarget', { targetId }).catch(() => {}); },
    };
  }

  async function newThread(page) {
    await page.send('Page.navigate', { url: NEW_THREAD_URL });
    const deadline = Date.now() + PAGE_READY_TIMEOUT;
    let state = {};
    while (Date.now() < deadline) {
      await sleep(250);
      try { state = (await page.evaluate(DOM.pageState, { timeout: 5000 })) || {}; if (state.ready) return; } catch (error) { if (error.code === 'BROWSER' && page.closed) throw error; }
    }
    const head = String(state.head || '').toLowerCase();
    if (LOGIN_HINTS.some((hint) => head.includes(hint))) throw new MuseError('muse.ai yêu cầu đăng nhập lại: cookie đã hết hạn. Dán cookie mới trong Settings.', 'AUTH_REQUIRED');
    throw new MuseError('Trang muse.ai không sẵn sàng (hết thời gian chờ)', 'TIMEOUT');
  }

  async function readState(page) {
    const state = (await page.evaluate(DOM.chatState)) || {};
    const tail = String(state.tail || ''); const low = tail.toLowerCase();
    const hit = QUOTA_HINTS.find((hint) => low.includes(hint));
    // Chỉ tính khi chính câu trả lời của agent nói hết quota; sidebar/prompt có thể chứa cùng từ khóa.
    if (hit && !state.generating && String(state.lastText || '').toLowerCase().includes(hit)) {
      const i = low.indexOf(hit);
      throw new MuseError(`Tài khoản Muse báo hết quota: …${tail.slice(Math.max(0, i - 120), i + 120).replace(/\s+/g, ' ')}…`, 'QUOTA');
    }
    return state;
  }

  async function sendPrompt(page, prompt) {
    const filled = await page.evaluate(DOM.fillInput(prompt));
    if (!filled?.ok) throw new MuseError(`Không điền được ô chat: ${filled?.err}`, 'BROWSER');
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if ((await page.evaluate(DOM.clickSend)) === 'clicked') return;
      await sleep(100);
    }
    for (const type of ['keyDown', 'keyUp']) {
      await page.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}) });
    }
    await sleep(500);
    if (!(await page.evaluate(DOM.inputEmpty))) throw new MuseError('Không tìm thấy nút gửi và Enter không gửi được', 'BROWSER');
  }

  function pickMediaUrl(links, kind) {
    const exts = kind === 'video' ? ['.mp4', '.webm', '.mov', '.m4v'] : ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'];
    const hosts = ['videodelivery.net', 'cloudflarestream.com', 'cloudflarestorage.com', 'amazonaws.com', 'storage.googleapis.com', 'blob.core.windows.net', 'musecdn', 'cdn.muse', 'muse-cdn'];
    const paths = ['/media/', '/download', '/dl/', '/video', '/attachment', '/files/'];
    const score = (url) => {
      const low = url.toLowerCase(); const pathOnly = low.split('?')[0].split('#')[0];
      if (url.startsWith('blob:') || exts.some((ext) => pathOnly.endsWith(ext))) return 3;
      if (hosts.some((host) => low.includes(host))) return 2;
      return paths.some((seg) => low.includes(seg)) ? 1 : 0;
    };
    const ranked = links.filter((url) => url && !/^(mailto|javascript):/.test(url)).sort((a, b) => score(b) - score(a));
    return ranked.length && score(ranked[0]) > 0 ? ranked[0] : null;
  }

  async function waitMedia(page, base, kind, timeoutMs, onProgress, signal) {
    const baseAtts = (base.attachments || []).length; let baseCount = base.agentCount || 0;
    const grace = MEDIA_GRACE[kind] || 8000; const started = Date.now();
    let textDoneAt = null; let asked = false; let busy = false; let denied = false;
    for (;;) {
      const elapsed = Date.now() - started;
      if (elapsed >= timeoutMs && !(busy && elapsed < timeoutMs * OVERRUN_FACTOR)) break;
      if (signal?.aborted) throw new MuseError('Đã hủy', 'CANCELLED');
      await sleep(600);
      const st = await readState(page);
      if (st.approval) { await page.evaluate(DOM.denyApprovals); denied = true; textDoneAt = null; continue; }
      const newAtts = (st.attachments || []).slice(baseAtts);
      const fresh = newAtts.filter((a) => a.src && a.kind === kind);
      if (fresh.length) return fresh[fresh.length - 1];
      const loading = newAtts.some((a) => String(a.tid || '').includes(kind));
      busy = Boolean(st.generating) || loading;
      onProgress?.(Math.min(95, Math.floor(((Date.now() - started) / timeoutMs) * 100)));
      if (loading) { textDoneAt = null; continue; } // attachment đã có nhưng blob chưa nạp xong
      const text = st.lastText || '';
      if ((st.agentCount || 0) > baseCount && text && !st.generating) {
        if (textDoneAt === null) textDoneAt = Date.now();
        else if (Date.now() - textDoneAt >= grace) {
          if (!asked) {
            // Agent thường báo xong mà file chỉ nằm trong workspace; nhắc một lần để nó đính kèm vào chat.
            await sendPrompt(page, `Please attach the final ${kind} file here in the chat${denied ? ' instead of uploading it.' : ', as a single attachment.'}`);
            asked = true; textDoneAt = null; baseCount = st.agentCount;
            continue;
          }
          const probe = (await page.evaluate(DOM.lastBubbleMedia)) || {};
          const url = pickMediaUrl(probe.links || [], kind);
          if (url) return { src: url, kind };
          throw new MuseError(`Muse chỉ trả lời bằng văn bản, không tạo ${kind}: ${text.slice(0, 200)}`, 'REFUSED');
        }
      } else textDoneAt = null;
    }
    throw new MuseError(`Tạo ${kind} quá thời gian chờ`, 'TIMEOUT');
  }

  async function download(page, att, kind) {
    const meta = await page.evaluate(DOM.fetchBlob(att.src), { awaitPromise: true, timeout: 300000 });
    if (!meta?.ok) throw new MuseError(`Không tải được ${kind} đã tạo: ${meta?.err}`, 'BROWSER');
    const chunks = []; const step = 3 * 1024 * 1024;
    for (let offset = 0; offset < meta.size; offset += step) {
      chunks.push(Buffer.from(await page.evaluate(DOM.readChunk(offset, step), { awaitPromise: true, timeout: 120000 }), 'base64'));
    }
    return { data: Buffer.concat(chunks), mime: meta.mime || (kind === 'video' ? 'video/mp4' : 'image/png'), width: att.w || null, height: att.h || null };
  }

  const mediaPrompt = (prompt, kind, { size, duration } = {}) => {
    const hints = [size && `aspect ratio ${size}`, duration && `${duration} seconds long`].filter(Boolean);
    return `${kind === 'image' ? 'Generate an image' : 'Generate a video'}${hints.length ? ` (${hints.join(', ')})` : ''}: ${prompt}`;
  };

  // Chạy tuần tự: một cửa sổ trình duyệt, một tài khoản.
  function serial(task) {
    const result = running.then(task, task);
    running = result.catch(() => {});
    return result;
  }

  function generate({ type, prompt, size, duration, headless = false, onProgress, signal }) {
    const kind = type === 'video' ? 'video' : 'image';
    return serial(async () => {
      const tab = await openTab({ headless });
      try {
        await newThread(tab.page);
        const base = await readState(tab.page);
        await sendPrompt(tab.page, mediaPrompt(prompt, kind, { size, duration }));
        const att = await waitMedia(tab.page, base, kind, TIMEOUTS[kind], onProgress, signal);
        return { ...(await download(tab.page, att, kind)), kind };
      } finally { await tab.close(); }
    });
  }

  // Chờ Muse trả lời xong một tin nhắn chat (không có media): chờ text mới xuất hiện và ngừng thay đổi, nút Stop biến mất.
  async function waitReply(page, base, timeoutMs, signal) {
    const started = Date.now(); let last = ''; let stable = 0;
    for (;;) {
      const elapsed = Date.now() - started;
      if (elapsed > timeoutMs) throw new MuseError('Muse trả lời quá lâu', 'TIMEOUT');
      if (signal?.aborted) throw new MuseError('Đã hủy', 'CANCELLED');
      await sleep(300);
      const st = await readState(page);
      if (st.approval) { await page.evaluate(DOM.denyApprovals); continue; }
      const text = st.lastText || '';
      const isNew = (st.agentCount || 0) > (base.agentCount || 0) || (text && text !== base.lastText);
      if (!isNew || !text) {
        if (elapsed > 20000 && STALL_HINTS.some((hint) => String(st.tail || '').includes(hint))) throw new MuseError('Muse đang kẹt ở trạng thái kết nối', 'TIMEOUT');
        continue;
      }
      if (text !== last) { last = text; stable = 0; continue; }
      stable += 1;
      if ((!st.generating && stable >= 6) || stable >= 60) return text;
    }
  }

  // ---- cuộc chat dùng lại: mỗi khóa (ví dụ id kênh) giữ một thread Muse để không phải tạo chat mới và nhắc lại ngữ cảnh
  const readThreads = () => { try { return JSON.parse(fs.readFileSync(threadFile, 'utf8')); } catch { return {}; } };
  const saveThread = (key, url) => { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(threadFile, JSON.stringify({ ...readThreads(), [key]: { url, at: new Date().toISOString() } })); };
  // Không truyền prefixes: xóa tất cả. Có prefixes (mảng tiền tố khóa): chỉ xóa các cuộc chat có khóa khớp.
  const resetThreads = (prefixes) => {
    if (!prefixes?.length) { try { fs.unlinkSync(threadFile); } catch {} return; }
    const threads = readThreads();
    for (const key of Object.keys(threads)) if (prefixes.some((prefix) => key.startsWith(prefix))) delete threads[key];
    fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(threadFile, JSON.stringify(threads));
  };
  const threadPath = (url) => { try { const p = new URL(url).pathname.replace(/\/+$/, ''); return p.startsWith('/thread/') && p !== '/thread/new' ? p : null; } catch { return null; } };

  // Mở lại một thread đã lưu. false nếu thread không còn / không tải được (khi đó tạo chat mới); cookie hết hạn thì ném AUTH_REQUIRED.
  async function loadThread(page, url, timeoutMs = Number(process.env.MUSE_THREAD_LOAD_TIMEOUT_MS || 20000)) {
    await page.send('Page.navigate', { url });
    const deadline = Date.now() + timeoutMs; let state = {};
    while (Date.now() < deadline) {
      await sleep(300);
      try { state = (await page.evaluate(DOM.pageState, { timeout: 5000 })) || {}; if (state.ready) break; } catch { /* trang đang tải */ }
    }
    if (!state.ready) {
      if (LOGIN_HINTS.some((hint) => String(state.head || '').toLowerCase().includes(hint))) throw new MuseError('muse.ai yêu cầu đăng nhập lại: cookie đã hết hạn. Dán cookie mới trong Settings.', 'AUTH_REQUIRED');
      return false;
    }
    const href = await page.evaluate('location.href').catch(() => '');
    return threadPath(href) === threadPath(url);
  }

  // Hỏi Muse một câu (dùng cho gợi ý tiêu đề/mô tả). Hàng đợi riêng để không phải chờ job tạo video.
  // Có threadKey + followup: dùng lại thread đã lưu và chỉ gửi câu ngắn `followup`; không dùng lại được thì mở chat mới và gửi đủ `prompt`.
  function chat({ prompt, followup, threadKey, fresh = false, headless = false, timeoutMs = 150000, signal }) {
    const task = async () => {
      const tab = await openTab({ headless });
      try {
        const saved = !fresh && threadKey && followup ? readThreads()[threadKey] : null;
        let continued = false;
        if (saved?.url) {
          try { continued = await loadThread(tab.page, saved.url); } catch (error) { if (error.code === 'AUTH_REQUIRED') throw error; continued = false; }
          if (continued && ((await readState(tab.page)).agentCount || 0) >= CHAT_THREAD_LIMIT) continued = false;
        }
        if (!continued) await newThread(tab.page);
        const base = await readState(tab.page);
        await sendPrompt(tab.page, continued ? followup : prompt);
        const text = await waitReply(tab.page, base, timeoutMs, signal);
        if (threadKey) {
          for (let i = 0; i < 10; i += 1) { // Muse đổi /thread/new thành /thread/<id> sau khi gửi
            const href = await tab.page.evaluate('location.href').catch(() => '');
            if (threadPath(href)) { saveThread(threadKey, href); break; }
            await sleep(200);
          }
        }
        return { text, continued };
      } finally { await tab.close(); }
    };
    const result = chatRunning.then(task, task);
    chatRunning = result.catch(() => {});
    return result;
  }

  // Kiểm tra cookie còn dùng được: mở trang chat mới và xem có bị đẩy về đăng nhập không.
  function checkSession({ headless = false } = {}) {
    return serial(async () => {
      const tab = await openTab({ headless });
      try { await newThread(tab.page); return { ok: true }; } finally { await tab.close(); }
    });
  }

  return { setCredential, clearCredential, credentialInfo, generate, chat, resetThreads, checkSession, stop };
}

module.exports = { createProvider, MuseError, parseCredential, SESSION_COOKIES };
