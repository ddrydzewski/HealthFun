import { DB, loadDB } from './db.js';
import { dispatchClick, dispatchInput, dispatchChange, on, openSheet, toast, setRerender, esc } from './ui.js';
import { getSettings, setSettings } from './store.js';
import * as today from './views/today.js';
import * as training from './views/training.js';
import * as diet from './views/diet.js';
import * as journal from './views/journal.js';
import * as knowledge from './views/knowledge.js';

const VIEWS = { dzis: today, trening: training, dieta: diet, dziennik: journal, wiedza: knowledge };
const TITLES = { dzis: 'Dziś', trening: 'Trening', dieta: 'Dieta', dziennik: 'Dziennik', wiedza: 'Wiedza' };
const app = document.getElementById('app');
let lastKey = '';
let installPrompt = null;

function applyTheme() {
  document.documentElement.dataset.theme = getSettings().theme;
}

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const tab = VIEWS[parts[0]] ? parts[0] : 'dzis';
  document.querySelectorAll('#tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  document.getElementById('title').textContent = TITLES[tab];
  const key = parts.slice(0, 3).join('/');
  app.innerHTML = '';
  VIEWS[tab].render(app, parts[1], parts[2]);
  if (key !== lastKey) window.scrollTo(0, 0);
  lastKey = key;
}

setRerender(() => { const y = window.scrollY; route(); window.scrollTo(0, y); });

// ---- ustawienia ----
on('settings', () => {
  const t = getSettings().theme;
  const opt = (k, l) => `<button type="button" class="chip ${t === k ? 'on' : ''}" data-action="set-theme" data-v="${k}">${l}</button>`;
  openSheet('Ustawienia', `
    <section class="block"><h4 class="block__title">Wygląd</h4><div class="chips">${opt('auto', 'Systemowy')}${opt('light', 'Jasny')}${opt('dark', 'Ciemny')}</div></section>
    <section class="block"><h4 class="block__title">Dane</h4>
      <p class="muted">Aplikacja czyta pliki CSV z folderu <code>data/</code>. Edytuj CSV → wgraj na GitHub → tutaj „Odśwież dane”.</p>
      <button type="button" class="btn btn--ghost" data-action="refresh-data">Odśwież dane i aplikację</button>
      ${installPrompt ? `<button type="button" class="btn" data-action="install">Zainstaluj na telefonie</button>` : `<p class="muted small">Instalacja: w Chrome na Androidzie wybierz menu ⋮ → „Dodaj do ekranu głównego” / „Zainstaluj aplikację”.</p>`}
    </section>
    <section class="block"><h4 class="block__title">Pliki źródłowe</h4>
      <ul class="bullets small">${DB.indeks.filter(r => r.plik.endsWith('.csv')).map(r => `<li><b>${esc(r.plik)}</b> — ${esc(r.opis)}</li>`).join('')}</ul>
    </section>
    <p class="muted small">Twoje wpisy (dziennik, serie, ptaszki) są zapisywane lokalnie w tym urządzeniu. Eksportuj dziennik do CSV w zakładce Dziennik, żeby mieć kopię.</p>
  `);
});
on('set-theme', (el) => { setSettings({ theme: el.dataset.v }); applyTheme(); el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el)); });
on('refresh-data', async () => {
  if ('caches' in window) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); }
  const reg = await navigator.serviceWorker?.getRegistration();
  await reg?.unregister();
  location.reload();
});
on('install', async () => { if (!installPrompt) return; installPrompt.prompt(); installPrompt = null; });
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });

// ---- start ----
async function init() {
  applyTheme();
  try {
    await loadDB();
  } catch (err) {
    app.innerHTML = `<div class="empty"><b>Nie udało się wczytać danych.</b><p class="muted">${esc(err.message)}</p><p class="muted small">Uruchom przez serwer http (np. <code>python3 -m http.server</code>), nie z pliku.</p><button class="btn" onclick="location.reload()">Spróbuj ponownie</button></div>`;
    return;
  }
  document.addEventListener('click', dispatchClick);
  document.addEventListener('input', dispatchInput);
  document.addEventListener('change', dispatchChange);
  window.addEventListener('hashchange', route);
  if (!location.hash) location.replace('#/dzis');
  route();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'activated' && navigator.serviceWorker.controller) {
            const t = document.getElementById('toast');
            t.onclick = () => location.reload();
            toast('Nowa wersja — dotknij, aby odświeżyć');
          }
        });
      });
    }).catch(() => {});
  }
}
init();
