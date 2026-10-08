import { weekdayName, planForDay, routineNames, routineRows } from '../db.js';
import { esc, fmtDate, on, rerender, toast } from '../ui.js';
import { todayKey, getChecks, setCheck, shiftKey } from '../store.js';

export function render(root) {
  const now = new Date(), date = todayKey(now);
  const plan = planForDay(weekdayName(now));
  const checks = getChecks(date);
  const session = /^[ABC]$/.test(checks.workout) ? checks.workout : plan[0]?.sesja || '';
  const training = /^[ABC]$/.test(session);
  const done = training ? checks.workout === session : !!checks['daily:move'];
  const names = routineNames().filter(name => /^(Rano|Przerwa|Wiecz)/.test(name) && !([0, 6].includes(now.getDay()) && routineRows(name)[0]?.kiedy.includes('pracy'))).slice(0, 3);
  const monday = shiftKey(date, -((now.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, index) => {
    const key = shiftKey(monday, index), day = getChecks(key);
    return { key, done: !!day.workout || !!day['daily:move'] };
  });
  const count = week.filter(day => day.done).length;
  root.innerHTML = `<div class="day-screen">
    <header class="day-heading"><div class="eyebrow">${esc(fmtDate(now))}</div><h2>${done ? 'Dziś już masz to za sobą.' : 'Trochę ruchu. Lepszy dzień.'}</h2></header>
    <section class="day-focus ${done ? 'day-focus--done' : ''}">
      <div class="eyebrow">${done ? 'Zrobione' : training ? 'Twój trening na dziś' : 'Dzień bez ciężarów'}</div>
      <div class="day-focus__title">${training ? `Trening ${session}` : 'Spokojny spacer'}</div>
      <p>${training ? '45–55 min · całe ciało · hantle' : '15–20 min · w swoim tempie'}</p>
      ${training ? `<a class="btn btn--big" href="#/trening/sesje/${session}">${done ? 'Zobacz trening' : 'Zaczynam trening'} →</a>` : `<button class="btn btn--big" data-action="toggle" data-key="daily:move" aria-pressed="${done}">${done ? '✓ Spacer zrobiony' : 'Oznacz spacer jako zrobiony'}</button>`}
    </section>
    <section class="day-habits"><div class="section-heading"><h3>Małe kroki</h3><span class="muted small">${names.filter(name => !!checks['rutyna:' + name]).length}/${names.length}</span></div>
      ${names.map((name, index) => {
        const checked = !!checks['rutyna:' + name];
        const label = name.startsWith('Przerwa') ? 'Wstań od biurka' : index === 0 ? 'Rozruszaj ciało' : 'Rozluźnij się';
        return `<div class="habit-row"><button class="tick" data-action="toggle" data-key="${esc('rutyna:' + name)}" aria-pressed="${checked}" aria-label="${esc(label)}"></button><button class="habit-label" data-action="open-routine" data-name="${esc(name)}"><b>${label}</b><span>${esc(routineRows(name)[0]?.czas_calkowity_min || '')} min</span></button></div>`;
      }).join('')}
    </section>
    <section class="day-week"><div class="section-heading"><h3>Twój tydzień</h3><span class="small">${count} ${count === 1 ? 'aktywny dzień' : count >= 2 && count <= 4 ? 'aktywne dni' : 'aktywnych dni'}</span></div><div class="week-track">${week.map((day, index) => `<div class="week-day ${day.done ? 'is-done' : ''} ${day.key === date ? 'is-today' : ''}"><span>${['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'][index]}</span><b aria-label="${day.done ? 'Ruch zrobiony' : 'Brak oznaczenia'}">${day.done ? '✓' : '·'}</b></div>`).join('')}</div><p class="muted small">${count >= 3 ? 'Trzy aktywne dni lub więcej. Dobry tydzień!' : 'Każdy aktywny dzień się liczy. Bez nadrabiania.'}</p></section>
  </div>`;
}

on('toggle', el => {
  const date = todayKey(), key = el.dataset.key;
  const next = !getChecks(date)[key];
  setCheck(date, key, next);
  rerender();
  if (next) toast(key === 'daily:move' ? 'Ruch na dziś zrobiony.' : 'Mały krok zrobiony.');
});