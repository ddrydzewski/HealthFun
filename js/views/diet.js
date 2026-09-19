import { DB, WEEKDAYS, WEEKDAYS_SHORT, SLOTS, recipeTags } from '../db.js';
import { esc, has, seg, badge, block, para, bullets, checklist, searchBox, chips, bindFilter, empty, refluxClass, plural, on, openSheet, closeSheet, rerender, toast, ICON_SWAP } from '../ui.js';
import { getShop, setShop, clearShop, resetDayPlan, setExcl } from '../store.js';
import { dayPlan, mealInfo, dayTotals, updateDay, alternatives, isExcluded, excludedBy, exclusionRules, shoppingFromWeek, kcalTarget, protTarget, planMode, setPlanMode } from '../plan.js';

export function render(root, sub = 'plan', id) {
  const s = ['plan', 'przepisy', 'skladniki', 'zakupy'].includes(sub) ? sub : 'plan';
  let html = seg('dieta', [['plan', 'Mój tydzień'], ['przepisy', 'Przepisy'], ['skladniki', 'Składniki'], ['zakupy', 'Zakupy']], s);
  if (s === 'plan') html += planView(id);
  else if (s === 'przepisy') html += recipesView();
  else if (s === 'skladniki') html += ingredientsView();
  else html += shoppingView();
  root.innerHTML = html;
  bindFilter(root);
}

// ---------- mój tydzień ----------
function planView(idx) {
  const dayIdx = /^[0-6]$/.test(idx) ? +idx : new Date().getDay();
  const { meals, edited } = dayPlan(dayIdx);
  const t = dayTotals(meals);
  const target = kcalTarget();
  const typ = DB.posilki.find(r => r.tydzien === '1' && r.dzien === WEEKDAYS[dayIdx])?.typ_dnia || '';
  const rules = exclusionRules().filter(r => r.active);
  const order = [1, 2, 3, 4, 5, 6, 0];
  return `
  <nav class="days">${order.map(i => `<a href="#/dieta/plan/${i}" class="${i === dayIdx ? 'on' : ''} ${i === new Date().getDay() ? 'today' : ''}"><span>${WEEKDAYS_SHORT[i]}</span></a>`).join('')}</nav>
  <section class="card">
    <div class="card__head"><div><h3>${esc(WEEKDAYS[dayIdx])}</h3><div class="muted small">${esc(typ)}</div></div>
      <div class="right"><b>≈ ${t.kcal} kcal</b><div class="muted small">≈ ${t.prot} g białka</div></div></div>
    <p class="muted small">Widełki ${target - 200}–${target + 200} kcal i ${protTarget() - 30}+ g białka to sukces. Nie pasuje coś? Tapnij strzałki — zamienniki są jeden ruch dalej.</p>
    ${meals.map((m, i) => mealRow(m, i, dayIdx)).join('')}
    ${meals.length ? '' : empty('Pusty dzień — dodaj coś poniżej.')}
    <div class="btnrow" style="margin-top:10px">
      <button type="button" class="btn btn--ghost btn--small" data-action="meal-add" data-day="${dayIdx}">+ Dodaj posiłek</button>
      ${edited ? `<button type="button" class="btn btn--ghost btn--small" data-action="day-reset" data-day="${dayIdx}">Przywróć propozycję</button>` : ''}
    </div>
  </section>
  <section class="card card--soft">
    <div class="eyebrow">Styl tygodnia</div>
    <div class="chips" style="padding-top:6px">
      <button type="button" class="chip ${planMode() === 'simple' ? 'on' : ''}" data-action="plan-mode" data-mode="simple">Prosty i powtarzalny</button>
      <button type="button" class="chip ${planMode() === 'full' ? 'on' : ''}" data-action="plan-mode" data-mode="full">Urozmaicony</button>
    </div>
    <p class="muted small">${planMode() === 'simple'
      ? 'Prosty: 2 śniadania, 2 obiady na zapas, 2 przekąski, 2 kolacje. Zakupy to ok. 20 rzeczy, gotowanie 2× w tygodniu. Idealne na start.'
      : 'Urozmaicony: pełne propozycje z planu (więcej przepisów, więcej zakupów). Dobre, gdy prosty się znudzi.'}</p>
  </section>
  <section class="card card--soft card--link" data-action="open-prefs">
    <div class="card__head"><div class="eyebrow">Czego nie jem</div><span class="linkbtn small">zmień →</span></div>
    <div class="chips chips--wrap">${rules.length ? rules.map(r => `<span class="chip chip--static">${esc(r.nazwa)}</span>`).join('') : '<span class="muted small">Nic nie wykluczone.</span>'}</div>
    <p class="muted small">Przepisy z tymi składnikami znikają z propozycji, a plan podmienia je na podobne. Lista zakupów przelicza się sama.</p>
  </section>`;
}

function mealRow(m, i, dayIdx) {
  const info = mealInfo(m);
  const r = info.recipe;
  return `<div class="meal">
    <div class="meal__body" ${r ? `data-action="open-recipe" data-id="${esc(r.id)}"` : ''}>
      <div class="li__row"><span class="muted small">${esc(m.time || '')}${m.time ? ' · ' : ''}${esc(m.slot)}</span><span class="muted small">${info.kcal ? `≈${info.kcal} kcal · ${info.prot} g B` : ''}</span></div>
      <b>${esc(info.name)}</b> ${m.custom ? badge('własne', 'muted') : ''}${m.swapped ? badge('podmienione', 'accent') : ''}
      <div class="muted small">${r ? `${esc(r.czas_min)} min · ${esc(r.trudnosc)}` : ''}${has(m.note) ? ` · ${esc(m.note)}` : ''}</div>
    </div>
    <div class="meal__actions">
      <button type="button" class="iconbtn" data-action="meal-swap" data-day="${dayIdx}" data-i="${i}" aria-label="Zamień posiłek">${ICON_SWAP}</button>
      <button type="button" class="iconbtn iconbtn--dim" data-action="meal-remove" data-day="${dayIdx}" data-i="${i}" aria-label="Usuń posiłek"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>
  </div>`;
}

// Arkusz zamiany / dodawania
export function openSwap(dayIdx, i, { all = false, slot } = {}) {
  const { meals } = dayPlan(dayIdx);
  const cur = i >= 0 ? meals[i] : null;
  const theSlot = slot || cur?.slot || 'przekąska';
  const used = meals.map(m => m.id).filter(Boolean);
  const alts = alternatives(theSlot, cur?.id, { includeExcluded: all, avoid: used });
  const hiddenCount = all ? 0 : alternatives(theSlot, cur?.id, { includeExcluded: true }).length - alts.length;
  const title = cur ? `Zamień: ${mealInfo(cur).name}` : 'Dodaj posiłek';
  const slotPick = cur ? '' : `<div class="chips">${SLOTS.map(s => `<button type="button" class="chip ${s === theSlot ? 'on' : ''}" data-action="swap-slot" data-day="${dayIdx}" data-slot="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
  openSheet(title, `
    ${slotPick}
    <p class="muted small">${cur ? `Podobne posiłki na „${esc(theSlot)}”, od najbardziej zbliżonych kalorycznie.` : `Propozycje na „${esc(theSlot)}”.`}</p>
    <div class="card--list">
      ${alts.map(r => { const ex = excludedBy(r); return `<div class="li li--tap ${ex.length ? 'li--dim' : ''}" data-action="swap-pick" data-day="${dayIdx}" data-i="${i}" data-id="${esc(r.id)}" data-slot="${esc(theSlot)}">
        <div class="li__row"><b>${esc(r.nazwa)}</b><span class="muted small">≈${esc(r.kcal_porcja)} kcal</span></div>
        <div class="muted small">${esc(r.bialko_g)} g białka · ${esc(r.czas_min)} min · ${esc(r.trudnosc)}${ex.length ? ` · <span class="badge bad">${esc(ex.map(e => e.nazwa).join(', '))}</span>` : ''}</div>
      </div>`; }).join('')}
      ${alts.length ? '' : empty('Brak propozycji w tej kategorii.')}
    </div>
    <div class="btnrow" style="margin-top:12px">
      <button type="button" class="btn btn--ghost" data-action="swap-custom" data-day="${dayIdx}" data-i="${i}" data-slot="${esc(theSlot)}">Coś własnego…</button>
      ${hiddenCount > 0 ? `<button type="button" class="btn btn--ghost" data-action="swap-all" data-day="${dayIdx}" data-i="${i}" data-slot="${esc(theSlot)}">Pokaż też ukryte (${hiddenCount})</button>` : ''}
    </div>
    <p class="muted small">„Coś własnego” = np. obiad u rodziny, pizza z ekipą. Wpisujesz nazwę, opcjonalnie kalorie z grubsza. To też jest plan.</p>
  `, { replace: true });
}

export function openPrefs() {
  const rules = exclusionRules();
  openSheet('Czego nie jem', `
    <p class="muted">Zaznacz, czego nie kupujesz albo nie lubisz. Plan ma pasować do Ciebie, nie odwrotnie.</p>
    <div class="card--list">
      ${rules.map(r => `<div class="row ${r.active ? 'row--done' : ''}">
        <button type="button" class="tick" data-action="pref-toggle" data-id="${esc(r.id)}" aria-pressed="${r.active}" aria-label="Wyklucz"></button>
        <div class="row__body" data-action="pref-toggle" data-id="${esc(r.id)}"><div class="row__title row__title--plain">${esc(r.nazwa)}</div>${has(r.powod) ? `<div class="row__meta">${esc(r.powod)}</div>` : ''}</div>
        ${r.custom ? `<button type="button" class="iconbtn iconbtn--dim" data-action="pref-del" data-id="${esc(r.id)}" aria-label="Usuń"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ''}
      </div>`).join('')}
    </div>
    <div class="field"><label class="field__label">Dodaj własne (fragment nazwy składnika)</label>
      <div class="btnrow"><input type="text" id="prefInput" placeholder="np. szpinak" style="flex:2"><button type="button" class="btn" data-action="pref-add">Dodaj</button></div></div>
  `, { replace: true });
}

// ---------- przepisy ----------
function recipesView() {
  const tags = [...new Set(DB.przepisy.flatMap(recipeTags))];
  const list = DB.przepisy.map(r => ({ r, ex: isExcluded(r) })).sort((a, b) => a.ex - b.ex);
  return `${searchBox('Szukaj przepisu, składnika…')}${chips(tags.map(t => [t, t]))}
  <div class="grid">
    ${list.map(({ r, ex }) => `<div class="rcard ${ex ? 'rcard--dim' : ''}" data-action="open-recipe" data-id="${esc(r.id)}" data-search="${esc(`${r.nazwa} ${r.typ_posilku} ${r.skladniki}`)}" data-cat="${esc(recipeTags(r).join(' '))}">
      <div class="rcard__top"><span class="badge accent">${esc(recipeTags(r)[0])}</span>${r.meal_prep.toLowerCase().startsWith('tak') ? badge('meal prep', 'muted') : ''}${ex ? badge('nie jem', 'bad') : ''}</div>
      <b class="rcard__name">${esc(r.nazwa)}</b>
      <div class="rcard__meta"><span>${esc(r.czas_min)} min</span><span>≈${esc(r.kcal_porcja)} kcal</span><span>${esc(r.bialko_g)} g B</span></div>
    </div>`).join('')}
  </div>${empty('Brak przepisów dla tego filtra.')}`;
}

export function openRecipe(id) {
  const r = DB.recipeById[id];
  if (!r) return;
  const ex = excludedBy(r);
  openSheet(r.nazwa, `
    <div class="badges">${badge(r.typ_posilku, 'accent')}${badge(`${r.czas_min} min`)}${badge(r.trudnosc)}${badge(`${r.porcje} porcj${r.porcje === '1' ? 'a' : 'e'}`)}</div>
    ${ex.length ? `<p class="small"><span class="badge bad">zawiera: ${esc(ex.map(e => e.nazwa).join(', '))}</span> <span class="muted">— to na Twojej liście „nie jem”. Zamienniki poniżej.</span></p>` : ''}
    <div class="macros">
      <div><b>≈${esc(r.kcal_porcja)}</b><span>kcal</span></div>
      <div><b>${esc(r.bialko_g)}</b><span>białko g</span></div>
      <div><b>${esc(r.tluszcz_g)}</b><span>tłuszcz g</span></div>
      <div><b>${esc(r.wegle_g)}</b><span>węgle g</span></div>
    </div>
    <p class="small"><span class="badge ${refluxClass(r.refluks_ok)}">refluks: ${esc(r.refluks_ok)}</span> ${has(r.meal_prep) ? `<span class="badge muted">meal prep: ${esc(r.meal_prep)}</span>` : ''}</p>
    ${block('Składniki (na wszystkie porcje)', bullets(r.skladniki, ';'))}
    ${block('Przygotowanie', checklist(r.przygotowanie))}
    ${block('Sprzęt', para(r.sprzet), 'block--soft')}
    ${block('Dlaczego to dobry wybór', para(r.dlaczego_dobry))}
    ${block('Zamienniki — improwizuj śmiało', para(r.zamienniki), 'block--soft')}
    <p class="muted small">Gramatury są orientacyjne. ±20% w składnikach nic nie zmienia — gotuj tak, żeby Ci smakowało.</p>
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
  const kw = i.nazwa.split(' ')[0].toLowerCase().replace(/[()]/g, '');
  const used = DB.przepisy.filter(r => r.skladniki.toLowerCase().includes(kw));
  openSheet(i.nazwa, `
    <div class="badges">${badge(i.kategoria, 'accent')}<span class="badge ${refluxClass(i.refluks)}">refluks: ${esc(i.refluks)}</span></div>
    ${has(i.kcal_100g) ? `<div class="macros"><div><b>${esc(i.kcal_100g)}</b><span>kcal/100 g</span></div><div><b>${esc(i.bialko_g)}</b><span>białko</span></div><div><b>${esc(i.tluszcz_g)}</b><span>tłuszcz</span></div><div><b>${esc(i.wegle_g)}</b><span>węgle</span></div></div>` : ''}
    ${has(i.blonnik_g) ? `<p class="muted small">Błonnik: ${esc(i.blonnik_g)} g/100 g</p>` : ''}
    ${block('Po co w diecie / uwagi', para(i.dlaczego_w_diecie_lub_uwagi))}
    ${used.length ? block('W przepisach', `<div class="links">${used.map(r => `<button type="button" class="chip" data-action="open-recipe" data-id="${esc(r.id)}">${esc(r.nazwa)}</button>`).join('')}</div>`) : ''}
    ${kw.length >= 3 ? `<button type="button" class="btn btn--ghost btn--small" data-action="pref-add-kw" data-kw="${esc(kw)}">Nie jem tego — wyklucz z planu</button>` : ''}
  `);
}

// ---------- zakupy ----------
function shoppingView() {
  const shop = getShop();
  const { groups, small, recipeCount, itemCount } = shoppingFromWeek();
  const allKeys = groups.flatMap(([, items]) => items.map(it => 'w:' + it.key));
  const done = allKeys.filter(k => shop[k]).length;
  const pantry = DB.zakupy.filter(r => r.tydzien === 'zapas');
  return `
  <section class="card">
    <div class="card__head"><div><h3>Na Twój tydzień</h3><div class="muted small">${plural(itemCount, 'produkt', 'produkty', 'produktów')} z ${plural(recipeCount, 'przepisu', 'przepisów', 'przepisów')} · ${done} kupione</div></div>
      <button type="button" class="btn btn--small btn--ghost" data-action="shop-clear">Odznacz</button></div>
    <div class="progress"><i style="width:${allKeys.length ? Math.round(done / allKeys.length * 100) : 0}%"></i></div>
    <p class="muted small">Lista liczy się z posiłków w „Mój tydzień”. Coś nie pasuje? Zamień posiłek — lista sama się przeliczy. Ilości zaokrąglone w górę; „z grubsza” wystarczy.</p>
  </section>
  ${groups.map(([g, items]) => `<section class="card card--list"><h3 class="card__h">${esc(g)} <span class="muted small">${items.length}</span></h3>
    ${items.map(it => { const k = 'w:' + it.key; const on = !!shop[k]; return `<div class="row ${on ? 'row--done' : ''}">
      <button type="button" class="tick" data-action="shop-toggle" data-key="${esc(k)}" aria-pressed="${on}" aria-label="Kupione"></button>
      <div class="row__body" data-action="shop-toggle" data-key="${esc(k)}">
        <div class="row__title">${esc(cap(it.name))}${it.label ? ` <span class="muted">— ≈ ${esc(it.label)}</span>` : ''}</div>
        <div class="row__meta">${it.recipes.map(id => esc(DB.recipeById[id]?.nazwa.split(' ').slice(0, 3).join(' ') || id)).join(' · ')}</div>
      </div></div>`; }).join('')}
  </section>`).join('')}
  <details class="card details"><summary><b>Przyprawy i drobiazgi</b><span class="muted small">${small.length} — pewnie masz</span></summary>
    <div class="chips chips--wrap">${small.map(it => `<span class="chip chip--static">${esc(cap(it.name))}</span>`).join('')}</div>
  </details>
  <details class="card details"><summary><b>Zapas do szafki</b><span class="muted small">raz na kilka tygodni</span></summary>
    ${pantry.map(r => { const k = 'p:' + r.produkt; const on = !!shop[k]; return `<div class="row ${on ? 'row--done' : ''}">
      <button type="button" class="tick" data-action="shop-toggle" data-key="${esc(k)}" aria-pressed="${on}" aria-label="Mam"></button>
      <div class="row__body" data-action="shop-toggle" data-key="${esc(k)}"><div class="row__title">${esc(r.produkt)}${has(r.ilosc) ? ` <span class="muted">— ${esc(r.ilosc)} ${esc(r.jednostka)}</span>` : ''}</div>${has(r.uwagi_zakupowe) ? `<div class="row__meta">${esc(r.uwagi_zakupowe)}</div>` : ''}</div></div>`; }).join('')}
  </details>`;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- akcje ----------
on('open-recipe', (el) => openRecipe(el.dataset.id));
on('open-ing', (el) => openIngredient(el.dataset.id));
on('shop-toggle', (el) => { setShop(el.dataset.key, !getShop()[el.dataset.key]); rerender(); });
on('shop-clear', () => { clearShop(); rerender(); toast('Odznaczone'); });

on('meal-swap', (el) => openSwap(+el.dataset.day, +el.dataset.i));
on('meal-add', (el) => openSwap(+el.dataset.day, -1, { slot: 'przekąska' }));
on('swap-slot', (el) => openSwap(+el.dataset.day, -1, { slot: el.dataset.slot }));
on('swap-all', (el) => openSwap(+el.dataset.day, +el.dataset.i, { all: true, slot: el.dataset.slot }));
on('swap-pick', (el) => {
  const day = +el.dataset.day, i = +el.dataset.i, id = el.dataset.id;
  updateDay(day, (meals) => {
    if (i >= 0) meals[i] = { id, slot: meals[i].slot, time: meals[i].time };
    else meals.push({ id, slot: el.dataset.slot, time: '' });
  });
  closeSheet(); rerender(); toast(i >= 0 ? 'Zamienione' : 'Dodane');
});
on('swap-custom', (el) => {
  const day = +el.dataset.day, i = +el.dataset.i, slot = el.dataset.slot;
  openSheet('Coś własnego', `
    <p class="muted">Obiad u rodziny, pizza z ekipą, kanapka w biegu — to też jest plan. Wpisz nazwę, kalorie tylko jeśli chcesz.</p>
    <div class="field"><label class="field__label">Nazwa</label><input type="text" id="customName" placeholder="np. obiad u mamy" autofocus></div>
    <div class="field"><label class="field__label">Kalorie (z grubsza, opcjonalnie)</label><input type="number" inputmode="numeric" id="customKcal" placeholder="np. 700"></div>
    <button type="button" class="btn btn--big" data-action="custom-save" data-day="${day}" data-i="${i}" data-slot="${esc(slot)}">Zapisz</button>
  `, { replace: true });
  setTimeout(() => document.getElementById('customName')?.focus(), 50);
});
on('custom-save', (el) => {
  const name = (document.getElementById('customName')?.value || '').trim();
  if (!name) return toast('Wpisz nazwę');
  const kcal = parseInt(document.getElementById('customKcal')?.value, 10) || '';
  const day = +el.dataset.day, i = +el.dataset.i;
  updateDay(day, (meals) => {
    const m = { custom: name, kcal, slot: i >= 0 ? meals[i].slot : el.dataset.slot, time: i >= 0 ? meals[i].time : '' };
    if (i >= 0) meals[i] = m; else meals.push(m);
  });
  closeSheet(); rerender(); toast('Zapisane. Smacznego.');
});
on('meal-remove', (el) => { updateDay(+el.dataset.day, (meals) => meals.splice(+el.dataset.i, 1)); rerender(); });
on('day-reset', (el) => { resetDayPlan(+el.dataset.day); rerender(); toast('Przywrócono propozycję dnia'); });
on('plan-mode', (el) => {
  if (el.dataset.mode === planMode()) return;
  setPlanMode(el.dataset.mode); rerender(); toast(el.dataset.mode === 'simple' ? 'Tydzień uproszczony' : 'Pełne propozycje włączone');
});

on('open-prefs', openPrefs);
on('pref-toggle', (el) => {
  const rule = exclusionRules().find(r => r.id === el.dataset.id);
  if (!rule) return;
  setExcl(rule.id, !rule.active);
  openPrefs(); rerender();
});
on('pref-del', (el) => { setExcl(el.dataset.id, null); openPrefs(); rerender(); });
on('pref-add', () => {
  const v = (document.getElementById('prefInput')?.value || '').trim().toLowerCase();
  if (v.length < 3) return toast('Wpisz co najmniej 3 litery');
  setExcl('custom:' + v, true); openPrefs(); rerender(); toast(`Wykluczone: ${v}`);
});
on('pref-add-kw', (el) => { setExcl('custom:' + el.dataset.kw, true); rerender(); toast(`Wykluczone: ${el.dataset.kw}. Plan i zakupy przeliczone.`); closeSheet(); });
