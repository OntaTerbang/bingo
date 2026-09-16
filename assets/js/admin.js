/* ============================================================
   admin.js — ruang kerja admin: kelola papan, pemandu, pemenang
   ============================================================ */

import {
  isRemote, currentUser, signIn, signOut, onAuthChange,
  listBoards, createBoard, updateBoard, deleteBoard,
  getCalls, setCalls, listWins, clearWins, subscribeWins, subscribeCalls,
} from "./store.js";
import {
  normalizeBoard, buildCard, renderGrid, itemsNeeded, slugify,
  SAMPLE_ITEMS, DEFAULT_BOARD,
} from "./core.js";
import { $, toast, initTheme, timeAgo } from "./ui.js";

/* ---------- keadaan ---------- */
let boards = [];
let current = null;      // papan yang sedang dibuka
let previewCard = [];
let called = [];
let unsubCalls = null;
let unsubWins = null;

/* ============================================================
   1. Masuk
   ============================================================ */
async function boot(){
  initTheme("#b-theme");
  if (!isRemote) $("#a-localhint").hidden = false;

  const user = await currentUser();
  if (user) showShell(user);
  else showAuth();

  onAuthChange(u => u ? showShell(u) : showAuth());
}

function showAuth(){
  $("#auth").hidden = false;
  $("#shell").hidden = true;
}

async function showShell(user){
  $("#auth").hidden = true;
  $("#shell").hidden = false;
  $("#who").textContent = user.email || "admin";
  $("#b-signout").hidden = !isRemote;
  await refreshBoards();
}

$("#a-signin").addEventListener("click", async () => {
  const err = $("#a-error");
  err.hidden = true;
  try {
    const user = await signIn($("#a-email").value.trim(), $("#a-pass").value);
    await showShell(user);
  } catch(e){
    err.textContent = e.message || "Gagal masuk. Periksa email dan kata sandi.";
    err.hidden = false;
  }
});
$("#a-pass").addEventListener("keydown", e => { if (e.key === "Enter") $("#a-signin").click(); });

$("#b-signout").addEventListener("click", async () => {
  await signOut();
  showAuth();
});

/* ============================================================
   2. Daftar papan
   ============================================================ */
async function refreshBoards(keepId){
  try { boards = await listBoards(); }
  catch(e){ boards = []; toast("Gagal memuat daftar papan"); }

  const list = $("#boardlist");
  list.innerHTML = "";
  boards.forEach(b => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = "";
    btn.append(document.createTextNode(b.title));
    const small = document.createElement("small");
    small.textContent = b.slug + " · " + b.size + "×" + b.size + " · " + b.items.length + " item";
    btn.appendChild(small);
    if (current && b.id === current.id) btn.classList.add("active");
    btn.addEventListener("click", () => { selectBoard(b.id); closeMenu(); });
    list.appendChild(btn);
  });

  const wanted = keepId || (current && current.id);
  if (wanted && boards.some(b => b.id === wanted)) selectBoard(wanted);
  else if (boards.length) selectBoard(boards[0].id);
  else { current = null; $("#editor").hidden = true; $("#empty").hidden = false; }
}

function selectBoard(id){
  const found = boards.find(b => b.id === id);
  if (!found) return;
  current = normalizeBoard(found);
  current.id = found.id;
  fillForm();
  $("#empty").hidden = true;
  $("#editor").hidden = false;
  Array.from($("#boardlist").children).forEach((el, i) =>
    el.classList.toggle("active", boards[i] && boards[i].id === id));
  watchBoard();
}

$("#b-new").addEventListener("click", async () => {
  const title = prompt("Nama papan baru:", "Bingo Acara Baru");
  if (title === null) return;
  try {
    const b = await createBoard({
      title: title.trim() || "Bingo Acara Baru",
      slug: slugify(title) || "papan-" + Date.now().toString(36),
      items: SAMPLE_ITEMS.slice(),
    });
    await refreshBoards(b.id);
    toast("Papan dibuat");
  } catch(e){
    toast(e.message || "Gagal membuat papan");
  }
});

$("#b-delete").addEventListener("click", async () => {
  if (!current) return;
  if (!confirm("Hapus papan \u201C" + current.title + "\u201D? Tindakan ini permanen.")) return;
  try {
    await deleteBoard(current.id);
    current = null;
    await refreshBoards();
    toast("Papan dihapus");
  } catch(e){ toast("Gagal menghapus papan"); }
});

/* ============================================================
   3. Formulir
   ============================================================ */
function fillForm(){
  $("#m-title").textContent = current.title;
  $("#m-slug").textContent = "index.html?board=" + current.slug;
  $("#b-open").href = "index.html?board=" + current.slug;

  $("#f-title").value = current.title;
  $("#f-sub").value = current.subtitle;
  $("#f-slug").value = current.slug;
  $("#f-size").value = String(current.size);
  $("#f-word").value = current.headerWord;
  $("#f-free").checked = current.freeSpace;
  $("#f-freetext").value = current.freeText;
  $("#f-shuffle").checked = current.shuffle;
  $("#f-host").checked = current.hostMode;
  $("#f-items").value = current.items.join("\n");

  $("#host-card").hidden = !current.hostMode;
  refreshPreview(true);
  updateNote();
}

/* Membaca formulir jadi objek papan. */
function readForm(){
  return normalizeBoard({
    id: current.id,
    title: $("#f-title").value.trim() || DEFAULT_BOARD.title,
    subtitle: $("#f-sub").value.trim(),
    slug: slugify($("#f-slug").value) || current.slug,
    size: $("#f-size").value,
    headerWord: $("#f-word").value.trim(),
    freeSpace: $("#f-free").checked,
    freeText: $("#f-freetext").value.trim() || "GRATIS",
    shuffle: $("#f-shuffle").checked,
    hostMode: $("#f-host").checked,
    items: $("#f-items").value.split("\n"),
  });
}

function updateNote(){
  const draft = readForm();
  const need = itemsNeeded(draft);
  const have = draft.items.length;
  $("#items-note").textContent = have >= need
    ? have + " item tersedia, papan butuh " + need + ". Sisanya jadi variasi antar kartu."
    : "Papan butuh " + need + " item, baru ada " + have + ". Kekurangannya akan diulang.";
  $("#freetext-field").hidden = draft.size % 2 === 0;
  $("#host-card").hidden = !draft.hostMode;
}

function refreshPreview(newLayout){
  const draft = readForm();
  if (newLayout || previewCard.length !== draft.size * draft.size){
    previewCard = buildCard(draft);
  }
  const marks = new Array(previewCard.length).fill(false);
  if (draft.freeSpace) marks[Math.floor(previewCard.length / 2)] = true;
  renderGrid($("#p-grid"), $("#p-letters"), draft, {
    card: previewCard, marks, called: [], interactive: false, maxWidth: 420,
  });
}

["#f-title","#f-sub","#f-slug","#f-word","#f-freetext"].forEach(sel =>
  $(sel).addEventListener("input", () => { updateNote(); refreshPreview(false); }));
["#f-size","#f-free","#f-shuffle","#f-host"].forEach(sel =>
  $(sel).addEventListener("change", () => { updateNote(); refreshPreview(true); }));
$("#f-items").addEventListener("input", () => { updateNote(); refreshPreview(true); });

$("#f-sort").addEventListener("click", () => {
  const items = $("#f-items").value.split("\n").map(s => s.trim()).filter(Boolean);
  $("#f-items").value = items.sort((a, b) => a.localeCompare(b, "id")).join("\n");
  updateNote(); refreshPreview(true);
});
$("#f-dedupe").addEventListener("click", () => {
  const items = $("#f-items").value.split("\n").map(s => s.trim()).filter(Boolean);
  const before = items.length;
  const unique = Array.from(new Set(items));
  $("#f-items").value = unique.join("\n");
  updateNote(); refreshPreview(true);
  toast((before - unique.length) + " duplikat dihapus");
});
$("#f-sample").addEventListener("click", () => {
  $("#f-items").value = SAMPLE_ITEMS.join("\n");
  updateNote(); refreshPreview(true);
});
$("#f-reshuffle").addEventListener("click", () => refreshPreview(true));

$("#f-copy").addEventListener("click", async () => {
  const url = location.origin + location.pathname.replace(/admin\.html$/, "index.html")
    + "?board=" + (slugify($("#f-slug").value) || current.slug);
  try { await navigator.clipboard.writeText(url); toast("Tautan pemain disalin"); }
  catch(e){ prompt("Salin tautan ini:", url); }
});

$("#b-save").addEventListener("click", async () => {
  if (!current) return;
  const draft = readForm();
  try {
    const saved = await updateBoard(current.id, draft);
    current = saved; current.id = saved.id || draft.id;
    await refreshBoards(current.id);
    toast(isRemote ? "Tersimpan, papan pemain ikut berubah" : "Tersimpan di perangkat ini");
  } catch(e){
    toast(e.message || "Gagal menyimpan");
  }
});

/* keyboard: Ctrl/Cmd + S */
addEventListener("keydown", e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s"){
    e.preventDefault();
    $("#b-save").click();
  }
});

/* ============================================================
   4. Pemandu dan pemenang
   ============================================================ */
function watchBoard(){
  if (unsubCalls){ unsubCalls(); unsubCalls = null; }
  if (unsubWins){ unsubWins(); unsubWins = null; }
  if (!current || !current.id) return;

  getCalls(current.id).then(list => { called = list; renderCalls(); }).catch(() => {});
  unsubCalls = subscribeCalls(current.id, list => {
    called = Array.isArray(list) ? list : [];
    renderCalls();
  });

  refreshWins();
  unsubWins = subscribeWins(current.id, refreshWins);
}

function renderCalls(){
  $("#h-now").textContent = called.length ? called[called.length - 1] : "Belum ada panggilan";
  const list = $("#h-list");
  list.innerHTML = "";
  called.slice(0, -1).reverse().forEach(t => {
    const b = document.createElement("b");
    b.textContent = t;
    list.appendChild(b);
  });
}

$("#h-call").addEventListener("click", async () => {
  if (!current) return;
  const left = current.items.filter(t => !called.includes(t));
  if (!left.length){ toast("Semua item sudah dipanggil"); return; }
  called = called.concat([left[Math.floor(Math.random() * left.length)]]);
  renderCalls();
  try { await setCalls(current.id, called); }
  catch(e){ toast("Gagal mengirim panggilan"); }
});

$("#h-reset").addEventListener("click", async () => {
  if (!current) return;
  called = [];
  renderCalls();
  try { await setCalls(current.id, []); toast("Panggilan dimulai ulang"); }
  catch(e){ toast("Gagal mengirim"); }
});

async function refreshWins(){
  if (!current) return;
  let wins = [];
  try { wins = await listWins(current.id); } catch(e){}
  const box = $("#w-list");
  box.innerHTML = "";
  if (!wins.length){
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Belum ada yang lapor menang.";
    box.appendChild(p);
    return;
  }
  wins.forEach(w => {
    const row = document.createElement("div");
    row.className = "win-row";
    const left = document.createElement("span");
    const b = document.createElement("b");
    b.textContent = w.player_name;
    left.append(b, document.createTextNode(" · " + w.lines_count + " garis"));
    const t = document.createElement("time");
    t.textContent = timeAgo(w.created_at);
    row.append(left, t);
    box.appendChild(row);
  });
}

$("#w-clear").addEventListener("click", async () => {
  if (!current) return;
  if (!confirm("Bersihkan seluruh daftar klaim menang?")) return;
  try { await clearWins(current.id); refreshWins(); toast("Daftar dibersihkan"); }
  catch(e){ toast("Gagal membersihkan"); }
});

/* ============================================================
   5. Menu ponsel
   ============================================================ */
$("#b-menu").addEventListener("click", () => $("#shell").classList.toggle("menu-open"));
function closeMenu(){ $("#shell").classList.remove("menu-open"); }
addEventListener("click", e => {
  const shell = $("#shell");
  if (!shell.classList.contains("menu-open")) return;
  if (e.target.closest(".side") || e.target.closest("#b-menu")) return;
  closeMenu();
});

let rt;
addEventListener("resize", () => {
  clearTimeout(rt);
  rt = setTimeout(() => { if (current) refreshPreview(false); }, 150);
});

boot();
