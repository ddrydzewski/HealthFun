import { DB, WEEKDAYS, WEEKDAYS_SHORT, mealsForDay } from '../db.js';
import { esc, has, seg, badge, block, para, bullets, checklist, searchBox, chips, bindFilter, empty, refluxClass, on, openSheet, rerender, toast } from '../ui.js';
import { getShop, setShop, clearShop } from '../store.js';

export function render(root, sub = 'plan', id) {
  const s = ['plan', 'przepisy', 'skladniki', 'zakupy'].includes(sub) ? sub : 'plan';
  let html = seg('dieta', [['plan', 'Plan tygodnia'], ['przepisy', 'Przepisy'], ['skladniki', 'Składniki'], ['zakupy', 'Zakupy']], s);
  if (s === 'plan') html += planView(id);
  else if (s === 'przepisy') html += recipesView();
  else if (s === 'skladniki') html += ingredientsView();
  else html += shoppingView();
  root.innerHTML = html;
  bindFilter(root);
}

// ---------- plan tygodnia ----------
function planView(idx) {
  const dayIdx = /^[0-6]$/.test(idx) ? +idx : new Date().getDay();
  const day = WEEKDAYS[dayIdx];
  const rows = mealsForDay(day);
  const suma = rows.find(r => r.posilek === 'SUMA');
  const meals = rows.filter(r => r.posilek !== 'SUMA');
  const avg = DB.posilki.find(r => r.dzien === 'ŚREDNIA TYGODNIA');
  const rules = DB.posilki.filter(r => r.tydzien === 'ZASADY');
  const order = [1, 2, 3, 4, 5, 6, 0];
  return `
  <nav class="days">${order.map(i => `<a href="#/dieta/plan/${i}" class="${i === dayIdx ? 'on' : ''} ${i === new Date().getDay() ? 'today' : ''}"><span>${WEEKDAYS_SHORT[i]}</span></a>`).join('')}</nav>
  <section class="card">
    <div class="card__head"><div><h3>${esc(day)}</h3><div class="muted small">${esc(meals[0]?.typ_dnia || '')}</div></div>
      ${suma ? `<div class="right"><b>${esc(suma.kcal)} kcal</b><div class="muted small">${esc(suma.bialko_g)} g białka</div></div>` : ''}</div>
    ${meals.map(mealRow).join('')}
    ${suma && has(suma.uwagi) ? `<p class="muted small">${esc(suma.uwagi)}</p>` : ''}
  </section>
  ${avg ? `<section class="card card--soft"><div class="eyebrow">Średnia tygodnia</div><b>${esc(avg.kcal)} kcal · ${esc(avg.bialko_g)} g białka</b><p class="muted small">${esc(avg.uwagi)}</p></section>` : ''}
  <section class="card"><h3>Zasady planu</h3>${rules.map(r => `<details class="details"><summary><b>${esc(r.dzien)}</b></summary><p>${esc(r.uwagi)}</p></details>`).join('')}</section>`;
}

export function mealRow(m) {
  const r = DB.recipeById[m.id_przepisu];
  return `<div class="li li--tap" data-action="open-recipe" data-id="${esc(m.id_przepisu)}">
    <div class="li__row"><span class="muted small">${esc(m.godzina)} · ${esc(m.posilek)}</span><span class="muted small">${esc(m.kcal)} kcal · ${esc(m.bialko_g)} g B</span></div>
    <b>${esc(m.nazwa)}</b>
    <div class="muted small">${r ? `${esc(r.czas_min)} min · ${esc(r.trudnosc)}` : ''}${has(m.uwagi) ? ` · ${esc(m.uwagi)}` : ''}</div>
  </div>`;
}

// ---------- przepisy ----------
const typeTags = (t) => splitTypes(t).map(x => x.split(' ')[0]);
const splitTypes = (t) => String(t || '').split('/').map(x => x.trim()).filter(Boolean);

function recipesView() {
  const tags = [...new Set(DB.przepisy.flatMap(r => typeTags(r.typ_posilku)))];
  return `${searchBox('Szukaj przepisu, składnika…')}${chips(tags.map(t => [t, t]))}
  <div class="grid">
    ${DB.przepisy.map(r => `<div class="rcard" data-action="open-recipe" data-id="${esc(r.id)}" data-search="${esc(`${r.nazwa} ${r.typ_posilku} ${r.skladniki}`)}" data-cat="${esc(typeTags(r.typ_posilku).join(' '))}">
      <div class="rcard__top"><span class="badge accent">${esc(splitTypes(r.typ_posilku)[0])}</span>${r.meal_prep.toLowerCase().startsWith('tak') ? badge('meal prep', 'muted') : ''}</div>
      <b class="rcard__name">${esc(r.nazwa)}</b>
      <div class="rcard__meta"><span>${esc(r.czas_min)} min</span><span>${esc(r.kcal_porcja)} kcal</span><span>${esc(r.bialko_g)} g B</span></div>
    </div>`).join('')}
  </div>${empty('Brak przepisów dla tego filtra.')}`;
}

export function openRecipe(id) {
  const r = DB.recipeById[id];
  if (!r) return;
  openSheet(r.nazwa, `
    <div class="badges">${badge(r.typ_posilku, 'accent')}${badge(`${r.czas_min} min`)}${badge(r.trudnosc)}${badge(`${r.porcje} porcj${r.porcje === '1' ? 'a' : 'e'}`)}</div>
    <div class="macros">
      <div><b>${esc(r.kcal_porcja)}</b><span>kcal</span></div>
      <div><b>${esc(r.bialko_g)}</b><span>białko g</span></div>
      <div><b>${esc(r.tluszcz_g)}</b><span>tłuszcz g</span></div>
      <div><b>${esc(r.wegle_g)}</b><span>węgle g</span></div>
    </div>
    <p class="small"><span class="badge ${refluxClass(r.refluks_ok)}">refluks: ${esc(r.refluks_ok)}</span> ${has(r.meal_prep) ? `<span class="badge muted">meal prep: ${esc(r.meal_prep)}</span>` : ''}</p>
    ${block('Składniki (na wszystkie porcje)', bullets(r.skladniki, ';'))}
    ${block('Przygotowanie', checklist(r.przygotowanie))}
    ${block('Sprzęt', para(r.sprzet), 'block--soft')}
    ${block('Dlaczego to dobry wybór', para(r.dlaczego_dobry))}
    ${block('Zamienniki', para(r.zamienniki), 'block--soft')}
  `);
}

// ---------- składniki ----------
function ingredientsView() {
  const cats = [...new Set(DB.skladniki.map(r => r.kategoria.split(' /')[0]))];
  const fmt = (v) => has(v) ? v : '–';
  return `${searchBox('Szukaj produktu…')}
  ${chips([['ok', 'bezpieczny', 'chip--ok'], ['warn', 'umiar', 'chip--warn'], ['bad', 'unikaj', 'chip--bad'], ...cats.map(c => [c, c])])}
  <section class="card card--list">
    ${DB.skladniki.map(i => `<div class="li li--tap" data-action="open-ing" data-id="${esc(i.id)}" data-search="${esc(`${i.nazwa} ${i.kategoria} ${i.dlaczego_w_diecie_lub_uwagi}`)}" data-cat="${esc(`${refluxClass(i.refluks)} ${i.kategoria.split(' /')[0]}`)}">
      <div class="li__row"><b>${esc(i.nazwa)}</b><span class="badge ${refluxClass(i.refluks)}">${esc(i.refluks)}</span></div>
      <div class="muted small">${esc(i.kategoria)}${has(i.kcal_100g) ? ` · ${esc(i.kcal_100g)} kcal · B ${fmt(i.bialko_g)} · T ${fmt(i.tluszcz_g)} · W ${fmt(i.wegle_g)} /100 g` : ''}</div>
    </div>`).join('')}
    ${empty('Nie znalazłem takiego produktu.')}
  </section>`;
}
function openIngredient(id) {
  const i = DB.ingById[id];
  if (!i) return;
  const used = DB.przepisy.filter(r => r.skladniki.toLowerCase().includes(i.nazwa.split(' ')[0].toLowerCase().replace(/[()]/g, '')));
  openSheet(i.nazwa, `
    <div class="badges">${badge(i.kategoria, 'accent')}<span class="badge ${refluxClass(i.refluks)}">refluks: ${esc(i.refluks)}</span></div>
    ${has(i.kcal_100g) ? `<div class="macros"><div><b>${esc(i.kcal_100g)}</b><span>kcal/100 g</span></div><div><b>${esc(i.bialko_g)}</b><span>białko</span></div><div><b>${esc(i.tluszcz_g)}</b><span>tłuszcz</span></div><div><b>${esc(i.wegle_g)}</b><span>węgle</span></div></div>` : ''}
    ${has(i.blonnik_g) ? `<p class="muted small">Błonnik: ${esc(i.blonnik_g)} g/100 g</p>` : ''}
    ${block('Po co w diecie / uwagi', para(i.dlaczego_w_diecie_lub_uwagi))}
    ${used.length ? block('W przepisach', `<div class="links">${used.map(r => `<button type="button" class="chip" data-action="open-recipe" data-id="${esc(r.id)}">${esc(r.nazwa)}</button>`).join('')}</div>`) : ''}
  `);
}

// ---------- zakupy ----------
function shoppingView() {
  const shop = getShop();
  const rows = DB.zakupy.filter(r => r.tydzien === '1');
  const groups = [...new Set(rows.map(r => r.kategoria))];
  const done = rows.filter(r => shop[shopKey(r)]).length;
  return `
  <section class="card">
    <div class="card__head"><div><h3>Tydzień 1</h3><div class="muted small">${done} / ${rows.length} kupione</div></div><button type="button" class="btn btn--small btn--ghost" data-action="shop-clear">Wyczyść</button></div>
    <div class="progress"><i style="width:${rows.length ? Math.round(done / rows.length * 100) : 0}%"></i></div>
  </section>
  ${groups.map(g => `<section class="card card--list"><h3 class="card__h">${esc(g)}</h3>
    ${rows.filter(r => r.kategoria === g).map(r => { const k = shopKey(r); const on = !!shop[k]; return `<div class="row ${on ? 'row--done' : ''}">
      <button type="button" class="tick" data-action="shop-toggle" data-key="${esc(k)}" aria-pressed="${on}" aria-label="Kupione"></button>
      <div class="row__body">
        <div class="row__title">${esc(r.produkt)} <span class="muted">— ${esc(r.ilosc)} ${esc(r.jednostka)}</span></div>
        ${has(r.uwagi_zakupowe) ? `<div class="row__meta">${esc(r.uwagi_zakupowe)}</div>` : ''}
        ${has(r.uzycie_w_przepisach) ? `<div class="row__note">${esc(r.uzycie_w_przepisach)}</div>` : ''}
      </div></div>`; }).join('')}
  </section>`).join('')}`;
}
const shopKey = (r) => `${r.tydzien}|${r.produkt}`;

// ---------- akcje ----------
on('open-recipe', (el) => openRecipe(el.dataset.id));
on('open-ing', (el) => openIngredient(el.dataset.id));
on('shop-toggle', (el) => { setShop(el.dataset.key, !getShop()[el.dataset.key]); rerender(); });
on('shop-clear', () => { if (confirm('Odznaczyć wszystkie zakupy?')) { clearShop(); rerender(); toast('Lista wyczyszczona'); } });
