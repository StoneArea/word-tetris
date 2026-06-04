// ===== 전역 상태 =====
let allStudents = [];
let selectedStudent = null;
let selectedDays = [];
let selectedMode = null;
let holidays = [];
let currentWords = [];
let studyWords = [];

// ===== 화면 전환 =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ===== 교재명 매핑 =====
const BOOK_MAP = {
  // 어원편
  '어원':'능률VOCA 어원편 (2021 개정)', '어원25':'능률VOCA 어원편 고등 (2025 개정)',
  '어원편고등':'능률VOCA 어원편 고등 (2025 개정)',
  '어원중등25':'능률VOCA 어원편 중등 (2025 개정)', '어원Lite':'능률VOCA 어원편 Lite',
  // 고등
  '고기본':'능률VOCA 고교기본 (2022 개정)', '고필수':'능률VOCA 고교필수 2000 (2022 개정)',
  '고교필수':'능률VOCA 고교필수 2000 (2022 개정)',
  '고난도':'능률 VOCA 중등 고난도 (2025 개정)', '능률고난도':'능률VOCA 고난도 (2022 개정)',
  '수완':'능률VOCA 수능완성 2200 (2022 개정)', '완성':'능률VOCA 수능완성 2200 (2022 개정)',
  '고기본25':'능률VOCA 고등 기본 (2025 개정)', '기본25':'능률 VOCA 중등 기본 (2025 개정)',
  '수필수25':'능률VOCA 수능 필수 (2025 개정)', '수능필수':'능률VOCA 수능 필수 (2025 개정)',
  '수고난도25':'능률VOCA 수능 고난도 (2025 개정)',
  // 중등
  '중기본25':'능률 VOCA 중등 기본 (2025 개정)', '중필수25':'능률 VOCA 중등 필수 (2025 개정)',
  '중고난도25':'능률 VOCA 중등 고난도 (2025 개정)', '중숙어25':'능률 VOCA 중등 숙어 (2025 개정)',
  '중등필수':'능률 VOCA 중등 필수 (2025 개정)', '중필수':'능률 VOCA 중등 필수 (2025 개정)',
  '중등기본':'능률 VOCA 중등 기본 (2025 개정)', '중기본':'능률 VOCA 중등 기본 (2025 개정)',
  '중등고난도':'능률 VOCA 중등 고난도 (2025 개정)',
  // 초등
  '초기본25':'능률VOCA 초등 기본 (2025 개정)', '초필수25':'능률VOCA 초등 필수 (2025 개정)',
  // 주니어
  '입문':'주니어 능률 VOCA 입문 (2023년)', '기본':'주니어 능률 VOCA 기본 (2023년)',
  '실력':'주니어 능률 VOCA 실력 (2023년)',
  // 어휘끝
  '어끝수능':'어휘끝수능', '어끝블랙':'어휘끝블랙',
  '어끝중필':'어휘끝중학필수', '어끝중고':'어휘끝중학고난도',
  // 기타
  '빠바':'빠바기초세우기', '특급':'특급 수능·EBS 기출 VOCA (2021 개정)',
  '해커스어원':'해커스 보카 어원편',
  '천마':'천일문중등마스터', '천스':'천일문중등스타트', '천필':'천일문중등필수',
  '리스2':'리딩튜터스타터2', '리딩튜터스타터2':'리딩튜터스타터2',
};

function resolveBook(s) { return BOOK_MAP[s?.trim()] || s?.trim() || ''; }

function parseBooks(bookStr) {
  if (!bookStr || bookStr === 'nan') return [];
  return bookStr.split(';').filter(b => b.trim()).map(b => {
    const short = b.split('=')[0].split(':')[0].trim();
    return { short, full: resolveBook(short), raw: b.trim() };
  });
}

// ===== 요일 =====
const YOIL = { '월':1,'화':2,'수':3,'목':4,'금':5,'토':6,'일':0 };

// ===== 진도 계산 =====
// 원본 Python: step = (day_speed - overlap), 매 수업일마다 step만큼 진행
// overlap은 앞 수업과 겹치는 과 수 (예: speed=3, overlap=1 → 매일 2과씩 진행, 3과 출제)
function calcChapter(student, targetDateStr) {
  const sd = pDate(student.startDate);
  if (!sd) return null;
  const startChap = parseInt(student.startChapter) || 1;
  const speed = parseInt(student.speed) || 1;
  const overlap = parseInt(student.overlap) || 0;
  const step = Math.max(1, speed - overlap); // 매 수업일 실제 진행량

  const weekdays = [];
  for (const c of (student.days || '')) { if (YOIL[c] !== undefined) weekdays.push(YOIL[c]); }
  const allDays = weekdays.length === 0;

  let classDays = 0;
  const tp = targetDateStr.split('-');
  const target = new Date(parseInt(tp[0]), parseInt(tp[1]) - 1, parseInt(tp[2]));
  const cur = new Date(sd.getTime());
  if (target < cur) return null;

  while (cur <= target) {
    const dow = cur.getDay();
    const ds = fDate(cur);
    if (!holidays.includes(ds) && (allDays || weekdays.includes(dow))) classDays++;
    cur.setDate(cur.getDate() + 1);
  }

  const totalProgress = (classDays - 1) * step; // step 단위로 누적
  const chapStart = startChap + totalProgress;
  const chapEnd = chapStart + speed - 1;
  return { start: Math.max(1, chapStart), end: chapEnd, speed, step };
}

function pDate(s) {
  if (!s) return null;
  const parts = s.replace(/[./]/g,'-').trim().split('-');
  if (parts.length < 3) return null;
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return isNaN(d.getTime()) ? null : d;
}
function fDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// ===== 초기화 =====
async function init() {
  document.getElementById('loading').classList.remove('hidden');
  try {
    const [sRes, hRes] = await Promise.all([fetch('/api/students'), fetch('/api/holidays')]);
    allStudents = await sRes.json();
    holidays = await hRes.json();
  } catch (e) { console.error(e); allStudents = []; }
  document.getElementById('loading').classList.add('hidden');

  setupSearch();
  setupModeButtons();
  loadRankings();
}

function setupModeButtons() {
  document.querySelectorAll('.big-mode-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      selectMode(btn.dataset.mode);
    });
  });
}

// ===== 검색 =====
function setupSearch() {
  const input = document.getElementById('student-search');
  const results = document.getElementById('search-results');

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (!q) { results.classList.add('hidden'); return; }
    const matches = allStudents.filter(s => s.name.includes(q));
    if (!matches.length) { results.classList.add('hidden'); return; }

    results.innerHTML = matches.slice(0, 12).map(s => {
      const books = parseBooks(s.book).map(b => b.short).join(', ');
      return `<div class="search-result-item" data-name="${s.name}" data-teacher="${s.teacher}">
        <div class="name">${s.name}</div>
        <div class="detail">${books || '교재없음'} · ${s.teacher}</div>
      </div>`;
    }).join('');
    results.classList.remove('hidden');

    results.querySelectorAll('.search-result-item').forEach(el => {
      el.addEventListener('click', () => {
        const st = allStudents.find(s => s.name === el.dataset.name && s.teacher === el.dataset.teacher);
        if (st) { selectStudent(st); results.classList.add('hidden'); input.value = st.name; }
      });
    });
  });
  document.addEventListener('click', e => { if (!e.target.closest('.search-box')) results.classList.add('hidden'); });
}

// ===== 랭킹 =====
async function loadRankings() {
  try {
    const res = await fetch('/api/rankings/today');
    const data = await res.json();
    const list = document.getElementById('ranking-list');
    if (!data.length) { list.innerHTML = '<p class="empty-msg">아직 기록이 없습니다</p>'; return; }
    list.innerHTML = data.map((r, i) => {
      const cls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      const time = (r.created_at || '').split(' ')[1]?.slice(0,5) || '';
      return `<div class="rank-item">
        <span class="rank-num ${cls}">${i+1}</span>
        <div class="rank-info"><span class="rank-name">${r.name}</span>
          <span class="rank-book">${r.book} ${time}</span></div>
        <span class="rank-score">${r.score}</span>
      </div>`;
    }).join('');
  } catch {}
}

// ===== 학생 선택 =====
function selectStudent(student) {
  selectedStudent = student;
  selectedDays = [];
  selectedMode = null;

  document.getElementById('selected-name').textContent = student.name;
  const books = parseBooks(student.book);
  document.getElementById('selected-book').textContent = books.map(b => b.short).join(', ') || '교재 없음';

  buildSchedule(student, books);
  buildDayChips(student, books);
  document.querySelectorAll('.big-mode-btn').forEach(b => b.classList.remove('selected'));
  updateStartBtn();

  showScreen('setup-screen');
}

// ===== 진도표 (수업일만 표시) =====
function buildSchedule(student, books) {
  const table = document.getElementById('schedule-table');
  const today = new Date();
  const todayStr = fDate(today);
  const dayNames = ['일','월','화','수','목','금','토'];

  // 학생 수업 요일 파싱
  const weekdays = [];
  for (const c of (student.days || '')) { if (YOIL[c] !== undefined) weekdays.push(YOIL[c]); }
  const allDays = weekdays.length === 0;

  function isClassDay(dateStr) {
    if (holidays.includes(dateStr)) return false;
    const d = new Date(dateStr + 'T00:00:00');
    return allDays || weekdays.includes(d.getDay());
  }

  // 수업일만 앞뒤 3일씩 수집
  const classDates = [];
  // 과거 수업일 3개
  const past = [];
  const d1 = new Date(today);
  while (past.length < 3) {
    d1.setDate(d1.getDate() - 1);
    const ds = fDate(d1);
    if (isClassDay(ds)) past.unshift(ds);
    if (d1 < new Date(today.getFullYear(), today.getMonth() - 1, 1)) break;
  }
  // 오늘 + 미래 수업일 4개
  const future = [];
  if (isClassDay(todayStr)) future.push(todayStr);
  const d2 = new Date(today);
  while (future.length < 5) {
    d2.setDate(d2.getDate() + 1);
    const ds = fDate(d2);
    if (isClassDay(ds)) future.push(ds);
    if (d2 > new Date(today.getFullYear(), today.getMonth() + 2, 1)) break;
  }

  const dates = [...past, ...future];
  // 중복 제거
  const unique = [...new Set(dates)];

  const rows = [];
  for (const ds of unique) {
    const dd = new Date(ds + 'T00:00:00');
    const isToday = ds === todayStr;
    const chapInfos = [];
    for (const b of books) {
      const info = calcChapter({ ...student }, ds);
      if (info && info.start >= 1) chapInfos.push(`${b.short} ${info.start}${info.end !== info.start ? '~'+info.end : ''}과`);
    }
    if (!chapInfos.length && !isToday) continue; // 진도 없는 날은 건너뜀
    rows.push(`<div class="sched-row ${isToday ? 'today' : ''}">
      <span class="sched-date">${ds.slice(5)} (${dayNames[dd.getDay()]})${isToday ? ' ◀' : ''}</span>
      <span class="sched-day">${chapInfos.join(' / ') || '-'}</span>
    </div>`);
  }

  table.innerHTML = rows.join('');
}

// ===== Day 칩 =====
function buildDayChips(student, books) {
  const chips = document.getElementById('day-chips');
  chips.innerHTML = '';
  if (!books.length) return;

  const todayStr = fDate(new Date());
  const info = calcChapter(student, todayStr);
  if (!info) { chips.innerHTML = '<span style="color:var(--text-dim);font-size:0.85em">진도 계산 불가</span>'; return; }

  const speed = info.speed;
  const step = info.step || Math.max(1, speed);
  const rangeCheck = document.getElementById('range-mode');

  // 앞뒤 3일분 + 오늘 (step 단위로 이동)
  const allChips = [];
  for (let offset = -3; offset <= 3; offset++) {
    const dayStart = info.start + offset * step;
    const dayEnd = dayStart + speed - 1;
    if (dayStart < 1) continue;
    const isToday = offset === 0;
    allChips.push({ dayStart, dayEnd, isToday, offset });
  }

  allChips.forEach(c => {
    const chip = document.createElement('button');
    chip.className = 'day-chip' + (c.isToday ? ' today-marker' : '');
    chip.textContent = c.dayStart === c.dayEnd ? `${c.dayStart}과` : `${c.dayStart}~${c.dayEnd}과`;
    chip.dataset.start = c.dayStart;
    chip.dataset.end = c.dayEnd;
    chip.addEventListener('click', () => toggleChip(chip));
    chips.appendChild(chip);
  });

  // 시험범위 전체 = 오늘의 시험 범위만 선택
  rangeCheck.onchange = () => {
    if (rangeCheck.checked) {
      selectTodayChip();
    } else {
      clearAllChips();
    }
    updateStartBtn();
  };

  // 기본: 오늘 시험범위 선택
  if (rangeCheck.checked) selectTodayChip();
}

function selectTodayChip() {
  clearAllChips();
  // 오늘 표시가 된 칩만 선택
  const todayChip = document.querySelector('.day-chip.today-marker');
  if (todayChip) {
    todayChip.classList.add('selected');
    const s = parseInt(todayChip.dataset.start), e = parseInt(todayChip.dataset.end);
    for (let d = s; d <= e; d++) { if (!selectedDays.includes(d)) selectedDays.push(d); }
    selectedDays.sort((a,b) => a - b);
  }
}

function clearAllChips() {
  selectedDays = [];
  document.querySelectorAll('.day-chip').forEach(c => c.classList.remove('selected'));
}

function toggleChip(chip) {
  document.getElementById('range-mode').checked = false;
  chip.classList.toggle('selected');
  rebuildSelectedDays();
  updateStartBtn();
}

function rebuildSelectedDays() {
  selectedDays = [];
  document.querySelectorAll('.day-chip.selected').forEach(c => {
    const s = parseInt(c.dataset.start), e = parseInt(c.dataset.end);
    for (let d = s; d <= e; d++) { if (!selectedDays.includes(d)) selectedDays.push(d); }
  });
  selectedDays.sort((a,b) => a - b);
}

// ===== 모드 선택 =====
function selectMode(mode) {
  selectedMode = mode;
  document.querySelectorAll('.big-mode-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.mode === mode);
  });
  updateStartBtn();
}

function updateStartBtn() {
  document.getElementById('start-btn').disabled = !(selectedDays.length > 0 && selectedMode);
}

// ===== 게임 시작 =====
document.getElementById('start-btn')?.addEventListener('click', launchGame);

async function launchGame() {
  if (!selectedStudent || !selectedDays.length || !selectedMode) return;
  const books = parseBooks(selectedStudent.book);
  if (!books.length) return;

  const bookFull = books[0].full;

  // 표제어/파생어: 학생 상태 필드에서 자동 결정
  // status에 'p'가 있으면 표제어만, 기본은 둘 다
  const status = (selectedStudent.status || '').toLowerCase();
  let types = '표제어,파생어';
  if (status.includes('p') && !status.includes('v')) types = '표제어';

  const url = `/api/words?book=${encodeURIComponent(bookFull)}&days=${selectedDays.join(',')}&types=${types}`;
  const res = await fetch(url);
  currentWords = await res.json();

  if (!currentWords.length) { alert('해당 범위에 단어가 없습니다.'); return; }

  if (selectedMode === 'study') {
    startStudyMode(currentWords);
  } else {
    showScreen('game-screen');
    startGame(currentWords, books[0].short, selectedStudent.name);
  }
}

// ===== 학습모드 =====
let studyIdx = 0;
let studyKnown = [];
let studyUnknown = [];
let studyFlipped = false;

function startStudyMode(words) {
  studyWords = [...words].sort(() => Math.random() - 0.5);
  studyIdx = 0;
  studyKnown = [];
  studyUnknown = [];
  studyFlipped = false;
  document.getElementById('study-result').classList.add('hidden');
  document.querySelector('.study-card-area').style.display = 'flex';
  document.querySelector('.study-buttons').style.display = 'flex';
  showScreen('study-screen');
  showStudyCard();
}

function showStudyCard() {
  if (studyIdx >= studyWords.length) { finishStudy(); return; }
  const w = studyWords[studyIdx];
  document.getElementById('card-meaning').textContent = w.meaning;
  document.getElementById('card-word').textContent = w.word;
  document.getElementById('card-full-meaning').textContent = w.meaning;
  document.getElementById('card-sentence').textContent = w.sentence || '';
  document.querySelector('.card-front').classList.remove('hidden');
  document.querySelector('.card-back').classList.add('hidden');
  document.getElementById('study-progress').textContent = `${studyIdx + 1} / ${studyWords.length}`;
  studyFlipped = false;
}

function flipCard() {
  // 토글: 앞↔뒤 반복 가능
  studyFlipped = !studyFlipped;
  if (studyFlipped) {
    document.querySelector('.card-front').classList.add('hidden');
    document.querySelector('.card-back').classList.remove('hidden');
  } else {
    document.querySelector('.card-front').classList.remove('hidden');
    document.querySelector('.card-back').classList.add('hidden');
  }
}

function markCard(known) {
  if (!studyFlipped) {
    // 아직 안 뒤집었으면 뒤집기만 하고 넘기지 않음
    flipCard();
    return;
  }
  const w = studyWords[studyIdx];
  if (known) studyKnown.push(w);
  else studyUnknown.push(w);
  studyIdx++;
  showStudyCard();
}

function finishStudy() {
  document.querySelector('.study-card-area').style.display = 'none';
  document.querySelector('.study-buttons').style.display = 'none';
  const result = document.getElementById('study-result');
  result.classList.remove('hidden');
  document.getElementById('study-summary').textContent =
    `알아요: ${studyKnown.length}개 / 몰라요: ${studyUnknown.length}개`;
  const wrongList = document.getElementById('study-wrong-list');
  wrongList.innerHTML = studyUnknown.map(w =>
    `<div class="wrong-word-item"><span class="eng">${w.word}</span><span class="kor">${w.meaning}</span></div>`
  ).join('');
}

function retryStudy() {
  if (studyUnknown.length) {
    startStudyMode(studyUnknown);
  } else {
    startStudyMode(currentWords);
  }
}

function exitStudy() { showScreen('setup-screen'); }

// ===== 게임 결과 =====
function confirmExit() {
  if (confirm('게임을 종료하시겠습니까?')) {
    if (typeof endGame === 'function') endGame();
    showScreen('setup-screen');
  }
}

function retryGame() { launchGame(); }

async function saveRanking(name, book, score, correct, wrong, maxCombo, mode) {
  try {
    await fetch('/api/rankings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, book, score, correct, wrong, maxCombo, mode })
    });
  } catch {}
}

// ===== 시작 =====
init();
