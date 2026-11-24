// 데이터 모델·병합·GitHub 동기화 테스트 (외부 패키지 없음): node scripts/test.mjs
import assert from 'node:assert/strict';
import * as S from '../web/store.js';
import * as Sync from '../web/sync.js';
import { encodeQR } from '../web/qr.js';

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const session = (over = {}) => ({
  ...S.newSession('2026-11-16', 1000),
  strokes: { free: 200, back: 50, breast: 0, other: 0 }, reps: 10, minutes: 35,
  ...over,
});

// ---------- 데이터 모델 ----------

test('날짜 도우미: 월요일 시작 주', () => {
  assert.equal(S.startOfWeek('2026-11-24'), '2026-11-23');
  assert.equal(S.startOfWeek('2026-11-23'), '2026-11-23');
  assert.equal(S.startOfWeek('2026-11-29'), '2026-11-23');
  assert.equal(S.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(S.isValidDate('2026-02-30'), false);
  assert.equal(S.longDate('2026-11-24'), '11월 24일 (화)');
});

test('정규화: 총 거리는 영법 합계, 증상이 있으면 확인 필요', () => {
  const s = S.normalizeSession(session({ total: 9999, symptoms: '어깨 뻐근함', status: '완료' }));
  assert.equal(s.total, 250);
  assert.equal(s.status, '확인 필요');
});

test('정규화: 잘못된 값은 고치거나 버린다', () => {
  const st = S.normalizeState({
    sessions: [
      session({ id: 'a', reps: -5, rpe: 99, tags: ['자유형 호흡', '없는 항목', '자유형 호흡'], sink: '이상한 값' }),
      session({ id: 'a' }), // 중복
      session({ id: 'b', date: '2026-13-01' }), // 잘못된 날짜
      null,
    ],
    reviews: { '2026-11-17': {}, '2026-11-16': { done: true } }, // 17일은 월요일이 아님
  });
  assert.equal(st.sessions.length, 1);
  const [s] = st.sessions;
  assert.equal(s.reps, 0);
  assert.equal(s.rpe, 10);
  assert.deepEqual(s.tags, ['자유형 호흡']);
  assert.equal(s.sink, '미확인');
  assert.deepEqual(Object.keys(st.reviews), ['2026-11-16']);
  assert.throws(() => S.normalizeState({ hello: 1 }));
});

test('통계: 연습 예정은 빠진다', () => {
  const t = S.totals([session(), session({ id: 'p', status: '연습 예정', strokes: { free: 500, back: 0, breast: 0, other: 0 } })].map(S.normalizeSession));
  assert.equal(t.distance, 250);
  assert.equal(t.count, 1);
  assert.equal(t.free, 200);
});

test('백업: 이전 Swimnote 파일과 레인로그 파일을 모두 읽는다', () => {
  const legacy = JSON.stringify({ app: 'swimnote', version: 1, state: { sessions: [{ ...session({ id: 'old' }), createdAt: undefined, updatedAt: undefined, total: 250 }], reviews: {} } });
  const st = S.parseBackup(legacy);
  assert.equal(st.sessions[0].id, 'old');
  assert.equal(st.sessions[0].updatedAt, 0);
  const again = S.parseBackup(S.makeBackup(st));
  assert.equal(S.canonical(again), S.canonical(st));
  assert.throws(() => S.parseBackup('{"app":"other","state":{}}'), /레인로그/);
  assert.throws(() => S.parseBackup('not json'), /JSON/);
});

test('이 기기 저장: 저장한 그대로 불러오고, 이전 Swimnote 저장값도 읽는다', () => {
  const mem = new Map();
  const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) };
  assert.equal(S.loadLocal(storage).sessions.length, 0);
  mem.set('swimnote-personal-v1', JSON.stringify({ state: { sessions: [session({ id: 'legacy' })], reviews: {} }, revision: 3 }));
  assert.equal(S.loadLocal(storage).sessions[0].id, 'legacy');
  const st = S.normalizeState({ sessions: [session({ id: 'x' })], reviews: {} });
  S.saveLocal(st, storage);
  assert.equal(S.loadLocal(storage).sessions[0].id, 'x');
  mem.set(S.STORAGE_KEY, '{broken');
  assert.equal(S.loadLocal(storage).sessions[0].id, 'legacy'); // 손상되면 이전 버전 값으로
  assert.equal(mem.get(`${S.STORAGE_KEY}:corrupt`), '{broken'); // 손상된 원본은 보관
});

// ---------- 병합 ----------

const base = () => S.normalizeState({ sessions: [], reviews: {} });

test('병합: 양쪽 기록을 합치고 최근 수정이 이긴다', () => {
  const a = S.normalizeState({ sessions: [session({ id: '1', memo: 'A', updatedAt: 10 }), session({ id: '2', updatedAt: 5 })], reviews: {} });
  const b = S.normalizeState({ sessions: [session({ id: '1', memo: 'B', updatedAt: 20 }), session({ id: '3', updatedAt: 5 })], reviews: {} });
  const m = S.mergeStates(a, b);
  assert.deepEqual(m.sessions.map(s => s.id).sort(), ['1', '2', '3']);
  assert.equal(m.sessions.find(s => s.id === '1').memo, 'B');
  assert.equal(S.canonical(S.mergeStates(a, b)), S.canonical(S.mergeStates(b, a)), '순서와 무관');
  assert.equal(S.canonical(S.mergeStates(m, m)), S.canonical(m), '여러 번 해도 같음');
});

test('병합: 삭제는 퍼지고, 삭제 뒤에 다시 고친 기록은 남는다', () => {
  const a = S.normalizeState({ sessions: [session({ id: '1', updatedAt: 10 })], reviews: {} });
  const b = S.normalizeState({ sessions: [], reviews: {}, deleted: { 1: 15 } });
  assert.equal(S.mergeStates(a, b).sessions.length, 0);
  const restored = S.normalizeState({ sessions: [session({ id: '1', updatedAt: 20 })], reviews: {} });
  assert.equal(S.mergeStates(restored, b).sessions.length, 1);
});

test('병합: 주간 복기와 설정도 최근 것이 이긴다', () => {
  const a = base(), b = base();
  a.reviews['2026-11-16'] = { ...S.blankReview(), changes: 'A', updatedAt: 1 };
  b.reviews['2026-11-16'] = { ...S.blankReview(), changes: 'B', updatedAt: 2 };
  a.settings = { ...S.defaultSettings(), name: '폰', updatedAt: 5 };
  b.settings = { ...S.defaultSettings(), name: 'PC', updatedAt: 3 };
  const m = S.mergeStates(a, b);
  assert.equal(m.reviews['2026-11-16'].changes, 'B');
  assert.equal(m.settings.name, '폰');
});

// ---------- GitHub 동기화 (가짜 GitHub API) ----------

const TOKEN = 'github_pat_TEST_' + 'x'.repeat(40);
const cfg = { owner: 'me', repo: 'lanelog-data', token: TOKEN, path: 'lanelog.json' };

function fakeGitHub({ isPrivate = true } = {}) {
  const files = new Map();
  let n = 0;
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const handler = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    if (opts.headers?.Authorization !== `Bearer ${TOKEN}`) return json({ message: 'Bad credentials' }, 401);
    const m = new URL(url).pathname.match(/^\/repos\/([^/]+)\/([^/]+)(?:\/contents\/(.+))?$/);
    if (!m || m[1] !== 'me' || m[2] !== 'lanelog-data') return json({ message: 'Not Found' }, 404);
    if (!m[3]) return json({ private: isPrivate, full_name: 'me/lanelog-data', html_url: 'https://github.com/me/lanelog-data' });
    const path = decodeURIComponent(m[3]);
    const file = files.get(path);
    if (method === 'GET') {
      if (!file) return json({ message: 'Not Found' }, 404);
      return json({ type: 'file', encoding: 'base64', content: file.content.replace(/(.{60})/g, '$1\n'), sha: file.sha });
    }
    if (method === 'PUT') {
      const body = JSON.parse(opts.body);
      if (file && body.sha !== file.sha) return json({ message: 'sha mismatch' }, 409);
      if (!file && body.sha) return json({ message: 'sha given for new file' }, 422);
      const sha = `sha${++n}`;
      files.set(path, { content: body.content, sha, message: body.message });
      return json({ content: { sha } }, file ? 200 : 201);
    }
    return json({ message: 'Method not allowed' }, 405);
  };
  const remoteState = () => JSON.parse(Sync.decodeBase64Utf8(files.get('lanelog.json').content)).state;
  return { handler, files, remoteState };
}

test('base64: 한글 기록이 그대로 오간다', () => {
  const s = '호흡이 급해졌어요 🏊 — "따옴표" \n 줄바꿈';
  assert.equal(Sync.decodeBase64Utf8(Sync.encodeBase64Utf8(s)), s);
  const long = '가'.repeat(100000);
  assert.equal(Sync.decodeBase64Utf8(Sync.encodeBase64Utf8(long)), long);
});

test('동기화: 휴대폰과 PC가 같은 기록으로 맞춰진다', async () => {
  const gh = fakeGitHub();
  const phone = S.normalizeState({ sessions: [session({ id: 'phone-1', memo: '폰에서 기록', updatedAt: 100 })], reviews: {} });
  const afterPhone = await Sync.syncOnce(cfg, phone, { device: 'Android', fetchImpl: gh.handler });
  assert.equal(afterPhone.sessions.length, 1);
  assert.match(gh.files.get('lanelog.json').message, /Android/);

  const pc = S.normalizeState({ sessions: [session({ id: 'pc-1', memo: 'PC에서 기록', updatedAt: 200 })], reviews: {} });
  const afterPc = await Sync.syncOnce(cfg, pc, { fetchImpl: gh.handler });
  assert.deepEqual(afterPc.sessions.map(s => s.id).sort(), ['pc-1', 'phone-1']);

  const phoneAgain = await Sync.syncOnce(cfg, afterPhone, { fetchImpl: gh.handler });
  assert.equal(S.canonical(phoneAgain), S.canonical(afterPc));
  assert.equal(S.canonical(gh.remoteState()), S.canonical(afterPc));
});

test('동기화: 바뀐 것이 없으면 다시 쓰지 않는다', async () => {
  const gh = fakeGitHub();
  const st = S.normalizeState({ sessions: [session({ id: 'a', updatedAt: 1 })], reviews: {} });
  await Sync.syncOnce(cfg, st, { fetchImpl: gh.handler });
  const sha = gh.files.get('lanelog.json').sha;
  await Sync.syncOnce(cfg, st, { fetchImpl: gh.handler });
  assert.equal(gh.files.get('lanelog.json').sha, sha);
});

test('동기화: 삭제가 다른 기기에도 반영된다', async () => {
  const gh = fakeGitHub();
  const both = S.normalizeState({ sessions: [session({ id: 'a', updatedAt: 1 }), session({ id: 'b', updatedAt: 1 })], reviews: {} });
  await Sync.syncOnce(cfg, both, { fetchImpl: gh.handler });
  const phone = S.normalizeState({ ...both, sessions: both.sessions.filter(s => s.id !== 'a'), deleted: { a: 50 } });
  await Sync.syncOnce(cfg, phone, { fetchImpl: gh.handler });
  const pc = await Sync.syncOnce(cfg, both, { fetchImpl: gh.handler });
  assert.deepEqual(pc.sessions.map(s => s.id), ['b']);
});

test('동기화: 두 기기가 동시에 저장해도 둘 다 남는다 (충돌 후 재시도)', async () => {
  const gh = fakeGitHub();
  await Sync.syncOnce(cfg, base(), { fetchImpl: gh.handler });
  let injected = false;
  const racing = async (url, opts = {}) => {
    if ((opts.method || 'GET') === 'PUT' && !injected) {
      injected = true; // 이 기기가 쓰기 직전에 다른 기기가 먼저 저장
      await Sync.syncOnce(cfg, S.normalizeState({ sessions: [session({ id: 'other', updatedAt: 7 })], reviews: {} }), { fetchImpl: gh.handler });
    }
    return gh.handler(url, opts);
  };
  const mine = S.normalizeState({ sessions: [session({ id: 'mine', updatedAt: 8 })], reviews: {} });
  const merged = await Sync.syncOnce(cfg, mine, { fetchImpl: racing });
  assert.deepEqual(merged.sessions.map(s => s.id).sort(), ['mine', 'other']);
  assert.deepEqual(gh.remoteState().sessions.map(s => s.id).sort(), ['mine', 'other']);
});

test('동기화: 토큰·저장소 오류를 알아듣게 알려준다', async () => {
  const gh = fakeGitHub();
  await assert.rejects(Sync.syncOnce({ ...cfg, token: 'github_pat_wrong_' + 'y'.repeat(30) }, base(), { fetchImpl: gh.handler }), e => e.code === 'auth');
  await assert.rejects(Sync.syncOnce({ ...cfg, repo: 'nope' }, base(), { fetchImpl: gh.handler }), e => e.code === 'notfound');
  await assert.rejects(Sync.syncOnce(cfg, base(), { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), e => e.code === 'offline');
  assert.equal((await Sync.checkRepo(cfg, { fetchImpl: fakeGitHub({ isPrivate: false }).handler })).isPrivate, false);
});

test('동기화: 손상된 원격 파일은 덮어쓰지 않는다', async () => {
  const gh = fakeGitHub();
  gh.files.set('lanelog.json', { content: Sync.encodeBase64Utf8('{not json'), sha: 'bad' });
  await assert.rejects(Sync.syncOnce(cfg, base(), { fetchImpl: gh.handler }), e => e.code === 'corrupt');
  assert.equal(gh.files.get('lanelog.json').sha, 'bad');
});

test('연결 설정: 입력값 정리와 검증', () => {
  const c = Sync.cleanConfig({ owner: ' https://github.com/me ', repo: ' lanelog-data ', token: ` ${TOKEN} ` });
  assert.equal(c.owner, 'me');
  assert.equal(c.token, TOKEN);
  assert.equal(Sync.validateConfig(c), '');
  assert.match(Sync.validateConfig({ ...c, token: 'abc' }), /github_pat_/);
  assert.match(Sync.validateConfig({ ...c, owner: 'bad id!' }), /아이디/);
});

test('다른 기기 연결 링크: 만들고 다시 읽는다', () => {
  const link = Sync.makeConnectLink('https://me.github.io/lanelog/', cfg);
  assert.ok(link.startsWith('https://me.github.io/lanelog/#connect='));
  assert.deepEqual(Sync.parseConnectHash(new URL(link).hash), cfg);
  const custom = Sync.makeConnectLink('https://x/', { ...cfg, path: 'data/swim.json' });
  assert.equal(Sync.parseConnectHash(new URL(custom).hash).path, 'data/swim.json');
  assert.equal(Sync.parseConnectHash('#/home'), null);
  assert.equal(Sync.parseConnectHash('#connect=a,b,notatoken'), null);
});

test('QR: 연결 링크 크기에 맞는 버전을 고른다', () => {
  const link = Sync.makeConnectLink('https://my-github-id.github.io/lanelog/', { ...cfg, token: 'github_pat_' + 'A'.repeat(82) });
  const { size, version, modules } = encodeQR(link, 'M');
  assert.equal(size, version * 4 + 17);
  assert.ok(version >= 8 && version <= 12, `version ${version}`);
  assert.equal(modules.length, size);
  // 세 모서리의 위치 찾기 패턴
  for (const [x, y] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
    assert.ok(modules[y][x] && modules[y + 6][x + 6] && !modules[y + 1][x + 1] && modules[y + 3][x + 3]);
  }
});

test('기기 이름', () => {
  assert.equal(Sync.deviceLabel('Mozilla/5.0 (Linux; Android 14; SM-S918N)'), 'Android');
  assert.equal(Sync.deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'Windows');
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} 통과`);
