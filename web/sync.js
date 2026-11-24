// GitHub 저장소 동기화
// 본인 GitHub의 비공개 저장소에 기록 파일(JSON) 하나를 두고, 모든 기기가 이 파일을 읽고 병합해서 다시 쓴다.
// 저장할 때마다 커밋이 하나씩 남으므로 GitHub에서 이전 버전을 언제든 되돌려 볼 수 있다.

import { APP_ID, SCHEMA_VERSION, normalizeState, mergeStates, canonical } from './store.js';

const API = 'https://api.github.com';
export const CONFIG_KEY = 'lanelog:sync';
export const DEFAULT_REPO = 'lanelog-data';
export const DEFAULT_PATH = 'lanelog.json';

export class SyncError extends Error {
  constructor(message, code = 'error') { super(message); this.code = code; }
}

// ---------- 설정 (이 기기에만 저장) ----------

export function loadSyncConfig(storage) {
  try {
    const c = JSON.parse(storage.getItem(CONFIG_KEY) || 'null');
    if (c && c.owner && c.repo && c.token) return { path: DEFAULT_PATH, ...c };
  } catch { /* 무시 */ }
  return null;
}
export const saveSyncConfig = (cfg, storage) => storage.setItem(CONFIG_KEY, JSON.stringify(cfg));
export const clearSyncConfig = storage => storage.removeItem(CONFIG_KEY);

export function cleanConfig({ owner, repo, token, path }) {
  return {
    owner: String(owner || '').trim().replace(/^@/, '').replace(/^https?:\/\/github\.com\//, '').split('/')[0],
    repo: String(repo || DEFAULT_REPO).trim(),
    token: String(token || '').trim(),
    path: String(path || DEFAULT_PATH).trim().replace(/^\/+/, ''),
  };
}

export function validateConfig(cfg) {
  if (!/^[A-Za-z0-9-]{1,39}$/.test(cfg.owner)) return 'GitHub 아이디를 확인해 주세요.';
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(cfg.repo)) return '저장소 이름을 확인해 주세요.';
  if (!/^(github_pat_|ghp_|gho_)[A-Za-z0-9_]{20,}$/.test(cfg.token)) return '토큰은 github_pat_ 으로 시작해요. 복사한 값을 확인해 주세요.';
  if (!/^[A-Za-z0-9._\-/]{1,200}\.json$/.test(cfg.path)) return '파일 경로는 .json으로 끝나야 해요.';
  return '';
}

// ---------- 다른 기기 연결 링크 ----------
// 형식: <앱 주소>#connect=owner,repo,token[,path]  (토큰이 담기므로 QR로만 보여주는 것을 권장)

export function makeConnectLink(baseUrl, cfg) {
  const parts = [cfg.owner, cfg.repo, cfg.token];
  if (cfg.path !== DEFAULT_PATH) parts.push(cfg.path);
  return `${baseUrl}#connect=${parts.map(encodeURIComponent).join(',')}`;
}

export function parseConnectHash(hash) {
  const m = /^#connect=(.+)$/.exec(hash || '');
  if (!m) return null;
  try {
    const [owner, repo, token, path] = m[1].split(',').map(decodeURIComponent);
    const cfg = cleanConfig({ owner, repo, token, path });
    return validateConfig(cfg) ? null : cfg;
  } catch { return null; }
}

// ---------- UTF-8 ↔ base64 (한글 기록을 그대로 보존) ----------

export function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function decodeBase64Utf8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ---------- GitHub API ----------

async function request(cfg, path, { method = 'GET', body, accept = 'application/vnd.github+json', fetchImpl = globalThis.fetch } = {}) {
  let res;
  try {
    res = await fetchImpl(API + path, {
      method,
      cache: 'no-store',
      headers: { Accept: accept, Authorization: `Bearer ${cfg.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new SyncError('인터넷 연결을 확인해 주세요.', 'offline');
  }
  return res;
}

async function failure(res, fallback) {
  let message = '';
  try { message = (await res.json()).message || ''; } catch { /* 본문 없음 */ }
  if (res.status === 401) return new SyncError('토큰이 올바르지 않거나 만료됐어요. 설정에서 새 토큰으로 다시 연결해 주세요.', 'auth');
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') return new SyncError('GitHub 요청 한도를 넘었어요. 잠시 후 다시 시도해 주세요.', 'ratelimit');
  if (res.status === 403) return new SyncError('토큰에 이 저장소의 Contents 읽기·쓰기 권한이 있는지 확인해 주세요.', 'permission');
  if (res.status === 404) return new SyncError('저장소를 찾을 수 없어요. 아이디·저장소 이름과 토큰의 저장소 접근 범위를 확인해 주세요.', 'notfound');
  return new SyncError(`${fallback} (GitHub ${res.status}${message ? ': ' + message : ''})`, 'http');
}

const repoPath = cfg => `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
const contentsPath = cfg => `${repoPath(cfg)}/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}`;

/** 연결 전에 저장소 접근과 공개 여부를 확인한다. */
export async function checkRepo(cfg, opts = {}) {
  const res = await request(cfg, repoPath(cfg), opts);
  if (!res.ok) throw await failure(res, '저장소를 확인하지 못했어요.');
  const repo = await res.json();
  return { isPrivate: repo.private === true, fullName: repo.full_name, url: repo.html_url };
}

export async function readRemote(cfg, opts = {}) {
  const res = await request(cfg, contentsPath(cfg), opts);
  if (res.status === 404) {
    // 파일이 아직 없을 수도, 저장소에 접근하지 못할 수도 있다. 저장소부터 확인한다.
    await checkRepo(cfg, opts);
    return { state: null, sha: null };
  }
  if (!res.ok) throw await failure(res, '기록 파일을 읽지 못했어요.');
  const meta = await res.json();
  if (Array.isArray(meta)) throw new SyncError('파일 경로가 폴더를 가리켜요. 설정에서 경로를 확인해 주세요.', 'path');
  let text;
  if (meta.encoding === 'base64') {
    text = decodeBase64Utf8(meta.content || '');
  } else {
    // 1MB가 넘는 파일은 내용이 비어서 오므로 원본으로 다시 받는다.
    const raw = await request(cfg, contentsPath(cfg), { ...opts, accept: 'application/vnd.github.raw+json' });
    if (!raw.ok) throw await failure(raw, '기록 파일을 읽지 못했어요.');
    text = await raw.text();
  }
  if (!text.trim()) return { state: null, sha: meta.sha };
  let data;
  try { data = JSON.parse(text); } catch {
    throw new SyncError('GitHub의 기록 파일이 손상됐어요. 저장소의 커밋 기록에서 이전 버전을 확인해 주세요.', 'corrupt');
  }
  return { state: normalizeState(data.state ?? data), sha: meta.sha };
}

export async function writeRemote(cfg, state, sha, message, opts = {}) {
  const file = JSON.stringify({ app: APP_ID, version: SCHEMA_VERSION, savedAt: new Date().toISOString(), state }, null, 2) + '\n';
  const body = { message, content: encodeBase64Utf8(file) };
  if (sha) body.sha = sha;
  const res = await request(cfg, contentsPath(cfg), { ...opts, method: 'PUT', body });
  // 그 사이 다른 기기가 먼저 저장하면 sha가 달라져 409/422가 온다 → 다시 읽어서 병합
  if (res.status === 409 || res.status === 422) return { conflict: true };
  if (!res.ok) throw await failure(res, '기록을 저장하지 못했어요.');
  const data = await res.json();
  return { sha: data.content?.sha ?? null };
}

/**
 * 원격 파일을 읽어 로컬 기록과 병합하고, 달라진 점이 있으면 다시 쓴다.
 * 반환값은 병합된 전체 기록이다.
 */
export async function syncOnce(cfg, local, { device = '', fetchImpl } = {}) {
  const opts = fetchImpl ? { fetchImpl } : {};
  for (let attempt = 0; attempt < 4; attempt++) {
    const remote = await readRemote(cfg, opts);
    const merged = remote.state ? mergeStates(local, remote.state) : normalizeState(local);
    if (!remote.state || canonical(merged) !== canonical(remote.state)) {
      const result = await writeRemote(cfg, merged, remote.sha, `기록 동기화${device ? ' · ' + device : ''}`, opts);
      if (result.conflict) continue;
    }
    return merged;
  }
  throw new SyncError('다른 기기에서 동시에 저장하고 있어요. 잠시 후 다시 시도해 주세요.', 'conflict');
}

export function deviceLabel(ua = globalThis.navigator?.userAgent || '') {
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad/i.test(ua)) return 'iOS';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return '';
}
