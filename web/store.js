// 레인로그 데이터 모델: 기본값, 정규화(검증), 기기 간 병합, 로컬 저장
// DOM에 의존하지 않으므로 Node 테스트에서도 그대로 불러올 수 있다.

export const APP_ID = 'lanelog';
export const SCHEMA_VERSION = 2;
export const POOL_LENGTH = 25;

export const STATUSES = ['완료', '복습 필요', '진행 중', '연습 예정', '확인 필요'];
export const STATUS_TONE = { '완료': 'green', '복습 필요': 'purple', '진행 중': 'blue', '연습 예정': 'gray', '확인 필요': 'orange' };
export const FOCUS_STATUSES = ['연습 예정', '진행 중', '완료'];

export const STROKES = [
  { key: 'free', name: '자유형' },
  { key: 'back', name: '배영' },
  { key: 'breast', name: '평영' },
  { key: 'other', name: '기타' },
];
export const STROKE_KEYS = STROKES.map(s => s.key);

export const CORES = [
  { key: 'breath', title: '자유형 호흡', icon: 'breath', hint: '호흡 방식과 어려웠던 순간' },
  { key: 'sink', title: '다리 가라앉음', icon: 'legs', hint: '가라앉음을 느낀 정도' },
  { key: 'kick', title: '발차기 타이밍', icon: 'kick', hint: '팔과 발차기의 리듬' },
];
export const CORE_TITLES = CORES.map(c => c.title);

// 저장 값은 이전 버전(Swimnote)과 호환되도록 그대로 두고, 화면에는 짧은 이름을 쓴다.
export const SINK_LEVELS = [
  { value: '미확인', label: '모르겠음' },
  { value: '거의 느끼지 못함', label: '거의 없음' },
  { value: '약간 느낌', label: '약간' },
  { value: '자주 느낌', label: '자주' },
  { value: '계속 느낌', label: '계속' },
];
export const SINK_VALUES = SINK_LEVELS.map(s => s.value);

export const ASSESSMENTS = [
  { value: 'unverified', label: '아직 모름' },
  { value: 'improved', label: '좋아졌어요' },
  { value: 'same', label: '비슷해요' },
  { value: 'harder', label: '어려워졌어요' },
];
export const ASSESSMENT_VALUES = ASSESSMENTS.map(a => a.value);

export const RPE_WORDS = ['', '아주 쉬움', '아주 쉬움', '쉬움', '쉬움', '보통', '보통', '힘듦', '힘듦', '아주 힘듦', '아주 힘듦'];

// ---------- 날짜 (기기 현지 시간 기준, 'YYYY-MM-DD' 문자열) ----------

const pad = n => String(n).padStart(2, '0');
export const toISODate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toISODate(new Date());
export function isValidDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** 0 = 월요일 … 6 = 일요일 */
export const weekday = iso => (new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7;
export const startOfWeek = iso => addDays(iso, -weekday(iso));
export const WEEKDAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];
export const shortDate = iso => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;
export const longDate = iso => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일 (${WEEKDAY_NAMES[weekday(iso)]})`;

// ---------- 기본값 ----------

export function defaultSettings() {
  return {
    name: '',
    routine: { free: 250, back: 0, breast: 0, other: 0, minutes: 30 },
    baseline: { free: '', back: '', breast: '' },
    updatedAt: 0,
  };
}

export function blankState() {
  return { sessions: [], reviews: {}, deleted: {}, settings: defaultSettings() };
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function newSession(date = today(), now = Date.now()) {
  return {
    id: newId(), date, status: '완료',
    strokes: { free: 0, back: 0, breast: 0, other: 0 }, total: 0,
    reps: 0, minutes: 0, rpe: 5,
    breath: '', sink: '미확인', kick: '', difficulty: '', memo: '',
    tags: [], symptoms: '', reflection: '',
    createdAt: now, updatedAt: now,
  };
}

export function blankReview() {
  return {
    changes: '', summary: '',
    focus: [{ title: '', memo: '', status: '연습 예정' }, { title: '', memo: '', status: '연습 예정' }],
    assessments: Object.fromEntries(CORES.map(c => [c.key, { value: 'unverified', note: '' }])),
    done: false, updatedAt: 0,
  };
}

// ---------- 정규화: 외부에서 들어온 값(가져오기, 동기화)을 안전한 형태로 ----------

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, max = 5000) => (typeof v === 'string' ? v.slice(0, max) : '');
const int = (v, max, min = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
const stamp = v => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const sum = obj => Object.values(obj).reduce((a, b) => a + b, 0);

export function normalizeSession(s) {
  if (!isObj(s)) return null;
  const id = str(s.id, 100).trim();
  if (!id || !isValidDate(s.date)) return null;
  const strokes = Object.fromEntries(STROKE_KEYS.map(k => [k, int(s.strokes?.[k], 100000)]));
  const symptoms = str(s.symptoms, 2000);
  let status = STATUSES.includes(s.status) ? s.status : '완료';
  if (symptoms.trim()) status = '확인 필요';
  const tags = Array.isArray(s.tags) ? [...new Set(s.tags.filter(t => CORE_TITLES.includes(t)))] : [];
  return {
    id, date: s.date, status, strokes, total: sum(strokes),
    reps: int(s.reps, 4000), minutes: int(s.minutes, 1440), rpe: int(s.rpe ?? 5, 10, 1),
    breath: str(s.breath, 1000), sink: SINK_VALUES.includes(s.sink) ? s.sink : '미확인',
    kick: str(s.kick, 1000), difficulty: str(s.difficulty), memo: str(s.memo),
    tags, symptoms, reflection: str(s.reflection),
    createdAt: stamp(s.createdAt), updatedAt: stamp(s.updatedAt),
  };
}

export function normalizeReview(r) {
  const base = blankReview();
  if (!isObj(r)) return base;
  const focus = [0, 1].map(i => {
    const f = Array.isArray(r.focus) && isObj(r.focus[i]) ? r.focus[i] : {};
    return { title: str(f.title, 100), memo: str(f.memo, 2000), status: STATUSES.includes(f.status) ? f.status : '연습 예정' };
  });
  const assessments = Object.fromEntries(CORES.map(c => {
    const a = isObj(r.assessments?.[c.key]) ? r.assessments[c.key] : {};
    return [c.key, { value: ASSESSMENT_VALUES.includes(a.value) ? a.value : 'unverified', note: str(a.note, 1000) }];
  }));
  return { changes: str(r.changes, 3000), summary: str(r.summary, 3000), focus, assessments, done: r.done === true, updatedAt: stamp(r.updatedAt) };
}

export function normalizeSettings(s) {
  const d = defaultSettings();
  if (!isObj(s)) return d;
  const routine = isObj(s.routine) ? s.routine : {};
  const baseline = isObj(s.baseline) ? s.baseline : {};
  return {
    name: str(s.name, 40),
    routine: { ...Object.fromEntries(STROKE_KEYS.map(k => [k, int(routine[k] ?? d.routine[k], 100000)])), minutes: int(routine.minutes ?? d.routine.minutes, 1440) },
    baseline: { free: str(baseline.free, 40), back: str(baseline.back, 40), breast: str(baseline.breast, 40) },
    updatedAt: stamp(s.updatedAt),
  };
}

const sortSessions = list => list.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt || a.id.localeCompare(b.id));

/** 형식이 크게 어긋나면 예외, 개별 항목의 사소한 오류는 고치거나 건너뛴다. */
export function normalizeState(input) {
  if (!isObj(input) || !Array.isArray(input.sessions)) throw new Error('레인로그 기록 형식이 아니에요.');
  const seen = new Set();
  const sessions = [];
  for (const raw of input.sessions.slice(0, 10000)) {
    const s = normalizeSession(raw);
    if (s && !seen.has(s.id)) { seen.add(s.id); sessions.push(s); }
  }
  const reviews = {};
  if (isObj(input.reviews)) {
    for (const week of Object.keys(input.reviews).sort()) {
      if (isValidDate(week) && weekday(week) === 0) reviews[week] = normalizeReview(input.reviews[week]);
    }
  }
  const deleted = {};
  if (isObj(input.deleted)) {
    for (const id of Object.keys(input.deleted).sort()) {
      const t = stamp(input.deleted[id]);
      if (id.length <= 100 && t) deleted[id] = t;
    }
  }
  return { sessions: sortSessions(sessions), reviews, deleted, settings: normalizeSettings(input.settings) };
}

/** 비교용 표준 문자열 */
export const canonical = state => JSON.stringify(normalizeState(state));

// ---------- 병합: 두 기기의 기록을 항목 단위로 합친다 ----------
// 같은 기록은 마지막으로 수정한 쪽(updatedAt)이 이기고, 삭제는 삭제 시각이 수정 시각보다 늦을 때만 반영한다.

export function mergeStates(a, b) {
  const deleted = { ...a.deleted };
  for (const [id, t] of Object.entries(b.deleted || {})) deleted[id] = Math.max(deleted[id] || 0, t);

  const byId = new Map();
  for (const s of [...a.sessions, ...b.sessions]) {
    const cur = byId.get(s.id);
    if (!cur || s.updatedAt > cur.updatedAt) byId.set(s.id, s);
  }
  const sessions = [...byId.values()].filter(s => !(deleted[s.id] >= s.updatedAt));

  const reviews = { ...a.reviews };
  for (const [week, r] of Object.entries(b.reviews || {})) {
    if (!reviews[week] || r.updatedAt > reviews[week].updatedAt) reviews[week] = r;
  }

  const settings = (b.settings?.updatedAt || 0) > (a.settings?.updatedAt || 0) ? b.settings : a.settings;
  return normalizeState({ sessions, reviews, deleted, settings });
}

// ---------- 통계 ----------

export const isPerformed = s => s.status !== '연습 예정';

export function totals(list) {
  const t = { distance: 0, reps: 0, minutes: 0, count: 0, free: 0, back: 0, breast: 0, other: 0 };
  for (const s of list) {
    if (!isPerformed(s)) continue;
    t.distance += s.total; t.reps += s.reps; t.minutes += s.minutes; t.count += 1;
    for (const k of STROKE_KEYS) t[k] += s.strokes[k];
  }
  return t;
}

export const sessionsInRange = (state, from, to) => state.sessions.filter(s => s.date >= from && s.date <= to);
export const sessionsInWeek = (state, weekStart) => sessionsInRange(state, weekStart, addDays(weekStart, 6));

// ---------- 백업 파일 ----------

export function makeBackup(state) {
  return JSON.stringify({ app: APP_ID, version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), state }, null, 2);
}

/** 레인로그 백업과 이전 Swimnote 백업을 모두 읽는다. */
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('JSON 파일을 읽지 못했어요.'); }
  if (!isObj(data) || !['lanelog', 'swimnote'].includes(data.app) || !isObj(data.state)) {
    throw new Error('레인로그(또는 이전 Swimnote)에서 내보낸 파일을 선택해 주세요.');
  }
  return normalizeState(data.state);
}

// ---------- 이 기기 저장소 ----------

export const STORAGE_KEY = 'lanelog:v2';
const LEGACY_KEY = 'swimnote-personal-v1';

export function loadLocal(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw) {
    try { return normalizeState(JSON.parse(raw)); } catch {
      // 손상된 값은 덮어쓰기 전에 따로 보관해 둔다 (동기화를 켰다면 GitHub에서 다시 받아온다)
      try { storage.setItem(`${STORAGE_KEY}:corrupt`, raw); } catch { /* 공간 부족 */ }
    }
  }
  try {
    const legacy = storage.getItem(LEGACY_KEY);
    if (legacy) return normalizeState(JSON.parse(legacy).state);
  } catch { /* 이전 버전 값도 손상 */ }
  return blankState();
}

export function saveLocal(state, storage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}
