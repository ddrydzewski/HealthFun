import { loadDB } from './db.js';
import { dispatchClick, dispatchInput, dispatchChange, on, onChange, openSheet, toast, setRerender, esc } from './ui.js';
import { getSettings, setSettings } from './store.js';
import { calendarURL } from './reminders.js';
import * as today from './views/today.js';
import * as training from './views/training.js';
import * as diet from './views/diet.js';
import * as knowledge from './views/knowledge.js';

const VIEWS = { dzis: today, trening: training, dieta: diet, wiedza: knowledge };
const TITLES = { dzis: 'Dziś', trening: 'Trening', dieta: 'Przepisy', wiedza: 'Warto wiedzieć' };
const app = document.getElementById('app');
let lastKey = '';
let installPrompt = null;

function applyTheme() {
  document.documentElement.dataset.theme = getSettings().theme;
}

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const tab = VIEWS[parts[0]] ? parts[0] : 'dzis';
  document.body.dataset.view = tab;
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
  const reminder = getSettings().calendarReminder || { time: '08:00', days: [1, 3, 5] };
  const opt = (k, l) => `<button type="button" class="chip ${t === k ? 'on' : ''}" data-action="set-theme" data-v="${k}">${l}</button>`;
  openSheet('Ustawienia', `
    <section class="block"><h4 class="block__title">Wygląd</h4><div class="chips">${opt('auto', 'Systemowy')}${opt('light', 'Jasny')}${opt('dark', 'Ciemny')}</div></section>
    <section class="block"><h4 class="block__title">Przypomnienie o treningu</h4>
      <label class="field__label" for="reminderTime">Godzina</label>
      <input id="reminderTime" type="time" value="${esc(reminder.time)}" data-change="calendar-reminder" required>
      <div class="reminder-days">${[1, 2, 3, 4, 5, 6, 0].map(day => `<label><input type="checkbox" data-reminder-day="${day}" data-change="calendar-reminder" ${reminder.days.includes(day) ? 'checked' : ''}><span>${['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'][day]}</span></label>`).join('')}</div>
      <a class="btn" id="calendarReminderLink" href="${esc(calendarURL(reminder))}" target="_blank" rel="noopener noreferrer">Dodaj do Kalendarza Google ↗</a>
      <p class="muted small">Powiadomienia wysyła Kalendarz Google, nie aplikacja. Godziny, powtarzanie i alert ustawisz przed zapisaniem wydarzenia.</p>
      <a class="linkbtn small" href="https://calendar.google.com/" target="_blank" rel="noopener noreferrer">Zarządzaj zapisanymi przypomnieniami ↗</a>
    </section>
    <section class="block"><h4 class="block__title">Jedzenie</h4>
      <button type="button" class="btn btn--ghost" data-action="open-prefs">Czego nie jem — wykluczenia</button>
      <p class="muted small">Niechciane składniki nie pojawią się w propozycjach.</p>
    </section>
    <section class="block"><h4 class="block__title">Dane</h4>
      <button type="button" class="btn btn--ghost" data-action="refresh-data">Odśwież dane i aplikację</button>
      ${installPrompt ? `<button type="button" class="btn" data-action="install">Zainstaluj na telefonie</button>` : `<p class="muted small">Instalacja: w Chrome na Androidzie wybierz menu ⋮ → „Dodaj do ekranu głównego” / „Zainstaluj aplikację”.</p>`}
    </section>
    <p class="muted small">Postęp i ulubione są zapisane tylko na tym urządzeniu.</p>
  `);
});
onChange('calendar-reminder', () => {
  const reminder = {
    time: document.getElementById('reminderTime').value,
    days: [...document.querySelectorAll('[data-reminder-day]:checked')].map(input => +input.dataset.reminderDay),
  };
  const link = document.getElementById('calendarReminderLink');
  try {
    link.href = calendarURL(reminder);
    link.removeAttribute('aria-disabled');
    setSettings({ calendarReminder: reminder });
  } catch (error) {
    link.removeAttribute('href');
    link.setAttribute('aria-disabled', 'true');
    toast(error.message);
  }
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
            t.dataset.update = 'true';
            t.onclick = () => location.reload();
            toast('Nowa wersja — dotknij, aby odświeżyć');
          }
        });
      });
    }).catch(() => {});
  }
}
init();
