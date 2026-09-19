// Małe narzędzia UI: escape, budowanie HTML, arkusz dolny, toast, timer przerwy, akcje.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const has = (s) => s != null && String(s).trim() !== '' && String(s).trim() !== '-';
export const splitList = (s, sep = '|') => String(s || '').split(sep).map(x => x.trim()).filter(x => x && x !== '-');

export const steps = (s, sep = '|') => `<ol class="steps">${splitList(s, sep).map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
export const checklist = (s, sep = '|') => `<ol class="steps steps--check">${splitList(s, sep).map(x => `<li><label><input type="checkbox"><span>${esc(x)}</span></label></li>`).join('')}</ol>`;
export const bullets = (s, sep = ';') => `<ul class="bullets">${splitList(s, sep).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
export const para = (s) => has(s) ? `<p>${esc(s)}</p>` : '';
export const badge = (t, cls = '') => has(t) ? `<span class="badge ${cls}">${esc(t)}</span>` : '';
export const block = (title, html, cls = '') => html ? `<section class="block ${cls}"><h4 class="block__title">${esc(title)}</h4><div class="block__body">${html}</div></section>` : '';
export const empty = (msg) => `<div class="empty" data-empty>${esc(msg)}</div>`;

export const refluxClass = (v) => {
  v = (v || '').toLowerCase();
  if (v.startsWith('bezp') || v === 'tak') return 'ok';
  if (v.startsWith('umiar')) return 'warn';
  if (v.startsWith('unikaj')) return 'bad';
  return 'muted';
};

// Polska odmiana: plural(1,'krok','kroki','kroków') -> "1 krok"
export function plural(n, one, few, many) {
  n = Math.abs(+n || 0);
  const w = n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? few : many;
  return `${n} ${w}`;
}
export const fmtDate = (d) => d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtShort = (k) => { const [, m, d] = k.split('-'); return `${+d}.${m}`; };

export const seg = (base, items, active) =>
  `<nav class="seg">${items.map(([k, l]) => `<a href="#/${base}/${k}" class="${k === active ? 'on' : ''}">${esc(l)}</a>`).join('')}</nav>`;

export const searchBox = (ph) =>
  `<label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="search" placeholder="${esc(ph)}" data-filter-input autocomplete="off" enterkeyhint="search"></label>`;

export const chips = (items) =>
  `<div class="chips">${items.map(([k, l, cls = '']) => `<button type="button" class="chip ${cls}" data-chip="${esc(k)}">${esc(l)}</button>`).join('')}</div>`;

// Filtrowanie w miejscu (bez re-renderu, focus w polu zostaje).
export function bindFilter(root) {
  const input = root.querySelector('[data-filter-input]');
  const chipEls = [...root.querySelectorAll('[data-chip]')];
  const items = [...root.querySelectorAll('[data-search]')];
  if (!input && !chipEls.length) return;
  let cat = '';
  const apply = () => {
    const q = (input?.value || '').toLowerCase().trim();
    let visible = 0;
    for (const it of items) {
      const okQ = !q || it.dataset.search.toLowerCase().includes(q);
      const okC = !cat || (it.dataset.cat || '').split(' ').includes(cat);
      it.hidden = !(okQ && okC);
      if (!it.hidden) visible++;
    }
    root.querySelectorAll('[data-group]').forEach(g => {
      g.hidden = ![...g.querySelectorAll('[data-search]')].some(i => !i.hidden);
    });
    const e = root.querySelector('[data-empty]');
    if (e) e.hidden = visible > 0;
  };
  input?.addEventListener('input', apply);
  chipEls.forEach(c => c.addEventListener('click', () => {
    cat = c.classList.contains('on') ? '' : c.dataset.chip;
    chipEls.forEach(x => x.classList.toggle('on', x === c && !!cat));
    apply();
  }));
  apply();
}

// ---- akcje (delegacja zdarzeń) ----
const actions = {}, inputs = {}, changes = {};
export const on = (name, fn) => { actions[name] = fn; };
export const onInput = (name, fn) => { inputs[name] = fn; };
export const onChange = (name, fn) => { changes[name] = fn; };
export function dispatchClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) { if (el.tagName === 'A') e.preventDefault(); fn(el, e); }
}
export function dispatchInput(e) {
  const el = e.target.closest('[data-input]');
  if (el && inputs[el.dataset.input]) inputs[el.dataset.input](el, e);
}
export function dispatchChange(e) {
  const el = e.target.closest('[data-change]');
  if (el && changes[el.dataset.change]) changes[el.dataset.change](el, e);
}

// ---- re-render bieżącego widoku z zachowaniem scrolla ----
export let rerender = () => {};
export const setRerender = (fn) => { rerender = fn; };

// ---- arkusz dolny (dialog) z obsługą przycisku "wstecz" ----
const sheet = document.getElementById('sheet');
const sheetTitle = document.getElementById('sheetTitle');
const sheetBody = document.getElementById('sheetBody');
let pendingNav = null;

export function openSheet(title, html) {
  sheetTitle.textContent = title;
  sheetBody.innerHTML = html;
  sheetBody.scrollTop = 0;
  if (!sheet.open) {
    sheet.showModal();
    history.pushState({ sheet: true }, '');
  }
}
export function closeSheet() { if (sheet.open) history.back(); }
export function navigate(hash) {
  if (sheet.open) { pendingNav = hash; history.back(); }
  else location.hash = hash;
}
window.addEventListener('popstate', () => {
  if (sheet.open) sheet.close();
  if (pendingNav) { const h = pendingNav; pendingNav = null; location.hash = h; }
});
sheet.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(); });
sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
on('close-sheet', closeSheet);
on('go', (el) => navigate(el.dataset.href));

// ---- toast ----
let toastT;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.classList.remove('show'); setTimeout(() => (t.hidden = true), 300); }, 2400);
}

// ---- timer przerwy ----
const timerEl = document.getElementById('timer');
let tEnd = 0, tInt = null;
const fmtT = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function tick() {
  const left = Math.max(0, Math.ceil((tEnd - Date.now()) / 1000));
  timerEl.querySelector('.timer__time').textContent = fmtT(left);
  if (left <= 0) {
    clearInterval(tInt); tInt = null;
    timerEl.classList.add('timer--done');
    timerEl.querySelector('.timer__label').textContent = 'Do boju';
    beep();
    navigator.vibrate?.([180, 80, 180]);
    setTimeout(stopTimer, 5000);
  }
}
export function startTimer(sec) {
  tEnd = Date.now() + sec * 1000;
  timerEl.hidden = false;
  timerEl.classList.remove('timer--done');
  timerEl.querySelector('.timer__label').textContent = 'Przerwa';
  clearInterval(tInt);
  tick();
  tInt = setInterval(tick, 250);
}
export function stopTimer() { clearInterval(tInt); tInt = null; timerEl.hidden = true; }
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22);
    });
  } catch { /* brak audio — wibracja wystarczy */ }
}
on('timer', (el) => startTimer(+el.dataset.sec || 90));
on('timer-add', () => { tEnd = Math.max(tEnd, Date.now()) + 30000; if (!tInt) { timerEl.classList.remove('timer--done'); timerEl.querySelector('.timer__label').textContent = 'Przerwa'; tInt = setInterval(tick, 250); } tick(); });
on('timer-stop', stopTimer);
