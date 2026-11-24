import { HandLandmarker } from "./lib/vision_bundle.mjs?v=3";

const $ = (s) => document.querySelector(s);
const video = $("#cam");
const bg = $("#bg"), bctx = bg.getContext("2d", { alpha: false });
const canvas = $("#fx"), ctx = canvas.getContext("2d");
const det = document.createElement("canvas"), dctx = det.getContext("2d");
const off = document.createElement("canvas"), octx = off.getContext("2d", { willReadFrequently: true });

const HINTS = {
  frame: "подними обе руки и разведи большой и указательный пальцы",
  draw: "сведи большой и указательный (щипок) и веди. замкни линию, и фигура зальётся. кулак стирает",
  web: "покажи обе руки ладонями к камере",
};
const FILTERS = ["тепловизор", "поп", "негатив", "монохром", "хром"];
const INKS = ["радуга", "белый"];
let mode = "frame", filterIdx = 0, inkIdx = 0, facing = "user", stream = null, landmarker = null;
let W = 0, H = 0, DPR = 1;

/* ---------- размеры ---------- */
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const bd = Math.min(DPR, 1.5);
  bg.width = Math.round(W * bd); bg.height = Math.round(H * bd);
  bctx.setTransform(bd, 0, 0, bd, 0, 0);
}
addEventListener("resize", resize); resize();

/* кадр камеры растягиваем на весь экран с обрезкой краёв */
function coverRect() {
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
  const s = Math.max(W / vw, H / vh);
  const dw = vw * s, dh = vh * s;
  return { x: (W - dw) / 2, y: (H - dh) / 2, w: dw, h: dh };
}
const mirrored = () => facing === "user";
function drawVideo(c, r) {
  c.save();
  if (mirrored()) { c.translate(W, 0); c.scale(-1, 1); c.drawImage(video, W - r.x - r.w, r.y, r.w, r.h); }
  else c.drawImage(video, r.x, r.y, r.w, r.h);
  c.restore();
}

/* фон: обычный цветной кадр камеры */
function drawBackground(r) { drawVideo(bctx, r); }

/* ---------- камера и модель ---------- */
async function openCamera() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
  });
  video.srcObject = stream;
  await video.play();
}

const SIZES = { wasm: 9.4e6, model: 7.8e6 }, got = { wasm: 0, model: 0 };
let onProgress = () => {};
async function fetchBytes(url, key) {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`файл ${url} не скачался (${res.status})`);
  const total = Number(res.headers.get("content-length")) || SIZES[key];
  SIZES[key] = total;
  if (!res.body || !res.body.getReader) { const b = new Uint8Array(await res.arrayBuffer()); got[key] = b.length; onProgress(); return b; }
  const reader = res.body.getReader(), chunks = []; let n = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); n += value.length; got[key] = n; onProgress(); }
  const out = new Uint8Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
const pct = () => Math.min(99, Math.round((got.wasm + got.model) / (SIZES.wasm + SIZES.model) * 100));
const assets = Promise.all([
  fetchBytes("./lib/vision_wasm_internal.wasm?v=2", "wasm"),
  fetchBytes("./models/hand_landmarker.task?v=2", "model"),
]);
assets.catch(() => {});
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
let delegateUsed = "";

async function loadModel(status) {
  onProgress = () => status(`загрузка ${pct()}%`);
  onProgress();
  const [wasm, model] = await assets;
  status("запуск…");
  const wasmUrl = URL.createObjectURL(new Blob([wasm], { type: "application/wasm" }));
  const files = { wasmLoaderPath: new URL("./lib/vision_wasm_internal.js?v=2", location.href).href, wasmBinaryPath: wasmUrl };
  const opts = (delegate) => ({
    baseOptions: { modelAssetBuffer: model, delegate },
    runningMode: "VIDEO", numHands: 2,
    minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.45, minTrackingConfidence: 0.45,
  });
  // видеокарта даёт плавность. если прошлый запуск на ней завис (метка осталась "trying"), сразу берём процессор
  const gpuState = store.get("nh_gpu");
  if (gpuState !== "trying" && gpuState !== "fail") {
    store.set("nh_gpu", "trying");
    try {
      const lm = await withTimeout(HandLandmarker.createFromOptions(files, opts("GPU")), 9000);
      store.set("nh_gpu", "ok"); delegateUsed = "GPU"; return lm;
    } catch (e) { console.warn("gpu off", e); store.set("nh_gpu", "fail"); }
  }
  const lm = await withTimeout(HandLandmarker.createFromOptions(files, opts("CPU")), 25000);
  delegateUsed = "CPU"; return lm;
}

$("#start").addEventListener("click", async () => {
  const btn = $("#start"), err = $("#err");
  btn.disabled = true; err.textContent = "";
  try {
    btn.textContent = "камера…";
    await openCamera();
    landmarker = await loadModel((s) => (btn.textContent = s));
    bg.classList.add("on"); $("#intro").classList.add("hide"); $("#hud").classList.add("on");
    setMode("frame");
    requestAnimationFrame(loop);
  } catch (e) {
    console.error(e);
    btn.disabled = false; btn.textContent = "ещё раз";
    err.textContent = e && e.name === "NotAllowedError"
      ? "доступ к камере запрещён. разреши его в настройках safari для этого сайта"
      : e && e.message === "timeout"
      ? "модель долго не запускается. закрой вкладку полностью и открой заново"
      : "не получилось запустить: " + (e && (e.message || e.name) || e);
  }
});

/* ---------- кнопки ---------- */
function setMode(m) {
  mode = m;
  document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
  $("#filter").hidden = m === "web";
  $("#ink").hidden = m !== "draw";
  $("#clear").hidden = m !== "draw";
  showHint(HINTS[m]);
}
document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
$("#filter").addEventListener("click", () => { filterIdx = (filterIdx + 1) % FILTERS.length; $("#filter").textContent = "фильтр: " + FILTERS[filterIdx]; });
$("#ink").addEventListener("click", () => { inkIdx = (inkIdx + 1) % INKS.length; $("#ink").textContent = "линия: " + INKS[inkIdx]; });
$("#clear").addEventListener("click", () => clearStrokes());
$("#flip").addEventListener("click", async () => {
  facing = facing === "user" ? "environment" : "user";
  try { await openCamera(); } catch (e) { facing = "user"; await openCamera(); }
  slots.length = 0;
});
let hintTimer = 0;
function showHint(t) { const h = $("#hint"); h.textContent = t; h.style.opacity = 1; clearTimeout(hintTimer); hintTimer = setTimeout(() => (h.style.opacity = 0), 6000); }

/* ---------- руки: трекинг + плавность ----------
   модель отдаёт точки 15–30 раз в секунду, рисуем 60. между ответами модели
   точки догоняют цель с небольшим упреждением по скорости, поэтому движение плавное */
const slots = []; // {target, vel, disp, seen, alive, pinch}
function ingest(raw, tNow) {
  const used = new Set();
  for (const pts of raw) {
    let best = -1, bd = 1e9;
    slots.forEach((s, i) => { if (used.has(i)) return; const d = Math.hypot(s.target[0].x - pts[0].x, s.target[0].y - pts[0].y); if (d < bd) { bd = d; best = i; } });
    if (best >= 0 && bd < Math.max(W, H) * 0.25) {
      const s = slots[best]; used.add(best);
      const dt = Math.max(0.008, tNow - s.seen);
      s.vel = pts.map((p, k) => ({ x: (p.x - s.target[k].x) / dt * 0.6 + s.vel[k].x * 0.4, y: (p.y - s.target[k].y) / dt * 0.6 + s.vel[k].y * 0.4 }));
      s.target = pts; s.seen = tNow;
    } else {
      slots.push({ target: pts, vel: pts.map(() => ({ x: 0, y: 0 })), disp: pts.map((p) => ({ x: p.x, y: p.y })), seen: tNow, alive: 0, pinch: false });
      used.add(slots.length - 1);
    }
  }
}
function stepHands(tNow, dt) {
  for (let i = slots.length - 1; i >= 0; i--) {
    const s = slots[i];
    const age = tNow - s.seen;
    if (age > 0.45) { slots.splice(i, 1); window.__dead = (window.__dead || 0) + 1; continue; }
    const lead = Math.min(age, 0.06);
    const k = 1 - Math.exp(-dt * 28);
    for (let j = 0; j < 21; j++) {
      const tx = s.target[j].x + s.vel[j].x * lead, ty = s.target[j].y + s.vel[j].y * lead;
      s.disp[j].x += (tx - s.disp[j].x) * k; s.disp[j].y += (ty - s.disp[j].y) * k;
    }
    s.alive = Math.min(1, s.alive + dt * 6) * (age > 0.25 ? Math.max(0, 1 - (age - 0.25) / 0.2) : 1);
  }
  return slots;
}

const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function extended(h, tip, pip) { return d2(h[tip], h[0]) > d2(h[pip], h[0]) * 1.12; }
function fist(h) { return d2(h[8], h[0]) < d2(h[5], h[0]) * 1.15 && d2(h[4], h[8]) > handSize(h) * 0.3 && !extended(h, 8, 6) && !extended(h, 12, 10) && !extended(h, 16, 14) && !extended(h, 20, 18); }
function handSize(h) { return d2(h[0], h[9]); }
function pinchState(s) {
  const h = s.disp, r = d2(h[4], h[8]) / handSize(h);
  s.pinch = s.pinch ? r < 0.42 : r < 0.26;
  return s.pinch;
}

const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const TIPS = [4, 8, 12, 16, 20];

function drawSkeleton(h, alpha) {
  ctx.lineCap = "round";
  ctx.lineWidth = 1.4; ctx.strokeStyle = `rgba(255,255,255,${0.7 * alpha})`;
  ctx.beginPath();
  BONES.forEach(([a, b]) => { ctx.moveTo(h[a].x, h[a].y); ctx.lineTo(h[b].x, h[b].y); });
  ctx.stroke();
  h.forEach((p, i) => {
    const tip = TIPS.includes(i);
    ctx.fillStyle = tip ? `rgba(255,255,255,${alpha})` : `rgba(200,206,214,${alpha * 0.9})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, tip ? 3 : 2, 0, Math.PI * 2); ctx.fill();
  });
}

/* ---------- блик, бегущий по контуру ---------- */
function along(segs, total, s) {
  s = ((s % total) + total) % total;
  for (const [a, b, l] of segs) { if (s <= l) { const u = l ? s / l : 0; return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }; } s -= l; }
  return segs[0][0];
}
function glintPath(points, t, closed) {
  const segs = []; let total = 0;
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i++) { const a = points[i], b = points[(i + 1) % points.length]; const l = d2(a, b); segs.push([a, b, l]); total += l; }
  if (!total) return;
  const len = Math.min(90, total * 0.18);
  const head = (t * 0.45 % 1) * total;
  ctx.save(); ctx.lineCap = "round";
  for (let k = 0; k < 14; k++) {
    const pa = along(segs, total, head - len * (k / 14)), pb = along(segs, total, head - len * ((k + 1) / 14));
    ctx.strokeStyle = `rgba(255,255,255,${(1 - k / 14) * 0.95})`; ctx.lineWidth = 2.4 - k * 0.1;
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
  }
  ctx.restore();
}

/* ---------- фильтры внутри фигур ---------- */
function lutFrom(stops) {
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) { const v = i / 255; let j = 0; while (j < stops.length - 2 && v > stops[j + 1][0]) j++;
    const [p0, c0] = stops[j], [p1, c1] = stops[j + 1]; const u = Math.min(1, Math.max(0, (v - p0) / (p1 - p0)));
    for (let k = 0; k < 3; k++) lut[i * 3 + k] = c0[k] + (c1[k] - c0[k]) * u; }
  return lut;
}
// тепловизор: синий → голубой → зелёный → жёлтый → красный, как в тиктоке
const THERMAL = lutFrom([[0,[10,20,120]],[0.2,[20,70,230]],[0.38,[30,200,240]],[0.52,[60,220,120]],[0.66,[250,230,40]],[0.82,[250,110,20]],[1,[220,20,30]]]);
// поп: четыре плоских цвета
const POP = [[20,30,140],[230,40,150],[30,210,230],[250,225,40]];

let filterFrame = -1;
function buildFilterImage(r, f, frameNo) {
  if (filterFrame === frameNo + f) return; // один раз за кадр на фильтр
  filterFrame = frameNo + f;
  const ow = 220, oh = Math.max(1, Math.round(ow * H / W));
  if (off.width !== ow || off.height !== oh) { off.width = ow; off.height = oh; }
  octx.save(); octx.setTransform(ow / W, 0, 0, oh / H, 0, 0); drawVideo(octx, r); octx.restore();
  const img = octx.getImageData(0, 0, ow, oh), d = img.data;
  // растягиваем контраст по кадру, чтобы цвета были сочными при любом свете
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 16) { const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; if (l < lo) lo = l; if (l > hi) hi = l; }
  const span = Math.max(40, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    let l = ((d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) - lo) / span * 255;
    l = Math.min(255, Math.max(0, l)) | 0;
    if (f === "тепловизор") { d[i] = THERMAL[l * 3]; d[i + 1] = THERMAL[l * 3 + 1]; d[i + 2] = THERMAL[l * 3 + 2]; }
    else { const c = POP[Math.min(3, (l / 64) | 0)]; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; }
  }
  octx.putImageData(img, 0, 0);
}
function paintFilter(r, poly, frameNo, alpha) {
  const f = FILTERS[filterIdx];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.clip();
  if (f === "монохром") {
    drawVideo(ctx, r);
    ctx.globalCompositeOperation = "saturation"; ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, W, H);
  } else if (f === "негатив") {
    drawVideo(ctx, r);
    ctx.globalCompositeOperation = "difference"; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  } else if (f === "хром") {
    drawVideo(ctx, r);
    ctx.globalCompositeOperation = "saturation"; ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "overlay"; drawVideo(ctx, r);
    ctx.globalCompositeOperation = "saturation"; ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "soft-light"; ctx.fillStyle = "rgba(150,175,205,.6)"; ctx.fillRect(0, 0, W, H);
  } else {
    buildFilterImage(r, f, frameNo);
    ctx.imageSmoothingEnabled = f !== "поп";
    ctx.drawImage(off, 0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
  }
  ctx.restore();
}

/* ---------- режим ОКНО ---------- */
let frameAlpha = 0, lastPoly = null;
function drawFrame(hands, r, t, dt, frameNo) {
  let poly = null;
  const live = hands.filter((s) => s.alive > 0.3);
  if (live.length >= 2) {
    const [L, R] = live[0].disp[0].x < live[1].disp[0].x ? [live[0].disp, live[1].disp] : [live[1].disp, live[0].disp];
    const open = (h) => d2(h[4], h[8]) > handSize(h) * 0.4;
    if (open(L) && open(R)) poly = [L[8], R[8], R[4], L[4]].map((p) => ({ x: p.x, y: p.y }));
  }
  frameAlpha += ((poly ? 1 : 0) - frameAlpha) * Math.min(1, dt * 12);
  if (poly) lastPoly = poly;
  if (frameAlpha > 0.02 && lastPoly) {
    const p = lastPoly;
    paintFilter(r, p, frameNo, frameAlpha);
    ctx.globalAlpha = frameAlpha;
    ctx.lineWidth = 1.5; ctx.strokeStyle = "#fff";
    ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.stroke();
    p.forEach((q) => ctx.strokeRect(q.x - 5, q.y - 5, 10, 10));
    glintPath(p, t, true);
    const top = p[0].y < p[1].y ? p[0] : p[1];
    ctx.font = "600 10px 'JetBrains Mono', monospace"; ctx.fillStyle = "#fff";
    ctx.fillText(FILTERS[filterIdx].toUpperCase(), Math.min(p[0].x, p[1].x), top.y - 12);
    ctx.globalAlpha = 1;
  }
  hands.forEach((s) => drawSkeleton(s.disp, 0.5 * s.alive));
}

/* ---------- режим РИСУНОК ---------- */
let strokes = []; const liveStroke = new Map(); let fistSince = 0, wipe = 0, hueSeed = 0;
const LIFE = 15;
function clearStrokes() { wipe = 1; }
function inkColor(s, i, a) {
  if (s.ink === "белый") return `rgba(255,255,255,${a})`;
  return `hsla(${(s.hue + i * 1.6) % 360},90%,60%,${a})`;
}
function finishStroke(s) {
  const p = s.pts;
  if (p.length > 12) {
    let len = 0; for (let i = 1; i < p.length; i++) len += d2(p[i - 1], p[i]);
    if (len > 180 && d2(p[0], p[p.length - 1]) < Math.max(70, len * 0.2)) s.closed = true;
  }
}
function drawDraw(hands, r, t, dt, frameNo) {
  const seen = new Set();
  hands.forEach((s) => {
    seen.add(s);
    const h = s.disp;
    const pinching = pinchState(s) && s.alive > 0.5;
    const pt = { x: (h[4].x + h[8].x) / 2, y: (h[4].y + h[8].y) / 2 };
    let st = liveStroke.get(s);
    if (pinching) {
      if (!st) {
        // если рука на миг потерялась, продолжаем ту же линию, а не начинаем новую
        st = strokes.find((o) => !o.closed && ![...liveStroke.values()].includes(o) && t - o.last < 0.6 && d2(o.pts[o.pts.length - 1], pt) < 80);
        if (st) st.closed = false;
        else { st = { pts: [], born: t, hue: (hueSeed += 47) % 360, ink: INKS[inkIdx] }; strokes.push(st); }
        liveStroke.set(s, st);
      }
      const last = st.pts[st.pts.length - 1];
      if (!last || d2(last, pt) > 1.5) st.pts.push(pt);
      st.last = t;
    } else if (st) { if (t - st.last > 0.15) { finishStroke(st); liveStroke.delete(s); } }
    // курсор
    ctx.strokeStyle = pinching ? "#fff" : "rgba(255,255,255,.55)"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pinching ? 6 : 11, 0, Math.PI * 2); ctx.stroke();
    drawSkeleton(h, 0.35 * s.alive);
  });
  for (const [k, st] of liveStroke) if (!seen.has(k)) { finishStroke(st); liveStroke.delete(k); }

  if (hands.some((s) => s.alive > 0.5 && fist(s.disp))) { fistSince += dt; if (fistSince > 0.7 && strokes.length) { wipe = 1; fistSince = -10; window.__wipes = (window.__wipes || 0) + 1; } } else fistSince = 0;
  if (wipe > 0) { wipe -= dt * 2.5; if (wipe <= 0) { strokes = []; liveStroke.clear(); wipe = 0; } }
  const wipeMul = wipe > 0 ? wipe : 1;
  strokes = strokes.filter((s) => t - (s.last || s.born) < LIFE);
  const active = new Set(liveStroke.values());
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const s of strokes) {
    const pts = s.pts; if (pts.length < 2) continue;
    const age = t - (s.last || s.born);
    const a = Math.max(0, 1 - Math.max(0, age - LIFE + 2) / 2) * wipeMul;
    if (s.closed) {
      paintFilter(r, pts, frameNo, a * 0.95);
      ctx.globalAlpha = a; ctx.lineWidth = 1.5; ctx.strokeStyle = "#fff";
      ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.stroke();
      glintPath(pts.filter((_, i) => i % 3 === 0), t * 0.8, true);
      ctx.globalAlpha = 1;
      continue;
    }
    // тень под линией, потом цветная линия кусками (для радуги)
    ctx.lineWidth = 7; ctx.strokeStyle = `rgba(0,0,0,${0.3 * a})`;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y); ctx.stroke();
    ctx.lineWidth = 3.2;
    for (let i = 1; i < pts.length; i++) {
      const p0 = i > 1 ? { x: (pts[i - 2].x + pts[i - 1].x) / 2, y: (pts[i - 2].y + pts[i - 1].y) / 2 } : pts[0];
      const p2 = { x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2 };
      ctx.strokeStyle = inkColor(s, i, a);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo(pts[i - 1].x, pts[i - 1].y, p2.x, p2.y); ctx.stroke();
    }
    if (active.has(s)) glintPath(pts.slice(-50), t * 1.6, false);
  }
}

/* ---------- режим НИТИ ---------- */
const FINGER_HUE = [8, 45, 150, 195, 285];
function drawWeb(hands, t) {
  const live = hands.filter((s) => s.alive > 0.3);
  live.forEach((s) => drawSkeleton(s.disp, 0.9 * s.alive));
  if (live.length < 2) return;
  const [A, B] = live[0].disp[0].x < live[1].disp[0].x ? [live[0].disp, live[1].disp] : [live[1].disp, live[0].disp];
  ctx.lineWidth = 0.7; ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.beginPath();
  TIPS.forEach((a) => TIPS.forEach((b) => { ctx.moveTo(A[a].x, A[a].y); ctx.lineTo(B[b].x, B[b].y); }));
  ctx.stroke();
  TIPS.forEach((k, i) => {
    const a = A[k], b = B[k];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + Math.sin(t * 2 + i) * 6 + d2(a, b) * 0.06;
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    g.addColorStop(0, `hsl(${FINGER_HUE[i]},90%,62%)`); g.addColorStop(0.5, "#fff"); g.addColorStop(1, `hsl(${FINGER_HUE[i]},90%,62%)`);
    ctx.lineWidth = 2; ctx.strokeStyle = g;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
    for (let j = 0; j < 3; j++) {
      const u = (t * 0.4 + i * 0.17 + j / 3) % 1;
      const x = (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * mx + u * u * b.x;
      const y = (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * my + u * u * b.y;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    }
  });
}

/* ---------- цикл: рисуем каждый кадр экрана, модель спрашиваем на каждый новый кадр камеры ---------- */
let lastVideoTime = -1, lastT = performance.now(), fpsAcc = 0, fpsN = 0, detAcc = 0, detN = 0, frameNo = 0;
function detect(now, r) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw) return;
  // уменьшенный кадр для модели: быстрее, и координаты точно совпадают с тем, что на экране
  const dw = 384, dh = Math.round(dw * vh / vw);
  if (det.width !== dw || det.height !== dh) { det.width = dw; det.height = dh; }
  dctx.drawImage(video, 0, 0, dw, dh);
  let res = null;
  try { res = landmarker.detectForVideo(det, now); } catch (e) { console.warn(e); }
  const raw = (res && res.landmarks || []).map((lm) => lm.map((p) => ({ x: r.x + (mirrored() ? 1 - p.x : p.x) * r.w, y: r.y + p.y * r.h })));
  ingest(raw, now / 1000);
  detN++;
}
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  const t = now / 1000;
  if (!landmarker || video.readyState < 2) return;
  frameNo++;
  const r = coverRect();
  drawBackground(r);
  if (video.currentTime !== lastVideoTime) { lastVideoTime = video.currentTime; detect(now, r); }
  const hands = stepHands(t, dt);

  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) {
    $("#fps").textContent = `${Math.round(fpsN / fpsAcc)} FPS · ТРЕК ${Math.round(detN / fpsAcc)} · ${delegateUsed}`;
    const n = hands.length; $("#hands").textContent = `${n} ${n === 1 ? "РУКА" : n ? "РУКИ" : "РУК"}`;
    fpsAcc = 0; fpsN = 0; detN = 0;
  }
  ctx.clearRect(0, 0, W, H);
  if (mode === "frame") drawFrame(hands, r, t, dt, frameNo);
  else if (mode === "draw") drawDraw(hands, r, t, dt, frameNo);
  else drawWeb(hands, t);
}
window.__nova = { ingest, get hands() { return slots.length; }, get mode() { return mode; }, setMode, get strokes() { return strokes.length; }, get dump() { return strokes.map((s) => ({ n: s.pts.length, closed: !!s.closed, a: s.pts[0], b: s.pts[s.pts.length - 1] })); }, get delegate() { return delegateUsed; } };
