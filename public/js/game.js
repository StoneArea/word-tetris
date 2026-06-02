// ===== 테트리스 + 단어 퀴즈 엔진 =====

const COLS = 10;
const ROWS = 20;
const CELL = 24; // px per cell

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

let canvas, ctx, canvasW, canvasH;
let grid, piece, nextPiece, bag;
let gameRunning = false, paused = false, quizActive = false;
let score, combo, maxCombo, level, linesCleared, wordIdx;
let dropInterval, dropTimer, lockTimer;
let animId, lastTime;
let gameWords, gameName, gameBook;
let wrongWords, correctCount, wrongCount;
let pendingLines; // 클리어 대기 라인

// ===== 초기화 =====
function startGame(words, book, name) {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');

  // 캔버스 크기 계산
  const area = document.querySelector('.game-area');
  const maxH = area.clientHeight - 10;
  const cellFromH = Math.floor(maxH / ROWS);
  const cellSize = Math.min(cellFromH, 28);
  canvasW = cellSize * COLS;
  canvasH = cellSize * ROWS;
  canvas.width = canvasW;
  canvas.height = canvasH;
  // CELL을 동적으로
  window._CELL = cellSize;

  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  score = 0; combo = 0; maxCombo = 0; level = 1; linesCleared = 0; wordIdx = 0;
  dropInterval = 1000; dropTimer = 0; lockTimer = 0;
  gameWords = [...words].sort(() => Math.random() - 0.5);
  gameName = name; gameBook = book;
  wrongWords = []; correctCount = 0; wrongCount = 0;
  pendingLines = [];
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
  if (bag.length === 0) bag = [...PIECE_NAMES].sort(() => Math.random() - 0.5);
  const name = bag.pop();
  const p = PIECES[name];
  return {
    shape: p.shape.map(r => [...r]),
    color: p.color,
    x: Math.floor((COLS - p.shape[0].length) / 2),
    y: 0
  };
}

// ===== 충돌 검사 =====
function isValid(shape, px, py) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = px + c, ny = py + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
      if (ny >= 0 && grid[ny][nx]) return false;
    }
  }
  return true;
}

// ===== 회전 =====
function rotate(shape) {
  const N = shape.length;
  const rot = Array.from({ length: N }, () => Array(N).fill(0));
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      rot[c][N - 1 - r] = shape[r][c];
  return rot;
}

function tryRotate() {
  const rotated = rotate(piece.shape);
  // 벽차기 (wall kick)
  for (const dx of [0, -1, 1, -2, 2]) {
    if (isValid(rotated, piece.x + dx, piece.y)) {
      piece.shape = rotated;
      piece.x += dx;
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
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      const ny = piece.y + r, nx = piece.x + c;
      if (ny < 0) { gameOver(); return; }
      grid[ny][nx] = piece.color;
    }
  }

  // 라인 클리어 체크
  const full = [];
  for (let r = 0; r < ROWS; r++) {
    if (grid[r].every(c => c !== 0)) full.push(r);
  }

  if (full.length > 0) {
    pendingLines = full;
    showQuiz(full.length);
  } else {
    nextTurn();
  }
}

function nextTurn() {
  piece = nextPiece;
  nextPiece = spawnPiece();
  dropTimer = 0;

  if (!isValid(piece.shape, piece.x, piece.y)) {
    gameOver();
  }
}

// ===== 라인 클리어 =====
function clearLines(lines) {
  lines.sort((a, b) => a - b);
  for (const row of lines) {
    grid.splice(row, 1);
    grid.unshift(Array(COLS).fill(0));
  }
  const n = lines.length;
  const lineScore = [0, 100, 300, 500, 800][n] || n * 200;
  score += lineScore * level;
  linesCleared += n;
  level = Math.floor(linesCleared / 10) + 1;
  dropInterval = Math.max(100, 1000 - (level - 1) * 80);
  updateHUD();
}

function addGarbageLine() {
  const hole = Math.floor(Math.random() * COLS);
  grid.shift();
  const garbageRow = Array(COLS).fill('#555');
  garbageRow[hole] = 0;
  grid.push(garbageRow);
}

// ===== 퀴즈 =====
function showQuiz(lineCount) {
  if (wordIdx >= gameWords.length) {
    // 단어 소진 시 셔플 반복
    gameWords = [...gameWords].sort(() => Math.random() - 0.5);
    wordIdx = 0;
  }

  const word = gameWords[wordIdx++];
  quizActive = true;
  paused = true;

  const overlay = document.getElementById('quiz-overlay');
  const meaningEl = document.getElementById('quiz-meaning');
  const choicesEl = document.getElementById('quiz-choices');
  const typingEl = document.getElementById('quiz-typing');
  const feedbackEl = document.getElementById('quiz-feedback');

  meaningEl.textContent = word.meaning;
  feedbackEl.textContent = '';

  // 레벨 7+ 에서 타이핑모드
  if (level >= 7) {
    choicesEl.classList.add('hidden');
    typingEl.classList.remove('hidden');
    const input = document.getElementById('quiz-input');
    input.value = '';
    overlay.classList.remove('hidden');
    setTimeout(() => input.focus(), 100);

    const handler = (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      input.removeEventListener('keydown', handler);
      const ans = input.value.trim().toLowerCase();
      const correct = word.word.toLowerCase();
      // sentence_answer도 체크 (활용형)
      const altAnswer = (word.sentence_answer || '').toLowerCase();
      if (ans === correct || (altAnswer && ans === altAnswer)) {
        onQuizCorrect(word, lineCount);
      } else {
        onQuizWrong(word, lineCount, correct);
      }
    };
    input.addEventListener('keydown', handler);
  } else {
    // 4지선다
    typingEl.classList.add('hidden');
    choicesEl.classList.remove('hidden');
    const correct = word.word;
    const choices = [correct];
    const others = gameWords.filter(w => w.word !== correct).sort(() => Math.random() - 0.5).slice(0, 3).map(w => w.word);
    choices.push(...others);
    while (choices.length < 4) choices.push('---');
    const shuffled = choices.sort(() => Math.random() - 0.5);

    choicesEl.innerHTML = shuffled.map(w =>
      `<button class="quiz-choice-btn" data-word="${w}">${w}</button>`
    ).join('');

    overlay.classList.remove('hidden');

    choicesEl.querySelectorAll('.quiz-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // 이미 답한 경우 무시
        if (btn.classList.contains('correct') || btn.classList.contains('wrong')) return;
        choicesEl.querySelectorAll('.quiz-choice-btn').forEach(b => b.style.pointerEvents = 'none');
        if (btn.dataset.word === correct) {
          btn.classList.add('correct');
          onQuizCorrect(word, lineCount);
        } else {
          btn.classList.add('wrong');
          choicesEl.querySelector(`[data-word="${correct}"]`)?.classList.add('correct');
          onQuizWrong(word, lineCount, correct);
        }
      });
    });
  }
}

function onQuizCorrect(word, lineCount) {
  const fb = document.getElementById('quiz-feedback');
  fb.textContent = '✓ 정답!';
  fb.style.color = '#10b981';
  correctCount++;
  combo++;
  if (combo > maxCombo) maxCombo = combo;
  score += 50 * combo;
  clearLines(pendingLines);

  setTimeout(closeQuiz, 600);
}

function onQuizWrong(word, lineCount, correctWord) {
  const fb = document.getElementById('quiz-feedback');
  fb.textContent = `✗ 정답: ${correctWord}`;
  fb.style.color = '#ef4444';
  wrongCount++;
  combo = 0;
  wrongWords.push({ word: word.word, meaning: word.meaning });

  // 틀리면 라인 안 지우고 garbage 추가
  pendingLines = [];
  addGarbageLine();
  updateHUD();

  setTimeout(closeQuiz, 1200);
}

function closeQuiz() {
  document.getElementById('quiz-overlay').classList.add('hidden');
  quizActive = false;
  paused = false;
  pendingLines = [];
  nextTurn();
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
  const total = correctCount + wrongCount;
  const acc = total > 0 ? Math.round(correctCount / total * 100) : 0;

  document.getElementById('final-score').textContent = score;
  document.getElementById('accuracy').textContent = acc + '%';
  document.getElementById('max-combo').textContent = maxCombo;
  document.getElementById('final-lines').textContent = linesCleared;

  // 틀린 단어
  const unique = [];
  const seen = new Set();
  for (const w of wrongWords) {
    if (!seen.has(w.word)) { seen.add(w.word); unique.push(w); }
  }
  const wl = document.getElementById('wrong-list');
  const ww = document.getElementById('wrong-words');
  if (unique.length) {
    wl.classList.remove('hidden');
    ww.innerHTML = unique.map(w =>
      `<div class="wrong-word-item"><span class="eng">${w.word}</span><span class="kor">${w.meaning}</span></div>`
    ).join('');
  } else {
    wl.classList.add('hidden');
  }

  // 랭킹 저장
  saveRanking(gameName, gameBook, score, correctCount, wrongCount, maxCombo, 'tetris');

  showScreen('result-screen');
}

// ===== 게임 루프 =====
function gameLoop(ts) {
  if (!gameRunning) return;
  const dt = ts - lastTime;
  lastTime = ts;

  if (!paused) {
    dropTimer += dt;
    if (dropTimer >= dropInterval) {
      dropTimer = 0;
      if (isValid(piece.shape, piece.x, piece.y + 1)) {
        piece.y++;
      } else {
        lockPiece();
      }
    }
  }

  draw();
  animId = requestAnimationFrame(gameLoop);
}

// ===== 렌더링 =====
function draw() {
  const C = window._CELL;
  ctx.clearRect(0, 0, canvasW, canvasH);

  // 그리드 배경
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5;
  for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c*C, 0); ctx.lineTo(c*C, canvasH); ctx.stroke(); }
  for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r*C); ctx.lineTo(canvasW, r*C); ctx.stroke(); }

  // 고정된 블록
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c]) {
        const isPending = pendingLines.includes(r);
        drawCell(c, r, grid[r][c], isPending ? 0.5 : 1.0, C);
      }
    }
  }

  if (!paused && piece) {
    // 고스트 (착지 미리보기)
    let ghostY = piece.y;
    while (isValid(piece.shape, piece.x, ghostY + 1)) ghostY++;
    if (ghostY !== piece.y) {
      for (let r = 0; r < piece.shape.length; r++) {
        for (let c = 0; c < piece.shape[r].length; c++) {
          if (piece.shape[r][c]) drawCell(piece.x + c, ghostY + r, piece.color, 0.2, C);
        }
      }
    }

    // 현재 조각
    for (let r = 0; r < piece.shape.length; r++) {
      for (let c = 0; c < piece.shape[r].length; c++) {
        if (piece.shape[r][c]) drawCell(piece.x + c, piece.y + r, piece.color, 1.0, C);
      }
    }
  }
}

function drawCell(x, y, color, alpha, C) {
  if (y < 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x * C + 1, y * C + 1, C - 2, C - 2);
  // 하이라이트
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x * C + 1, y * C + 1, C - 2, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(x * C + 1, y * C + C - 4, C - 2, 3);
  ctx.restore();
}

// ===== 컨트롤 =====
let keyHandler, touchHandlers = {};

function setupControls() {
  // 키보드
  keyHandler = (e) => {
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

  // 모바일 버튼
  const addTouch = (id, fn, repeat = false) => {
    const el = document.getElementById(id);
    if (!el) return;
    let interval;
    const start = (e) => { e.preventDefault(); fn(); if (repeat) interval = setInterval(fn, 100); };
    const stop = () => { if (interval) clearInterval(interval); };
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend', stop);
    el.addEventListener('mousedown', start);
    el.addEventListener('mouseup', stop);
    touchHandlers[id] = { start, stop, el };
  };

  addTouch('ctrl-left', moveLeft, true);
  addTouch('ctrl-right', moveRight, true);
  addTouch('ctrl-down', softDrop, true);
  addTouch('ctrl-rotate', tryRotate);
  addTouch('ctrl-drop', hardDrop);
}

function removeControls() {
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  for (const h of Object.values(touchHandlers)) {
    h.el.removeEventListener('touchstart', h.start);
    h.el.removeEventListener('touchend', h.stop);
    h.el.removeEventListener('mousedown', h.start);
    h.el.removeEventListener('mouseup', h.stop);
  }
  touchHandlers = {};
}
