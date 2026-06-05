// ===== 전역 상태 =====
var allStudents = [];
var selectedStudent = null;
var selectedDays = [];
var selectedMode = null;
var holidays = [];
var currentWords = [];
var studyWords = [];
var currentDaysRange = '';
var currentBookShort = '';
var allBooks = [];

// ===== 화면 전환 =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
}

// ===== 교재명 매핑 =====
var BOOK_MAP = {
  '어원':'능률VOCA 어원편 (2021 개정)', '어원25':'능률VOCA 어원편 고등 (2025 개정)',
  '어원편고등':'능률VOCA 어원편 고등 (2025 개정)',
  '어원중등25':'능률VOCA 어원편 중등 (2025 개정)', '어원Lite':'능률VOCA 어원편 Lite',
  '고기본':'능률VOCA 고교기본 (2022 개정)', '고필수':'능률VOCA 고교필수 2000 (2022 개정)',
  '고교필수':'능률VOCA 고교필수 2000 (2022 개정)',
  '고난도':'능률 VOCA 중등 고난도 (2025 개정)', '능률고난도':'능률VOCA 고난도 (2022 개정)',
  '수완':'능률VOCA 수능완성 2200 (2022 개정)', '완성':'능률VOCA 수능완성 2200 (2022 개정)',
  '고기본25':'능률VOCA 고등 기본 (2025 개정)', '기본25':'능률 VOCA 중등 기본 (2025 개정)',
  '수필수25':'능률VOCA 수능 필수 (2025 개정)', '수능필수':'능률VOCA 수능 필수 (2025 개정)',
  '수고난도25':'능률VOCA 수능 고난도 (2025 개정)',
  '중기본25':'능률 VOCA 중등 기본 (2025 개정)', '중필수25':'능률 VOCA 중등 필수 (2025 개정)',
  '중고난도25':'능률 VOCA 중등 고난도 (2025 개정)', '중숙어25':'능률 VOCA 중등 숙어 (2025 개정)',
  '중등필수':'능률 VOCA 중등 필수 (2025 개정)', '중필수':'능률 VOCA 중등 필수 (2025 개정)',
  '중등기본':'능률 VOCA 중등 기본 (2025 개정)', '중기본':'능률 VOCA 중등 기본 (2025 개정)',
  '중등고난도':'능률 VOCA 중등 고난도 (2025 개정)',
  '초기본25':'능률VOCA 초등 기본 (2025 개정)', '초필수25':'능률VOCA 초등 필수 (2025 개정)',
  '입문':'주니어 능률 VOCA 입문 (2023년)', '기본':'주니어 능률 VOCA 기본 (2023년)',
  '실력':'주니어 능률 VOCA 실력 (2023년)',
  '어끝수능':'어휘끝수능', '어끝블랙':'어휘끝블랙',
  '어끝중필':'어휘끝중학필수', '어끝중고':'어휘끝중학고난도',
  '빠바':'빠바기초세우기', '특급':'특급 수능·EBS 기출 VOCA (2021 개정)',
  '해커스어원':'해커스 보카 어원편',
  '천마':'천일문중등마스터', '천스':'천일문중등스타트', '천필':'천일문중등필수',
  '리스2':'리딩튜터스타터2', '리딩튜터스타터2':'리딩튜터스타터2'
};

function resolveBook(s) {
  var t = s ? s.trim() : '';
  return BOOK_MAP[t] || t;
}

function parseBooks(bookStr) {
  if (!bookStr || bookStr === 'nan') return [];
  return bookStr.split(';').filter(function(b) { return b.trim(); }).map(function(b) {
    var short = b.split('=')[0].split(':')[0].trim();
    return { short: short, full: resolveBook(short), raw: b.trim() };
  });
}

// ===== 요일 =====
var YOIL = { '월':1,'화':2,'수':3,'목':4,'금':5,'토':6,'일':0 };

// ===== 진도 계산 =====
function calcChapter(student, targetDateStr) {
  var sd = pDate(student.startDate);
  if (!sd) return null;
  var startChap = parseInt(student.startChapter) || 1;
  var speed = parseInt(student.speed) || 1;
  var overlap = parseInt(student.overlap) || 0;
  var step = Math.max(1, speed - overlap);

  var weekdays = [];
  var daysStr = student.days || '';
  for (var i = 0; i < daysStr.length; i++) {
    var ch = daysStr[i];
    if (YOIL[ch] !== undefined) weekdays.push(YOIL[ch]);
  }
  var allDaysFlag = weekdays.length === 0;

  var classDays = 0;
  var tp = targetDateStr.split('-');
  var target = new Date(parseInt(tp[0]), parseInt(tp[1]) - 1, parseInt(tp[2]));
  var cur = new Date(sd.getTime());
  if (target < cur) return null;

  while (cur <= target) {
    var dow = cur.getDay();
    var ds = fDate(cur);
    if (holidays.indexOf(ds) < 0 && (allDaysFlag || weekdays.indexOf(dow) >= 0)) classDays++;
    cur.setDate(cur.getDate() + 1);
  }

  var totalProgress = (classDays - 1) * step;
  var chapStart = startChap + totalProgress;
  var chapEnd = chapStart + speed - 1;
  return { start: Math.max(1, chapStart), end: chapEnd, speed: speed, step: step };
}

function pDate(s) {
  if (!s) return null;
  var parts = s.replace(/[./]/g,'-').trim().split('-');
  if (parts.length < 3) return null;
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return isNaN(d.getTime()) ? null : d;
}
function fDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// ===== 초기화 =====
async function init() {
  document.getElementById('loading').classList.remove('hidden');
  try {
    var results = await Promise.all([fetch('/api/students'), fetch('/api/holidays')]);
    allStudents = await results[0].json();
    holidays = await results[1].json();
  } catch (e) { console.error(e); allStudents = []; }
  document.getElementById('loading').classList.add('hidden');

  setupSearch();
  setupModeButtons();
  loadRankings();
  loadWeeklyTop();
  loadFreeBooks();
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
  var input = document.getElementById('student-search');
  var resultsEl = document.getElementById('search-results');

  input.addEventListener('input', function() {
    var q = input.value.trim();
    if (!q) { resultsEl.classList.add('hidden'); return; }
    var matches = allStudents.filter(function(s) { return s.name.indexOf(q) >= 0; });
    if (!matches.length) { resultsEl.classList.add('hidden'); return; }

    resultsEl.innerHTML = matches.slice(0, 12).map(function(s) {
      var books = parseBooks(s.book).map(function(b) { return b.short; }).join(', ');
      return '<div class="search-result-item" data-name="' + s.name + '" data-teacher="' + s.teacher + '">' +
        '<div class="name">' + s.name + '</div>' +
        '<div class="detail">' + (books || '교재없음') + ' · ' + s.teacher + '</div></div>';
    }).join('');
    resultsEl.classList.remove('hidden');

    resultsEl.querySelectorAll('.search-result-item').forEach(function(el) {
      el.addEventListener('click', function() {
        var st = allStudents.find(function(s) { return s.name === el.dataset.name && s.teacher === el.dataset.teacher; });
        if (st) { selectStudent(st); resultsEl.classList.add('hidden'); input.value = st.name; }
      });
    });
  });
  document.addEventListener('click', function(e) { if (!e.target.closest('.search-box')) resultsEl.classList.add('hidden'); });
}

// ===== 랭킹 =====
async function loadRankings() {
  try {
    var res = await fetch('/api/rankings/today');
    var data = await res.json();
    var list = document.getElementById('ranking-list');
    if (!data.length) { list.innerHTML = '<p class="empty-msg">아직 기록이 없습니다</p>'; return; }
    list.innerHTML = data.map(function(r, i) {
      var cls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      var timeParts = (r.created_at || '').split(' ');
      var time = timeParts[1] ? timeParts[1].slice(0,5) : '';
      var range = r.days_range ? ' ' + r.days_range : '';
      return '<div class="rank-item">' +
        '<span class="rank-num ' + cls + '">' + (i+1) + '</span>' +
        '<div class="rank-info"><span class="rank-name">' + r.name + '</span>' +
        '<span class="rank-book">' + r.book + range + ' ' + time + '</span></div>' +
        '<span class="rank-score">' + r.score + '</span></div>';
    }).join('');
  } catch (e) {}
}

async function loadWeeklyTop() {
  try {
    var res = await fetch('/api/rankings/weekly-top');
    var data = await res.json();
    var list = document.getElementById('weekly-list');
    if (!data.length) { list.innerHTML = '<p class="empty-msg">기록 없음</p>'; return; }
    list.innerHTML = data.map(function(r, i) {
      var cls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      var range = r.days_range ? ' ' + r.days_range : '';
      return '<div class="rank-item">' +
        '<span class="rank-num ' + cls + '">' + (i+1) + '</span>' +
        '<div class="rank-info"><span class="rank-name">' + r.name + '</span>' +
        '<span class="rank-book">' + r.book + range + '</span>' +
        '<span class="rank-range">' + (r.date || '') + '</span></div>' +
        '<span class="rank-score">' + r.score + '</span></div>';
    }).join('');
  } catch (e) {}
}

// ===== 학생 선택 =====
function selectStudent(student) {
  selectedStudent = student;
  selectedDays = [];
  selectedMode = null;

  document.getElementById('selected-name').textContent = student.name;
  var books = parseBooks(student.book);
  document.getElementById('selected-book').textContent = books.map(function(b) { return b.short; }).join(', ') || '교재 없음';

  buildSchedule(student, books);
  buildDayChips(student, books);
  document.querySelectorAll('.big-mode-btn').forEach(function(b) { b.classList.remove('selected'); });
  updateStartBtn();

  // 자유 도전 초기화
  var freeSelect = document.getElementById('free-book-select');
  if (freeSelect) freeSelect.value = '';
  var freeRange = document.getElementById('free-range');
  if (freeRange) freeRange.classList.add('hidden');
  var freeDetail = document.getElementById('free-challenge-detail');
  if (freeDetail) freeDetail.removeAttribute('open');

  showScreen('setup-screen');
}

// ===== 진도표 (수업일만 표시) =====
function buildSchedule(student, books) {
  var table = document.getElementById('schedule-table');
  var today = new Date();
  var todayStr = fDate(today);
  var dayNames = ['일','월','화','수','목','금','토'];

  var weekdays = [];
  var daysStr = student.days || '';
  for (var i = 0; i < daysStr.length; i++) {
    var ch = daysStr[i];
    if (YOIL[ch] !== undefined) weekdays.push(YOIL[ch]);
  }
  var allDaysFlag = weekdays.length === 0;

  function isClassDay(dateStr) {
    if (holidays.indexOf(dateStr) >= 0) return false;
    var dp = dateStr.split('-');
    var d = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]));
    return allDaysFlag || weekdays.indexOf(d.getDay()) >= 0;
  }

  var past = [];
  var d1 = new Date(today);
  while (past.length < 3) {
    d1.setDate(d1.getDate() - 1);
    var ds1 = fDate(d1);
    if (isClassDay(ds1)) past.unshift(ds1);
    if (d1 < new Date(today.getFullYear(), today.getMonth() - 1, 1)) break;
  }
  var future = [];
  if (isClassDay(todayStr)) future.push(todayStr);
  var d2 = new Date(today);
  while (future.length < 5) {
    d2.setDate(d2.getDate() + 1);
    var ds2 = fDate(d2);
    if (isClassDay(ds2)) future.push(ds2);
    if (d2 > new Date(today.getFullYear(), today.getMonth() + 2, 1)) break;
  }

  var dates = past.concat(future);
  // 중복 제거
  var seen = {};
  var unique = [];
  for (var u = 0; u < dates.length; u++) {
    if (!seen[dates[u]]) { seen[dates[u]] = true; unique.push(dates[u]); }
  }

  var rows = [];
  for (var ri = 0; ri < unique.length; ri++) {
    var ds = unique[ri];
    var dp = ds.split('-');
    var dd = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]));
    var isToday = ds === todayStr;
    var chapInfos = [];
    for (var bi = 0; bi < books.length; bi++) {
      var info = calcChapter(student, ds);
      if (info && info.start >= 1) {
        chapInfos.push(books[bi].short + ' ' + info.start + (info.end !== info.start ? '~' + info.end : '') + '과');
      }
    }
    if (!chapInfos.length && !isToday) continue;
    rows.push('<div class="sched-row ' + (isToday ? 'today' : '') + '">' +
      '<span class="sched-date">' + ds.slice(5) + ' (' + dayNames[dd.getDay()] + ')' + (isToday ? ' ◀' : '') + '</span>' +
      '<span class="sched-day">' + (chapInfos.join(' / ') || '-') + '</span></div>');
  }

  table.innerHTML = rows.join('');
}

// ===== Day 칩 =====
function buildDayChips(student, books) {
  var chips = document.getElementById('day-chips');
  chips.innerHTML = '';
  if (!books.length) return;

  var todayStr = fDate(new Date());
  var info = calcChapter(student, todayStr);
  if (!info) { chips.innerHTML = '<span style="color:var(--text-dim);font-size:0.85em">진도 계산 불가</span>'; return; }

  var speed = info.speed;
  var step = info.step || Math.max(1, speed);
  var rangeCheck = document.getElementById('range-mode');

  var allChips = [];
  for (var offset = -3; offset <= 3; offset++) {
    var dayStart = info.start + offset * step;
    var dayEnd = dayStart + speed - 1;
    if (dayStart < 1) continue;
    var isToday = offset === 0;
    allChips.push({ dayStart: dayStart, dayEnd: dayEnd, isToday: isToday, offset: offset });
  }

  allChips.forEach(function(c) {
    var chip = document.createElement('button');
    chip.className = 'day-chip' + (c.isToday ? ' today-marker' : '');
    chip.textContent = c.dayStart === c.dayEnd ? c.dayStart + '과' : c.dayStart + '~' + c.dayEnd + '과';
    chip.dataset.start = c.dayStart;
    chip.dataset.end = c.dayEnd;
    chip.addEventListener('click', function() { toggleChip(chip); });
    chips.appendChild(chip);
  });

  rangeCheck.onchange = function() {
    if (rangeCheck.checked) {
      selectTodayChip();
    } else {
      clearAllChips();
    }
    updateStartBtn();
  };

  if (rangeCheck.checked) selectTodayChip();
}

function selectTodayChip() {
  clearAllChips();
  var todayChip = document.querySelector('.day-chip.today-marker');
  if (todayChip) {
    todayChip.classList.add('selected');
    var s = parseInt(todayChip.dataset.start), e = parseInt(todayChip.dataset.end);
    for (var d = s; d <= e; d++) { if (selectedDays.indexOf(d) < 0) selectedDays.push(d); }
    selectedDays.sort(function(a,b) { return a - b; });
  }
}

function clearAllChips() {
  selectedDays = [];
  document.querySelectorAll('.day-chip').forEach(function(c) { c.classList.remove('selected'); });
}

function toggleChip(chip) {
  document.getElementById('range-mode').checked = false;
  chip.classList.toggle('selected');
  rebuildSelectedDays();
  updateStartBtn();
}

function rebuildSelectedDays() {
  selectedDays = [];
  document.querySelectorAll('.day-chip.selected').forEach(function(c) {
    var s = parseInt(c.dataset.start), e = parseInt(c.dataset.end);
    for (var d = s; d <= e; d++) { if (selectedDays.indexOf(d) < 0) selectedDays.push(d); }
  });
  selectedDays.sort(function(a,b) { return a - b; });
}

// ===== 모드 선택 =====
function selectMode(mode) {
  selectedMode = mode;
  document.querySelectorAll('.big-mode-btn').forEach(function(b) {
    b.classList.toggle('selected', b.dataset.mode === mode);
  });
  updateStartBtn();
}

function updateStartBtn() {
  document.getElementById('start-btn').disabled = !(selectedDays.length > 0 && selectedMode);
}

// ===== 게임 시작 =====
var startBtn = document.getElementById('start-btn');
if (startBtn) startBtn.addEventListener('click', launchGame);

async function launchGame() {
  if (!selectedStudent || !selectedDays.length || !selectedMode) return;

  var freeSelect = document.getElementById('free-book-select');
  var freeBook = freeSelect ? freeSelect.value : '';
  var bookFull, bookShort;

  if (freeBook) {
    bookFull = freeBook;
    bookShort = '';
    var keys = Object.keys(BOOK_MAP);
    for (var ki = 0; ki < keys.length; ki++) {
      if (BOOK_MAP[keys[ki]] === freeBook) { bookShort = keys[ki]; break; }
    }
    if (!bookShort) bookShort = freeBook.slice(0, 10);
  } else {
    var books = parseBooks(selectedStudent.book);
    if (!books.length) return;
    bookFull = books[0].full;
    bookShort = books[0].short;
  }

  var status = (selectedStudent.status || '').toLowerCase();
  var types = '표제어,파생어';
  if (!freeBook && status.indexOf('p') >= 0 && status.indexOf('v') < 0) types = '표제어';

  var url = '/api/words?book=' + encodeURIComponent(bookFull) + '&days=' + selectedDays.join(',') + '&types=' + types;
  var res = await fetch(url);
  currentWords = await res.json();

  if (!currentWords.length) { alert('해당 범위에 단어가 없습니다.'); return; }

  var sorted = selectedDays.slice().sort(function(a,b) { return a - b; });
  currentDaysRange = sorted[0] === sorted[sorted.length-1] ? sorted[0] + '과' : sorted[0] + '~' + sorted[sorted.length-1] + '과';
  currentBookShort = bookShort;

  if (selectedMode === 'study') {
    startStudyMode(currentWords);
  } else {
    showScreen('game-screen');
    startGame(currentWords, bookShort, selectedStudent.name);
  }
}

// ===== 학습모드 =====
var studyIdx = 0;
var studyKnown = [];
var studyUnknown = [];
var studyFlipped = false;

function startStudyMode(words) {
  studyWords = words.slice().sort(function() { return Math.random() - 0.5; });
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
  var w = studyWords[studyIdx];
  document.getElementById('card-meaning').textContent = w.meaning;
  document.getElementById('card-word').textContent = w.word;
  document.getElementById('card-full-meaning').textContent = w.meaning;
  document.getElementById('card-sentence').textContent = w.sentence || '';
  document.querySelector('.card-front').classList.remove('hidden');
  document.querySelector('.card-back').classList.add('hidden');
  document.getElementById('study-progress').textContent = (studyIdx + 1) + ' / ' + studyWords.length;
  studyFlipped = false;
}

function flipCard() {
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
    flipCard();
    return;
  }
  var w = studyWords[studyIdx];
  if (known) studyKnown.push(w);
  else studyUnknown.push(w);
  studyIdx++;
  showStudyCard();
}

function finishStudy() {
  document.querySelector('.study-card-area').style.display = 'none';
  document.querySelector('.study-buttons').style.display = 'none';
  var result = document.getElementById('study-result');
  result.classList.remove('hidden');
  document.getElementById('study-summary').textContent =
    '알아요: ' + studyKnown.length + '개 / 몰라요: ' + studyUnknown.length + '개';
  var wrongList = document.getElementById('study-wrong-list');
  wrongList.innerHTML = studyUnknown.map(function(w) {
    return '<div class="wrong-word-item"><span class="eng">' + w.word + '</span><span class="kor">' + w.meaning + '</span></div>';
  }).join('');
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

async function saveRanking(name, book, score, correct, wrong, maxCombo, mode, daysRange) {
  try {
    await fetch('/api/rankings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, book: book, score: score, correct: correct, wrong: wrong, maxCombo: maxCombo, mode: mode, daysRange: daysRange })
    });
    loadRankings();
    loadWeeklyTop();
  } catch (e) {}
}

// ===== 자유 도전 =====
async function loadFreeBooks() {
  try {
    var res = await fetch('/api/books');
    allBooks = await res.json();
    var select = document.getElementById('free-book-select');
    if (!select) return;
    for (var i = 0; i < allBooks.length; i++) {
      var b = allBooks[i];
      var opt = document.createElement('option');
      opt.value = b.book_name;
      opt.textContent = b.book_name + ' (' + b.minDay + '~' + b.maxDay + '과)';
      select.appendChild(opt);
    }
    select.addEventListener('change', onFreeBookChange);
    var freeAllBtn = document.getElementById('free-all-btn');
    if (freeAllBtn) freeAllBtn.addEventListener('click', onFreeAllRange);
  } catch (e) {}
}

function onFreeBookChange() {
  var select = document.getElementById('free-book-select');
  var rangeDiv = document.getElementById('free-range');
  var book = null;
  for (var i = 0; i < allBooks.length; i++) {
    if (allBooks[i].book_name === select.value) { book = allBooks[i]; break; }
  }
  if (!book) { rangeDiv.classList.add('hidden'); return; }
  document.getElementById('free-range-info').textContent = book.minDay + '~' + book.maxDay + '과';
  rangeDiv.classList.remove('hidden');
}

function onFreeAllRange() {
  var select = document.getElementById('free-book-select');
  var book = null;
  for (var i = 0; i < allBooks.length; i++) {
    if (allBooks[i].book_name === select.value) { book = allBooks[i]; break; }
  }
  if (!book) return;
  selectedDays = [];
  for (var d = book.minDay; d <= book.maxDay; d++) selectedDays.push(d);
  var chips = document.getElementById('day-chips');
  chips.innerHTML = '<span style="color:var(--accent);font-size:0.85em">' + book.book_name + ' 전체 (' + book.minDay + '~' + book.maxDay + '과)</span>';
  document.getElementById('range-mode').checked = false;
  updateStartBtn();
}

// ===== 시작 =====
init();
