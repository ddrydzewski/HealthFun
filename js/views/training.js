import { DB, sessionRows, sessionDay, routineNames, routineRows, glossary, usageOf, linkTerms } from '../db.js';
import { esc, has, seg, para, badge, block, searchBox, chips, bindFilter, empty, plural, splitList, on, onInput, openSheet, navigate, toast, rerender } from '../ui.js';
import { todayKey, getWorkout, setWorkoutSet, lastWorkoutFor, setEntry, setCheck, getChecks } from '../store.js';

const SESSIONS = ['A', 'B', 'C'];
const chevron = '<svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
// Wersje z auto-linkowaniem pojęć ze słownika.
const stepsL = (s) => `<ol class="steps">${splitList(s).map(x => `<li>${linkTerms(x)}</li>`).join('')}</ol>`;
const paraL = (s) => has(s) ? `<p>${linkTerms(s)}</p>` : '';

export function render(root, sub = 'sesje', id) {
  const s = ['sesje', 'rutyny', 'cwiczenia'].includes(sub) ? sub : 'sesje';
  let html = seg('trening', [['sesje', 'Sesje'], ['rutyny', 'Rutyny'], ['cwiczenia', 'Ćwiczenia']], s);
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
      <div class="card__head"><div><div class="eyebrow">${esc(sessionDay(L))}</div><div class="card__big">Sesja ${L} ${done ? badge('zrobione dziś', 'ok') : ''}</div></div>${chevron}</div>
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
  const groups = [];
  for (const r of rows) {
    const g = groups.at(-1);
    const name = r.blok.replace(/\s*\(superset\)/, '');
    if (!g || g.name !== name) groups.push({ name, rows: [r] }); else g.rows.push(r);
  }
  const labels = { rozgrzewka: 'Rozgrzewka', 'główne': 'Główne', dodatkowe: 'Dodatkowe', core: 'Core' };
  return `
  <a class="back" href="#/trening/sesje">← Wszystkie sesje</a>
  <section class="hero hero--compact">
    <div class="eyebrow">${esc(sessionDay(L))} · ${esc(rows[0]?.faza || '')}</div>
    <h2 class="hero__title">Sesja ${L} ${checks.workout === L ? badge('zrobione dziś', 'ok') : ''}</h2>
    <p class="muted">Rozgrzewka bez przerw. Główne: RIR 2, technika ponad ciężar. Wpisuj kg × powtórzenia — aplikacja pokaże Ci ostatni wynik.</p>
  </section>
  ${groups.map(g => `<section class="card"><div class="card__head"><h3>${esc(labels[g.name] || g.name)}</h3><span class="muted small">${g.rows.length}</span></div>${g.rows.map(r => planRow(r, workout, date)).join('')}</section>`).join('')}
  <button type="button" class="btn btn--big" data-action="finish-workout" data-session="${L}">Zakończ trening i zapisz</button>
  <p class="muted small center">Zapis trafia do dziennika (sesja, wykonany, ciężary). Serie zostają w historii ćwiczeń.</p>`;
}

function planRow(r, workout, date) {
  const ex = DB.exById[r.id_cwiczenia];
  const n = parseInt(r.serie, 10);
  const loggable = Number.isInteger(n) && n > 0 && r.blok !== 'rozgrzewka';
  const sets = workout[r.id_cwiczenia] || [];
  const last = loggable ? lastWorkoutFor(r.id_cwiczenia, date) : null;
  const rest = parseInt(r.przerwa_s, 10);
  const meta = [
    `${esc(r.serie)} × ${esc(r.powtorzenia_lub_czas)}`,
    has(r.RIR) ? `<button type="button" class="term" data-action="term" data-term="RIR">RIR ${esc(r.RIR)}</button>` : '',
    has(r.tempo) && r.blok !== 'rozgrzewka' ? `<button type="button" class="term" data-action="term" data-term="Tempo">tempo ${esc(r.tempo)}</button>` : '',
    rest ? `przerwa ${esc(r.przerwa_s)} s` : '',
  ].filter(Boolean).join(' · ');
  return `<div class="exrow">
    <div class="exrow__head" data-action="open-ex" data-id="${esc(r.id_cwiczenia)}" role="button">
      <div class="exrow__num">${esc(r.kolejnosc)}</div>
      <div class="exrow__main">
        <div class="exrow__name">${esc(ex?.nazwa || r.nazwa)}</div>
        <div class="exrow__meta">${meta}</div>
        ${has(r.uwagi) ? `<div class="exrow__note">${linkTerms(r.uwagi)}</div>` : ''}
      </div>${ex ? chevron : ''}
    </div>
    ${loggable ? `<div class="exrow__log">
      ${last ? `<div class="muted small">Ostatnio (${esc(last.date.slice(5).replace('-', '.'))}): ${esc(fmtSets(last.sets))}</div>` : ''}
      <div class="sets">${Array.from({ length: n }, (_, i) => {
        const st = sets[i] || {};
        return `<div class="set"><span class="set__n">${i + 1}</span>
          <input type="number" step="0.5" min="0" inputmode="decimal" placeholder="kg" value="${esc(st.kg ?? '')}" data-input="set" data-ex="${esc(r.id_cwiczenia)}" data-i="${i}" data-f="kg" aria-label="Seria ${i + 1} kg">
          <span class="set__x">×</span>
          <input type="number" min="0" inputmode="numeric" placeholder="powt." value="${esc(st.reps ?? '')}" data-input="set" data-ex="${esc(r.id_cwiczenia)}" data-i="${i}" data-f="reps" aria-label="Seria ${i + 1} powtórzenia">
        </div>`; }).join('')}</div>
      <div class="exrow__actions">
        ${rest ? `<button type="button" class="btn btn--small btn--ghost" data-action="timer" data-sec="${rest}">Start przerwy ${esc(r.przerwa_s)} s</button>` : ''}
        ${has(r.progresja) ? `<span class="muted small">Progresja: ${esc(r.progresja)}</span>` : ''}
      </div>
    </div>` : ''}
  </div>`;
}

const fmtSets = (sets) => sets.map(s => `${s.kg || '–'}×${s.reps || '–'}`).join(', ');

// ---------- rutyny ----------
function routinesView() {
  return `<p class="muted intro">Krótkie sekwencje na cały dzień. Wieczorna ma z czasem zastąpić rolowanie — leczy przyczynę (skrócone zginacze bioder, słabe pośladki), nie objaw.</p>
  ${routineNames().map(name => routineCard(name)).join('')}`;
}
function routineCard(name) {
  const rows = routineRows(name);
  const f = rows[0];
  return `<section class="card"><div class="card__head"><div><h3>${esc(name)}</h3><div class="muted small">${esc(f.kiedy)} · ${esc(f.czas_calkowity_min)} min</div></div></div>
    ${rows.map(r => routineStep(r)).join('')}</section>`;
}
function routineStep(r) {
  const ex = DB.exById[r.id_cwiczenia];
  return `<div class="li li--tap" ${ex ? `data-action="open-ex" data-id="${esc(r.id_cwiczenia)}"` : ''}>
    <div class="li__row"><b>${esc(r.kolejnosc)}. ${esc(r.nazwa)}</b><span class="badge accent">${esc(r.ilosc)}</span></div>
    <div class="muted small">${linkTerms(r.cel)}</div>
    ${has(r.uwagi) ? `<div class="small">${linkTerms(r.uwagi)}</div>` : ''}
  </div>`;
}
export function openRoutine(name) {
  const rows = routineRows(name);
  const f = rows[0];
  openSheet(name, `<p class="muted">${esc(f.kiedy)} · ok. ${esc(f.czas_calkowity_min)} min</p>${rows.map(routineStep).join('')}`);
}

// ---------- biblioteka ćwiczeń ----------
function exercisesView() {
  const cats = [...new Set(DB.cwiczenia.map(r => r.kategoria))];
  const lvl = (n) => '●'.repeat(+n || 1) + '○'.repeat(Math.max(0, 3 - (+n || 1)));
  return `${searchBox('Szukaj ćwiczenia, mięśnia…')}${chips(cats.map(c => [c, c]))}
  <section class="card card--list">
    ${DB.cwiczenia.map(e => `<div class="li li--tap" data-action="open-ex" data-id="${esc(e.id)}" data-search="${esc(`${e.nazwa} ${e.nazwa_ang} ${e.glowne_miesnie} ${e.kategoria} ${e.sprzet}`)}" data-cat="${esc(e.kategoria)}">
      <div class="li__row"><b>${esc(e.nazwa)}</b><span class="muted small mono" title="poziom">${lvl(e.poziom)}</span></div>
      <div class="muted small">${esc(e.glowne_miesnie)} · ${esc(e.sprzet)}</div>
    </div>`).join('')}
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
    <p class="muted small">Podkreślone słowa możesz tapnąć — wyjaśnienie pojawi się od razu.</p>
    ${block('Jak wykonać', stepsL(e.jak_wykonac))}
    ${block('Najczęstsze błędy', paraL(e.najczestsze_bledy))}
    ${block('Biodro i kręgosłup', paraL(e.uwagi_biodro_kregoslup), 'block--callout')}
    ${block('Dlaczego jest w planie', paraL(e.dlaczego_w_planie))}
    <div class="two">
      ${block('Łatwiej', paraL(e.wersja_latwiejsza), 'block--soft')}
      ${block('Trudniej', paraL(e.wersja_trudniejsza), 'block--soft')}
    </div>
    ${(use.sessions.length || use.routines.length) ? `<p class="muted small">Występuje w: ${[...use.sessions.map(s => `<a href="#/trening/sesje/${s}" data-action="go" data-href="#/trening/sesje/${s}">Sesja ${s}</a>`), ...use.routines.map(esc)].join(' · ')}</p>` : ''}
  `);
}

// ---------- akcje ----------
on('open-ex', (el) => openExercise(el.dataset.id));
on('open-routine', (el) => openRoutine(el.dataset.name));
on('term', (el) => {
  const g = glossary(el.dataset.term);
  if (!g) return;
  openSheet(g.termin, `<p>${esc(g.wyjasnienie_prosto)}</p>${block('Przykład', para(g.przyklad_lub_analogia), 'block--soft')}<p class="muted small">Więcej pojęć: Wiedza → Słownik.</p>`);
});
onInput('set', (el) => {
  setWorkoutSet(todayKey(), el.dataset.ex, +el.dataset.i, el.dataset.f, el.value);
});
on('finish-workout', (el) => {
  const L = el.dataset.session;
  const date = todayKey();
  const workout = getWorkout(date);
  const summary = sessionRows(L)
    .filter(r => r.blok.startsWith('główne') || r.blok.startsWith('dodatkowe'))
    .map(r => {
      const sets = (workout[r.id_cwiczenia] || []).filter(s => s && (s.kg || s.reps));
      if (!sets.length) return null;
      const name = (DB.exById[r.id_cwiczenia]?.nazwa_ang || r.nazwa).split(' ').slice(0, 2).join(' ');
      return `${name} ${fmtSets(sets)}`;
    }).filter(Boolean).join(' / ');
  setEntry(date, { trening_sesja: L, trening_wykonany: 'tak', ...(summary ? { glowne_ciezary_kg: summary } : {}) });
  setCheck(date, 'workout', L);
  toast('Trening zapisany. Dobra robota.');
  rerender();
  setTimeout(() => navigate('#/dzis'), 600);
});
