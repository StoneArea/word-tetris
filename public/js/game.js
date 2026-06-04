// ===== 테트리스 + 단어 퀴즈 엔진 =====

const COLS = 10;
const ROWS = 20;

const PIECES = {
  I: { shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color: '#00f0f0' },
  O: { shape: [[1,1],[1,1]], color: '#f0f000' },
  T: { shape: [[0,1,0],[1,1,1],[0,0,0]], color: '#a020f0' },
  S: { shape: [[0,1,1],[1,1,0],[0,0,0]], color: '#00f000' },
  Z: { shape: [[1,1,0],[0,1,1],[0,0,0]], color: '#f00000' },
  L: { shape: [[0,0,1],[1,1,1],[0,0,0]], color: '#f0a000' },
  J: { shape: [[1,0,0],[1,1,1],[0,0,0]], color: '#0000f0' },
};
const PIECE_NAMES = Object.keys(PIECES);

// 줄 클리어 이름 & 점수 배율
const LINE_CLEAR_NAMES = ['', 'Single', 'Double', 'Triple', 'Tetris!'];
const LINE_CLEAR_SCORES = [0, 100, 300, 500, 800];
const LINE_CLEAR_COLORS = ['', '#10b981', '#00d4ff', '#f59e0b', '#ef4444'];

let canvas, ctx, canvasW, canvasH, cellSize;
let grid, piece, nextPiece, bag;
let gameRunning = false, paused = false, quizActive = false;
let score, combo, maxCombo, level, linesCleared, wordIdx;
let dropInterval, dropTimer;
let animId, lastTime;
let gameWords, gameName, gameBook;
let wrongWords, correctCount, wrongCount;
let pendingLines;
let quizQueue; // 연속 퀴즈 큐
let pendingLineCount; // 현재 클리어할 줄 수
let effects; // 시각 효과
let quizTimerId; // 퀴즈 타이머

// ===== 초기화 =====
function startGame(words, book, name) {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');

  var area = document.querySelector('.game-area');
  var maxH = area.clientHeight - 10;
  var maxW = area.clientWidth - 10;
  var cellFromH = Math.floor(maxH / ROWS);
  var cellFromW = Math.floor(maxW / COLS);
  cellSize = Math.min(cellFromH, cellFromW, 28);

  canvasW = cellSize * COLS;
  canvasH = cellSize * ROWS;
  canvas.width = canvasW;
  canvas.height = canvasH;

  grid = Array.from({ length: ROWS }, function() { return Array(COLS).fill(0); });
  score = 0; combo = 0; maxCombo = 0; level = 1; linesCleared = 0; wordIdx = 0;
  dropInterval = 1000; dropTimer = 0;
  gameWords = [].concat(words).sort(function() { return Math.random() - 0.5; });
  gameName = name; gameBook = book;
  wrongWords = []; correctCount = 0; wrongCount = 0;
  pendingLines = []; quizQueue = []; pendingLineCount = 0;
  effects = [];
  paused = false; quizActive = false;
  bag = [];
  piece = spawnPiece();
  nextPiece = spawnPiece();
  gameRunning = true;
  lastTime = performance.now();

  document.getElementById('quiz-overlay').classList.add('hidden');
  updateHUD();
  setupControls();
  gameLoop(lastTime);
}

function endGame() {
  gameRunning = false;
  if (animId) cancelAnimationFrame(animId);
  animId = null;
  removeControls();
}

// ===== 조각 생성 (7-bag) =====
function spawnPiece() {
  if (bag.length === 0) bag = [].concat(PIECE_NAMES).sort(function() { return Math.random() - 0.5; });
  var name = bag.pop();
  var p = PIECES[name];
  return {
    name: name,
    shape: p.shape.map(function(r) { return [].concat(r); }),
    color: p.color,
    x: Math.floor((COLS - p.shape[0].length) / 2),
    y: 0
  };
}

// ===== 충돌 검사 =====
function isValid(shape, px, py) {
  for (var r = 0; r < shape.length; r++) {
    for (var c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      var nx = px + c, ny = py + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
      if (ny >= 0 && grid[ny][nx]) return false;
    }
  }
  return true;
}

// ===== 회전 =====
function rotate(shape) {
  var N = shape.length;
  var rot = Array.from({ length: N }, function() { return Array(N).fill(0); });
  for (var r = 0; r < N; r++)
    for (var c = 0; c < N; c++)
      rot[c][N - 1 - r] = shape[r][c];
  return rot;
}

function tryRotate() {
  var rotated = rotate(piece.shape);
  var kicks = [0, -1, 1, -2, 2];
  for (var i = 0; i < kicks.length; i++) {
    if (isValid(rotated, piece.x + kicks[i], piece.y)) {
      piece.shape = rotated;
      piece.x += kicks[i];
      return;
    }
  }
}

// ===== 이동 =====
function moveLeft() { if (!quizActive && isValid(piece.shape, piece.x - 1, piece.y)) piece.x--; }
function moveRight() { if (!quizActive && isValid(piece.shape, piece.x + 1, piece.y)) piece.x++; }
function softDrop() {
  if (quizActive) return;
  if (isValid(piece.shape, piece.x, piece.y + 1)) { piece.y++; score += 1; }
}
function hardDrop() {
  if (quizActive) return;
  while (isValid(piece.shape, piece.x, piece.y + 1)) { piece.y++; score += 2; }
  lockPiece();
}

// ===== 고정 =====
function lockPiece() {
  for (var r = 0; r < piece.shape.length; r++) {
    for (var c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      var ny = piece.y + r, nx = piece.x + c;
      if (ny < 0) { gameOver(); return; }
      grid[ny][nx] = piece.color;
    }
  }

  var full = [];
  for (var r = 0; r < ROWS; r++) {
    if (grid[r].every(function(c) { return c !== 0; })) full.push(r);
  }

  if (full.length > 0) {
    pendingLines = full;
    pendingLineCount = full.length;
    // 줄 수에 따라 퀴즈 수 결정: 1줄=1문제, 2줄=2문제, 3줄=2문제, 4줄(테트리스)=3문제
    var quizCount = [0, 1, 2, 3, 5][full.length] || full.length;
    startQuizSequence(quizCount, full.length);
  } else {
    nextTurn();
  }
}

function nextTurn() {
  piece = nextPiece;
  nextPiece = spawnPiece();
  dropTimer = 0;
  if (!isValid(piece.shape, piece.x, piece.y)) gameOver();
}

// ===== 라인 클리어 =====
function clearLines(lines) {
  lines.sort(function(a, b) { return a - b; });
  for (var i = 0; i < lines.length; i++) {
    grid.splice(lines[i], 1);
    grid.unshift(Array(COLS).fill(0));
  }
  var n = lines.length;
  var lineScore = LINE_CLEAR_SCORES[n] || n * 200;
  score += lineScore * level;
  linesCleared += n;
  level = Math.floor(linesCleared / 10) + 1;
  dropInterval = Math.max(100, 1000 - (level - 1) * 80);
  updateHUD();
}

function addGarbageLine() {
  var hole = Math.floor(Math.random() * COLS);
  grid.shift();
  var row = Array(COLS).fill('#555');
  row[hole] = 0;
  grid.push(row);
}

// ===== 연속 퀴즈 시스템 =====
function startQuizSequence(count, lineCount) {
  quizQueue = [];
  for (var i = 0; i < count; i++) {
    if (wordIdx >= gameWords.length) {
      gameWords = [].concat(gameWords).sort(function() { return Math.random() - 0.5; });
      wordIdx = 0;
    }
    quizQueue.push(gameWords[wordIdx++]);
  }
  quizActive = true;
  paused = true;

  // 줄 클리어 효과
  var clearName = LINE_CLEAR_NAMES[lineCount] || lineCount + ' Lines!';
  var clearColor = LINE_CLEAR_COLORS[lineCount] || '#fff';
  addEffect(COLS * cellSize / 2, canvasH / 2 - 30, clearName, clearColor, lineCount >= 4 ? 'huge' : lineCount >= 2 ? 'big' : 'normal');

  // 첫 퀴즈 시작 (효과 보여준 후)
  setTimeout(function() { showNextQuiz(lineCount); }, lineCount >= 4 ? 800 : 400);
}

var quizCorrectInSequence = 0;
var quizTotalInSequence = 0;

function showNextQuiz(lineCount) {
  if (quizQueue.length === 0) {
    finishQuizSequence(lineCount);
    return;
  }

  if (quizTimerId) { clearTimeout(quizTimerId); quizTimerId = null; }
  var answered = false;

  var word = quizQueue.shift();
  var overlay = document.getElementById('quiz-overlay');
  var meaningEl = document.getElementById('quiz-meaning');
  var choicesEl = document.getElementById('quiz-choices');
  var typingEl = document.getElementById('quiz-typing');
  var feedbackEl = document.getElementById('quiz-feedback');

  var quizTotal = [0, 1, 2, 3, 5][pendingLineCount] || pendingLineCount;
  var quizCurrent = quizTotal - quizQueue.length;
  var quizNum = quizTotal >= 2 ? ' (' + quizCurrent + '/' + quizTotal + ')' : '';
  meaningEl.textContent = word.meaning + quizNum;
  feedbackEl.textContent = '';

  var handler = null;

  // 레벨별 타이핑 확률: 1~3=0%, 4~5=20%, 6~7=40%, 8~9=60%, 10+=80%
  var typingChance = level <= 3 ? 0 : level <= 5 ? 0.2 : level <= 7 ? 0.4 : level <= 9 ? 0.6 : 0.8;
  var useTyping = Math.random() < typingChance;

  // 타이머: 타이핑 10초, 4지선다 5초
  var timeLimit = useTyping ? 10000 : 5000;
  quizTimerId = setTimeout(function() {
    if (answered) return;
    answered = true;
    if (handler) document.getElementById('quiz-input').removeEventListener('keydown', handler);
    choicesEl.querySelectorAll('.quiz-choice-btn').forEach(function(b) { b.style.pointerEvents = 'none'; });
    var correctBtn = choicesEl.querySelector('[data-word="' + word.word + '"]');
    if (correctBtn) correctBtn.classList.add('correct');
    onSingleQuizWrong(word, lineCount, word.word);
  }, timeLimit);

  if (useTyping) {
    // 타이핑
    choicesEl.classList.add('hidden');
    typingEl.classList.remove('hidden');
    var input = document.getElementById('quiz-input');
    input.value = '';
    overlay.classList.remove('hidden');
    setTimeout(function() { input.focus(); }, 100);

    handler = function(e) {
      if (e.key !== 'Enter' || answered) return;
      e.preventDefault();
      answered = true;
      clearTimeout(quizTimerId);
      input.removeEventListener('keydown', handler);
      var ans = input.value.trim().toLowerCase();
      var correct = word.word.toLowerCase();
      var alt = (word.sentence_answer || '').toLowerCase();
      if (ans === correct || (alt && ans === alt)) {
        onSingleQuizCorrect(word, lineCount);
      } else {
        onSingleQuizWrong(word, lineCount, correct);
      }
    };
    input.addEventListener('keydown', handler);
  } else {
    // 4지선다
    typingEl.classList.add('hidden');
    choicesEl.classList.remove('hidden');
    var correct = word.word;
    var choices = [correct];
    var others = gameWords.filter(function(w) { return w.word !== correct; })
      .sort(function() { return Math.random() - 0.5; }).slice(0, 3)
      .map(function(w) { return w.word; });
    choices = choices.concat(others);
    while (choices.length < 4) choices.push('---');
    var shuffled = choices.sort(function() { return Math.random() - 0.5; });

    choicesEl.innerHTML = shuffled.map(function(w) {
      return '<button class="quiz-choice-btn" data-word="' + w + '">' + w + '</button>';
    }).join('');

    overlay.classList.remove('hidden');

    choicesEl.querySelectorAll('.quiz-choice-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (answered || btn.classList.contains('correct') || btn.classList.contains('wrong')) return;
        answered = true;
        clearTimeout(quizTimerId);
        choicesEl.querySelectorAll('.quiz-choice-btn').forEach(function(b) { b.style.pointerEvents = 'none'; });
        if (btn.dataset.word === correct) {
          btn.classList.add('correct');
          onSingleQuizCorrect(word, lineCount);
        } else {
          btn.classList.add('wrong');
          var correctBtn = choicesEl.querySelector('[data-word="' + correct + '"]');
          if (correctBtn) correctBtn.classList.add('correct');
          onSingleQuizWrong(word, lineCount, correct);
        }
      });
    });
  }
}

function onSingleQuizCorrect(word, lineCount) {
  var fb = document.getElementById('quiz-feedback');
  fb.textContent = '✓ 정답!';
  fb.style.color = '#10b981';
  correctCount++;
  combo++;
  if (combo > maxCombo) maxCombo = combo;
  // 줄 수에 비례한 보너스
  var bonus = 50 * combo * Math.max(1, lineCount);
  score += bonus;
  quizCorrectInSequence++;
  updateHUD();

  setTimeout(function() { showNextQuiz(lineCount); }, 500);
}

function onSingleQuizWrong(word, lineCount, correctWord) {
  var fb = document.getElementById('quiz-feedback');
  fb.textContent = '✗ 정답: ' + correctWord;
  fb.style.color = '#ef4444';
  wrongCount++;
  combo = 0;
  wrongWords.push({ word: word.word, meaning: word.meaning });
  updateHUD();

  setTimeout(function() { showNextQuiz(lineCount); }, 1000);
}

function finishQuizSequence(lineCount) {
  document.getElementById('quiz-overlay').classList.add('hidden');

  if (quizCorrectInSequence > 0) {
    // 정답이 하나라도 있으면 라인 클리어
    clearLines(pendingLines);
    // 전문 정답 보너스
    var quizTotal = [0, 1, 2, 3, 5][lineCount] || lineCount;
    if (quizCorrectInSequence === quizTotal && quizTotal > 1) {
      var perfectBonus = lineCount * 200 * level;
      score += perfectBonus;
      addEffect(COLS * cellSize / 2, canvasH / 2, 'PERFECT! +' + perfectBonus, '#ffd700', 'huge');
    }
  } else {
    // 모두 틀림 → 라인 안 지우고 garbage
    pendingLines = [];
    for (var i = 0; i < lineCount; i++) addGarbageLine();
    addEffect(COLS * cellSize / 2, canvasH / 2, 'MISS!', '#ef4444', 'big');
  }

  quizCorrectInSequence = 0;
  quizTotalInSequence = 0;
  quizActive = false;
  paused = false;
  pendingLines = [];
  pendingLineCount = 0;
  updateHUD();
  nextTurn();
}

// ===== 시각 효과 =====
function addEffect(x, y, text, color, size) {
  effects.push({
    x: x, y: y, text: text, color: color,
    size: size || 'normal',
    life: 1.0, maxLife: 1.0
  });
}

function updateEffects(dt) {
  var speed = 0.02 * dt;
  effects = effects.filter(function(e) {
    e.life -= speed;
    e.y -= 1.2 * dt;
    return e.life > 0;
  });
}

function drawEffects() {
  for (var i = 0; i < effects.length; i++) {
    var e = effects[i];
    ctx.save();
    ctx.globalAlpha = Math.min(1, e.life * 2);
    var fontSize = e.size === 'huge' ? 32 : e.size === 'big' ? 24 : 18;
    var scale = 1 + (1 - e.life / e.maxLife) * 0.3;
    ctx.font = 'bold ' + Math.round(fontSize * scale) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 외곽선
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 3;
    ctx.strokeText(e.text, e.x, e.y);
    ctx.fillStyle = e.color;
    ctx.fillText(e.text, e.x, e.y);
    ctx.restore();
  }
}

// ===== HUD =====
function updateHUD() {
  document.getElementById('score').textContent = score;
  document.getElementById('combo').textContent = combo;
  document.getElementById('level').textContent = level;
  document.getElementById('lines').textContent = linesCleared;
}

// ===== 게임 오버 =====
function gameOver() {
  endGame();
  var total = correctCount + wrongCount;
  var acc = total > 0 ? Math.round(correctCount / total * 100) : 0;

  document.getElementById('final-score').textContent = score;
  document.getElementById('accuracy').textContent = acc + '%';
  document.getElementById('max-combo').textContent = maxCombo;
  document.getElementById('final-lines').textContent = linesCleared;

  var unique = [];
  var seen = {};
  for (var i = 0; i < wrongWords.length; i++) {
    var w = wrongWords[i];
    if (!seen[w.word]) { seen[w.word] = true; unique.push(w); }
  }
  var wl = document.getElementById('wrong-list');
  var ww = document.getElementById('wrong-words');
  if (unique.length) {
    wl.classList.remove('hidden');
    ww.innerHTML = unique.map(function(w) {
      return '<div class="wrong-word-item"><span class="eng">' + w.word + '</span><span class="kor">' + w.meaning + '</span></div>';
    }).join('');
  } else {
    wl.classList.add('hidden');
  }

  saveRanking(gameName, gameBook, score, correctCount, wrongCount, maxCombo, 'tetris');
  showScreen('result-screen');
}

// ===== 게임 루프 =====
function gameLoop(ts) {
  if (!gameRunning) return;
  var rawDelta = ts - lastTime;
  var dt = Math.min(rawDelta / 16.67, 3);
  lastTime = ts;

  if (!paused) {
    dropTimer += Math.min(rawDelta, 50);
    if (dropTimer >= dropInterval) {
      dropTimer = 0;
      if (isValid(piece.shape, piece.x, piece.y + 1)) {
        piece.y++;
      } else {
        lockPiece();
      }
    }
  }

  updateEffects(dt);
  draw();
  animId = requestAnimationFrame(gameLoop);
}

// ===== 렌더링 =====
function draw() {
  var C = cellSize;
  var boardW = C * COLS;
  ctx.clearRect(0, 0, canvasW, canvasH);

  // === 게임판 ===
  // 그리드 배경
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5;
  for (var c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c*C, 0); ctx.lineTo(c*C, canvasH); ctx.stroke(); }
  for (var r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r*C); ctx.lineTo(boardW, r*C); ctx.stroke(); }

  // 고정 블록
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      if (grid[r][c]) {
        var isPending = pendingLines.indexOf(r) >= 0;
        drawCell(c, r, grid[r][c], isPending ? 0.4 + 0.3 * Math.sin(Date.now() / 100) : 1.0, C);
      }
    }
  }

  if (!paused && piece) {
    // 고스트
    var ghostY = piece.y;
    while (isValid(piece.shape, piece.x, ghostY + 1)) ghostY++;
    if (ghostY !== piece.y) {
      for (var r = 0; r < piece.shape.length; r++)
        for (var c = 0; c < piece.shape[r].length; c++)
          if (piece.shape[r][c]) drawCell(piece.x + c, ghostY + r, piece.color, 0.2, C);
    }
    // 현재 조각
    for (var r = 0; r < piece.shape.length; r++)
      for (var c = 0; c < piece.shape[r].length; c++)
        if (piece.shape[r][c]) drawCell(piece.x + c, piece.y + r, piece.color, 1.0, C);
  }

  // === 다음 블록 미리보기 (헤더 캔버스) ===
  drawNextPreview();

  // === 효과 ===
  drawEffects();
}

function drawCell(x, y, color, alpha, C) {
  if (y < 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x * C + 1, y * C + 1, C - 2, C - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x * C + 1, y * C + 1, C - 2, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(x * C + 1, y * C + C - 4, C - 2, 3);
  ctx.restore();
}

function drawNextPreview() {
  var nc = document.getElementById('next-canvas');
  if (!nc || !nextPiece) return;
  var nctx = nc.getContext('2d');
  var np = nextPiece;
  var pcs = 12; // preview cell size
  // 캔버스 크기 맞추기
  nc.width = np.shape[0].length * pcs;
  nc.height = np.shape.length * pcs;
  nctx.clearRect(0, 0, nc.width, nc.height);
  for (var r = 0; r < np.shape.length; r++) {
    for (var c = 0; c < np.shape[r].length; c++) {
      if (np.shape[r][c]) {
        nctx.fillStyle = np.color;
        nctx.fillRect(c * pcs + 1, r * pcs + 1, pcs - 2, pcs - 2);
        nctx.fillStyle = 'rgba(255,255,255,0.2)';
        nctx.fillRect(c * pcs + 1, r * pcs + 1, pcs - 2, 2);
      }
    }
  }
}

// ===== 컨트롤 =====
var keyHandler, touchHandlers = {};

function setupControls() {
  keyHandler = function(e) {
    if (quizActive) return;
    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); moveLeft(); break;
      case 'ArrowRight': e.preventDefault(); moveRight(); break;
      case 'ArrowDown': e.preventDefault(); softDrop(); break;
      case 'ArrowUp': case 'z': case 'Z': e.preventDefault(); tryRotate(); break;
      case ' ': e.preventDefault(); hardDrop(); break;
    }
  };
  document.addEventListener('keydown', keyHandler);

  var addTouch = function(id, fn, repeat) {
    var el = document.getElementById(id);
    if (!el) return;
    var interval = null;
    var isTouching = false;
    var stop = function() { if (interval) { clearInterval(interval); interval = null; } isTouching = false; };
    var onTouch = function(e) { e.preventDefault(); isTouching = true; stop(); fn(); if (repeat) interval = setInterval(fn, 100); };
    var onMouse = function(e) { if (isTouching) return; e.preventDefault(); stop(); fn(); if (repeat) interval = setInterval(fn, 100); };
    el.addEventListener('touchstart', onTouch, { passive: false });
    el.addEventListener('touchend', stop);
    el.addEventListener('touchcancel', stop);
    el.addEventListener('mousedown', onMouse);
    el.addEventListener('mouseup', stop);
    el.addEventListener('mouseleave', stop);
    touchHandlers[id] = { onTouch: onTouch, onMouse: onMouse, stop: stop, el: el };
  };

  addTouch('ctrl-left', moveLeft, true);
  addTouch('ctrl-right', moveRight, true);
  addTouch('ctrl-down', softDrop, true);
  addTouch('ctrl-rotate', tryRotate, false);
  addTouch('ctrl-drop', hardDrop, false);
}

function removeControls() {
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  for (var id in touchHandlers) {
    var h = touchHandlers[id];
    h.stop();
    h.el.removeEventListener('touchstart', h.onTouch);
    h.el.removeEventListener('touchend', h.stop);
    h.el.removeEventListener('touchcancel', h.stop);
    h.el.removeEventListener('mousedown', h.onMouse);
    h.el.removeEventListener('mouseup', h.stop);
    h.el.removeEventListener('mouseleave', h.stop);
  }
  touchHandlers = {};
}
