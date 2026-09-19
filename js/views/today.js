import { DB, weekdayName, planForDay, routineNames, routineRows } from '../db.js';
import { esc, has, badge, fmtDate, plural, on, rerender, ICON_SWAP } from '../ui.js';
import { todayKey, getChecks, setCheck, getEntry } from '../store.js';
import { dayPlan, mealInfo, kcalTarget, protTarget } from '../plan.js';

const mealKey = (m, i) => `meal:${i}:${m.id || m.custom}`;
const chevron = '<svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';

export function render(root) {
  const d = new Date(), wd = weekdayName(d), date = todayKey(d);
  const plan = planForDay(wd);
  const session = plan[0]?.sesja || '';
  const isTraining = /^[ABC]$/.test(session);
  const checks = getChecks(date);
  const entry = getEntry(date);

  const meals = dayPlan(d.getDay()).meals;
  const infos = meals.map(mealInfo);
  const eatenIdx = meals.map((m, i) => i).filter(i => checks[mealKey(meals[i], i)]);
  const kcal = eatenIdx.reduce((s, i) => s + infos[i].kcal, 0);
  const prot = eatenIdx.reduce((s, i) => s + infos[i].prot, 0);
  const target = kcalTarget();
  const pct = Math.min(100, Math.round(kcal / target * 100));

  const isWeekend = [0, 6].includes(d.getDay());
  // Przerwa biurowa dotyczy dni pracy (kolumna kiedy zawiera "pracy").
  const routines = routineNames().filter(n => !(isWeekend && routineRows(n)[0].kiedy.includes('pracy')));
  const routinesDone = routines.filter(n => n.startsWith('Przerwa') ? (checks.biuro || 0) >= 5 : checks['rutyna:' + n]).length;
  const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
  const rule = DB.zasady[doy % DB.zasady.length];
  const mainCount = plan.filter(r => r.blok.startsWith('główne')).length;
  const done = checks.workout === session;
  const journalFilled = has(entry.waga_kg) || has(entry.refluks_0_3) || has(entry.rolowanie_tak_nie);

  root.innerHTML = `
  <section class="hero">
    <div class="eyebrow">${esc(fmtDate(d))}</div>
    <h2 class="hero__title">${greeting(d)}</h2>
  </section>

  <section class="card card--accent card--link" data-action="go" data-href="${isTraining ? `#/trening/sesje/${session}` : '#/trening/rutyny'}">
    <div class="card__head"><div class="eyebrow">Trening</div>${done ? badge('zrobione', 'ok') : ''}</div>
    ${isTraining
      ? `<div class="card__big">Sesja ${esc(session)}</div><div class="card__sub">${plural(plan.length, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń')} · ${mainCount} głównych · 45–55 min</div>`
      : `<div class="card__big">${esc(plan[0]?.nazwa || 'Odpoczynek')}</div><div class="card__sub">${esc(plan[0]?.powtorzenia_lub_czas || '')}${has(plan[0]?.uwagi) ? ` · ${esc(plan[0].uwagi)}` : ''}</div>`}
    <div class="card__cta">${isTraining ? (done ? 'Zobacz sesję' : 'Zacznij trening') : 'Rutyny dnia'} →</div>
  </section>

  <section class="card">
    <div class="card__head"><h3>Posiłki</h3><span class="muted small">${eatenIdx.length} z ${meals.length} · ≈${kcal} kcal · ${prot} g B</span></div>
    <div class="progress"><i style="width:${pct}%"></i></div>
    <p class="muted small">Widełki ${target - 200}–${target + 200} kcal i ~${protTarget() - 30}+ g białka to dobry dzień. Nie liczymy do 1 kcal.</p>
    ${meals.map((m, i) => { const info = infos[i]; return row(!!checks[mealKey(m, i)], mealKey(m, i), `${esc(m.time || '')}${m.time ? ' · ' : ''}${esc(m.slot)}`, esc(info.name) + (m.custom ? ' ' + badge('własne', 'muted') : ''), info.kcal ? `≈${info.kcal} kcal · ${info.prot} g białka` : 'bez liczenia', info.recipe ? `data-action="open-recipe" data-id="${esc(info.recipe.id)}"` : '', m.note, `<button type="button" class="iconbtn" data-action="meal-swap" data-day="${d.getDay()}" data-i="${i}" aria-label="Zamień posiłek">${ICON_SWAP}</button>`); }).join('')}
    <a class="linkbtn" href="#/dieta/plan">Mój tydzień →</a>
  </section>

  <section class="card">
    <div class="card__head"><h3>Rutyny</h3><span class="muted small">${routinesDone} / ${routines.length}</span></div>
    ${routines.map(name => {
      const rows = routineRows(name); const f = rows[0];
      if (name.startsWith('Przerwa biurowa')) {
        const n = checks.biuro || 0;
        return `<div class="row ${n >= 5 ? 'row--done' : ''}">
          <div class="counter"><button type="button" data-action="biuro" data-d="-1" aria-label="Mniej">−</button><b>${n}</b><button type="button" data-action="biuro" data-d="1" aria-label="Więcej">+</button></div>
          <div class="row__body" data-action="open-routine" data-name="${esc(name)}"><div class="row__title">${esc(name)}</div><div class="row__meta">cel 5–7 dziennie · ${esc(f.czas_calkowity_min)} min · ${esc(f.kiedy)}</div></div></div>`;
      }
      return row(!!checks['rutyna:' + name], 'rutyna:' + name, `${esc(f.kiedy)}`, esc(name), `${esc(f.czas_calkowity_min)} min · ${plural(rows.length, 'krok', 'kroki', 'kroków')}`, `data-action="open-routine" data-name="${esc(name)}"`);
    }).join('')}
  </section>

  <section class="card card--link" data-action="go" data-href="#/dziennik">
    <div class="card__head"><h3>Dziennik</h3>${journalFilled ? badge('wypełniony', 'ok') : badge('do zrobienia', 'muted')}</div>
    <div class="quick">
      <div><span>waga</span><b>${has(entry.waga_kg) ? esc(entry.waga_kg) + ' kg' : '–'}</b></div>
      <div><span>sen</span><b>${has(entry.sen_h) ? esc(entry.sen_h) + ' h' : '–'}</b></div>
      <div><span>refluks</span><b>${has(entry.refluks_0_3) ? esc(entry.refluks_0_3) + '/3' : '–'}</b></div>
      <div><span>rolowanie</span><b>${has(entry.rolowanie_tak_nie) ? esc(entry.rolowanie_tak_nie) : '–'}</b></div>
    </div>
    <div class="card__cta">${journalFilled ? 'Edytuj wpis' : 'Wypełnij dzisiaj'} →</div>
  </section>

  <section class="card card--soft card--link" data-action="open-rule" data-id="${esc(rule.id)}">
    <div class="eyebrow">Zasada dnia · ${esc(rule.kategoria)}</div>
    <b>${esc(rule.zasada)}</b>
    <p class="muted small">${esc(rule.dlaczego_prosto)}</p>
  </section>`;
}

function greeting(d) {
  const h = d.getHours();
  return h < 5 ? 'Późno — sen to też trening.' : h < 11 ? 'Dobry poranek.' : h < 17 ? 'Dzień dobry.' : h < 21 ? 'Dobry wieczór.' : 'Czas zwalniać.';
}

function row(done, key, over, title, meta, openAttrs, note, extra = chevron) {
  return `<div class="row ${done ? 'row--done' : ''}">
    <button type="button" class="tick" data-action="toggle" data-key="${esc(key)}" aria-pressed="${done}" aria-label="Oznacz jako zrobione"></button>
    <div class="row__body" ${openAttrs}>
      <div class="row__over">${over}</div>
      <div class="row__title">${title}</div>
      <div class="row__meta">${meta}</div>
      ${has(note) ? `<div class="row__note">${esc(note)}</div>` : ''}
    </div>${extra}
  </div>`;
}

on('toggle', (el) => {
  const date = todayKey();
  setCheck(date, el.dataset.key, !getChecks(date)[el.dataset.key]);
  rerender();
});
on('biuro', (el) => {
  const date = todayKey();
  const n = Math.max(0, (getChecks(date).biuro || 0) + (+el.dataset.d));
  setCheck(date, 'biuro', n);
  rerender();
});
