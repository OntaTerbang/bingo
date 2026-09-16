/* ============================================================
   player.js — halaman yang dibuka peserta
   ============================================================ */

import { DEFAULT_SLUG } from "./config.js";
import {
  isRemote, getBoard, getCalls, addWin, subscribeBoard, subscribeCalls,
} from "./store.js";
import {
  normalizeBoard, buildCard, completedLines, freeIndex, layoutKey, renderGrid, DEFAULT_BOARD,
} from "./core.js";
import { $, toast, initTheme, confetti } from "./ui.js";

/* ---------- keadaan ---------- */
let board = null;
let card = [];
let marks = [];
let history = [];
let called = [];
let lastLineCount = 0;
let claimed = false;

const slug = new URLSearchParams(location.search).get("board") || DEFAULT_SLUG;

/* ---------- penyimpanan kartu di perangkat pemain ---------- */
const keyFor = suffix => "bingo:card:" + layoutKey(board) + ":" + suffix;
function saveCard(){
  try {
    localStorage.setItem(keyFor("card"), JSON.stringify(card));
    localStorage.setItem(keyFor("marks"), marks.map(m => m ? "1" : "0").join(""));
  } catch(e){}
}
function loadCard(){
  try {
    const c = JSON.parse(localStorage.getItem(keyFor("card")) || "null");
    if (!Array.isArray(c) || c.length !== board.size * board.size) return false;
    const m = localStorage.getItem(keyFor("marks")) || "";
    card = c;
    marks = m.length === c.length ? m.split("").map(x => x === "1") : new Array(c.length).fill(false);
    return true;
  } catch(e){ return false; }
}
function newCard(){
  card = buildCard(board);
  marks = new Array(card.length).fill(false);
  history = [];
  claimed = false;
  lastLineCount = 0;
  applyFree();
  saveCard();
}
function applyFree(){
  const fi = freeIndex(board);
  if (fi >= 0){ card[fi] = board.freeText; marks[fi] = true; }
}

/* ---------- menggambar ---------- */
function render(){
  $("#t-title").textContent = board.title;
  $("#t-sub").textContent = board.subtitle;
  document.title = board.title;

  renderGrid($("#grid"), $("#letters"), board, { card, marks, called, interactive: true });

  const done = completedLines(board.size, marks);
  const count = marks.filter(Boolean).length;
  $("#progress").textContent = count + " dari " + card.length + " tertandai";

  const pill = $("#linecount");
  pill.textContent = done.length + " garis penuh";
  pill.classList.toggle("win", done.length > 0);

  const banner = $("#banner");
  banner.classList.toggle("show", done.length > 0);
  if (done.length){
    $("#banner-sub").textContent = count === card.length
      ? "Papan penuh. Luar biasa."
      : done.length + " garis selesai.";
  }
  $("#btn-claim").hidden = claimed;
  $("#btn-claim").textContent = claimed ? "Sudah dilaporkan" : "Lapor menang";

  if (done.length > lastLineCount) confetti();
  lastLineCount = done.length;

  const cb = $("#callbox");
  cb.hidden = !board.hostMode;
  if (board.hostMode){
    $("#callnow").textContent = called.length ? called[called.length - 1] : "Belum ada panggilan";
    const list = $("#calllist");
    list.innerHTML = "";
    called.slice(0, -1).reverse().slice(0, 14).forEach(t => {
      const b = document.createElement("b");
      b.textContent = t;
      list.appendChild(b);
    });
  }

  $("#btn-undo").disabled = history.length === 0;
  $("#modebadge").textContent = isRemote
    ? "Papan \u201C" + board.slug + "\u201D · setelan diatur admin"
    : "Mode lokal · data tersimpan di perangkat ini";
}

/* ---------- interaksi ---------- */
$("#grid").addEventListener("click", e => {
  const cell = e.target.closest(".cell");
  if (!cell) return;
  const i = Number(cell.dataset.i);
  if (i === freeIndex(board)) return;
  marks[i] = !marks[i];
  history.push(i);
  if (history.length > 50) history.shift();
  saveCard();
  render();
  if (marks[i] && navigator.vibrate){ try { navigator.vibrate(12); } catch(e){} }
});

$("#btn-undo").addEventListener("click", () => {
  const i = history.pop();
  if (i === undefined) return;
  marks[i] = !marks[i];
  saveCard();
  render();
});

$("#btn-reset").addEventListener("click", () => {
  marks = new Array(card.length).fill(false);
  history = [];
  lastLineCount = 0;
  claimed = false;
  applyFree();
  saveCard();
  render();
  toast("Tanda dihapus");
});

$("#btn-new").addEventListener("click", () => {
  newCard();
  render();
  toast("Kartu baru siap");
});

$("#btn-claim").addEventListener("click", async () => {
  const name = prompt("Nama kamu, supaya admin tahu siapa yang menang:");
  if (name === null) return;
  try {
    await addWin(board.id, name.trim() || "Tanpa nama", completedLines(board.size, marks).length);
    claimed = true;
    render();
    toast("Laporan terkirim ke admin");
  } catch(err){
    toast("Gagal mengirim laporan");
  }
});

initTheme("#btn-theme");

let resizeTimer;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 120);
});

/* ---------- mulai ---------- */
async function start(){
  let data = null;
  try { data = await getBoard(slug); } catch(e){ /* biarkan */ }

  if (!data){
    board = normalizeBoard(Object.assign({}, DEFAULT_BOARD, { slug }));
    board.id = "fallback";
    toast("Papan \u201C" + slug + "\u201D belum ada, menampilkan contoh");
  } else {
    board = data;
  }

  if (!loadCard()) newCard();
  applyFree();
  render();

  if (board.hostMode && board.id){
    try { called = await getCalls(board.id); render(); } catch(e){}
  }

  subscribeBoard(slug, async next => {
    const updated = next || await getBoard(slug);
    if (!updated) return;
    const changed = layoutKey(updated) !== layoutKey(board);
    board = updated;
    if (changed) newCard();
    render();
  });

  if (board.id){
    subscribeCalls(board.id, list => {
      called = Array.isArray(list) ? list : [];
      render();
    });
  }
}

start();
