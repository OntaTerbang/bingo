/* ============================================================
   core.js — aturan bingo, tanpa tahu apa pun soal DOM/Supabase
   ============================================================ */

export const SAMPLE_ITEMS = [
  "Wifi-nya lemot","Ada yang lupa unmute","\u201CKamu ke-mute\u201D","Rapat molor 15 menit",
  "Kamera mati sepanjang rapat","Ada anak atau kucing lewat","\u201CNanti aku follow up\u201D",
  "Screen share gagal dulu","\u201CSingkat saja ya\u201D","Ada yang makan sambil rapat",
  "\u201CBisa diulang?\u201D","Notulen ditunjuk dadakan","Ini harusnya cukup email",
  "Slide penuh teks kecil","\u201CKita sinkronkan lagi\u201D","Ada yang masuk telat",
  "Mic bergema","\u201CSesuai arahan atasan\u201D","Tenggat mundur lagi",
  "Meme nyasar di kolom chat","\u201CCoba cek di grup\u201D","Salah sebut nama peserta",
  "\u201CDiskusi lanjut offline\u201D","Baterai laptop kritis","Kopi habis di tengah jalan",
  "\u201CSatu pertanyaan terakhir\u201D","Rapat bubar lebih cepat"
];

export const DEFAULT_BOARD = {
  slug: "demo",
  title: "Bingo Rapat Senin",
  subtitle: "Tandai kotak begitu kejadiannya muncul.",
  headerWord: "BINGO",
  size: 5,
  freeSpace: true,
  freeText: "GRATIS",
  shuffle: true,
  hostMode: false,
  items: SAMPLE_ITEMS.slice(),
};

/* ---------- utilitas kecil ---------- */
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function slugify(s){
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function shuffled(arr){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function hash(str){
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/* ---------- normalisasi setelan papan ---------- */
export function normalizeBoard(raw){
  const b = Object.assign({}, DEFAULT_BOARD, raw || {});
  b.size = clamp(parseInt(b.size, 10) || 5, 3, 7);
  b.items = (Array.isArray(b.items) ? b.items : String(b.items || "").split("\n"))
    .map(s => String(s).trim())
    .filter(Boolean)
    .slice(0, 200);
  if (!b.items.length) b.items = SAMPLE_ITEMS.slice();
  b.headerWord = String(b.headerWord || "BINGO").toUpperCase().replace(/\s+/g, "").slice(0, 7) || "BINGO";
  b.freeSpace = !!b.freeSpace && b.size % 2 === 1;
  b.freeText = String(b.freeText || "GRATIS").slice(0, 14);
  b.title = String(b.title || DEFAULT_BOARD.title).slice(0, 60);
  b.subtitle = String(b.subtitle || "").slice(0, 90);
  b.slug = slugify(b.slug) || "demo";
  b.shuffle = !!b.shuffle;
  b.hostMode = !!b.hostMode;
  return b;
}

export const freeIndex = b => (b.freeSpace ? Math.floor(b.size * b.size / 2) : -1);
export const cellCount = b => b.size * b.size;

/* Berapa item minimum yang dibutuhkan papan ini. */
export const itemsNeeded = b => cellCount(b) - (freeIndex(b) >= 0 ? 1 : 0);

/* Sidik jari bentuk papan. Kalau berubah, kartu pemain dibuat ulang. */
export const layoutKey = b =>
  hash(JSON.stringify([b.slug, b.size, b.freeSpace, b.freeText, b.shuffle, b.items]));

/* ---------- membuat kartu ---------- */
export function buildCard(board){
  const total = cellCount(board);
  const fi = freeIndex(board);
  const need = itemsNeeded(board);

  let pool = board.shuffle ? shuffled(board.items) : board.items.slice();
  while (pool.length < need){
    pool = pool.concat(board.shuffle ? shuffled(board.items) : board.items);
  }
  pool = pool.slice(0, need);

  const card = [];
  let p = 0;
  for (let i = 0; i < total; i++) card.push(i === fi ? board.freeText : pool[p++]);
  return card;
}

/* ---------- garis menang ---------- */
export function lines(size){
  const out = [];
  for (let r = 0; r < size; r++) out.push(Array.from({ length: size }, (_, c) => r * size + c));
  for (let c = 0; c < size; c++) out.push(Array.from({ length: size }, (_, r) => r * size + c));
  out.push(Array.from({ length: size }, (_, i) => i * size + i));
  out.push(Array.from({ length: size }, (_, i) => i * size + (size - 1 - i)));
  return out;
}

export function completedLines(size, marks){
  return lines(size).filter(l => l.every(i => marks[i]));
}

/* ---------- menggambar papan ---------- */
export function renderLetters(el, board){
  let word = board.headerWord;
  while (word.length < board.size) word += board.headerWord;
  el.innerHTML = "";
  for (let i = 0; i < board.size; i++){
    const s = document.createElement("span");
    s.textContent = word[i];
    el.appendChild(s);
  }
}

/**
 * Menggambar kotak-kotak papan.
 * opts: { card, marks, called, interactive, maxWidth }
 */
export function renderGrid(gridEl, lettersEl, board, opts){
  const o = Object.assign({ card: [], marks: [], called: [], interactive: true, maxWidth: 520 }, opts);
  const n = board.size;
  const gap = 6;
  const width = Math.min(o.maxWidth, gridEl.clientWidth || o.maxWidth);
  const cellw = (width - (n - 1) * gap) / n;

  [gridEl, lettersEl].forEach(el => {
    if (!el) return;
    el.style.setProperty("--n", n);
    el.style.setProperty("--cellw", cellw + "px");
  });
  if (lettersEl) renderLetters(lettersEl, board);

  const hit = new Set();
  completedLines(n, o.marks).forEach(l => l.forEach(i => hit.add(i)));
  const fi = freeIndex(board);

  gridEl.innerHTML = "";
  o.card.forEach((text, i) => {
    const cell = document.createElement(o.interactive ? "button" : "div");
    cell.className = "cell";
    if (o.interactive){ cell.type = "button"; cell.dataset.i = i; }
    if (o.marks[i]) cell.classList.add("on");
    if (i === fi) cell.classList.add("free");
    if (hit.has(i)) cell.classList.add("hit");
    if (o.called.includes(text)) cell.classList.add("called");
    if (o.interactive) cell.setAttribute("aria-pressed", o.marks[i] ? "true" : "false");
    const s = document.createElement("span");
    s.textContent = text;
    cell.appendChild(s);
    gridEl.appendChild(cell);
  });

  return { hits: hit.size, lines: completedLines(n, o.marks).length };
}
