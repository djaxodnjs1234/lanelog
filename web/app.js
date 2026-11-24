// 레인로그 화면 — 모바일(안드로이드) 우선
import * as S from './store.js';
import * as Sync from './sync.js';
import { qrSVG } from './qr.js';

const APP_VERSION = '1.0.0';
const BUILD = '__BUILD__';

// ---------- 저장 공간 (사생활 보호 모드처럼 막혀 있으면 메모리로 대체) ----------
let storageVolatile = false;
const storage = (() => {
  try {
    const ls = window.localStorage;
    ls.setItem('lanelog:probe', '1');
    ls.removeItem('lanelog:probe');
    return ls;
  } catch {
    storageVolatile = true;
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  }
})();

// ---------- 상태 ----------
let state = S.loadLocal(storage);
let demoBackup = null;
let view = 'home';
let lastRenderedView = '';
let weekOffset = 0;
let search = '', filterStatus = '', filterTag = '';
let sheet = null;
let sheetClosing = false;
let pendingRender = false;
let mainStale = false;
let syncConfig = Sync.loadSyncConfig(storage);
let syncState = { status: 'idle', message: '', lastSyncedAt: Number(storage.getItem('lanelog:last-sync')) || 0 };
let installPrompt = null;
let pendingConnect = null;
let currentDay = S.today();

// ---------- 유틸 ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => Number(n || 0).toLocaleString('ko-KR');
const dist = m => (m >= 10000 ? `${(m / 1000).toFixed(1).replace(/\.0$/, '')}km` : `${num(m)}m`);
const toInt = v => Math.max(0, Math.round(Number(v) || 0));
const text = v => String(v ?? '').trim();
const routineTotal = () => S.STROKE_KEYS.reduce((a, k) => a + state.settings.routine[k], 0);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isTypingInMain = () => {
  const a = document.activeElement;
  return !!(a && $('#main')?.contains(a) && a.matches('input, textarea, select'));
};

const ICONS = {
  home: 'M3.5 10.5 12 4l8.5 6.5M6 9.5V20h4.5v-5.5h3V20H18V9.5',
  book: 'M4 3h13a3 3 0 0 1 3 3v15H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3M7 3v18M11 8h5M11 12h5',
  calendar: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M8 13h2M14 13h2M8 17h2',
  settings: 'M4 6h3M11 6h9M7 6a2 2 0 1 0 4 0 2 2 0 1 0-4 0M4 12h9M17 12h3M13 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0M4 18h2M10 18h10M6 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  target: 'M20 11a8 8 0 1 1-7-7M16 2v6h6M16 8l-5 5M14 12a3 3 0 1 1-3-3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  chevron: 'm9 5 7 7-7 7',
  left: 'm15 5-7 7 7 7',
  clock: 'M12 7.5V12l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  wave: 'M2 9q2.5-3 5 0t5 0 5 0 5 0M2 15q2.5-3 5 0t5 0 5 0 5 0',
  repeat: 'M4 10a5 5 0 0 1 5-5h10M16 2l3 3-3 3M20 14a5 5 0 0 1-5 5H5M8 16l-3 3 3 3',
  download: 'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5',
  upload: 'M12 16V3M7 8l5-5 5 5M4 16v5h16v-5',
  close: 'M6 6l12 12M18 6 6 18',
  search: 'M21 21l-4.5-4.5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0',
  breath: 'M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h5',
  legs: 'm9 3 1 7-5 5 3 6M14 3v9l5 6-3 3',
  kick: 'm6 4 7 6-3 5 8 4M13 10l5-6M3 11l3 3M3 18h4',
  check: 'm5 12.5 4.5 4.5L19 7',
  edit: 'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17zM14.5 7.5l3 3',
  info: 'M12 11v6M12 7.5h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  flag: 'M5 22V3q5-3 9 0t7 0v10q-4 3-8 0t-8 0',
  note: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h3',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18h2',
  phone: 'M8 2.5h8a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2zM11 18.5h2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0',
  cloud: 'M7 19h10.5a4.5 4.5 0 0 0 .6-8.96A6.5 6.5 0 0 0 5.6 10.1 4.5 4.5 0 0 0 7 19z',
  cloudOk: 'M7 19h10.5a4.5 4.5 0 0 0 .6-8.96A6.5 6.5 0 0 0 5.6 10.1 4.5 4.5 0 0 0 7 19zM9.5 14.2l2 2 3.6-3.7',
  cloudOff: 'M3 3l18 18M9 6.3A6.5 6.5 0 0 1 18.1 10a4.5 4.5 0 0 1 2.4 7.6M16.5 19H7a4.5 4.5 0 0 1-1.4-8.9 6.5 6.5 0 0 1 .5-1.6',
  cloudAlert: 'M7 19h10.5a4.5 4.5 0 0 0 .6-8.96A6.5 6.5 0 0 0 5.6 10.1 4.5 4.5 0 0 0 7 19zM12 11v3.5M12 16.8h.01',
  sync: 'M20 12a8 8 0 0 0-14.3-4.9M4 4v4h4M4 12a8 8 0 0 0 14.3 4.9M20 20v-4h-4',
};
const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name] || ICONS.wave}"/></svg>`;
const BRAND_MARK = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 12.5q3-3.5 6 0t6 0 6 0 6 0M4 20.5q3-3.5 6 0t6 0 6 0 6 0"/></svg>';

const pill = status => `<span class="pill ${S.STATUS_TONE[status] || 'gray'}">${esc(status)}</span>`;
const ASSESS_TONE = { improved: 'green', same: 'blue', harder: 'orange', unverified: 'gray' };
const chipRadio = (name, value, label, checked) =>
  `<label class="chip-opt"><input type="radio" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''}><span>${esc(label)}</span></label>`;
const chipCheck = (name, value, label, checked) =>
  `<label class="chip-opt"><input type="checkbox" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''}><span>${esc(label)}</span></label>`;

function deltaText(d, unit, prefix = '지난주보다') {
  if (d === 0) return `${prefix} <b>같아요</b>`;
  return `${prefix} <b>${d > 0 ? '+' : '−'}${num(Math.abs(d))}${unit}</b>`;
}

function relTime(ts) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function newSessionFor(date) {
  const s = S.newSession(date);
  if (date > S.today()) s.status = '연습 예정';
  return s;
}

// ---------- 저장 ----------

function commit(mutate, { render: rerender = true } = {}) {
  const next = structuredClone(state);
  mutate(next);
  state = S.normalizeState(next);
  if (!demoBackup) {
    try { S.saveLocal(state, storage); }
    catch { snack('이 기기에 저장하지 못했어요. 저장 공간을 확인해 주세요.'); }
    scheduleSync();
  }
  if (rerender) render();
}

// ---------- 화면 골격 ----------

const TABS = [
  ['home', 'home', '홈'],
  ['records', 'book', '기록'],
  ['week', 'calendar', '주간'],
  ['settings', 'settings', '설정'],
];
const TITLES = { home: '', records: '연습 기록', week: '주간 복기', settings: '설정' };

function renderShell() {
  $('#nav').innerHTML =
    `<a class="nav-brand" href="#/home" data-tab="home"><span class="brand-mark">${BRAND_MARK}</span>레인로그</a>` +
    TABS.map(([id, ic, label]) => `<a class="nav-item" href="#/${id}" data-tab="${id}"><span class="nav-icon">${icon(ic)}</span><span>${label}</span></a>`).join('') +
    `<button class="btn primary nav-cta" data-action="new">${icon('plus')}연습 기록하기</button>`;
  $('#fab').innerHTML = `${icon('plus')}<span>기록하기</span>`;
}

function parseView() {
  const m = /^#\/(\w+)/.exec(location.hash);
  return m && TABS.some(t => t[0] === m[1]) ? m[1] : 'home';
}

function render() {
  flushAutosave();
  pendingRender = false;
  mainStale = false;
  currentDay = S.today();
  document.body.dataset.view = view;
  $('#title').innerHTML = view === 'home'
    ? `<span class="brand"><span class="brand-mark">${BRAND_MARK}</span>레인로그</span>`
    : esc(TITLES[view]);
  $$('[data-tab]').forEach(a => {
    const on = a.dataset.tab === view && a.classList.contains('nav-item');
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const main = $('#main');
  const body = { home: viewHome, records: viewRecords, week: viewWeek, settings: viewSettings }[view]();
  main.innerHTML = demoBanner() + body;
  main.classList.toggle('enter', lastRenderedView !== view);
  lastRenderedView = view;
  renderSyncButton();
}

/** 입력 중이거나 시트가 열려 있으면 다시 그리기를 미룬다. */
function softRender() {
  if (sheet || isTypingInMain()) { pendingRender = true; return; }
  render();
}

function demoBanner() {
  return demoBackup
    ? `<div class="demo-banner">${icon('info')}<span class="grow">예시 화면이에요. 여기서 바꾼 내용은 저장되지 않아요.</span><button class="btn small" data-action="demo-exit">닫기</button></div>`
    : '';
}

// ---------- 홈 ----------

function viewHome() {
  const t = S.today(), ws = S.startOfWeek(t);
  const a = S.totals(S.sessionsInWeek(state, ws));
  const b = S.totals(S.sessionsInWeek(state, S.addDays(ws, -7)));
  const name = state.settings.name;
  const out = [`<div class="greeting"><p>${S.longDate(t)}</p><h2>${name ? `${esc(name)}님, ` : ''}오늘도 한 레인씩</h2></div>`];
  if (installPrompt && !isStandalone() && storage.getItem('lanelog:install-dismissed') !== '1') out.push(installCard());
  const draft = loadDraft();
  if (draft?.isNew) {
    out.push(`<button class="card draft-card" data-action="resume-draft">${icon('edit')}<span class="grow"><strong>작성 중인 기록이 있어요</strong><small>${S.longDate(draft.values.date)} · 이어서 쓰기</small></span>${icon('chevron')}</button>`);
  }
  if (!state.sessions.length) { out.push(welcomeCard()); return out.join(''); }
  out.push(todayCard(t), weekCard(ws, a, b), focusCard(ws), coreCard(), recentCard());
  return out.join('');
}

function installCard() {
  return `<section class="card install-card"><span class="soft-icon">${icon('phone')}</span><div class="grow"><strong>홈 화면에 설치하기</strong><small>앱처럼 바로 열고, 인터넷이 없어도 기록할 수 있어요.</small></div><button class="btn primary small" data-action="install">설치</button><button class="icon-btn" data-action="install-dismiss" aria-label="설치 안내 닫기">${icon('close')}</button></section>`;
}

function welcomeCard() {
  return `<section class="card welcome">
    <div class="welcome-art" aria-hidden="true">${poolArt()}</div>
    <h2>첫 기록을 남겨 볼까요?</h2>
    <p>수영을 마치고 거리와 시간만 적어도 충분해요.<br>호흡·발차기처럼 물속에서 느낀 점은 생각날 때 더하면 돼요.</p>
    <button class="btn primary lg" data-action="new">${icon('plus')}첫 연습 기록하기</button>
    <button class="btn text" data-action="demo">예시 화면 먼저 둘러보기</button>
    ${!syncConfig && !demoBackup ? `<p class="foot-note">다른 기기에서 쓰던 기록이 있다면 <a class="link" href="#/settings" data-tab="settings">설정 › 기기 간 동기화</a>에서 연결하세요.</p>` : ''}
  </section>`;
}

function todayCard(t) {
  const todays = state.sessions.filter(s => s.date === t);
  const done = todays.filter(S.isPerformed);
  const planned = todays.filter(s => !S.isPerformed(s));
  if (done.length) {
    const tt = S.totals(done);
    return `<section class="card today-card done"><span class="today-icon">${icon('check')}</span><div class="grow"><strong>오늘 ${dist(tt.distance)} 수영했어요</strong><small>${tt.minutes ? `${num(tt.minutes)}분 · ` : ''}${done.length > 1 ? `${done.length}번 기록` : '수고했어요!'}</small></div><button class="btn tonal small" data-detail="${esc(done[0].id)}">보기</button></section>`;
  }
  const r = routineTotal();
  const main = planned.length
    ? `<button class="btn primary" data-action="complete-plan" data-id="${esc(planned[0].id)}">${icon('check')}예정한 연습 완료하기</button>`
    : `<button class="btn primary" data-action="new">${icon('plus')}오늘 기록하기</button>`;
  return `<section class="card today-card"><div><strong>오늘 수영했나요?</strong><small>${planned.length ? '오늘 예정한 연습이 있어요. 다녀와서 완료로 바꿔 주세요.' : '수영 직후 1분이면 충분해요.'}</small></div><div class="btn-row">${main}${r ? `<button class="btn tonal" data-action="new-routine">${icon('repeat')}평소 루틴 ${dist(r)}</button>` : ''}</div></section>`;
}

function weekCard(ws, a, b) {
  return `<a class="card week-card" href="#/week" data-tab="week" data-offset="0">
    <div class="card-head"><span class="eyebrow">이번 주 · ${S.shortDate(ws)}–${S.shortDate(S.addDays(ws, 6))}</span><span class="text-link">주간 복기${icon('chevron')}</span></div>
    <div class="hero-number"><b>${num(a.distance)}</b><small>m</small></div>
    <div class="delta">${b.count ? deltaText(a.distance - b.distance, 'm') : '지난주 기록 없음'}</div>
    <div class="mini-stats"><span><b>${a.count}</b>회 연습</span><span><b>${num(a.minutes)}</b>분</span><span>25m <b>${num(a.reps)}</b>회</span></div>
    ${dayBars(ws)}
  </a>`;
}

function stackBar(t, max) {
  if (!t.distance) return '';
  const segs = S.STROKES.filter(s => t[s.key]).map(s => `<span class="seg ${s.key}" style="flex:${t[s.key]}"></span>`).join('');
  return `<div class="bar" style="height:${Math.max(8, (t.distance / max) * 100).toFixed(1)}%">${segs}</div>`;
}

function dayBars(ws) {
  const t = S.today();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = S.addDays(ws, i), list = state.sessions.filter(s => s.date === d);
    return { d, i, tot: S.totals(list), planned: list.some(s => !S.isPerformed(s)) };
  });
  const max = Math.max(250, ...days.map(x => x.tot.distance));
  return `<div class="bars days" role="img" aria-label="요일별 거리">${days.map(x => `<div class="bar-col${x.d === t ? ' is-today' : ''}"><div class="bar-track">${stackBar(x.tot, max)}${x.planned && !x.tot.distance ? '<i class="plan-dot"></i>' : ''}</div><span class="bar-label">${S.WEEKDAY_NAMES[x.i]}</span></div>`).join('')}</div>`;
}

function focusCard(ws) {
  const items = (state.reviews[S.addDays(ws, -7)]?.focus || []).filter(f => f.title);
  const body = items.length
    ? `<div class="focus-list">${items.map((f, i) => `<div class="focus-item"><span class="focus-num">${i + 1}</span><div class="grow"><strong>${esc(f.title)}</strong>${f.memo ? `<p>${esc(f.memo)}</p>` : ''}</div>${pill(f.status)}</div>`).join('')}</div>`
    : `<p class="muted small">지난주 복기에서 이번 주에 집중할 연습을 정해 두면, 수영 가기 전에 여기서 바로 확인할 수 있어요.</p><button class="btn tonal small" data-action="go-week" data-offset="-1">지난주 복기하기</button>`;
  return `<section class="card"><div class="card-head"><h3>${icon('target')}이번 주 집중 연습</h3>${items.length ? `<button class="text-link" data-action="go-week" data-offset="-1">바꾸기</button>` : ''}</div>${body}</section>`;
}

function latestAssessment(key) {
  for (const w of Object.keys(state.reviews).sort().reverse()) {
    const a = state.reviews[w].assessments[key];
    if (a && a.value !== 'unverified') return a;
  }
  return null;
}

function coreCard() {
  const since = S.addDays(S.today(), -27);
  const recent = state.sessions.filter(s => s.date >= since && S.isPerformed(s));
  const rows = S.CORES.map(c => {
    const a = latestAssessment(c.key);
    const n = recent.filter(s => s.tags.includes(c.title)).length;
    const label = a ? S.ASSESSMENTS.find(x => x.value === a.value).label : '아직 모름';
    return `<div class="core-row"><span class="soft-icon">${icon(c.icon)}</span><div class="grow"><strong>${c.title}</strong><small>${n ? `최근 4주 ${n}번 신경 썼어요` : '최근 4주 기록 없음'}</small></div><span class="pill ${a ? ASSESS_TONE[a.value] : 'gray'}">${label}</span></div>`;
  }).join('');
  return `<section class="card"><div class="card-head"><h3>${icon('wave')}집중하고 있는 세 가지</h3></div><div class="core-list">${rows}</div><p class="foot-note">주간 복기에서 직접 느낀 변화를 고르면 여기에 표시돼요.</p></section>`;
}

const strokeSummary = s => S.STROKES.filter(x => s.strokes[x.key]).map(x => `${x.name} ${num(s.strokes[x.key])}m`).join(' · ');

function recordRow(s) {
  const title = s.tags.length ? s.tags.join(' · ') : strokeSummary(s) || '수영 연습';
  const snippet = s.difficulty || s.memo || s.reflection || (s.tags.length ? strokeSummary(s) : '') || (s.minutes ? `${s.minutes}분 연습` : '');
  return `<button class="record" data-detail="${esc(s.id)}">
    <span class="record-date${s.date === S.today() ? ' is-today' : ''}"><small>${Number(s.date.slice(5, 7))}월</small><b>${Number(s.date.slice(8))}</b><small>${S.WEEKDAY_NAMES[S.weekday(s.date)]}</small></span>
    <span class="record-body"><span class="record-title">${esc(title)}</span>${snippet ? `<span class="record-snippet">${esc(snippet)}</span>` : ''}</span>
    <span class="record-side"><b>${num(s.total)}<small>m</small></b>${s.status !== '완료' ? pill(s.status) : ''}</span>
  </button>`;
}

function recentCard() {
  return `<section class="card list-card"><div class="card-head"><h3>${icon('book')}최근 기록</h3><a class="text-link" href="#/records" data-tab="records">전체 ${state.sessions.length}개${icon('chevron')}</a></div><div class="record-list">${state.sessions.slice(0, 3).map(recordRow).join('')}</div></section>`;
}

function poolArt() {
  return `<svg viewBox="0 0 360 140" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="pool-water" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--water-1)"/><stop offset="1" style="stop-color:var(--water-2)"/></linearGradient></defs>
    <rect width="360" height="140" fill="url(#pool-water)"/>
    <g style="stroke:var(--water-line)" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round" fill="none"><path d="M0 35h360M0 70h360M0 105h360"/></g>
    <g style="stroke:var(--water-wave)" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".9"><path d="M40 54q10-8 20 0t20 0 20 0"/><path d="M230 88q10-8 20 0t20 0 20 0 20 0"/><path d="M150 122q8-6 16 0t16 0"/></g>
    <g transform="translate(176 66)"><ellipse rx="26" ry="9" style="fill:var(--water-swimmer)" opacity=".18"/><circle cx="18" cy="-2" r="7" style="fill:var(--water-swimmer)"/><path d="M-26 0q8-6 16 0t16 0" style="stroke:var(--water-swimmer)" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M10 -6l-14-10" style="stroke:var(--water-swimmer)" stroke-width="4" stroke-linecap="round"/></g>
  </svg>`;
}

// ---------- 기록 ----------

function viewRecords() {
  if (!state.sessions.length) {
    return `<div class="empty card">${icon('book')}<strong>아직 남긴 기록이 없어요</strong><p>오늘 물속에서 느낀 점부터 가볍게 남겨 보세요.</p><button class="btn primary" data-action="new">${icon('plus')}첫 연습 기록하기</button></div>`;
  }
  return `<div class="records-top">
      <div class="search-field">${icon('search')}<input id="search" type="search" enterkeyhint="search" autocomplete="off" placeholder="어려웠던 점, 호흡, 메모 검색" value="${esc(search)}" aria-label="기록 검색"></div>
      <div class="chip-scroll" role="toolbar" aria-label="기록 필터">
        ${['', '복습 필요', '확인 필요', '연습 예정'].map(st => `<button class="chip${filterStatus === st ? ' on' : ''}" data-filter-status="${st}" aria-pressed="${filterStatus === st}">${st || '전체'}</button>`).join('')}
        <span class="chip-divider" aria-hidden="true"></span>
        ${S.CORES.map(c => `<button class="chip${filterTag === c.title ? ' on' : ''}" data-filter-tag="${c.title}" aria-pressed="${filterTag === c.title}">${c.title}</button>`).join('')}
      </div>
    </div>
    <div id="records-results">${recordsResults()}</div>`;
}

function recordsResults() {
  const q = search.trim().toLowerCase();
  const list = state.sessions.filter(s =>
    (!filterStatus || s.status === filterStatus) &&
    (!filterTag || s.tags.includes(filterTag)) &&
    (!q || [s.difficulty, s.memo, s.breath, s.kick, s.reflection, s.symptoms, s.tags.join(' '), s.date].join(' ').toLowerCase().includes(q)));
  if (!list.length) {
    return `<div class="empty">${icon('search')}<p>조건에 맞는 기록이 없어요.</p><button class="btn tonal small" data-action="clear-filter">필터 지우기</button></div>`;
  }
  const t = S.totals(list);
  const filtered = q || filterStatus || filterTag;
  const groups = new Map();
  for (const s of list) {
    const k = s.date.slice(0, 7);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  return `<p class="result-summary">${filtered ? `${list.length}개 찾음` : `전체 ${list.length}개`} · 누적 ${dist(t.distance)} · ${num(t.minutes)}분</p>` +
    [...groups].map(([month, items]) => {
      const mt = S.totals(items);
      return `<section class="month"><h3 class="month-head"><span>${month.slice(0, 4)}년 ${Number(month.slice(5))}월</span><small>${mt.count}회 · ${dist(mt.distance)}</small></h3><div class="card flush record-list">${items.map(recordRow).join('')}</div></section>`;
    }).join('');
}

function setFilterChips() {
  $$('[data-filter-status]').forEach(b => { const on = b.dataset.filterStatus === filterStatus; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  $$('[data-filter-tag]').forEach(b => { const on = b.dataset.filterTag === filterTag; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  const r = $('#records-results');
  if (r) r.innerHTML = recordsResults();
}

// ---------- 주간 ----------

const currentWeekStart = () => S.addDays(S.startOfWeek(S.today()), weekOffset * 7);
function weekName(offset) {
  if (offset === 0) return '이번 주';
  if (offset === -1) return '지난주';
  if (offset === 1) return '다음 주';
  return offset < 0 ? `${-offset}주 전` : `${offset}주 뒤`;
}

function viewWeek() {
  const ws = currentWeekStart(), we = S.addDays(ws, 6), t = S.today();
  const list = S.sessionsInWeek(state, ws);
  const a = S.totals(list), b = S.totals(S.sessionsInWeek(state, S.addDays(ws, -7)));
  const r = S.normalizeReview(state.reviews[ws]);
  const rel = weekName(weekOffset);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = S.addDays(ws, i), ss = list.filter(s => s.date === d), tt = S.totals(ss);
    const cls = [d === t && 'is-today', tt.distance && 'has', ss.length && !tt.count && 'planned'].filter(Boolean).join(' ');
    return `<button class="day ${cls}" data-day="${d}" aria-label="${S.longDate(d)} ${ss.length ? `${num(tt.distance)}m` : '기록 없음, 새 기록'}"><span>${S.WEEKDAY_NAMES[i]}</span><b>${Number(d.slice(8))}</b><small>${tt.distance ? num(tt.distance) : ss.length ? '예정' : '+'}</small></button>`;
  }).join('');
  const stat = (label, key, unit) => `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value"><b>${num(a[key])}</b><small>${unit}</small></span><span class="stat-delta">${b.count ? deltaText(a[key] - b[key], unit, '지난주 대비') : '지난주 기록 없음'}</span></div>`;
  return `
    <div class="week-switch">
      <button class="icon-btn" data-action="week-prev" aria-label="이전 주">${icon('left')}</button>
      <div class="week-label"><strong>${S.shortDate(ws)} – ${S.shortDate(we)}</strong><small>${ws.slice(0, 4)}년 · ${rel}</small></div>
      <button class="icon-btn" data-action="week-next" aria-label="다음 주">${icon('chevron')}</button>
    </div>
    ${weekOffset !== 0 ? `<button class="btn text small back-today" data-action="week-today">${icon('calendar')}이번 주로 돌아가기</button>` : ''}
    <div class="day-strip">${days}</div>
    <section class="card stats-grid">${stat('거리', 'distance', 'm')}${stat('연습', 'count', '회')}${stat('시간', 'minutes', '분')}${stat('25m 반복', 'reps', '회')}</section>
    ${list.length ? `<section class="card list-card"><div class="card-head"><h3>${icon('book')}${rel} 기록</h3></div><div class="record-list">${list.map(recordRow).join('')}</div></section>` : ''}
    ${reviewForm(ws, r, list)}
    ${focusForm(ws, r)}
    ${strokeCard(a)}
    ${sixWeeks(ws)}`;
}

function reviewForm(ws, r, list) {
  const notes = list.filter(s => S.isPerformed(s) && (s.difficulty || s.symptoms));
  return `<form id="review-form" class="card form-card" data-week="${ws}" autocomplete="off">
    <div class="card-head"><h3>${icon('note')}한 주 돌아보기</h3><span class="save-hint" aria-live="polite">자동 저장</span></div>
    ${notes.length ? `<div class="ref-box"><span class="ref-title">이 주 기록에 남긴 어려웠던 점</span>${notes.map(s => `<button type="button" class="ref-item" data-detail="${esc(s.id)}"><b>${S.shortDate(s.date)}</b><span class="grow">${esc(s.difficulty || '(통증·불편함 기록)')}</span>${s.symptoms ? pill('확인 필요') : ''}</button>`).join('')}</div>` : ''}
    <label class="field"><span class="label">지난주와 달라진 점</span><textarea class="input" name="changes" rows="3" maxlength="3000" placeholder="예: 3스트로크 호흡이 조금 편해졌어요">${esc(r.changes)}</textarea></label>
    <label class="field"><span class="label">어려웠던 점 · 다음에 기억할 점</span><textarea class="input" name="summary" rows="3" maxlength="3000" placeholder="예: 50m 후반에 호흡이 급해졌어요">${esc(r.summary)}</textarea></label>
    <div class="field"><span class="label">세 가지는 어땠나요?</span>
      ${S.CORES.map(c => {
        const a = r.assessments[c.key];
        return `<div class="assess"><div class="assess-head">${icon(c.icon)}<strong>${c.title}</strong></div><div class="chips" role="radiogroup" aria-label="${c.title}">${S.ASSESSMENTS.map(x => chipRadio(`assess-${c.key}`, x.value, x.label, a.value === x.value)).join('')}</div><input class="input small" name="note-${c.key}" maxlength="1000" placeholder="그렇게 느낀 이유 (선택)" value="${esc(a.note)}" aria-label="${c.title} 메모"></div>`;
      }).join('')}
    </div>
    <label class="switch-row"><input type="checkbox" name="done"${r.done ? ' checked' : ''}><span class="switch" aria-hidden="true"></span><span>이 주 복기를 마쳤어요</span></label>
  </form>`;
}

function focusForm(ws, r) {
  const nw = S.addDays(ws, 7);
  return `<form id="focus-form" class="card form-card" data-week="${ws}" autocomplete="off">
    <div class="card-head"><h3>${icon('target')}다음 주 집중 연습</h3><span class="save-hint" aria-live="polite">자동 저장</span></div>
    <p class="muted small">${S.shortDate(nw)}–${S.shortDate(S.addDays(nw, 6))}에 집중할 연습을 1–2개만 정해 보세요. 그 주 홈 화면에 보여요.</p>
    ${[0, 1].map(i => {
      const f = r.focus[i];
      return `<div class="focus-edit"><span class="focus-num">${i + 1}</span><div class="grow">
        <input class="input title-input" name="title-${i}" maxlength="100" placeholder="${i ? '두 번째 연습 (선택)' : '예: 3스트로크마다 호흡하기'}" value="${esc(f.title)}" aria-label="집중 연습 ${i + 1}">
        <textarea class="input" name="memo-${i}" rows="2" maxlength="2000" placeholder="방법이나 확인하고 싶은 점" aria-label="집중 연습 ${i + 1} 메모">${esc(f.memo)}</textarea>
        <div class="chips small" role="radiogroup" aria-label="집중 연습 ${i + 1} 진행 상태">${S.FOCUS_STATUSES.map(st => chipRadio(`status-${i}`, st, st, f.status === st)).join('')}</div>
      </div></div>`;
    }).join('')}
  </form>`;
}

function strokeCard(a) {
  if (!a.distance) return '';
  return `<section class="card"><div class="card-head"><h3>${icon('wave')}영법별 거리</h3></div>
    <div class="hbar">${S.STROKES.filter(s => a[s.key]).map(s => `<span class="seg ${s.key}" style="flex:${a[s.key]}"></span>`).join('')}</div>
    <ul class="legend">${S.STROKES.map(s => `<li><i class="dot ${s.key}"></i>${s.name}<b>${num(a[s.key])}m</b><small>${Math.round((a[s.key] / a.distance) * 100)}%</small></li>`).join('')}</ul>
  </section>`;
}

function sixWeeks(ws) {
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const w = S.addDays(ws, (i - 5) * 7);
    return { w, t: S.totals(S.sessionsInWeek(state, w)) };
  });
  const max = Math.max(250, ...weeks.map(x => x.t.distance));
  return `<section class="card"><div class="card-head"><h3>${icon('calendar')}최근 6주 거리</h3></div>
    <div class="bars weeks" role="img" aria-label="최근 6주 주별 거리">${weeks.map(x => `<div class="bar-col${x.w === ws ? ' is-today' : ''}"><span class="bar-value">${x.t.distance ? dist(x.t.distance) : ''}</span><div class="bar-track">${stackBar(x.t, max)}</div><span class="bar-label">${S.shortDate(x.w)}</span></div>`).join('')}</div>
    <ul class="legend compact">${S.STROKES.map(s => `<li><i class="dot ${s.key}"></i>${s.name}</li>`).join('')}</ul>
    <p class="foot-note">연습 예정 기록은 통계에서 빠져요. 거리의 변화가 곧 실력의 변화는 아니에요.</p>
  </section>`;
}

// ---------- 설정 ----------

function stepperRow(name, label, value, step, unit, idPrefix = 'f') {
  const id = `${idPrefix}-${name}`;
  return `<div class="stepper-row"><label for="${id}">${label}</label><div class="stepper">
    <button type="button" class="step-btn" data-step="${name}" data-delta="${-step}" aria-label="${label} ${step}${unit} 줄이기">${icon('minus')}</button>
    <span class="step-input"><input id="${id}" name="${name}" type="number" inputmode="numeric" min="0" step="1" value="${value || ''}" placeholder="0"><span>${unit}</span></span>
    <button type="button" class="step-btn" data-step="${name}" data-delta="${step}" aria-label="${label} ${step}${unit} 늘리기">${icon('plus')}</button>
  </div></div>`;
}

function viewSettings() {
  const st = state.settings, rt = st.routine;
  return `${syncCard()}
    <form id="settings-form" class="card form-card" autocomplete="off">
      <div class="card-head"><h3>${icon('user')}내 정보</h3><span class="save-hint" aria-live="polite">자동 저장</span></div>
      <label class="field"><span class="label">이름</span><input class="input" name="name" maxlength="40" value="${esc(st.name)}" placeholder="홈 화면 인사에 표시돼요"></label>
      <div class="field"><span class="label">평소 루틴</span><p class="hint">기록할 때 ‘평소 루틴’ 버튼을 누르면 이 값이 채워져요.</p>
        ${S.STROKES.map(s => stepperRow(s.key, s.name, rt[s.key], S.POOL_LENGTH, 'm', 'set')).join('')}
        ${stepperRow('minutes', '시간', rt.minutes, 5, '분', 'set')}
      </div>
      <div class="field"><span class="label">나의 시작점</span><p class="hint">처음 시작할 때의 수준을 적어 두는 메모예요. 통계에는 들어가지 않아요.</p>
        ${[['free', '자유형'], ['back', '배영'], ['breast', '평영']].map(([k, n]) => `<label class="inline-field"><span>${n}</span><input class="input" name="baseline-${k}" maxlength="40" value="${esc(st.baseline[k])}" placeholder="예: 25m"></label>`).join('')}
      </div>
    </form>
    <section class="card"><div class="card-head"><h3>${icon('download')}백업</h3></div>
      <p class="muted small">기록 전체를 JSON 파일로 저장하거나, 저장해 둔 파일을 불러와 지금 기록과 합칠 수 있어요. 이전 Swimnote 백업 파일도 불러올 수 있어요.</p>
      <div class="btn-row"><button class="btn tonal" data-action="export">${icon('download')}내보내기</button><label class="btn tonal" tabindex="0">${icon('upload')}가져오기<input type="file" id="import-file" accept="application/json,.json" hidden></label></div>
    </section>
    <section class="card"><div class="card-head"><h3>${icon('phone')}앱</h3></div>
      ${installRow()}
      <button class="list-btn" data-action="demo">${icon('info')}<span class="grow">예시 화면 둘러보기</span>${icon('chevron')}</button>
      <p class="foot-note">레인로그 ${APP_VERSION}${BUILD.startsWith('__') ? ' (개발용)' : ` · ${BUILD}`}${storageVolatile ? '<br><b>이 브라우저는 저장 공간을 막아 두어서, 창을 닫으면 기록이 사라질 수 있어요.</b>' : ''}</p>
    </section>`;
}

function installRow() {
  if (isStandalone()) return `<p class="list-note">${icon('check')}<span>홈 화면 앱으로 실행 중이에요.</span></p>`;
  if (installPrompt) return `<button class="list-btn" data-action="install">${icon('phone')}<span class="grow">홈 화면에 앱 설치</span>${icon('chevron')}</button>`;
  return `<p class="list-note">${icon('phone')}<span>Chrome 메뉴(⋮)에서 <b>홈 화면에 추가</b>를 누르면 앱처럼 쓸 수 있어요.</span></p>`;
}

function syncCard() {
  if (!syncConfig) {
    return `<section class="card sync-card" id="sync"><div class="card-head"><h3>${icon('cloud')}기기 간 동기화</h3><span class="pill gray">꺼짐</span></div>
      <p>지금은 이 기기에만 저장돼요. 본인 GitHub의 비공개 저장소를 연결하면 휴대폰과 PC에서 같은 기록을 볼 수 있어요.</p>
      <button class="btn primary block" data-action="sync-setup">${icon('cloud')}GitHub 동기화 설정하기</button>
      <p class="foot-note">다른 기기에서 이미 연결했다면, 그 기기의 <b>설정 › 다른 기기 연결</b>에 뜨는 QR을 이 기기 카메라로 스캔하세요.</p>
    </section>`;
  }
  const c = syncConfig;
  const status = syncState.status === 'error' ? pill('확인 필요') : syncState.status === 'offline' ? '<span class="pill gray">오프라인</span>' : '<span class="pill green">켜짐</span>';
  return `<section class="card sync-card" id="sync"><div class="card-head"><h3>${icon('cloudOk')}기기 간 동기화</h3>${status}</div>
    <dl class="kv"><dt>저장소</dt><dd><a href="https://github.com/${esc(c.owner)}/${esc(c.repo)}" target="_blank" rel="noopener">${esc(c.owner)}/${esc(c.repo)}</a></dd><dt>마지막 동기화</dt><dd>${syncState.lastSyncedAt ? relTime(syncState.lastSyncedAt) : '아직 없음'}</dd></dl>
    ${syncState.status === 'error' ? `<p class="error-text">${esc(syncState.message)}</p>` : ''}
    <div class="btn-row"><button class="btn tonal" data-action="sync-now">${icon('sync')}지금 동기화</button><button class="btn tonal" data-action="sync-qr">${icon('qr')}다른 기기 연결</button></div>
    <button class="btn text danger small" data-action="sync-disconnect">이 기기에서 연결 해제</button>
  </section>`;
}

// ---------- 시트 (전체 화면/하단 시트) + 안드로이드 뒤로 가기 ----------

// 스낵바가 시트 안에 들어가 있으면 시트 내용을 바꾸기 전에 꺼내 둔다.
// 시트에서만 의미 있는 안내(예: '새로 쓰기')는 시트가 바뀌거나 닫히면 함께 숨긴다.
function rescueSnackbar() {
  const el = $('#snackbar');
  if (!el) return;
  if (el.dataset.bound) { el.classList.remove('show'); el.dataset.bound = ''; }
  if (el.parentElement !== document.body) document.body.append(el);
}

function openSheet(type, html, { full = false, id = null } = {}) {
  flushAutosave();
  rescueSnackbar();
  const dlg = $('#sheet');
  dlg.className = `sheet${full ? ' full' : ''}`;
  dlg.innerHTML = html;
  if (!sheet) history.pushState({ sheet: true }, '');
  sheet = { type, id, dirty: false };
  if (!dlg.open) dlg.showModal();
  dlg.focus({ preventScroll: true }); // 첫 버튼에 포커스 테두리가 생기거나 키보드가 바로 뜨지 않도록
  $('.sheet-body', dlg)?.scrollTo(0, 0);
}

function closeSheet({ force = false } = {}) {
  if (!sheet) return;
  flushAutosave();
  if (!force && sheet.dirty && !confirm('저장하지 않은 내용이 있어요. 닫을까요?')) return;
  if (sheet.type === 'editor') clearDraft();
  sheet.dirty = false;
  if (history.state?.sheet) { sheetClosing = true; history.back(); } // popstate에서 마무리
  else finishClose();
}

function finishClose() {
  const dlg = $('#sheet');
  sheet = null;
  sheetClosing = false;
  pendingConnect = null;
  rescueSnackbar();
  if (dlg.open) dlg.close();
  dlg.innerHTML = '';
  if (pendingRender || mainStale) render();
}

window.addEventListener('popstate', () => {
  if (sheet) {
    if (sheet.dirty && !confirm('저장하지 않은 내용이 있어요. 닫을까요?')) { history.pushState({ sheet: true }, ''); return; }
    if (sheet.type === 'editor' && sheet.dirty) clearDraft();
    finishClose();
    return;
  }
  const v = parseView();
  if (v !== view) { view = v; render(); window.scrollTo(0, 0); }
});
window.addEventListener('hashchange', () => {
  if (sheet) return;
  const v = parseView();
  if (v !== view) { view = v; render(); window.scrollTo(0, 0); }
});

function goTab(tab) {
  if (tab === view) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  flushAutosave();
  const url = `#/${tab}`;
  if (tab === 'home') {
    if (history.state?.fromHome) { history.back(); return; }
    history.replaceState(null, '', url);
  } else if (view === 'home') {
    history.pushState({ fromHome: true }, '', url);
  } else {
    history.replaceState({ fromHome: !!history.state?.fromHome }, '', url);
  }
  view = tab;
  render();
  window.scrollTo(0, 0);
}

// ---------- 기록 입력 ----------

const DRAFT_KEY = 'lanelog:draft';
function loadDraft() {
  try {
    const d = JSON.parse(storage.getItem(DRAFT_KEY) || 'null');
    if (d && Date.now() - d.savedAt < 7 * 86400000 && S.isValidDate(d.values?.date)) return d;
  } catch { /* 무시 */ }
  return null;
}
const clearDraft = () => storage.removeItem(DRAFT_KEY);
let draftTimer;
function queueDraft(form) {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    if (!form.isConnected || demoBackup) return;
    try { storage.setItem(DRAFT_KEY, JSON.stringify({ id: form.dataset.id, isNew: form.dataset.new === '1', savedAt: Date.now(), values: readSessionForm(form) })); } catch { /* 무시 */ }
  }, 400);
}

function openEditor(base, { isNew } = {}) {
  if (isNew === undefined) isNew = !state.sessions.some(x => x.id === base.id);
  let s = base;
  let repsAuto = isNew ? true : base.reps === Math.round(base.total / S.POOL_LENGTH);
  let restored = false;
  const draft = demoBackup ? null : loadDraft();
  if (draft && ((isNew && draft.isNew) || (!isNew && draft.id === base.id))) {
    s = { ...base, ...draft.values, id: isNew ? draft.id : base.id };
    repsAuto = draft.values.repsAuto ?? repsAuto;
    restored = true;
  }
  const t = S.today(), y = S.addDays(t, -1), rt = routineTotal();
  const html = `<form id="session-form" class="sheet-form" data-id="${esc(s.id)}" data-new="${isNew ? 1 : 0}" data-reps-auto="${repsAuto ? 1 : 0}" novalidate>
    <header class="sheet-bar"><button type="button" class="icon-btn" data-action="close-sheet" aria-label="닫기">${icon('close')}</button><h2>${isNew ? '연습 기록하기' : '기록 수정'}</h2><span class="bar-spacer"></span></header>
    <div class="sheet-body">
      <section class="group">
        <div class="date-row"><label class="sr-only" for="f-date">날짜</label><input class="input date-input" id="f-date" type="date" name="date" value="${s.date}" required>
          <button type="button" class="chip${s.date === t ? ' on' : ''}" data-date-quick="0">오늘</button><button type="button" class="chip${s.date === y ? ' on' : ''}" data-date-quick="-1">어제</button></div>
        <div class="chips scroll" role="radiogroup" aria-label="상태">${S.STATUSES.map(st => chipRadio('status', st, st, s.status === st)).join('')}</div>
      </section>
      <section class="group">
        <div class="group-head"><h3>거리</h3>${rt ? `<button type="button" class="btn tonal small" data-action="fill-routine">${icon('repeat')}평소 루틴 ${dist(rt)}</button>` : ''}</div>
        ${S.STROKES.map(x => stepperRow(x.key, x.name, s.strokes[x.key], S.POOL_LENGTH, 'm')).join('')}
        <div class="total-line"><span>총 거리</span><span><b id="f-total">${num(S.STROKE_KEYS.reduce((a, k) => a + (s.strokes[k] || 0), 0))}</b>m</span></div>
      </section>
      <section class="group">
        <h3>시간 · 반복</h3>
        ${stepperRow('minutes', '연습 시간', s.minutes, 5, '분')}
        ${stepperRow('reps', '25m 반복', s.reps, 1, '회')}
        <p class="hint" id="reps-hint">${repsHint(repsAuto)}</p>
        <div class="field"><div class="label-row"><label class="label" for="f-rpe">체감 난이도</label><output id="f-rpe-out" class="rpe-out">${s.rpe} · ${S.RPE_WORDS[s.rpe]}</output></div>
          <input id="f-rpe" class="range" type="range" name="rpe" min="1" max="10" step="1" value="${s.rpe}"><div class="range-scale"><span>쉬움</span><span>힘듦</span></div></div>
      </section>
      <section class="group">
        <h3>물속에서 느낀 점 <small>선택</small></h3>
        <div class="field"><span class="label">오늘 신경 쓴 부분</span><div class="chips">${S.CORES.map(c => chipCheck('tags', c.title, c.title, s.tags.includes(c.title))).join('')}</div></div>
        <div class="field"><label class="label" for="f-breath">호흡</label><input class="input" id="f-breath" name="breath" maxlength="1000" value="${esc(s.breath)}" placeholder="예: 오른쪽, 3스트로크에 한 번" enterkeyhint="done">
          <div class="chips quick">${['오른쪽', '왼쪽', '양쪽', '2스트로크', '3스트로크'].map(v => `<button type="button" class="chip small" data-append="${v}">+ ${v}</button>`).join('')}</div></div>
        <div class="field"><span class="label">다리 가라앉음</span><div class="chips" role="radiogroup" aria-label="다리 가라앉음">${S.SINK_LEVELS.map(x => chipRadio('sink', x.value, x.label, s.sink === x.value)).join('')}</div></div>
        <div class="field"><label class="label" for="f-kick">발차기 타이밍</label><input class="input" id="f-kick" name="kick" maxlength="1000" value="${esc(s.kick)}" placeholder="예: 팔 동작과 맞추기 어려웠음" enterkeyhint="done"></div>
        <div class="field"><label class="label" for="f-difficulty">어려웠던 점</label><textarea class="input" id="f-difficulty" name="difficulty" rows="3" maxlength="5000" placeholder="어느 구간에서, 어떤 동작이 어려웠나요?">${esc(s.difficulty)}</textarea></div>
        <div class="field"><label class="label" for="f-memo">메모</label><textarea class="input" id="f-memo" name="memo" rows="3" maxlength="5000" placeholder="기억하고 싶은 내용">${esc(s.memo)}</textarea></div>
      </section>
      <details class="group symptoms"${s.symptoms ? ' open' : ''}><summary>${icon('info')}통증이나 불편함이 있었나요?</summary>
        <textarea class="input" name="symptoms" rows="3" maxlength="2000" placeholder="느낀 그대로 적어 주세요. 없으면 비워 두세요." aria-label="통증이나 불편함">${esc(s.symptoms)}</textarea>
        <p class="hint">적어 두면 ‘확인 필요’로 표시돼요. 통증이 계속되면 무리하지 말고 전문가와 상담하세요.</p></details>
      <p class="form-error" id="form-error" role="alert"></p>
    </div>
    <footer class="sheet-footer"><button type="submit" class="btn primary block lg">${icon('check')}${isNew ? '기록 저장' : '수정 저장'}</button></footer>
  </form>`;
  openSheet('editor', html, { full: true, id: s.id });
  if (restored) {
    sheet.dirty = true;
    snack('작성 중이던 내용을 불러왔어요.', { sheetBound: true, action: '새로 쓰기', onAction: () => { clearDraft(); sheet && (sheet.dirty = false); openEditor(base, { isNew }); } });
  }
}

const repsHint = auto => (auto ? '총 거리에 맞춰 자동으로 계산돼요.' : '직접 입력했어요. <button type="button" class="link" data-action="reps-auto">총 거리로 다시 계산</button>');

function readSessionForm(f) {
  const d = new FormData(f);
  const strokes = Object.fromEntries(S.STROKE_KEYS.map(k => [k, toInt(d.get(k))]));
  return {
    id: f.dataset.id,
    date: String(d.get('date') || ''),
    status: String(d.get('status') || '완료'),
    strokes,
    total: S.STROKE_KEYS.reduce((a, k) => a + strokes[k], 0),
    reps: toInt(d.get('reps')),
    minutes: toInt(d.get('minutes')),
    rpe: Math.min(10, Math.max(1, toInt(d.get('rpe')) || 5)),
    breath: text(d.get('breath')),
    sink: String(d.get('sink') || '미확인'),
    kick: text(d.get('kick')),
    tags: d.getAll('tags').map(String),
    difficulty: text(d.get('difficulty')),
    memo: text(d.get('memo')),
    symptoms: text(d.get('symptoms')),
    repsAuto: f.dataset.repsAuto === '1',
  };
}

function recalcTotal(f) {
  const total = S.STROKE_KEYS.reduce((a, k) => a + toInt(f.elements[k].value), 0);
  $('#f-total').textContent = num(total);
  if (f.dataset.repsAuto === '1') f.elements.reps.value = total ? Math.round(total / S.POOL_LENGTH) : '';
}

function syncDateUI(f) {
  const d = f.elements.date.value, t = S.today();
  const st = f.elements.status.value;
  if (d > t && st !== '연습 예정') f.elements.status.value = '연습 예정';
  else if (d && d <= t && st === '연습 예정') f.elements.status.value = '완료';
  $$('[data-date-quick]', f).forEach(b => b.classList.toggle('on', d === S.addDays(t, Number(b.dataset.dateQuick))));
}

function validateSession(v) {
  if (!S.isValidDate(v.date)) return '날짜를 확인해 주세요.';
  if (v.date > S.today() && v.status !== '연습 예정') return '미래 날짜는 ‘연습 예정’으로만 기록할 수 있어요.';
  const hasAny = v.total || v.minutes || v.reps || v.breath || v.kick || v.difficulty || v.memo || v.symptoms || v.tags.length || v.status === '연습 예정';
  if (!hasAny) return '거리나 시간, 느낀 점 중 하나는 남겨 주세요.';
  return '';
}

function submitSession(f) {
  const v = readSessionForm(f);
  const err = validateSession(v);
  if (err) {
    const el = $('#form-error');
    el.textContent = err;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return;
  }
  const isNew = f.dataset.new === '1';
  const now = Date.now();
  const { repsAuto, ...fields } = v;
  commit(next => {
    const i = next.sessions.findIndex(x => x.id === v.id);
    const prev = i >= 0 ? next.sessions[i] : { ...S.newSession(v.date, now), id: v.id };
    const s = { ...prev, ...fields, status: fields.symptoms ? '확인 필요' : fields.status, updatedAt: now };
    if (i >= 0) next.sessions[i] = s; else next.sessions.push(s);
    delete next.deleted[v.id];
  }, { render: false });
  clearDraft();
  if (sheet) sheet.dirty = false;
  closeSheet({ force: true });
  render();
  if (!isNew) { snack('수정했어요.'); return; }
  if (v.status === '연습 예정') { snack('연습 예정을 저장했어요.'); return; }
  const ws = S.startOfWeek(v.date);
  const count = S.totals(S.sessionsInWeek(state, ws)).count;
  snack(`저장했어요 · ${ws === S.startOfWeek(S.today()) ? '이번 주' : '그 주'} ${count}번째 연습`);
}

// ---------- 기록 상세 ----------

function openDetail(id) {
  const s = state.sessions.find(x => x.id === id);
  if (!s) return;
  const sink = s.sink !== '미확인' ? S.SINK_LEVELS.find(x => x.value === s.sink)?.label : '';
  const rows = [['신경 쓴 부분', s.tags.join(' · ')], ['호흡', s.breath], ['다리 가라앉음', sink], ['발차기', s.kick], ['어려웠던 점', s.difficulty], ['메모', s.memo]].filter(([, v]) => v);
  const html = `<div class="sheet-wrap">
    <header class="sheet-bar"><button type="button" class="icon-btn" data-action="close-sheet" aria-label="닫기">${icon('close')}</button><h2>${S.longDate(s.date)}</h2><button type="button" class="icon-btn" data-action="edit-session" data-id="${esc(s.id)}" aria-label="기록 수정">${icon('edit')}</button></header>
    <div class="sheet-body">
      ${s.symptoms ? `<div class="notice warn">${icon('info')}<div><strong>통증·불편함 기록</strong><p>${esc(s.symptoms)}</p></div></div>` : ''}
      <div class="detail-stats"><div><small>거리</small><b>${num(s.total)}<small>m</small></b></div><div><small>시간</small><b>${s.minutes}<small>분</small></b></div><div><small>25m 반복</small><b>${s.reps}<small>회</small></b></div><div><small>난이도</small><b>${s.rpe}<small>/10</small></b></div></div>
      ${s.total ? `<div class="hbar">${S.STROKES.filter(x => s.strokes[x.key]).map(x => `<span class="seg ${x.key}" style="flex:${s.strokes[x.key]}"></span>`).join('')}</div><ul class="legend compact">${S.STROKES.filter(x => s.strokes[x.key]).map(x => `<li><i class="dot ${x.key}"></i>${x.name} <b>${num(s.strokes[x.key])}m</b></li>`).join('')}</ul>` : ''}
      ${rows.length ? `<dl class="detail-list">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : `<p class="muted small detail-empty">물속에서 느낀 점은 아직 없어요. <button type="button" class="link" data-action="edit-session" data-id="${esc(s.id)}">추가하기</button></p>`}
      <form id="reflect-form" class="reflect" data-id="${esc(s.id)}" autocomplete="off">
        <label class="field"><span class="label">${icon('flag')}다음에 다시 해볼 점</span><textarea class="input" name="reflection" rows="3" maxlength="5000" placeholder="이 연습에서 가져갈 것을 적어 두세요.">${esc(s.reflection)}</textarea></label>
        <div class="field"><span class="label">상태</span><div class="chips" role="radiogroup" aria-label="상태">${S.STATUSES.map(st => chipRadio('status', st, st, s.status === st)).join('')}</div>
        ${s.symptoms ? '<p class="hint">통증·불편함이 적혀 있으면 ‘확인 필요’로 유지돼요.</p>' : ''}</div>
        <p class="save-hint" aria-live="polite">자동 저장</p>
      </form>
      <button type="button" class="btn text danger block" data-action="delete-session" data-id="${esc(s.id)}">${icon('trash')}기록 삭제</button>
    </div></div>`;
  openSheet('detail', html, { id });
}

function deleteSession(id) {
  const s = state.sessions.find(x => x.id === id);
  if (!s) return;
  closeSheet({ force: true });
  commit(next => { next.sessions = next.sessions.filter(x => x.id !== id); next.deleted[id] = Date.now(); });
  snack('기록을 삭제했어요.', {
    action: '되돌리기',
    onAction: () => commit(next => { delete next.deleted[id]; next.sessions.push({ ...s, updatedAt: Date.now() }); }),
  });
}

// ---------- 자동 저장 (주간 복기, 집중 연습, 설정, 상세의 복기) ----------

const autosaveTimers = new Map();
function queueAutosave(form) {
  clearTimeout(autosaveTimers.get(form));
  autosaveTimers.set(form, setTimeout(() => saveForm(form), 600));
  setSaveHint(form, '저장 중…');
}
function flushAutosave() {
  for (const [form, t] of autosaveTimers) { clearTimeout(t); saveForm(form); }
  autosaveTimers.clear();
}
function setSaveHint(form, msg) {
  const el = $('.save-hint', form);
  if (el) el.textContent = msg;
}
function saveForm(form) {
  autosaveTimers.delete(form);
  const d = new FormData(form);
  const now = Date.now();
  if (form.id === 'review-form') {
    const week = form.dataset.week;
    commit(next => {
      const r = S.normalizeReview(next.reviews[week]);
      r.changes = text(d.get('changes'));
      r.summary = text(d.get('summary'));
      r.done = d.has('done');
      for (const c of S.CORES) r.assessments[c.key] = { value: String(d.get(`assess-${c.key}`) || 'unverified'), note: text(d.get(`note-${c.key}`)) };
      r.updatedAt = now;
      next.reviews[week] = r;
    }, { render: false });
  } else if (form.id === 'focus-form') {
    const week = form.dataset.week;
    commit(next => {
      const r = S.normalizeReview(next.reviews[week]);
      r.focus = [0, 1].map(i => ({ title: text(d.get(`title-${i}`)), memo: text(d.get(`memo-${i}`)), status: String(d.get(`status-${i}`) || '연습 예정') }));
      r.updatedAt = now;
      next.reviews[week] = r;
    }, { render: false });
  } else if (form.id === 'settings-form') {
    commit(next => {
      next.settings = {
        name: text(d.get('name')),
        routine: { ...Object.fromEntries(S.STROKE_KEYS.map(k => [k, toInt(d.get(k))])), minutes: toInt(d.get('minutes')) },
        baseline: { free: text(d.get('baseline-free')), back: text(d.get('baseline-back')), breast: text(d.get('baseline-breast')) },
        updatedAt: now,
      };
    }, { render: false });
  } else if (form.id === 'reflect-form') {
    const id = form.dataset.id;
    let blocked = false;
    commit(next => {
      const s = next.sessions.find(x => x.id === id);
      if (!s) return;
      s.reflection = text(d.get('reflection'));
      let st = String(d.get('status') || s.status);
      if (s.symptoms.trim()) st = '확인 필요';
      if (s.date > S.today() && st !== '연습 예정') { st = '연습 예정'; blocked = true; }
      s.status = st;
      s.updatedAt = now;
    }, { render: false });
    if (blocked) { snack('미래 날짜는 ‘연습 예정’으로만 둘 수 있어요.'); if (form.elements.status) form.elements.status.value = '연습 예정'; }
    mainStale = true;
  }
  setSaveHint(form, demoBackup ? '예시 · 저장 안 됨' : '저장됨');
}

// ---------- 동기화 ----------

let syncTimer = null, syncing = false, syncAgain = false;

function setSyncState(status, message = '') {
  syncState.status = status;
  syncState.message = message;
  renderSyncButton();
  if (view === 'settings') softRender();
}

function renderSyncButton() {
  const btn = $('#sync-btn');
  if (!btn) return;
  let ic = 'cloudOk', label = '동기화됨', cls = 'ok';
  if (demoBackup) { ic = 'info'; label = '예시 화면'; cls = 'off'; }
  else if (!syncConfig) { ic = 'phone'; label = '이 기기에 저장'; cls = 'off'; }
  else if (syncState.status === 'syncing' || syncState.status === 'pending') { ic = 'sync'; label = '동기화 중'; cls = 'busy'; }
  else if (syncState.status === 'error') { ic = 'cloudAlert'; label = '확인 필요'; cls = 'error'; }
  else if (syncState.status === 'offline') { ic = 'cloudOff'; label = '오프라인'; cls = 'offline'; }
  btn.className = `sync-btn ${cls}`;
  btn.innerHTML = `${icon(ic)}<span>${label}</span>`;
  btn.setAttribute('aria-label', `동기화 상태: ${label}`);
}

function scheduleSync(delay = 1500) {
  if (!syncConfig || demoBackup) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => runSync(), delay);
  if (syncState.status !== 'syncing') { syncState.status = 'pending'; renderSyncButton(); }
}

async function runSync({ manual = false } = {}) {
  clearTimeout(syncTimer);
  if (!syncConfig || demoBackup) return false;
  if (syncing) { syncAgain = true; return false; }
  if (!navigator.onLine) {
    setSyncState('offline');
    if (manual) snack('오프라인이에요. 연결되면 자동으로 동기화해요.');
    return false;
  }
  syncing = true;
  setSyncState('syncing');
  const snapshot = state;
  const before = S.canonical(snapshot);
  const knownIds = new Set(snapshot.sessions.map(s => s.id));
  try {
    const merged = await Sync.syncOnce(syncConfig, snapshot, { device: Sync.deviceLabel() });
    const changedDuring = state !== snapshot;
    state = S.mergeStates(state, merged);
    S.saveLocal(state, storage);
    syncState.lastSyncedAt = Date.now();
    storage.setItem('lanelog:last-sync', String(syncState.lastSyncedAt));
    setSyncState('ok');
    if (S.canonical(merged) !== before) softRender();
    const added = merged.sessions.filter(s => !knownIds.has(s.id)).length;
    if (manual) snack(added ? `동기화했어요 · 새 기록 ${added}개` : '동기화했어요.');
    else if (added) snack(`다른 기기의 기록 ${added}개를 가져왔어요.`);
    if (changedDuring) syncAgain = true;
    return true;
  } catch (e) {
    setSyncState(e.code === 'offline' ? 'offline' : 'error', e.message);
    if (manual) snack(e.message);
    return false;
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; scheduleSync(400); }
  }
}

function openSyncSetup() {
  if (demoBackup) { snack('예시 화면을 닫은 뒤 설정해 주세요.'); return; }
  const newRepo = `https://github.com/new?name=${Sync.DEFAULT_REPO}&visibility=private&description=${encodeURIComponent('레인로그 동기화 데이터')}`;
  const html = `<form id="sync-form" class="sheet-form" autocomplete="off">
    <header class="sheet-bar"><button type="button" class="icon-btn" data-action="close-sheet" aria-label="닫기">${icon('close')}</button><h2>GitHub 동기화 설정</h2><span class="bar-spacer"></span></header>
    <div class="sheet-body">
      <p class="lead">본인 GitHub 계정의 <b>비공개 저장소</b>에 기록 파일 하나를 두고, 휴대폰과 PC가 이 파일로 기록을 맞춰요. 처음 한 번만 설정하면 돼요.</p>
      <ol class="steps">
        <li><b class="step-title">비공개 저장소 만들기</b><p>이름은 <code>${Sync.DEFAULT_REPO}</code>, 공개 범위는 <b>Private</b>으로 만들어 주세요.</p>
          <a class="btn tonal small" href="${newRepo}" target="_blank" rel="noopener">GitHub에서 만들기${icon('external')}</a></li>
        <li><b class="step-title">토큰 만들기</b><p><b>Repository access</b>는 <b>Only select repositories</b>에서 <code>${Sync.DEFAULT_REPO}</code>만 고르고, <b>Permissions</b>에서 <b>Contents</b>를 <b>Read and write</b>로 바꿔 주세요. 만들어진 <code>github_pat_…</code> 값을 복사하세요.</p>
          <a class="btn tonal small" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">토큰 만들기${icon('external')}</a></li>
        <li><b class="step-title">아래에 입력</b>
          <label class="field"><span class="label">GitHub 아이디</span><input class="input" name="owner" autocapitalize="off" autocorrect="off" spellcheck="false" required placeholder="예: my-github-id"></label>
          <label class="field"><span class="label">저장소 이름</span><input class="input" name="repo" value="${Sync.DEFAULT_REPO}" autocapitalize="off" autocorrect="off" spellcheck="false" required></label>
          <label class="field"><span class="label">토큰</span><input class="input mono" name="token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" required placeholder="github_pat_…"></label>
          <details class="advanced"><summary>고급 설정</summary><label class="field"><span class="label">파일 경로</span><input class="input" name="path" value="${Sync.DEFAULT_PATH}" autocapitalize="off" spellcheck="false"></label></details>
        </li>
      </ol>
      <p class="hint">토큰은 이 기기에만 저장되고 GitHub 말고는 어디에도 보내지 않아요. 저장할 때마다 저장소에 커밋이 남아서 이전 기록으로 되돌릴 수도 있어요.</p>
      <p class="form-error" id="sync-error" role="alert"></p>
    </div>
    <footer class="sheet-footer"><button type="submit" class="btn primary block lg">${icon('cloud')}연결하고 동기화</button></footer>
  </form>`;
  openSheet('sync-setup', html, { full: true });
}

async function connectSync(cfg) {
  const info = await Sync.checkRepo(cfg);
  if (!info.isPrivate && !confirm(`${info.fullName}은(는) 공개 저장소예요. 수영 기록을 누구나 볼 수 있게 돼요.\n비공개 저장소를 권장해요. 그래도 연결할까요?`)) return false;
  const knownIds = new Set(state.sessions.map(s => s.id));
  const merged = await Sync.syncOnce(cfg, state, { device: Sync.deviceLabel() });
  Sync.saveSyncConfig(cfg, storage);
  syncConfig = cfg;
  state = S.mergeStates(state, merged);
  S.saveLocal(state, storage);
  syncState = { status: 'ok', message: '', lastSyncedAt: Date.now() };
  storage.setItem('lanelog:last-sync', String(syncState.lastSyncedAt));
  const added = merged.sessions.filter(s => !knownIds.has(s.id)).length;
  mainStale = true;
  snack(added ? `연결했어요 · GitHub에서 기록 ${added}개를 가져왔어요.` : '연결했어요. 이제 기록이 자동으로 동기화돼요.');
  return true;
}

async function submitConnect(button, cfg, errEl) {
  const label = button.innerHTML;
  button.disabled = true;
  button.textContent = '연결하는 중…';
  errEl.textContent = '';
  try {
    if (await connectSync(cfg)) closeSheet({ force: true });
  } catch (e) {
    errEl.textContent = e.message;
  } finally {
    button.disabled = false;
    button.innerHTML = label;
  }
}

function openConnectSheet(cfg) {
  pendingConnect = cfg;
  const html = `<div class="sheet-wrap">
    <header class="sheet-bar"><button type="button" class="icon-btn" data-action="close-sheet" aria-label="닫기">${icon('close')}</button><h2>이 기기 연결하기</h2><span class="bar-spacer"></span></header>
    <div class="sheet-body">
      <p class="lead">다른 기기에서 보낸 동기화 정보예요. 연결하면 이 기기의 기록과 GitHub의 기록이 합쳐져요.</p>
      <dl class="kv"><dt>저장소</dt><dd>${esc(cfg.owner)}/${esc(cfg.repo)}</dd></dl>
      <p class="form-error" id="connect-error" role="alert"></p>
    </div>
    <footer class="sheet-footer"><button type="button" class="btn primary block lg" data-action="connect-confirm">${icon('cloud')}연결하기</button></footer>
  </div>`;
  openSheet('connect', html);
}

function openQR() {
  const link = Sync.makeConnectLink(location.origin + location.pathname, syncConfig);
  const html = `<div class="sheet-wrap">
    <header class="sheet-bar"><button type="button" class="icon-btn" data-action="close-sheet" aria-label="닫기">${icon('close')}</button><h2>다른 기기 연결</h2><span class="bar-spacer"></span></header>
    <div class="sheet-body center">
      <div class="qr">${qrSVG(link, { label: '다른 기기 연결용 QR 코드' })}</div>
      <p class="lead">연결할 휴대폰의 <b>카메라 앱</b>으로 이 QR을 비추세요. 레인로그가 열리면 ‘연결하기’만 누르면 돼요.</p>
      <div class="notice warn">${icon('info')}<p>QR과 링크에는 동기화 토큰이 들어 있어요. 다른 사람에게 보여 주거나 공유하지 마세요.</p></div>
      <button type="button" class="btn tonal" data-action="copy-link" data-link="${esc(link)}">${icon('copy')}링크 복사</button>
    </div></div>`;
  openSheet('qr', html);
}

// ---------- 백업 ----------

function exportBackup() {
  const blob = new Blob([S.makeBackup(state)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `lanelog-${demoBackup ? 'example-' : ''}${S.today()}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  snack('백업 파일을 저장했어요. 다운로드 폴더를 확인하세요.');
}

async function importBackup(file) {
  try {
    if (demoBackup) throw new Error('예시 화면을 닫은 뒤 가져와 주세요.');
    if (file.size > 5_000_000) throw new Error('5MB 이하의 파일을 선택해 주세요.');
    const incoming = S.parseBackup(await file.text());
    const known = new Set(state.sessions.map(s => s.id));
    const fresh = incoming.sessions.filter(s => !known.has(s.id)).length;
    if (!confirm(`파일에 기록 ${incoming.sessions.length}개가 있어요 (새 기록 ${fresh}개).\n지금 기록과 합칠까요? 같은 기록은 더 최근에 고친 쪽이 남아요.`)) return;
    commit(next => Object.assign(next, S.mergeStates(next, incoming)));
    snack(fresh ? `기록 ${fresh}개를 가져왔어요.` : '가져왔어요. 새로 추가된 기록은 없어요.');
  } catch (e) {
    snack(e.message);
  }
}

// ---------- 예시 화면 ----------

function demoState() {
  const ws = S.startOfWeek(S.today()), t = S.today(), now = Date.now();
  const mk = (offset, free, back, breast, minutes, status, difficulty, tags, extra = {}) => {
    const date = S.addDays(ws, offset);
    const strokes = { free, back, breast, other: 0 };
    const total = free + back + breast;
    return { ...S.newSession(date, now - (14 - offset) * 3600000), strokes, total, reps: Math.round(total / 25), minutes, status: date > t ? '연습 예정' : status, difficulty, tags, breath: '오른쪽, 3스트로크에 한 번', sink: '약간 느낌', kick: '팔 동작에 맞춰 두 번', ...extra };
  };
  const sessions = [
    mk(-12, 200, 50, 0, 35, '완료', '호흡할 때 고개가 많이 들려서 다리가 가라앉았어요.', ['자유형 호흡', '다리 가라앉음']),
    mk(-10, 250, 50, 25, 40, '복습 필요', '배영에서 똑바로 가기가 어려웠어요.', ['다리 가라앉음'], { rpe: 6 }),
    mk(-7, 250, 0, 0, 35, '완료', '후반 50m에서 호흡 간격이 짧아졌어요.', ['자유형 호흡']),
    mk(-5, 300, 50, 0, 40, '완료', '킥판 잡고 발차기 연습. 무릎이 많이 굽혀졌어요.', ['발차기 타이밍'], { rpe: 6 }),
    mk(-3, 250, 50, 25, 45, '복습 필요', '팔 동작과 발차기 리듬을 맞추기 어려웠어요.', ['발차기 타이밍', '자유형 호흡'], { rpe: 7 }),
    mk(0, 300, 50, 0, 40, '완료', '3스트로크 호흡으로 처음 25m를 끝까지 갔어요.', ['자유형 호흡'], { rpe: 6, memo: '물속에서 코로 천천히 내쉬는 게 핵심', reflection: '다음엔 50m 도전' }),
    mk(2, 300, 50, 0, 40, '완료', '', ['자유형 호흡', '발차기 타이밍'], { breath: '', sink: '미확인', kick: '' }),
  ].filter(s => s.date <= S.addDays(t, 3));
  const prev = S.addDays(ws, -7);
  const review = {
    ...S.blankReview(), changes: '호흡할 때 고개를 덜 들게 됐어요.', summary: '후반에 호흡이 급해져요. 천천히 내쉬기!',
    focus: [{ title: '3스트로크 호흡으로 25m 끝까지', memo: '물속에서 코로 길게 내쉬기', status: '진행 중' }, { title: '킥판 발차기 4바퀴', memo: '무릎 덜 굽히기', status: '연습 예정' }],
    assessments: { breath: { value: 'improved', note: '고개가 덜 들림' }, sink: { value: 'unverified', note: '' }, kick: { value: 'same', note: '' } },
    done: true, updatedAt: now,
  };
  return S.normalizeState({ sessions, reviews: { [prev]: review }, deleted: {}, settings: { ...S.defaultSettings(), name: '', baseline: { free: '200m', back: '50m', breast: '25m' } } });
}

function startDemo() {
  if (demoBackup) return;
  flushAutosave();
  if (sheet) closeSheet({ force: true });
  demoBackup = state;
  state = demoState();
  weekOffset = 0;
  if (view !== 'home') goTab('home'); else render();
  window.scrollTo(0, 0);
}

function endDemo() {
  if (!demoBackup) return;
  state = demoBackup;
  demoBackup = null;
  render();
  runSync();
}

// ---------- 스낵바 ----------

let snackTimer;
function snack(message, { action, onAction, timeout = 3500, sheetBound = false } = {}) {
  const el = $('#snackbar');
  el.dataset.bound = sheetBound ? '1' : '';
  const host = $('#sheet').open ? $('#sheet') : document.body;
  if (el.parentElement !== host) host.append(el);
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  const hide = () => el.classList.remove('show');
  if (action) el.querySelector('button').addEventListener('click', () => { hide(); onAction(); }, { once: true });
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(snackTimer);
  snackTimer = setTimeout(hide, action ? Math.max(timeout, 6000) : timeout);
}

// ---------- 이벤트 ----------

document.addEventListener('click', async e => {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    e.preventDefault();
    if (sheet) return;
    if (tab.dataset.offset !== undefined) weekOffset = Number(tab.dataset.offset);
    if (tab.dataset.tab === view) render();
    goTab(tab.dataset.tab);
    return;
  }

  const detail = e.target.closest('[data-detail]');
  if (detail) { openDetail(detail.dataset.detail); return; }

  const day = e.target.closest('[data-day]');
  if (day) {
    const list = state.sessions.filter(s => s.date === day.dataset.day);
    if (list.length) openDetail(list[0].id); else openEditor(newSessionFor(day.dataset.day), { isNew: true });
    return;
  }

  const step = e.target.closest('[data-step]');
  if (step) {
    const input = step.closest('form').elements[step.dataset.step];
    input.value = Math.max(0, toInt(input.value) + Number(step.dataset.delta)) || '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  const quick = e.target.closest('[data-date-quick]');
  if (quick) {
    const f = quick.closest('form');
    f.elements.date.value = S.addDays(S.today(), Number(quick.dataset.dateQuick));
    f.elements.date.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  const append = e.target.closest('[data-append]');
  if (append) {
    const input = append.closest('form').elements.breath;
    const v = append.dataset.append;
    if (!input.value.includes(v)) input.value = input.value.trim() ? `${input.value.trim()}, ${v}` : v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  const fs = e.target.closest('[data-filter-status]');
  if (fs) { filterStatus = fs.dataset.filterStatus; setFilterChips(); return; }
  const ft = e.target.closest('[data-filter-tag]');
  if (ft) { filterTag = filterTag === ft.dataset.filterTag ? '' : ft.dataset.filterTag; setFilterChips(); return; }

  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  switch (a) {
    case 'new': openEditor(newSessionFor(S.today()), { isNew: true }); break;
    case 'new-routine': {
      const s = newSessionFor(S.today());
      const rt = state.settings.routine;
      for (const k of S.STROKE_KEYS) s.strokes[k] = rt[k];
      s.total = routineTotal();
      s.reps = Math.round(s.total / S.POOL_LENGTH);
      s.minutes = rt.minutes;
      openEditor(s, { isNew: true });
      break;
    }
    case 'complete-plan': {
      const s = state.sessions.find(x => x.id === el.dataset.id);
      if (s) openEditor({ ...s, status: '완료' }, { isNew: false });
      break;
    }
    case 'resume-draft': openEditor(newSessionFor(S.today()), { isNew: true }); break;
    case 'close-sheet': closeSheet(); break;
    case 'fill-routine': {
      const f = el.closest('form'), rt = state.settings.routine;
      for (const k of S.STROKE_KEYS) f.elements[k].value = rt[k] || '';
      f.elements.minutes.value = rt.minutes || '';
      f.dataset.repsAuto = '1';
      $('#reps-hint').innerHTML = repsHint(true);
      f.elements.free.dispatchEvent(new Event('input', { bubbles: true }));
      snack('평소 루틴을 채웠어요. 오늘 한 만큼 고쳐 주세요.');
      break;
    }
    case 'reps-auto': {
      const f = el.closest('form');
      f.dataset.repsAuto = '1';
      recalcTotal(f);
      $('#reps-hint').innerHTML = repsHint(true);
      break;
    }
    case 'edit-session': {
      const s = state.sessions.find(x => x.id === el.dataset.id);
      if (s) openEditor(s, { isNew: false });
      break;
    }
    case 'delete-session': deleteSession(el.dataset.id); break;
    case 'go-week': weekOffset = Number(el.dataset.offset || 0); if (view === 'week') render(); else goTab('week'); break;
    case 'week-prev': weekOffset -= 1; render(); break;
    case 'week-next': weekOffset += 1; render(); break;
    case 'week-today': weekOffset = 0; render(); break;
    case 'clear-filter': search = ''; filterStatus = ''; filterTag = ''; render(); break;
    case 'export': exportBackup(); break;
    case 'demo': startDemo(); break;
    case 'demo-exit': endDemo(); break;
    case 'install':
      if (installPrompt) {
        installPrompt.prompt();
        await installPrompt.userChoice.catch(() => null);
        installPrompt = null;
        render();
      }
      break;
    case 'install-dismiss': storage.setItem('lanelog:install-dismissed', '1'); render(); break;
    case 'sync-status':
      if (demoBackup) { snack('예시 화면에서는 동기화하지 않아요.'); break; }
      if (!syncConfig) {
        goTab('settings');
        snack('지금은 이 기기에만 저장돼요. 여기서 동기화를 켤 수 있어요.');
        break;
      }
      runSync({ manual: true });
      break;
    case 'sync-setup': openSyncSetup(); break;
    case 'sync-now': runSync({ manual: true }); break;
    case 'sync-qr': if (syncConfig) openQR(); break;
    case 'copy-link':
      try { await navigator.clipboard.writeText(el.dataset.link); snack('링크를 복사했어요. 본인에게만 보내세요.'); }
      catch { snack('복사하지 못했어요. QR을 이용해 주세요.'); }
      break;
    case 'sync-disconnect':
      if (!confirm('이 기기에서 동기화를 끌까요?\n기록은 이 기기와 GitHub에 그대로 남아요.')) break;
      Sync.clearSyncConfig(storage);
      syncConfig = null;
      syncState = { status: 'idle', message: '', lastSyncedAt: 0 };
      storage.removeItem('lanelog:last-sync');
      render();
      snack('동기화를 껐어요.');
      break;
    case 'connect-confirm':
      if (pendingConnect) await submitConnect(el, pendingConnect, $('#connect-error'));
      break;
  }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'search') {
    search = t.value;
    const r = $('#records-results');
    if (r) r.innerHTML = recordsResults();
    return;
  }
  const form = t.form || t.closest('form');
  if (!form) return;
  if (form.id === 'session-form') {
    if (sheet) sheet.dirty = true;
    const n = t.name;
    if (S.STROKE_KEYS.includes(n)) recalcTotal(form);
    if (n === 'reps') { form.dataset.repsAuto = '0'; $('#reps-hint').innerHTML = repsHint(false); }
    if (n === 'date') syncDateUI(form);
    if (n === 'rpe') $('#f-rpe-out').textContent = `${t.value} · ${S.RPE_WORDS[t.value]}`;
    if (n === 'symptoms' && t.value.trim()) form.elements.status.value = '확인 필요';
    if (n !== 'date' && n !== 'status') $('#form-error').textContent = '';
    queueDraft(form);
    return;
  }
  if (['review-form', 'focus-form', 'settings-form', 'reflect-form'].includes(form.id)) queueAutosave(form);
});

document.addEventListener('change', e => {
  if (e.target.id === 'import-file') {
    const file = e.target.files?.[0];
    if (file) importBackup(file);
    e.target.value = '';
  }
});

document.addEventListener('submit', e => {
  const f = e.target;
  e.preventDefault();
  if (f.id === 'session-form') submitSession(f);
  if (f.id === 'sync-form') {
    const d = new FormData(f);
    const cfg = Sync.cleanConfig({ owner: d.get('owner'), repo: d.get('repo'), token: d.get('token'), path: d.get('path') });
    const err = Sync.validateConfig(cfg);
    if (err) { $('#sync-error').textContent = err; return; }
    submitConnect(f.querySelector('[type="submit"]'), cfg, $('#sync-error'));
  }
});

document.addEventListener('keydown', e => {
  // 입력 칸에서 엔터를 눌러도 기록 전체가 저장되지 않도록 (키보드만 닫는다)
  if (e.key === 'Enter' && e.target.matches('#session-form input:not([type="submit"]), #search')) {
    e.preventDefault();
    e.target.blur();
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('label.btn[tabindex]')) {
    e.preventDefault();
    e.target.querySelector('input[type="file"]')?.click();
  }
});

document.addEventListener('focusout', () => {
  if (!pendingRender) return;
  setTimeout(() => { if (pendingRender && !sheet && !isTypingInMain()) render(); }, 0);
});

// 시트: Esc / 안드로이드 뒤로 가기(닫기 요청)
const dlg = $('#sheet');
dlg.addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });
dlg.addEventListener('close', () => {
  if (!sheet || sheetClosing) return;
  // 브라우저가 직접 닫은 경우: 넣어 둔 기록 항목을 정리
  const hadEntry = history.state?.sheet;
  sheet = null;
  pendingConnect = null;
  rescueSnackbar();
  if (hadEntry) history.back();
  if (pendingRender || mainStale) render();
});
dlg.addEventListener('click', e => {
  if (e.target !== dlg) return;
  const r = dlg.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeSheet();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { flushAutosave(); return; }
  if (S.today() !== currentDay) softRender();
  runSync();
});
window.addEventListener('pagehide', flushAutosave);
window.addEventListener('online', () => runSync());
window.addEventListener('offline', () => { if (syncConfig) setSyncState('offline'); });
setInterval(() => { if (document.visibilityState === 'visible') runSync(); }, 120000);

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; softRender(); });
window.addEventListener('appinstalled', () => { installPrompt = null; snack('홈 화면에 설치했어요.'); softRender(); });

// 다른 탭에서 같은 기기의 기록이 바뀌면 반영
window.addEventListener('storage', e => {
  if (e.key === S.STORAGE_KEY && !demoBackup) { state = S.loadLocal(storage); softRender(); }
  if (e.key === Sync.CONFIG_KEY) { syncConfig = Sync.loadSyncConfig(storage); renderSyncButton(); }
});

// ---------- 서비스 워커 (오프라인 사용, 업데이트 알림) ----------

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  let userAccepted = false;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          snack('새 버전이 준비됐어요.', { action: '새로고침', timeout: 15000, onAction: () => { userAccepted = true; w.postMessage('skip-waiting'); } });
        }
      });
    });
  }).catch(() => { /* 오프라인 기능 없이 동작 */ });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (userAccepted) location.reload(); });
}

// ---------- 시작 ----------

renderShell();
$('#sync-btn').dataset.action = 'sync-status';
$('#fab').dataset.action = 'new';
pendingConnect = Sync.parseConnectHash(location.hash);
if (pendingConnect) history.replaceState(null, '', `${location.pathname}#/settings`);
const wantsNew = new URLSearchParams(location.search).has('new');
if (wantsNew) history.replaceState(null, '', location.pathname + (location.hash || ''));
view = parseView();
render();
if (pendingConnect) {
  const cfg = pendingConnect;
  if (syncConfig && syncConfig.owner === cfg.owner && syncConfig.repo === cfg.repo && syncConfig.token === cfg.token) {
    pendingConnect = null;
    snack('이미 연결된 기기예요.');
  } else openConnectSheet(cfg);
} else if (wantsNew) {
  openEditor(newSessionFor(S.today()), { isNew: true });
}
runSync();
registerServiceWorker();
