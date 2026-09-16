/* ============================================================
   ui.js — potongan antarmuka kecil yang dipakai dua halaman
   ============================================================ */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

let toastTimer;
export function toast(message){
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

/* ---------- tema ---------- */
export function initTheme(buttonSelector){
  let saved = null;
  try { saved = localStorage.getItem("bingo:theme"); } catch(e){}
  if (saved) document.documentElement.setAttribute("data-theme", saved);

  const btn = $(buttonSelector);
  if (!btn) return;
  btn.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const isDark = cur ? cur === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("bingo:theme", next); } catch(e){}
  });
}

/* ---------- konfeti ---------- */
export function confetti(){
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cv = document.createElement("canvas");
  cv.className = "confetti";
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = innerWidth * dpr;
  cv.height = innerHeight * dpr;
  cv.style.width = innerWidth + "px";
  cv.style.height = innerHeight + "px";
  document.body.appendChild(cv);

  const ctx = cv.getContext("2d");
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const colors = ["--ink", "--win", "--free"].map(v => css.getPropertyValue(v).trim() || "#E0175F");

  const parts = Array.from({ length: 70 }, () => ({
    x: innerWidth / 2 + (Math.random() - .5) * innerWidth * .5,
    y: innerHeight * .35,
    vx: (Math.random() - .5) * 7,
    vy: -6 - Math.random() * 7,
    r: 3 + Math.random() * 4,
    a: Math.random() * Math.PI,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));

  let frames = 0;
  (function tick(){
    frames++;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts){
      p.vy += .28; p.x += p.vx; p.y += p.vy; p.a += .12;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r, -p.r * .6, p.r * 2, p.r * 1.2);
      ctx.restore();
    }
    if (frames < 130) requestAnimationFrame(tick);
    else cv.remove();
  })();
}

/* ---------- waktu ---------- */
export function timeAgo(iso){
  const d = new Date(iso);
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "baru saja";
  if (s < 3600) return Math.floor(s / 60) + " menit lalu";
  if (s < 86400) return Math.floor(s / 3600) + " jam lalu";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}
