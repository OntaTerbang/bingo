/* ============================================================
   store.js — satu pintu untuk semua data
   ------------------------------------------------------------
   Kalau config.js sudah diisi, semua lewat Supabase (dengan
   realtime). Kalau belum, semua jatuh ke localStorage supaya
   aplikasi tetap bisa dijalankan dan dicoba.
   ============================================================ */

import { SUPABASE_URL, SUPABASE_ANON_KEY, TABLES } from "./config.js";
import { normalizeBoard, DEFAULT_BOARD } from "./core.js";

export const isRemote = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let sb = null;
if (isRemote){
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
export const client = sb;

/* ------------------------------------------------------------
   Pemetaan baris tabel ↔ objek papan
   ------------------------------------------------------------ */
function rowToBoard(row){
  if (!row) return null;
  return normalizeBoard({
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    headerWord: row.header_word,
    size: row.size,
    freeSpace: row.free_space,
    freeText: row.free_text,
    shuffle: row.shuffle,
    hostMode: row.host_mode,
    items: row.items,
    ownerId: row.owner_id,
    updatedAt: row.updated_at,
  });
}
function boardToRow(b){
  return {
    slug: b.slug,
    title: b.title,
    subtitle: b.subtitle,
    header_word: b.headerWord,
    size: b.size,
    free_space: b.freeSpace,
    free_text: b.freeText,
    shuffle: b.shuffle,
    host_mode: b.hostMode,
    items: b.items,
    updated_at: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------
   Penyimpanan lokal
   ------------------------------------------------------------ */
const LS = {
  read(key, fallback){
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch(e){ return fallback; }
  },
  write(key, value){
    try { localStorage.setItem(key, JSON.stringify(value)); } catch(e){}
  },
};
const K_BOARDS = "bingo:boards";
const K_CALLS = id => "bingo:calls:" + id;
const K_WINS  = id => "bingo:wins:" + id;

function localBoards(){
  let list = LS.read(K_BOARDS, null);
  if (!Array.isArray(list) || !list.length){
    list = [Object.assign({ id: "local-demo" }, DEFAULT_BOARD)];
    LS.write(K_BOARDS, list);
  }
  return list;
}
function saveLocalBoards(list){
  LS.write(K_BOARDS, list);
  // beri tahu tab lain
  try { localStorage.setItem("bingo:ping", String(Date.now())); } catch(e){}
}
const newId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2, 10));

/* ------------------------------------------------------------
   Autentikasi
   ------------------------------------------------------------ */
export async function currentUser(){
  if (!isRemote) return { id: "local", email: "mode lokal" };
  const { data } = await sb.auth.getUser();
  return data.user || null;
}
export async function signIn(email, password){
  if (!isRemote) return { id: "local", email: "mode lokal" };
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}
export async function signOut(){
  if (!isRemote) return;
  await sb.auth.signOut();
}
export function onAuthChange(cb){
  if (!isRemote) return () => {};
  const { data } = sb.auth.onAuthStateChange((_e, session) => cb(session ? session.user : null));
  return () => data.subscription.unsubscribe();
}

/* ------------------------------------------------------------
   Papan
   ------------------------------------------------------------ */
export async function listBoards(){
  if (!isRemote) return localBoards().map(b => normalizeBoard(b));
  const user = await currentUser();
  let q = sb.from(TABLES.boards).select("*").order("updated_at", { ascending: false });
  if (user) q = q.eq("owner_id", user.id);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(rowToBoard);
}

export async function getBoard(slug){
  if (!isRemote){
    const found = localBoards().find(b => b.slug === slug);
    return found ? normalizeBoard(found) : null;
  }
  const { data, error } = await sb.from(TABLES.boards).select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return rowToBoard(data);
}

export async function createBoard(partial){
  const board = normalizeBoard(Object.assign({}, DEFAULT_BOARD, partial));
  if (!isRemote){
    const list = localBoards();
    let slug = board.slug, n = 2;
    while (list.some(b => b.slug === slug)) slug = board.slug + "-" + n++;
    const rec = Object.assign({ id: newId() }, board, { slug });
    list.unshift(rec);
    saveLocalBoards(list);
    return normalizeBoard(rec);
  }
  const user = await currentUser();
  if (!user) throw new Error("Harus masuk dulu.");
  const row = Object.assign(boardToRow(board), { owner_id: user.id });
  let attempt = 0, slug = board.slug;
  while (attempt < 5){
    const { data, error } = await sb.from(TABLES.boards)
      .insert(Object.assign({}, row, { slug })).select().single();
    if (!error) return rowToBoard(data);
    if (error.code === "23505"){ attempt++; slug = board.slug + "-" + (attempt + 1); continue; }
    throw error;
  }
  throw new Error("Alamat papan sudah dipakai.");
}

export async function updateBoard(id, board){
  const b = normalizeBoard(board);
  if (!isRemote){
    const list = localBoards();
    const i = list.findIndex(x => x.id === id);
    if (i < 0) throw new Error("Papan tidak ditemukan.");
    list[i] = Object.assign({ id }, b);
    saveLocalBoards(list);
    return list[i];
  }
  const { data, error } = await sb.from(TABLES.boards)
    .update(boardToRow(b)).eq("id", id).select().single();
  if (error) throw error;
  return rowToBoard(data);
}

export async function deleteBoard(id){
  if (!isRemote){
    saveLocalBoards(localBoards().filter(b => b.id !== id));
    return;
  }
  const { error } = await sb.from(TABLES.boards).delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------------
   Panggilan pemandu
   ------------------------------------------------------------ */
export async function getCalls(boardId){
  if (!isRemote) return LS.read(K_CALLS(boardId), []);
  const { data, error } = await sb.from(TABLES.calls)
    .select("called").eq("board_id", boardId).maybeSingle();
  if (error) throw error;
  return (data && Array.isArray(data.called)) ? data.called : [];
}

export async function setCalls(boardId, called){
  if (!isRemote){
    LS.write(K_CALLS(boardId), called);
    try { localStorage.setItem("bingo:ping", String(Date.now())); } catch(e){}
    return called;
  }
  const { error } = await sb.from(TABLES.calls).upsert({
    board_id: boardId,
    called,
    updated_at: new Date().toISOString(),
  }, { onConflict: "board_id" });
  if (error) throw error;
  return called;
}

/* ------------------------------------------------------------
   Klaim menang
   ------------------------------------------------------------ */
export async function addWin(boardId, playerName, linesCount){
  const row = {
    board_id: boardId,
    player_name: String(playerName || "Tanpa nama").slice(0, 40),
    lines_count: linesCount,
  };
  if (!isRemote){
    const list = LS.read(K_WINS(boardId), []);
    list.unshift(Object.assign({ id: newId(), created_at: new Date().toISOString() }, row));
    LS.write(K_WINS(boardId), list.slice(0, 100));
    try { localStorage.setItem("bingo:ping", String(Date.now())); } catch(e){}
    return;
  }
  const { error } = await sb.from(TABLES.wins).insert(row);
  if (error) throw error;
}

export async function listWins(boardId){
  if (!isRemote) return LS.read(K_WINS(boardId), []);
  const { data, error } = await sb.from(TABLES.wins)
    .select("*").eq("board_id", boardId)
    .order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return data || [];
}

export async function clearWins(boardId){
  if (!isRemote){ LS.write(K_WINS(boardId), []); return; }
  const { error } = await sb.from(TABLES.wins).delete().eq("board_id", boardId);
  if (error) throw error;
}

/* ------------------------------------------------------------
   Realtime
   ------------------------------------------------------------ */
function localWatch(cb){
  const handler = () => cb();
  addEventListener("storage", handler);
  return () => removeEventListener("storage", handler);
}

export function subscribeBoard(slug, cb){
  if (!isRemote) return localWatch(() => cb());
  const ch = sb.channel("board:" + slug)
    .on("postgres_changes",
      { event: "*", schema: "public", table: TABLES.boards, filter: "slug=eq." + slug },
      payload => cb(rowToBoard(payload.new)))
    .subscribe();
  return () => sb.removeChannel(ch);
}

export function subscribeCalls(boardId, cb){
  if (!isRemote) return localWatch(() => cb(LS.read(K_CALLS(boardId), [])));
  const ch = sb.channel("calls:" + boardId)
    .on("postgres_changes",
      { event: "*", schema: "public", table: TABLES.calls, filter: "board_id=eq." + boardId },
      payload => cb(Array.isArray(payload.new?.called) ? payload.new.called : []))
    .subscribe();
  return () => sb.removeChannel(ch);
}

export function subscribeWins(boardId, cb){
  if (!isRemote) return localWatch(() => cb());
  const ch = sb.channel("wins:" + boardId)
    .on("postgres_changes",
      { event: "*", schema: "public", table: TABLES.wins, filter: "board_id=eq." + boardId },
      () => cb())
    .subscribe();
  return () => sb.removeChannel(ch);
}
