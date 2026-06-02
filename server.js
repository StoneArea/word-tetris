const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const https = require('https');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3333;

// --- Firebase 설정 (환경변수 우선, 없으면 로컬 파일) ---
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || 'https://vocatest-generator-default-rtdb.firebaseio.com';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || Buffer.from('QUl6YVN5Q0JBQjBPRWZLUmdKNW9pWklBSEhkalJHcWhjMDZORlVv', 'base64').toString();
const ACADEMY = process.env.ACADEMY || 'SKY영어학원';
const BRANCH = process.env.BRANCH || '수완';
const BASE_PATH = `academies/${ACADEMY}/${BRANCH}`;

// --- 인증 토큰 ---
let idToken = null;
let currentRefreshToken = (process.env.FIREBASE_REFRESH_TOKEN || '').trim();
const LOGIN_CONFIG_PATH = path.join(__dirname, 'login_config.json');

function loadRefreshToken() {
  if (currentRefreshToken) return currentRefreshToken;
  try { return JSON.parse(fs.readFileSync(LOGIN_CONFIG_PATH, 'utf-8')).refresh_token || ''; }
  catch { return ''; }
}
function saveRefreshToken(t) {
  currentRefreshToken = t; // 메모리에 저장 (배포 환경에서도 동작)
  try {
    let c = {}; try { c = JSON.parse(fs.readFileSync(LOGIN_CONFIG_PATH, 'utf-8')); } catch {}
    c.refresh_token = t; fs.writeFileSync(LOGIN_CONFIG_PATH, JSON.stringify(c));
  } catch {} // 읽기전용 파일시스템에서는 무시
}

function refreshIdToken() {
  return new Promise((resolve, reject) => {
    const rt = loadRefreshToken();
    if (!rt) return reject(new Error('No refresh token - env: ' + (process.env.FIREBASE_REFRESH_TOKEN ? 'SET(' + process.env.FIREBASE_REFRESH_TOKEN.length + 'chars)' : 'NOT SET')));
    console.log('Refreshing token, rt length:', rt.length);
    const body = JSON.stringify({ grant_type: 'refresh_token', refresh_token: rt.trim() });
    const req = https.request({
      hostname: 'securetoken.googleapis.com', path: `/v1/token?key=${FIREBASE_API_KEY}`,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.id_token) { idToken = j.id_token; if (j.refresh_token) saveRefreshToken(j.refresh_token); resolve(idToken); }
          else { console.error('Token response:', JSON.stringify(j).slice(0, 200)); reject(new Error('Token refresh failed')); }
        } catch (e) { console.error('Token parse error:', d.slice(0, 200)); reject(e); }
      });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

refreshIdToken().then(() => console.log('Firebase 인증 완료')).catch(e => console.error('Firebase 인증 실패:', e.message));
setInterval(() => refreshIdToken().catch(() => {}), 50 * 60 * 1000);

// --- SQLite (단어 DB) ---
const wordsDb = new Database(path.join(__dirname, 'netutor_words.db'), { readonly: true });

// --- SQLite (랭킹 DB) ---
const rankDb = new Database(path.join(__dirname, 'rankings.db'));
rankDb.exec(`CREATE TABLE IF NOT EXISTS rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, book TEXT, score INTEGER, correct INTEGER, wrong INTEGER,
  max_combo INTEGER, mode TEXT, created_at TEXT
)`);

app.use(express.static('public'));
app.use(express.json());

// --- Firebase fetch ---
function firebaseFetch(fbPath) {
  return new Promise(async (resolve, reject) => {
    if (!idToken) try { await refreshIdToken(); } catch {}
    const auth = idToken ? `?auth=${idToken}` : '';
    https.get(`${FIREBASE_DB_URL}/${fbPath}.json${auth}`, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { const p = JSON.parse(d); resolve(p?.error ? null : p); } catch { resolve(null); } });
    }).on('error', reject);
  });
}

// 학생 캐시 (5분)
let studentsCache = null;
let studentsCacheTime = 0;

async function getStudents() {
  if (studentsCache && Date.now() - studentsCacheTime < 5 * 60 * 1000) return studentsCache;
  const data = await firebaseFetch(`${BASE_PATH}/students`);
  if (!data) return [];
  const students = [];
  for (const [teacher, records] of Object.entries(data)) {
    if (!Array.isArray(records)) continue;
    for (const rec of records) {
      if (!rec || !rec['이름']) continue;
      students.push({
        name: rec['이름'], teacher,
        book: rec['교재'] || '', startDate: rec['시작날짜'] || '',
        startChapter: rec['시작단원'] || '', speed: rec['하루진도'] || '',
        days: rec['요일'] || '', type: rec['유형'] || '',
        zone: rec['구역설정'] || '', overlap: rec['겹침'] || '',
        status: rec['상태'] || '', halfPeriod: rec['절반진도기간'] || '',
        skipPeriod: rec['안보는기간'] || '', note: rec['비고'] || ''
      });
    }
  }
  studentsCache = students;
  studentsCacheTime = Date.now();
  return students;
}

// === API ===

app.get('/api/students', async (req, res) => {
  try { res.json(await getStudents()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/holidays', async (req, res) => {
  try {
    const d = await firebaseFetch(`${BASE_PATH}/settings/holidays`);
    res.json(Array.isArray(d) ? d : []);
  } catch { res.json([]); }
});

app.get('/api/words', (req, res) => {
  const { book, days, types } = req.query;
  if (!book || !days) return res.json([]);
  const dayList = days.split(',').map(Number).filter(n => !isNaN(n));
  if (!dayList.length) return res.json([]);
  const ph = dayList.map(() => '?').join(',');
  let q = `SELECT day, word, meaning, word_type, sentence, sentence_meaning, sentence_answer
            FROM words WHERE book_name = ? AND day IN (${ph})`;
  const params = [book, ...dayList];
  if (types) {
    const tl = types.split(',').filter(Boolean);
    if (tl.length) { q += ` AND word_type IN (${tl.map(() => '?').join(',')})`; params.push(...tl); }
  }
  q += ' ORDER BY day, id';
  res.json(wordsDb.prepare(q).all(...params));
});

app.get('/api/books/:bookName/days', (req, res) => {
  const r = wordsDb.prepare('SELECT MIN(CAST(day AS INTEGER)) as minDay, MAX(CAST(day AS INTEGER)) as maxDay FROM words WHERE book_name = ?').get(req.params.bookName);
  res.json(r || { minDay: 1, maxDay: 1 });
});

// 학생 히스토리 (Firebase)
app.get('/api/history/:name', async (req, res) => {
  try {
    const data = await firebaseFetch(`${BASE_PATH}/history`);
    if (!data) return res.json([]);
    const records = [];
    for (const val of Object.values(data)) {
      if (val?.student?.trim() === req.params.name.trim()) {
        records.push({
          date: val.date, book: val.book,
          chapters: val.chapters_display, options: val.options,
          type: val.test_type, teacher: val.teacher
        });
      }
    }
    records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    res.json(records.slice(0, 50));
  } catch { res.json([]); }
});

// KST 시간 헬퍼
function kstNow() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
function kstToday() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

// 랭킹 저장 (Firebase에 영구 저장)
app.post('/api/rankings', async (req, res) => {
  const { name, book, score, correct, wrong, maxCombo, mode } = req.body;
  if (!name || score == null) return res.status(400).json({ error: 'missing fields' });

  const record = {
    name, book: book || '', score, correct: correct || 0, wrong: wrong || 0,
    max_combo: maxCombo || 0, mode: mode || '', created_at: kstNow(), date: kstToday()
  };

  // SQLite (로컬 캐시)
  rankDb.prepare('INSERT INTO rankings (name, book, score, correct, wrong, max_combo, mode, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(record.name, record.book, record.score, record.correct, record.wrong, record.max_combo, record.mode, record.created_at);

  // Firebase (영구 저장)
  try {
    if (!idToken) await refreshIdToken();
    const body = JSON.stringify(record);
    const url = new URL(`${FIREBASE_DB_URL}/${BASE_PATH}/game_rankings.json?auth=${idToken}`);
    const postReq = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, () => {});
    postReq.write(body); postReq.end();
  } catch {}

  res.json({ ok: true });
});

// 오늘 랭킹 (Firebase에서 조회)
app.get('/api/rankings/today', async (req, res) => {
  const today = kstToday();

  // 먼저 Firebase에서 시도
  try {
    const data = await firebaseFetch(`${BASE_PATH}/game_rankings`);
    if (data) {
      const rows = Object.values(data)
        .filter(r => r && r.date === today)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 30);
      return res.json(rows);
    }
  } catch {}

  // 폴백: 로컬 SQLite
  const rows = rankDb.prepare(
    `SELECT name, book, score, correct, wrong, max_combo, mode, created_at
     FROM rankings WHERE created_at LIKE ? ORDER BY score DESC LIMIT 30`
  ).all(today + '%');
  res.json(rows);
});

app.listen(PORT, () => console.log(`🎮 단어 테트리스: http://localhost:${PORT}`));
