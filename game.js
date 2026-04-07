/* ============================================================
   JIGSAW PUZZLE — game.js
   ============================================================ */

// ── Constants ────────────────────────────────────────────────
const DIFFICULTIES = {
  easy:   { cols: 3, rows: 3 },
  medium: { cols: 4, rows: 4 },
  hard:   { cols: 6, rows: 6 },
};

const TAB_RATIO    = 0.28;   // tab height as fraction of min(baseW, baseH)
const SNAP_PX      = 28;     // pixel radius for snap
const SNAP_DEG     = 25;     // angle tolerance for snap (degrees)
const BOARD_RATIO  = 0.70;   // puzzle board occupies this fraction of canvas
const TIMEOUT_MS   = 3200;   // ms to show completed image after time-up

// ── App-level state ──────────────────────────────────────────
const app = {
  difficulty:   'medium',
  timerSec:     120,
  randomize:    false,
  uploads:      [],   // { dataUrl, name, img }
  order:        [],   // indices into uploads[]
  currentIdx:   0,
  results:      [],   // { name, completed, timeSec, missed }
  savedSettings: null,
};

// ── Puzzle state (set per puzzle) ────────────────────────────
let pz = null;
/*  pz = {
      pieces[], boardX, boardY, boardW, boardH,
      baseW, baseH, tabSize, cols, rows,
      imgCanvas, uploadIdx, name,
      totalPieces, placedCount, complete, timedOut,
      dragPiece, dragOX, dragOY,
      timerRemaining, timerInterval, startTime
    }
*/

// ── Canvas refs ──────────────────────────────────────────────
let canvas, ctx, ccvs, cctx;
let rafId = null;

// ── Confetti ─────────────────────────────────────────────────
let cfParticles = [];
let cfActive    = false;
const CF_COLORS = ['#ff6584','#6c63ff','#43e97b','#ffd166','#06d6a0','#ef476f','#26c6da','#ffa552'];

/* ============================================================
   BOOT
   ============================================================ */
window.addEventListener('DOMContentLoaded', () => {
  canvas = gid('puzzle-canvas');
  ctx    = canvas.getContext('2d');
  ccvs   = gid('confetti-canvas');
  cctx   = ccvs.getContext('2d');

  setupScreen();
  attachCanvasEvents();
});

/* ============================================================
   SETUP SCREEN
   ============================================================ */
function setupScreen() {
  // Difficulty buttons
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      app.difficulty = btn.dataset.diff;
    });
  });

  // Timer
  const timerEl = gid('timer-input');
  timerEl.addEventListener('input', () => {
    app.timerSec = Math.max(0, parseInt(timerEl.value) || 0);
  });

  // Randomize
  gid('randomize-toggle').addEventListener('change', e => {
    app.randomize = e.target.checked;
  });

  // Upload area
  const area    = gid('upload-area');
  const fileEl  = gid('file-input');
  area.addEventListener('click',      ()  => fileEl.click());
  area.addEventListener('dragover',   e   => { e.preventDefault(); area.classList.add('drag-over'); });
  area.addEventListener('dragleave',  ()  => area.classList.remove('drag-over'));
  area.addEventListener('drop',       e   => { e.preventDefault(); area.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); });
  fileEl.addEventListener('change',   ()  => handleFiles(fileEl.files));

  // Buttons
  gid('start-btn').addEventListener('click',   startGame);
  gid('next-btn').addEventListener('click',    nextPuzzle);
  gid('restart-btn').addEventListener('click', restartGame);
  gid('menu-btn').addEventListener('click',    mainMenu);
}

// ── File handling ────────────────────────────────────────────
function handleFiles(fileList) {
  const slots = 10 - app.uploads.length;
  Array.from(fileList).slice(0, slots).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        app.uploads.push({ dataUrl: ev.target.result, name: '', img });
        renderImageList();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderImageList() {
  const list = gid('image-list');
  list.innerHTML = '';
  gid('image-count').textContent = `${app.uploads.length} / 10`;
  gid('start-btn').disabled = app.uploads.length === 0;
  gid('upload-area').style.display = app.uploads.length >= 10 ? 'none' : 'block';

  app.uploads.forEach((u, i) => {
    const div = document.createElement('div');
    div.className = 'img-item';
    div.innerHTML = `
      <img class="img-thumb" src="${u.dataUrl}" alt="">
      <div class="img-meta">
        <input type="text" placeholder="Name / description (optional)" value="${esc(u.name)}">
        <div class="img-num">Image ${i + 1}</div>
      </div>
      <button class="img-remove" title="Remove">✕</button>`;
    div.querySelector('input').addEventListener('input', e => { app.uploads[i].name = e.target.value; });
    div.querySelector('.img-remove').addEventListener('click', () => { app.uploads.splice(i, 1); renderImageList(); });
    list.appendChild(div);
  });
}

/* ============================================================
   GAME FLOW
   ============================================================ */
function startGame() {
  app.savedSettings = {
    difficulty: app.difficulty,
    timerSec:   app.timerSec,
    randomize:  app.randomize,
    uploads:    app.uploads,
  };
  app.order      = app.uploads.map((_, i) => i);
  if (app.randomize) shuffle(app.order);
  app.currentIdx = 0;
  app.results    = [];

  showScreen('puzzle-screen');
  loadPuzzle(0);
}

function nextPuzzle() {
  hideOverlay('completion-overlay');
  app.currentIdx++;
  if (app.currentIdx >= app.order.length) showSummary();
  else loadPuzzle(app.currentIdx);
}

function restartGame() {
  const s = app.savedSettings;
  Object.assign(app, {
    difficulty: s.difficulty,
    timerSec:   s.timerSec,
    randomize:  s.randomize,
    uploads:    s.uploads,
  });
  app.order      = app.uploads.map((_, i) => i);
  if (app.randomize) shuffle(app.order);
  app.currentIdx = 0;
  app.results    = [];

  showScreen('puzzle-screen');
  loadPuzzle(0);
}

function mainMenu() {
  stopAllPuzzle();
  app.uploads = [];
  app.results = [];
  // Reset setup UI
  gid('file-input').value = '';
  gid('image-list').innerHTML = '';
  gid('image-count').textContent = '0 / 10';
  gid('start-btn').disabled = true;
  gid('upload-area').style.display = 'block';
  gid('randomize-toggle').checked = false;
  app.randomize = false;
  showScreen('setup-screen');
}

function stopAllPuzzle() {
  if (pz && pz.timerInterval) clearInterval(pz.timerInterval);
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  stopConfetti();
  pz = null;
}

/* ============================================================
   LOAD PUZZLE
   ============================================================ */
function loadPuzzle(idx) {
  // Clean up previous
  if (pz && pz.timerInterval) clearInterval(pz.timerInterval);
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  stopConfetti();
  hideOverlay('completion-overlay');
  hideOverlay('timeout-overlay');

  const uploadIdx = app.order[idx];
  const upload    = app.uploads[uploadIdx];
  const { cols, rows } = DIFFICULTIES[app.difficulty];

  // Size the canvases to fill the wrapper
  const wrapper = document.querySelector('.canvas-wrapper');
  const W = wrapper.clientWidth  || window.innerWidth;
  const H = wrapper.clientHeight || (window.innerHeight - 60);
  canvas.width  = W;  canvas.height = H;
  ccvs.width    = W;  ccvs.height   = H;

  // Board dimensions (maintain image aspect ratio)
  const iw = upload.img.naturalWidth  || 800;
  const ih = upload.img.naturalHeight || 600;
  const aspect   = iw / ih;
  const maxBW    = W * BOARD_RATIO;
  const maxBH    = H * BOARD_RATIO;
  let boardW = maxBW;
  let boardH = boardW / aspect;
  if (boardH > maxBH) { boardH = maxBH; boardW = boardH * aspect; }
  const boardX = (W - boardW) / 2;
  const boardY = (H - boardH) / 2;

  const baseW   = boardW / cols;
  const baseH   = boardH / rows;
  const tabSize = Math.min(baseW, baseH) * TAB_RATIO;

  // Scale source image to board size once
  const imgCvs = document.createElement('canvas');
  imgCvs.width = boardW; imgCvs.height = boardH;
  imgCvs.getContext('2d').drawImage(upload.img, 0, 0, boardW, boardH);

  // Generate shared edge types
  const hEdges = genEdges(rows, cols, true);   // top edge of each piece (row≥1)
  const vEdges = genEdges(rows, cols, false);  // left edge of each piece (col≥1)

  // Build pieces
  const pieces = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const top    = r === 0        ? 'flat' : hEdges[key(r,   c)];
      const bottom = r === rows - 1 ? 'flat' : flip(hEdges[key(r+1, c)]);
      const left   = c === 0        ? 'flat' : vEdges[key(r,   c)];
      const right  = c === cols - 1 ? 'flat' : flip(vEdges[key(r,   c+1)]);
      const edges  = { top, bottom, left, right };

      const homeX = boardX + c * baseW + baseW / 2;
      const homeY = boardY + r * baseH + baseH / 2;

      pieces.push({
        r, c,
        x: homeX, y: homeY,   // will be overwritten by scatter
        angle:  0,
        placed: false,
        homeX, homeY,
        edges,
        baseW, baseH, tabSize,
        pcvs: buildPieceCanvas(imgCvs, r, c, baseW, baseH, tabSize, edges),
      });
    }
  }

  scatter(pieces, W, H, boardX, boardY, boardW, boardH, tabSize);

  // Header
  gid('puzzle-number').textContent = `Puzzle ${idx + 1} of ${app.order.length}`;
  gid('puzzle-name').textContent   = upload.name || '';
  gid('pieces-placed').textContent = '0';
  gid('pieces-total').textContent  = pieces.length;

  // Timer display
  const timerEl = gid('timer-display');
  if (app.timerSec > 0) {
    timerEl.classList.remove('hidden', 'urgent');
    setTimerDisplay(app.timerSec);
  } else {
    timerEl.classList.add('hidden');
  }

  pz = {
    pieces, boardX, boardY, boardW, boardH,
    baseW, baseH, tabSize, cols, rows,
    imgCanvas: imgCvs, uploadIdx, name: upload.name,
    totalPieces: pieces.length, placedCount: 0,
    complete: false, timedOut: false,
    dragPiece: null, dragOX: 0, dragOY: 0,
    timerRemaining: app.timerSec,
    timerInterval: null,
    startTime: Date.now(),
  };

  if (app.timerSec > 0) {
    pz.timerInterval = setInterval(tickTimer, 1000);
  }

  rafId = requestAnimationFrame(renderLoop);
}

/* ============================================================
   EDGE GENERATION
   ============================================================ */
function genEdges(rows, cols, horizontal) {
  const map = {};
  if (horizontal) {
    for (let r = 1; r < rows; r++)
      for (let c = 0; c < cols; c++)
        map[key(r, c)] = Math.random() < 0.5 ? 'out' : 'in';
  } else {
    for (let r = 0; r < rows; r++)
      for (let c = 1; c < cols; c++)
        map[key(r, c)] = Math.random() < 0.5 ? 'out' : 'in';
  }
  return map;
}
const key  = (r, c)  => `${r},${c}`;
const flip = t       => t === 'out' ? 'in' : t === 'in' ? 'out' : 'flat';

/* ============================================================
   BUILD PIECE CANVAS (offscreen)
   ============================================================ */
function buildPieceCanvas(imgCvs, r, c, baseW, baseH, tabSize, edges) {
  const ts  = tabSize;
  const pw  = Math.ceil(baseW + 2 * ts);
  const ph  = Math.ceil(baseH + 2 * ts);

  const pc   = document.createElement('canvas');
  pc.width   = pw;
  pc.height  = ph;
  const pctx = pc.getContext('2d');

  const path = jigsawPath(edges, baseW, baseH, ts);

  // Clip and draw image
  pctx.save();
  pctx.clip(path);
  // Shift so the piece's image region aligns with the piece canvas
  pctx.drawImage(imgCvs, ts - c * baseW, ts - r * baseH);
  pctx.restore();

  // Stroke border
  pctx.save();
  pctx.strokeStyle = 'rgba(0,0,0,0.32)';
  pctx.lineWidth   = 1.8;
  pctx.stroke(path);
  pctx.restore();

  return pc;
}

/* ============================================================
   JIGSAW PATH (Path2D)

   Piece canvas layout:
     (0,0)──────────────(pw,0)
       │                  │
       │  [ts,ts]──[ts+bW,ts]  │   ← base cell top-left at (ts,ts)
       │                  │
     (0,ph)────────────(pw,ph)

   'out' → tab protrudes outside base cell (fills the ts padding)
   'in'  → blank protrudes inside base cell
   ============================================================ */
function jigsawPath(edges, bW, bH, ts) {
  const { top, bottom, left, right } = edges;
  const p = new Path2D();
  p.moveTo(ts, ts);

  // Top edge → left to right
  if (top === 'flat') {
    p.lineTo(ts + bW, ts);
  } else {
    const d = top === 'out' ? -1 : 1;   // -1 = up, +1 = down
    p.lineTo(ts + bW * 0.35, ts);
    p.bezierCurveTo(ts + bW * 0.35, ts + d * ts * 0.7,
                    ts + bW * 0.40, ts + d * ts,
                    ts + bW * 0.50, ts + d * ts);
    p.bezierCurveTo(ts + bW * 0.60, ts + d * ts,
                    ts + bW * 0.65, ts + d * ts * 0.7,
                    ts + bW * 0.65, ts);
    p.lineTo(ts + bW, ts);
  }

  // Right edge ↓ top to bottom
  if (right === 'flat') {
    p.lineTo(ts + bW, ts + bH);
  } else {
    const d = right === 'out' ? 1 : -1;  // +1 = right, -1 = left
    p.lineTo(ts + bW, ts + bH * 0.35);
    p.bezierCurveTo(ts + bW + d * ts * 0.7, ts + bH * 0.35,
                    ts + bW + d * ts,        ts + bH * 0.40,
                    ts + bW + d * ts,        ts + bH * 0.50);
    p.bezierCurveTo(ts + bW + d * ts,        ts + bH * 0.60,
                    ts + bW + d * ts * 0.7, ts + bH * 0.65,
                    ts + bW,                 ts + bH * 0.65);
    p.lineTo(ts + bW, ts + bH);
  }

  // Bottom edge ← right to left
  if (bottom === 'flat') {
    p.lineTo(ts, ts + bH);
  } else {
    const d = bottom === 'out' ? 1 : -1;  // +1 = down, -1 = up
    p.lineTo(ts + bW * 0.65, ts + bH);
    p.bezierCurveTo(ts + bW * 0.65, ts + bH + d * ts * 0.7,
                    ts + bW * 0.60, ts + bH + d * ts,
                    ts + bW * 0.50, ts + bH + d * ts);
    p.bezierCurveTo(ts + bW * 0.40, ts + bH + d * ts,
                    ts + bW * 0.35, ts + bH + d * ts * 0.7,
                    ts + bW * 0.35, ts + bH);
    p.lineTo(ts, ts + bH);
  }

  // Left edge ↑ bottom to top
  if (left === 'flat') {
    p.lineTo(ts, ts);
  } else {
    const d = left === 'out' ? -1 : 1;   // -1 = left, +1 = right
    p.lineTo(ts, ts + bH * 0.65);
    p.bezierCurveTo(ts + d * ts * 0.7, ts + bH * 0.65,
                    ts + d * ts,        ts + bH * 0.60,
                    ts + d * ts,        ts + bH * 0.50);
    p.bezierCurveTo(ts + d * ts,        ts + bH * 0.40,
                    ts + d * ts * 0.7, ts + bH * 0.35,
                    ts,                 ts + bH * 0.35);
    p.lineTo(ts, ts);
  }

  p.closePath();
  return p;
}

/* ============================================================
   SCATTER PIECES
   ============================================================ */
function scatter(pieces, W, H, bx, by, bw, bh, ts) {
  const pad = ts * 2;
  const zoneX1 = bx - pad, zoneX2 = bx + bw + pad;
  const zoneY1 = by - pad, zoneY2 = by + bh + pad;

  pieces.forEach(pc => {
    let x, y, tries = 0;
    do {
      x = pad + Math.random() * (W - pad * 2);
      y = pad + Math.random() * (H - pad * 2);
      tries++;
    } while (tries < 40 && x > zoneX1 && x < zoneX2 && y > zoneY1 && y < zoneY2);
    pc.x     = x;
    pc.y     = y;
    pc.angle = [0, 90, 180, 270][Math.floor(Math.random() * 4)];
  });
}

/* ============================================================
   RENDER LOOP
   ============================================================ */
function renderLoop() {
  rafId = requestAnimationFrame(renderLoop);
  render();
}

function render() {
  if (!pz) return;
  const { pieces, dragPiece, boardX, boardY, boardW, boardH, cols, rows, baseW, baseH } = pz;
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // Background gradient
  const grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H)*0.8);
  grad.addColorStop(0, '#1e1b4b');
  grad.addColorStop(1, '#0a0820');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // When the timer has expired, just show the solved image on the board and stop
  if (pz.timedOut) {
    ctx.drawImage(pz.imgCanvas, boardX, boardY, boardW, boardH);
    // Faint border around the revealed image
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth   = 2;
    ctx.strokeRect(boardX, boardY, boardW, boardH);
    return;
  }

  // Board guide
  drawBoard(boardX, boardY, boardW, boardH, cols, rows, baseW, baseH);

  // Snap hint (highlight home position of dragged piece)
  if (dragPiece && !dragPiece.placed) {
    const dist  = Math.hypot(dragPiece.x - dragPiece.homeX, dragPiece.y - dragPiece.homeY);
    const adeg  = Math.abs(normAngle(dragPiece.angle));
    if (dist < SNAP_PX * 2.5 && adeg < SNAP_DEG * 1.5) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 220, 50, 0.55)';
      ctx.lineWidth   = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(dragPiece.homeX - dragPiece.baseW / 2,
                     dragPiece.homeY - dragPiece.baseH / 2,
                     dragPiece.baseW, dragPiece.baseH);
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // Draw placed pieces first, then unplaced, then dragged (z-order)
  pieces.forEach(p => { if (p.placed  && p !== dragPiece) drawPiece(p, false); });
  pieces.forEach(p => { if (!p.placed && p !== dragPiece) drawPiece(p, true); });
  if (dragPiece) drawPiece(dragPiece, true);

  // Confetti
  if (cfActive) renderConfetti();
}

function drawBoard(bx, by, bw, bh, cols, rows, bW, bH) {
  // Faint board fill
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  ctx.fillRect(bx, by, bw, bh);

  // Grid lines
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([4, 5]);
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath();
    ctx.moveTo(bx + c * bW, by);
    ctx.lineTo(bx + c * bW, by + bh);
    ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(bx, by + r * bH);
    ctx.lineTo(bx + bw, by + r * bH);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Board border
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth   = 2;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.restore();
}

function drawPiece(p, shadow) {
  const { x, y, angle, pcvs, baseW, baseH, tabSize } = p;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle * Math.PI / 180);
  if (shadow) {
    ctx.shadowColor   = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur    = 12;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;
  }
  ctx.drawImage(pcvs, -(tabSize + baseW / 2), -(tabSize + baseH / 2));
  ctx.restore();
}

/* ============================================================
   MOUSE / TOUCH EVENTS
   ============================================================ */
function attachCanvasEvents() {
  canvas.addEventListener('mousedown',    onDown);
  canvas.addEventListener('mousemove',    onMove);
  window.addEventListener('mouseup',      onUp);
  canvas.addEventListener('contextmenu',  onRightClick);
  canvas.addEventListener('touchstart',   onTouchStart,  { passive: false });
  canvas.addEventListener('touchmove',    onTouchMove,   { passive: false });
  canvas.addEventListener('touchend',     onTouchEnd);
}

function cvPos(e) {
  const r  = canvas.getBoundingClientRect();
  const sx = canvas.width  / r.width;
  const sy = canvas.height / r.height;
  return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
}

function pieceAt(mx, my) {
  if (!pz) return null;
  for (let i = pz.pieces.length - 1; i >= 0; i--) {
    const p = pz.pieces[i];
    if (p.placed) continue;
    if (hitTest(mx, my, p)) return p;
  }
  return null;
}

function hitTest(mx, my, p) {
  const dx  = mx - p.x, dy = my - p.y;
  const rad = -p.angle * Math.PI / 180;
  const lx  = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly  = dx * Math.sin(rad) + dy * Math.cos(rad);
  const hw  = p.baseW / 2 + p.tabSize;
  const hh  = p.baseH / 2 + p.tabSize;
  return lx >= -hw && lx <= hw && ly >= -hh && ly <= hh;
}

function onDown(e) {
  if (e.button !== 0 || !pz || pz.complete) return;
  const { x, y } = cvPos(e);
  const p = pieceAt(x, y);
  if (!p) return;
  startDrag(p, x, y);
}

function onMove(e) {
  if (!pz || !pz.dragPiece) return;
  const { x, y } = cvPos(e);
  pz.dragPiece.x = x - pz.dragOX;
  pz.dragPiece.y = y - pz.dragOY;
}

function onUp() {
  if (!pz || !pz.dragPiece) return;
  const p = pz.dragPiece;
  pz.dragPiece = null;
  if (!pz.complete) trySnap(p);
}

function onRightClick(e) {
  e.preventDefault();
  if (!pz || pz.complete) return;
  const { x, y } = cvPos(e);
  const p = pieceAt(x, y);
  if (p) { p.angle = (p.angle + 90) % 360; trySnap(p); }
}

// Touch support
let lastTap = { piece: null, time: 0 };

function onTouchStart(e) {
  e.preventDefault();
  if (!pz || pz.complete || e.touches.length !== 1) return;
  const t       = e.touches[0];
  const { x, y } = cvPos(t);
  const p       = pieceAt(x, y);
  const now     = Date.now();

  // Double-tap = rotate
  if (p && p === lastTap.piece && now - lastTap.time < 320) {
    p.angle = (p.angle + 90) % 360;
    trySnap(p);
    lastTap = { piece: null, time: 0 };
    return;
  }
  lastTap = { piece: p, time: now };
  if (p) startDrag(p, x, y);
}

function onTouchMove(e) {
  e.preventDefault();
  if (!pz || !pz.dragPiece || e.touches.length !== 1) return;
  const { x, y } = cvPos(e.touches[0]);
  pz.dragPiece.x = x - pz.dragOX;
  pz.dragPiece.y = y - pz.dragOY;
}

function onTouchEnd(e) {
  if (!pz || !pz.dragPiece) return;
  const p = pz.dragPiece;
  pz.dragPiece = null;
  if (!pz.complete) trySnap(p);
}

function startDrag(p, mx, my) {
  pz.dragPiece = p;
  pz.dragOX    = mx - p.x;
  pz.dragOY    = my - p.y;
  // Bring to top of rendering order
  const i = pz.pieces.indexOf(p);
  if (i !== -1) { pz.pieces.splice(i, 1); pz.pieces.push(p); }
}

/* ============================================================
   SNAP LOGIC
   ============================================================ */
function trySnap(p) {
  if (p.placed) return;
  const dist  = Math.hypot(p.x - p.homeX, p.y - p.homeY);
  const adiff = Math.abs(normAngle(p.angle));
  if (dist < SNAP_PX && adiff < SNAP_DEG) {
    p.x      = p.homeX;
    p.y      = p.homeY;
    p.angle  = 0;
    p.placed = true;
    pz.placedCount++;
    gid('pieces-placed').textContent = pz.placedCount;
    if (pz.placedCount === pz.totalPieces) onComplete();
  }
}

function normAngle(a) {
  a = ((a % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
}

/* ============================================================
   TIMER
   ============================================================ */
function tickTimer() {
  if (!pz || pz.complete) return;
  pz.timerRemaining--;
  setTimerDisplay(pz.timerRemaining);
  if (pz.timerRemaining <= 10) gid('timer-display').classList.add('urgent');
  if (pz.timerRemaining <= 0) {
    clearInterval(pz.timerInterval);
    onTimedOut();
  }
}

function setTimerDisplay(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  gid('timer-value').textContent = `${m}:${String(s).padStart(2, '0')}`;
}

/* ============================================================
   PUZZLE COMPLETE
   ============================================================ */
function onComplete() {
  pz.complete = true;
  if (pz.timerInterval) clearInterval(pz.timerInterval);

  const timeSec = Math.round((Date.now() - pz.startTime) / 1000);
  app.results.push({ name: pz.name || `Puzzle ${app.currentIdx + 1}`, completed: true, timeSec, missed: false });

  startConfetti();

  const desc = pz.name ? pz.name : 'Puzzle complete!';
  gid('completion-desc').textContent = desc;
  const isLast = app.currentIdx >= app.order.length - 1;
  gid('next-btn').textContent = isLast ? 'See Results →' : 'Next Puzzle →';

  setTimeout(() => showOverlay('completion-overlay'), 700);
}

/* ============================================================
   TIMER EXPIRED
   ============================================================ */
function onTimedOut() {
  pz.complete = true;
  pz.timedOut = true;

  app.results.push({ name: pz.name || `Puzzle ${app.currentIdx + 1}`, completed: false, timeSec: app.timerSec, missed: true });

  // Draw the full solved image over the board
  ctx.drawImage(pz.imgCanvas, pz.boardX, pz.boardY, pz.boardW, pz.boardH);

  showOverlay('timeout-overlay');
  setTimeout(() => {
    hideOverlay('timeout-overlay');
    app.currentIdx++;
    if (app.currentIdx >= app.order.length) showSummary();
    else loadPuzzle(app.currentIdx);
  }, TIMEOUT_MS);
}

/* ============================================================
   CONFETTI
   ============================================================ */
function startConfetti() {
  cfParticles = Array.from({ length: 160 }, () => ({
    x:        Math.random() * ccvs.width,
    y:        -10 - Math.random() * 120,
    w:        5 + Math.random() * 9,
    h:        9 + Math.random() * 7,
    color:    CF_COLORS[Math.floor(Math.random() * CF_COLORS.length)],
    vx:       (Math.random() - 0.5) * 3.5,
    vy:       2 + Math.random() * 3.5,
    rot:      Math.random() * 360,
    rotSpd:   (Math.random() - 0.5) * 9,
    opacity:  1,
  }));
  cfActive = true;
}

function stopConfetti() {
  cfActive    = false;
  cfParticles = [];
  if (cctx) cctx.clearRect(0, 0, ccvs.width, ccvs.height);
}

function renderConfetti() {
  cctx.clearRect(0, 0, ccvs.width, ccvs.height);
  let alive = false;
  cfParticles.forEach(p => {
    p.x   += p.vx;
    p.y   += p.vy;
    p.vy  += 0.06;
    p.rot += p.rotSpd;
    if (p.y < ccvs.height) alive = true;
    if (p.y > ccvs.height + 20) return;
    cctx.save();
    cctx.globalAlpha = p.opacity;
    cctx.translate(p.x, p.y);
    cctx.rotate(p.rot * Math.PI / 180);
    cctx.fillStyle = p.color;
    cctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    cctx.restore();
  });
  if (!alive) stopConfetti();
}

/* ============================================================
   SUMMARY SCREEN
   ============================================================ */
function showSummary() {
  stopAllPuzzle();

  const done  = app.results.filter(r => r.completed).length;
  const total = app.results.length;
  gid('summary-subtitle').textContent =
    `${done} of ${total} puzzle${total !== 1 ? 's' : ''} completed`;

  const el = gid('summary-results');
  el.innerHTML = '';

  app.results.forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.style.animationDelay = `${i * 0.07}s`;

    const timeStr = r.missed ? 'Time ran out' : fmtTime(r.timeSec);
    const status  = r.completed ? `Completed in ${timeStr}` : 'Time ran out';
    const icon    = r.completed ? '✅' : '⏰';
    const cls     = r.completed ? 'done' : 'missed';

    card.innerHTML = `
      <div class="res-num ${cls}">${i + 1}</div>
      <div class="res-info">
        <div class="res-name">${esc(r.name)}</div>
        <div class="res-status">${status}</div>
      </div>
      <div class="res-icon">${icon}</div>`;
    el.appendChild(card);
  });

  showScreen('summary-screen');
}

/* ============================================================
   SCREEN & OVERLAY HELPERS
   ============================================================ */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.style.display = '';
    s.classList.remove('active');
  });
  const s = gid(id);
  s.style.display = 'flex';
  s.classList.add('active');
}

function showOverlay(id)  { gid(id).classList.remove('hidden'); }
function hideOverlay(id)  { gid(id).classList.add('hidden'); }

/* ============================================================
   UTILITIES
   ============================================================ */
function gid(id) { return document.getElementById(id); }

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
