import { DB, sessionRows, sessionDay, routineNames, routineRows, glossary, usageOf, linkTerms } from '../db.js';
import { esc, has, seg, para, badge, block, searchBox, chips, bindFilter, empty, plural, splitList, on, onInput, openSheet, navigate, toast, rerender } from '../ui.js';
import { todayKey, getWorkout, setWorkoutSet, lastWorkoutFor, setCheck, getChecks } from '../store.js';
import { startTimer, stopTimer } from '../ui.js';
import { shortMeaning } from './knowledge.js';

const SESSIONS = ['A', 'B', 'C'];
const chevron = '<svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
// Wersje z auto-linkowaniem pojęć ze słownika.
const stepsL = (s) => `<ol class="steps">${splitList(s).map(x => `<li>${linkTerms(x)}</li>`).join('')}</ol>`;
const paraL = (s) => has(s) ? `<p>${linkTerms(s)}</p>` : '';

export function render(root, sub = 'sesje', id) {
  const s = ['sesje', 'rutyny', 'cwiczenia'].includes(sub) ? sub : 'sesje';
  root.classList.toggle('app--workout', s === 'sesje' && SESSIONS.includes(id));
  let html = seg('trening', [['sesje', 'Treningi'], ['rutyny', 'Małe kroki'], ['cwiczenia', 'Ćwiczenia']], s);
  if (s === 'sesje') html += SESSIONS.includes(id) ? sessionView(id) : sessionsList();
  else if (s === 'rutyny') html += routinesView();
  else html += exercisesView();
  root.innerHTML = html;
  bindFilter(root);
}

// ---------- lista sesji ----------
function sessionsList() {
  const today = todayKey();
  const checks = getChecks(today);
  const cards = SESSIONS.map(L => {
    const rows = sessionRows(L);
    const main = rows.filter(r => r.blok.startsWith('główne'));
    const done = checks.workout === L;
    return `<a class="card card--link" href="#/trening/sesje/${L}">
      <div class="card__head"><div><div class="eyebrow">${esc(sessionDay(L))}</div><div class="card__big">Trening ${L} ${done ? badge('zrobione dziś', 'ok') : ''}</div></div>${chevron}</div>
      <div class="card__sub">${main.map(r => esc(DB.exById[r.id_cwiczenia]?.nazwa || r.nazwa)).join(' · ')}</div>
      <div class="muted small">${plural(rows.length, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń')} · 45–55 min · ${rows.filter(r => r.blok !== 'rozgrzewka').length} z obciążeniem</div>
    </a>`;
  }).join('');

  const rules = DB.plan.filter(r => r.faza === 'ZASADY');
  const deload = DB.plan.find(r => r.faza.startsWith('Deload'));
  const restDays = DB.plan.filter(r => r.faza.startsWith('Blok') && r.sesja === 'odpoczynek');

  return `${cards}
  <section class="card">
    <h3>Dni bez ciężarów</h3>
    ${restDays.map(r => `<div class="li"><div><b>${esc(r.dzien)}</b> — ${esc(r.nazwa)} ${has(r.powtorzenia_lub_czas) ? `<span class="muted">(${esc(r.powtorzenia_lub_czas)})</span>` : ''}</div><div class="muted small">${esc(r.uwagi)}</div></div>`).join('')}
  </section>
  ${deload ? `<details class="card details"><summary><b>${esc(deload.faza)}</b> — lżejszy tydzień<span class="muted small">${esc(deload.serie)}, RIR ${esc(deload.RIR)}</span></summary><p>${esc(deload.uwagi)}</p></details>` : ''}
  <section class="card">
    <h3>Zasady treningu</h3>
    ${rules.map(r => `<details class="details"><summary><b>${esc(r.nazwa)}</b></summary><p>${linkTerms(r.uwagi)}</p></details>`).join('')}
  </section>`;
}

// ---------- pojedyncza sesja ----------
function sessionView(L) {
  const date = todayKey();
  const rows = sessionRows(L);
  const workout = getWorkout(date);
  const checks = getChecks(date);
  let index = Math.max(0, Math.min(rows.length - 1, Number(checks['current:' + L]) || 0));
  if (rows[index]?.blok.includes('superset') && rows[index - 1]?.blok === rows[index].blok) index--;
  const row = rows[index];
  if (!row) return empty('Brak ćwiczeń w tym treningu.');
  const active = row.blok.includes('superset') && rows[index + 1]?.blok === row.blok ? rows.slice(index, index + 2) : [row];
  const next = index + active.length;
  const completed = rows.filter(item => exerciseDone(L, item, checks)).length;
  return `
  <a class="back" href="#/trening/sesje">← Treningi</a>
  <div class="section-heading"><h2>Trening ${L}</h2><span class="muted small" data-workout-count>${completed}/${rows.length} zrobione</span></div>
  <div class="progress" role="progressbar" aria-label="Postęp treningu" aria-valuemin="0" aria-valuemax="${rows.length}" aria-valuenow="${completed}"><i style="width:${completed / rows.length * 100}%"></i></div>
  <section class="workout-focus"><div class="eyebrow">Ćwiczenie ${index + 1}${active.length === 2 ? '–' + (index + 2) : ''} z ${rows.length} · ${row.blok === 'rozgrzewka' ? 'rozgrzewka' : 'trening'}</div>${active.length === 2 ? '<p class="muted small">Jedna seria każdego ćwiczenia, potem przerwa. Powtórz trzy razy.</p>' : ''}${active.map(item => planRow(item, workout, date, L)).join('')}</section>
  <div class="workout-nav"><button class="btn btn--ghost" data-action="workout-step" data-session="${L}" data-index="${index - 1}" ${index === 0 ? 'disabled' : ''}>← Poprzednie</button><button class="btn btn--ghost" data-action="workout-step" data-session="${L}" data-index="${next}" ${next >= rows.length ? 'disabled' : ''}>Następne →</button></div>
  <details class="details workout-overview"><summary>Wszystkie ćwiczenia</summary>${rows.map((item, itemIndex) => `<button class="workout-jump" data-action="workout-step" data-session="${L}" data-index="${itemIndex}"><span>${exerciseDone(L, item, checks) ? '✓' : itemIndex + 1}. ${esc(DB.exById[item.id_cwiczenia]?.nazwa || item.nazwa)}</span>${itemIndex === index ? badge('teraz', 'accent') : ''}</button>`).join('')}</details>
  <button class="btn btn--big workout-finish" data-action="finish-workout" data-session="${L}" ${completed === rows.length ? '' : 'hidden'}>${checks.workout === L ? '✓ Trening zapisany' : 'Zakończ trening'}</button>`;
}

const setKey = (session, id, index) => `set:${session}:${id}:${index}`;
function exerciseDone(session, row, checks) {
  const count = parseInt(row.serie, 10);
  return row.blok !== 'rozgrzewka' && count > 0
    ? Array.from({ length: count }, (_, index) => !!checks[setKey(session, row.id_cwiczenia, index)]).every(Boolean)
    : !!checks[`exercise:${session}:${row.id_cwiczenia}`];
}

function updateWorkoutProgress(session) {
  const root = document.querySelector('.app--workout');
  if (!root) return;
  const rows = sessionRows(session), checks = getChecks(todayKey());
  const completed = rows.filter(row => exerciseDone(session, row, checks)).length;
  root.querySelector('[data-workout-count]').textContent = `${completed}/${rows.length} zrobione`;
  const progress = root.querySelector('[role="progressbar"]');
  progress.setAttribute('aria-valuenow', completed);
  progress.querySelector('i').style.width = `${completed / rows.length * 100}%`;
  root.querySelectorAll('.workout-jump').forEach(button => {
    const index = Number(button.dataset.index), row = rows[index];
    button.querySelector('span').textContent = `${exerciseDone(session, row, checks) ? '✓' : index + 1}. ${DB.exById[row.id_cwiczenia]?.nazwa || row.nazwa}`;
  });
  root.querySelector('.workout-finish').hidden = completed !== rows.length;
}

function planRow(r, workout, date, session) {
  const ex = DB.exById[r.id_cwiczenia];
  const n = parseInt(r.serie, 10);
  const loggable = Number.isInteger(n) && n > 0 && r.blok !== 'rozgrzewka';
  const sets = workout[r.id_cwiczenia] || [];
  const last = loggable ? lastWorkoutFor(r.id_cwiczenia, date) : null;
  const rest = parseInt(r.przerwa_s, 10);
  const meta = [
    `${esc(r.serie)} × ${esc(r.powtorzenia_lub_czas)}`,
    has(r.RIR) && r.blok !== 'rozgrzewka' ? `zostaw ${esc(r.RIR)} powt. w zapasie` : '',
    rest ? `przerwa ${esc(r.przerwa_s)} s` : '',
  ].filter(Boolean).join(' · ');
  return `<div class="exrow">
    <div class="exrow__head">
      <div class="exrow__main">
        <div class="exrow__name">${esc(ex?.nazwa || r.nazwa)}</div>
        <div class="exrow__meta">${meta}</div>
        ${ex ? `<button class="linkbtn" data-action="open-ex" data-id="${esc(ex.id)}">Jak wykonać →</button>` : ''}
        ${has(r.uwagi) || has(r.tempo) ? `<details class="details"><summary>Wskazówki</summary>${paraL(r.uwagi)}${has(r.tempo) ? `<p>Tempo: ${esc(r.tempo)}</p>` : ''}</details>` : ''}
      </div>
    </div>
    ${loggable ? `<div class="exrow__log">
      ${last ? `<div class="muted small">Ostatnio (${esc(last.date.slice(5).replace('-', '.'))}): ${esc(fmtSets(last.sets))}</div>` : ''}
      <div class="series-checks">${Array.from({ length: n }, (_, index) => `<button class="series-check" data-action="workout-set" data-session="${session}" data-ex="${esc(r.id_cwiczenia)}" data-i="${index}" data-rest="${rest || 0}" aria-pressed="${!!getChecks(date)[setKey(session, r.id_cwiczenia, index)]}">Seria ${index + 1}<span>${getChecks(date)[setKey(session, r.id_cwiczenia, index)] ? '✓' : '○'}</span></button>`).join('')}</div>
      <details class="details"><summary>Ciężar i powtórzenia <span class="muted small">opcjonalnie</span></summary><div class="sets">${Array.from({ length: n }, (_, i) => {
        const st = sets[i] || {};
        return `<div class="set"><span class="set__n">${i + 1}</span>
          <input type="number" step="0.5" min="0" inputmode="decimal" placeholder="kg" value="${esc(st.kg ?? '')}" data-input="set" data-ex="${esc(r.id_cwiczenia)}" data-i="${i}" data-f="kg" aria-label="Seria ${i + 1} kg">
          <span class="set__x">×</span>
          <input type="number" min="0" inputmode="numeric" placeholder="powt." value="${esc(st.reps ?? '')}" data-input="set" data-ex="${esc(r.id_cwiczenia)}" data-i="${i}" data-f="reps" aria-label="Seria ${i + 1} powtórzenia">
        </div>`; }).join('')}</div></details>
      <div class="exrow__actions">
        ${rest ? `<button type="button" class="btn btn--small btn--ghost" data-action="timer" data-sec="${rest}">Start przerwy ${esc(r.przerwa_s)} s</button>` : ''}
        ${has(r.progresja) ? `<span class="muted small">Progresja: ${esc(r.progresja)}</span>` : ''}
      </div>
    </div>` : `<button class="btn btn--big btn--ghost" data-action="workout-exercise" data-session="${session}" data-ex="${esc(r.id_cwiczenia)}" aria-pressed="${exerciseDone(session, r, getChecks(date))}">${exerciseDone(session, r, getChecks(date)) ? '✓ Zrobione' : 'Oznacz jako zrobione'}</button>`}
  </div>`;
}

const fmtSets = (sets) => sets.map(s => `${s.kg || '–'}×${s.reps || '–'}`).join(', ');

// ---------- rutyny ----------
function routinesView() {
  return `<p class="muted intro">Chwila ruchu rano, przy biurku i wieczorem.</p>
  ${routineNames().map(name => routineCard(name)).join('')}`;
}
function routineCard(name) {
  const rows = routineRows(name);
  const f = rows[0];
  return `<section class="card"><div class="card__head"><div><h3>${esc(name)}</h3><div class="muted small">${esc(f.kiedy)} · ${esc(f.czas_calkowity_min)} min</div></div></div>
    <button class="btn btn--ghost" data-action="open-routine" data-name="${esc(name)}">Zaczynam →</button></section>`;
}
function routineStep(r) {
  const ex = DB.exById[r.id_cwiczenia];
  return `<div class="li li--tap" ${ex ? `data-action="open-ex" data-id="${esc(r.id_cwiczenia)}"` : ''}>
    <div class="li__row"><b>${esc(r.kolejnosc)}. ${esc(r.nazwa)}</b><span class="badge accent">${esc(r.ilosc)}</span></div>
    <div class="muted small">${linkTerms(r.cel)}</div>
    ${has(r.uwagi) ? `<div class="small">${linkTerms(r.uwagi)}</div>` : ''}
  </div>`;
}
export function openRoutine(name, replace = false) {
  const rows = routineRows(name);
  const f = rows[0];
  if (!f) return;
  const compact = rows.slice(0, 3);
  const checks = getChecks(todayKey());
  openSheet(name, `<p class="muted">${esc(f.kiedy)}</p>${compact.map(routineStep).join('')}${rows.length > 3 ? `<details class="details"><summary>Dłuższa wersja</summary>${rows.slice(3).map(routineStep).join('')}</details>` : ''}<button class="btn btn--big" data-action="routine-done" data-name="${esc(name)}" aria-pressed="${!!checks['rutyna:' + name]}">${checks['rutyna:' + name] ? '✓ Zrobione dziś' : 'Zrobione na dziś'}</button>`, { replace });
}

// ---------- biblioteka ćwiczeń ----------
function exercisesView() {
  const cats = [...new Set(DB.cwiczenia.map(r => r.kategoria))];
  const lvl = (n) => ['Łatwe', 'Średnie', 'Zaawansowane'][Math.max(0, Math.min(2, (+n || 1) - 1))];
  return `${searchBox('Szukaj ćwiczenia, mięśnia…')}${chips(cats.map(c => [c, c]))}
  <section class="card card--list">
    ${DB.cwiczenia.map(e => `<button class="li exercise-item" data-action="open-ex" data-id="${esc(e.id)}" data-search="${esc(`${e.nazwa} ${e.nazwa_ang} ${e.glowne_miesnie} ${e.kategoria} ${e.sprzet}`)}" data-cat="${esc(e.kategoria)}">
      <div class="li__row"><b>${esc(e.nazwa)}</b><span class="muted small mono" title="poziom">${lvl(e.poziom)}</span></div>
      <div class="muted small">${esc(e.glowne_miesnie)} · ${esc(e.sprzet)}</div>
    </button>`).join('')}
    ${empty('Nic nie pasuje do filtra.')}
  </section>`;
}

export function openExercise(id) {
  const e = DB.exById[id];
  if (!e) return;
  const use = usageOf(id);
  openSheet(e.nazwa, `
    <div class="badges">${badge(e.kategoria, 'accent')}${badge(`poziom ${e.poziom}/3`)}${badge(e.sprzet)}</div>
    <p class="muted">${esc(e.nazwa_ang)} · <b>${esc(e.glowne_miesnie)}</b></p>
    ${block('Jak wykonać', stepsL(e.jak_wykonac))}
    ${block('Najczęstsze błędy', paraL(e.najczestsze_bledy))}
    ${block('Biodro i kręgosłup', paraL(e.uwagi_biodro_kregoslup), 'block--callout')}
    <details class="details"><summary>Więcej o ćwiczeniu</summary>${block('Po co', paraL(e.dlaczego_w_planie))}
    <div class="two">
      ${block('Łatwiej', paraL(e.wersja_latwiejsza), 'block--soft')}
      ${block('Trudniej', paraL(e.wersja_trudniejsza), 'block--soft')}
    </div></details>
    ${(use.sessions.length || use.routines.length) ? `<p class="muted small">Występuje w: ${[...use.sessions.map(s => `<a href="#/trening/sesje/${s}" data-action="go" data-href="#/trening/sesje/${s}">Sesja ${s}</a>`), ...use.routines.map(esc)].join(' · ')}</p>` : ''}
  `);
}

// ---------- akcje ----------
on('open-ex', (el) => openExercise(el.dataset.id));
on('open-routine', (el) => openRoutine(el.dataset.name));
on('term', (el) => {
  const g = glossary(el.dataset.term);
  if (!g) return;
  openSheet(g.termin, `<p>${esc(shortMeaning(g))}</p>${block('Przykład', para(g.przyklad_lub_analogia))}`);
});
onInput('set', (el) => {
  if (!['kg', 'reps'].includes(el.dataset.f) || !el.validity.valid) return;
  setWorkoutSet(todayKey(), el.dataset.ex, +el.dataset.i, el.dataset.f, el.value);
});
on('workout-step', el => {
  const rows = sessionRows(el.dataset.session), index = +el.dataset.index;
  if (!Number.isInteger(index) || index < 0 || index >= rows.length) return;
  setCheck(todayKey(), 'current:' + el.dataset.session, index);
  rerender();
});
on('workout-set', el => {
  const date = todayKey(), key = setKey(el.dataset.session, el.dataset.ex, +el.dataset.i);
  const next = !getChecks(date)[key];
  setCheck(date, key, next);
  el.setAttribute('aria-pressed', next);
  el.querySelector('span').textContent = next ? '✓' : '○';
  updateWorkoutProgress(el.dataset.session);
  if (next) {
    toast('Seria zrobiona. Krok bliżej!');
    if (sessionRows(el.dataset.session).every(row => exerciseDone(el.dataset.session, row, getChecks(date)))) stopTimer();
    else if (+el.dataset.rest > 0) startTimer(+el.dataset.rest);
  }
});
on('workout-exercise', el => {
  const date = todayKey(), key = `exercise:${el.dataset.session}:${el.dataset.ex}`;
  const next = !getChecks(date)[key];
  setCheck(date, key, next);
  el.setAttribute('aria-pressed', next);
  el.textContent = next ? '✓ Zrobione' : 'Oznacz jako zrobione';
  updateWorkoutProgress(el.dataset.session);
});
on('routine-done', el => {
  const date = todayKey(), key = 'rutyna:' + el.dataset.name;
  setCheck(date, key, !getChecks(date)[key]);
  openRoutine(el.dataset.name, true);
  rerender();
});
on('finish-workout', (el) => {
  const L = el.dataset.session;
  const date = todayKey();
  if (!sessionRows(L).every(row => exerciseDone(L, row, getChecks(date)))) return;
  setCheck(date, 'workout', L);
  stopTimer();
  toast('Trening zapisany. Dobra robota.');
  rerender();
  setTimeout(() => navigate('#/dzis'), 600);
});
