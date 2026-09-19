// Warstwa "mój plan": domyślny tydzień z CSV + wykluczenia + nadpisania użytkownika + lista zakupów.
import { DB, WEEKDAYS, mealsForDay, recipesForSlot, recipeTags } from './db.js';
import { getPlanOverrides, setDayPlan, resetDayPlan, getExcl, getSettings, setSettings } from './store.js';

// ---------- czego nie jem ----------
export function exclusionRules() {
  const excl = getExcl();
  const rules = DB.preferencje.map(p => ({
    id: p.id, nazwa: p.nazwa, powod: p.powod,
    keywords: p.slowa_kluczowe.split(';').map(s => s.trim().toLowerCase()).filter(Boolean),
    active: excl[p.id] ?? p.domyslnie === 'tak',
  }));
  for (const k of Object.keys(excl)) {
    if (k.startsWith('custom:') && excl[k]) rules.push({ id: k, nazwa: k.slice(7), keywords: [k.slice(7).toLowerCase()], active: true, custom: true });
  }
  return rules;
}
export function excludedBy(recipe) {
  const s = (recipe.skladniki || '').toLowerCase();
  return exclusionRules().filter(r => r.active && r.keywords.some(k => s.includes(k)));
}
export const isExcluded = (recipe) => excludedBy(recipe).length > 0;

// ---------- plan dnia ----------
export function alternatives(slot, currentId, { includeExcluded = false, avoid = [] } = {}) {
  const cur = DB.recipeById[currentId];
  const k = +cur?.kcal_porcja || 450;
  return recipesForSlot(slot)
    .filter(r => r.id !== currentId && (includeExcluded || !isExcluded(r)))
    .sort((a, b) => (avoid.includes(a.id) - avoid.includes(b.id)) || (Math.abs(+a.kcal_porcja - k) - Math.abs(+b.kcal_porcja - k)));
}

export function defaultDay(dayIdx) {
  const rows = mealsForDay(WEEKDAYS[dayIdx]).filter(m => m.posilek !== 'SUMA');
  const used = [];
  return rows.map(m => {
    const r = DB.recipeById[m.id_przepisu];
    let id = m.id_przepisu;
    if (r && isExcluded(r)) id = alternatives(m.posilek, id, { avoid: used })[0]?.id || id;
    used.push(id);
    return { id, slot: m.posilek, time: m.godzina, note: id === m.id_przepisu ? m.uwagi : '', swapped: id !== m.id_przepisu };
  });
}
export const planMode = () => getSettings().planMode || 'simple';
export function dayPlan(dayIdx) {
  const o = getPlanOverrides()[dayIdx];
  return { meals: o || (planMode() === 'simple' ? simpleDay(dayIdx) : defaultDay(dayIdx)), edited: !!o };
}
export function mealInfo(m) {
  if (m.custom) return { name: m.custom, kcal: +m.kcal || 0, prot: 0, recipe: null };
  const r = DB.recipeById[m.id];
  return { name: r?.nazwa || m.id, kcal: +r?.kcal_porcja || 0, prot: +r?.bialko_g || 0, recipe: r };
}
export const dayTotals = (meals) => meals.reduce((a, m) => { const i = mealInfo(m); a.kcal += i.kcal; a.prot += i.prot; return a; }, { kcal: 0, prot: 0 });
export function updateDay(dayIdx, fn) {
  const meals = dayPlan(dayIdx).meals.map(m => ({ ...m }));
  fn(meals);
  setDayPlan(dayIdx, meals);
}
export const kcalTarget = () => +DB.profil.find(r => r.parametr === 'cel_kcal')?.wartosc || 2150;
export const protTarget = () => +DB.profil.find(r => r.parametr === 'bialko')?.wartosc || 170;

// Tryb prosty: 2 śniadania, 2 obiady (meal prep), 2 przekąski, 2 kolacje — minimum zakupów, zero decyzji.
const DIFF = { 'bardzo łatwy': 0, 'łatwy': 1, 'średni': 2 };
function pickSimple(slot, n, prefer = () => 0) {
  return recipesForSlot(slot).filter(r => !isExcluded(r))
    .sort((a, b) => prefer(a) - prefer(b) || (DIFF[a.trudnosc] ?? 3) - (DIFF[b.trudnosc] ?? 3) || parseInt(a.czas_min) - parseInt(b.czas_min) || +b.bialko_g - +a.bialko_g)
    .slice(0, n);
}
export function simpleDay(dayIdx) {
  const br = pickSimple('śniadanie', 2);
  const lu = pickSimple('obiad', 2, r => r.meal_prep.toLowerCase().startsWith('tak') ? 0 : 1);
  const sn = pickSimple('przekąska', 2);
  const snIds = sn.map(r => r.id);
  const di = pickSimple('kolacja', 4, r => recipeTags(r).includes('kolacja') ? 0 : 1).filter(r => !snIds.includes(r.id)).slice(0, 2);
  const at = (arr, k) => arr[k % arr.length]?.id;
  const k = (dayIdx + 6) % 7; // poniedziałek = 0
  return defaultDay(dayIdx).map(m => {
    let id = m.id;
    if (m.slot === 'śniadanie' && br.length) id = at(br, k);
    else if (m.slot === 'obiad' && lu.length) id = at(lu, k < 3 ? 0 : 1);
    else if ((m.slot === 'II śniadanie' || m.slot === 'przekąska') && sn.length) id = at(sn, k);
    else if (m.slot === 'kolacja' && di.length) id = at(di, k);
    return { id, slot: m.slot, time: m.time };
  });
}
export function setPlanMode(mode) { setSettings({ planMode: mode }); for (let d = 0; d < 7; d++) resetDayPlan(d); }

// ---------- lista zakupów z planu ----------
const CATS = [
  ['Mięso, ryby, jajka', /kurczak|indyk|dorsz|łoso|wołowin|jajk|tofu|mintaj|pstrąg/],
  ['Nabiał', /twar|skyr|jogurt|serek|parmezan|mleko|kefir/],
  ['Warzywa i owoce', /banan|gruszk|borów|jabłk|brokuł|cukini|marchew|fasolk|dyni|szpinak|ogórek|sałat|rzodkiew|pietruszk|awokado|imbir|melon|koper/],
  ['Pieczywo, ryż, ziemniaki', /ryż|ziemniak|batat|kasz|komos|makaron|chleb|tortill|wafle|mąk/],
  ['Tłuszcze, orzechy, inne', /oliw|olej|masło|migdał|orzech|chia|pestk|słonecznik|napój|sos soj|odżywk/],
];
const SMALL = /^(sól|cynamon|kurkum|tymianek|oregano|bazyli|liść|ziele|pieprz|sezam|lód|szczypta|woda|oliwa|olej)/;
const STRIP = /\(.*?\)|\d+%|\b(suchy|sucha|suche|upieczon\w*|gotowan\w*|świeży|świeża|świeże|naturaln\w*|mrożon\w*|półtłusty|do podania|do posmarowania patelni|do maczania|starty|starta|w kostce|opcjonalnie|może być|płynne|bez skóry|filet|lub .*|z .* dnia|jasny|extra virgin|pełnoziarnist\w*|baby|mały|garść)\b/gi;
const clean = (s) => s.replace(STRIP, ' ').replace(/[;,.]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
// Scalanie synonimów / odmian w jedną pozycję zakupową.
const ALIAS = [
  [/^ziemniak/, 'ziemniaki'], [/^ryż/, 'ryż'], [/^fasolk/, 'fasolka szparagowa'], [/^jogurt(?! grecki)/, 'jogurt naturalny'],
  [/^pierś z kurczaka/, 'pierś z kurczaka'], [/^chleb/, 'chleb żytni'], [/^banan/, 'banany'], [/^gruszk/, 'gruszki'],
  [/^jajk/, 'jajka'], [/^twar/, 'twaróg półtłusty'], [/^marchew/, 'marchew'], [/^ogórek/, 'ogórki'], [/^cukini/, 'cukinia'],
  [/^brokuł/, 'brokuł'], [/^szpinak/, 'szpinak'], [/^koperek/, 'koperek'], [/^imbir/, 'imbir świeży'], [/^mielony indyk|^indyk/, 'mielony indyk'],
];
const canon = (name) => ALIAS.find(([rx]) => rx.test(name))?.[1] || name;

function parseIng(raw) {
  let s = raw.replace(/\d+%/g, '');
  const m = s.match(/^(.*?)\s+(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|szt\.?|łyżeczk\w*|łyżk\w*|pęczek|cm|kromk\w*)?\b\s*(.*)$/i);
  if (!m) return { name: clean(s), qty: null, unit: '', raw };
  let qty = parseFloat(m[2].replace(',', '.'));
  let unit = (m[3] || '').replace(/\.$/, '').toLowerCase();
  const grams = (m[4] || '').match(/^\(\s*(\d+)\s*g\s*\)/);
  if (grams) { qty = +grams[1]; unit = 'g'; }
  if (/^łyż/.test(unit)) unit = 'łyż';
  if (unit === 'kg') { qty *= 1000; unit = 'g'; }
  if (unit === 'l') { qty *= 1000; unit = 'ml'; }
  if (/^kromk/.test(unit)) unit = 'kromki';
  return { name: clean(m[1]), qty, unit, raw };
}
const fmtQty = (qty, unit) => {
  if (unit === 'g') return qty >= 1000 ? `${(Math.ceil(qty / 50) * 50 / 1000).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')} kg` : `${Math.ceil(qty / 10) * 10} g`;
  if (unit === 'ml') return qty >= 1000 ? `${(qty / 1000).toFixed(1).replace('.', ',')} l` : `${Math.ceil(qty / 50) * 50} ml`;
  if (unit === 'szt') return `${Math.ceil(qty)} szt.`;
  return `${Math.ceil(qty)} ${unit}`;
};

export function shoppingFromWeek() {
  const counts = {};
  for (let d = 0; d < 7; d++) for (const m of dayPlan(d).meals) if (m.id) counts[m.id] = (counts[m.id] || 0) + 1;
  const items = {}, small = {};
  for (const [id, c] of Object.entries(counts)) {
    const r = DB.recipeById[id];
    if (!r) continue;
    const batches = Math.ceil(c / (+r.porcje || 1));
    for (const raw of r.skladniki.split(';').map(s => s.trim()).filter(Boolean)) {
      const p = parseIng(raw);
      if (!p.name || /^woda\b/.test(p.name)) continue;
      p.name = canon(p.name);
      const isSmall = SMALL.test(p.name) || p.qty == null || p.unit === 'łyż';
      const bucket = isSmall ? small : items;
      const key = p.name;
      const it = bucket[key] || (bucket[key] = { key, name: p.name, qty: 0, unit: p.unit, recipes: new Set(), mixed: false });
      if (!isSmall) { if (it.unit !== p.unit) it.mixed = true; it.qty += p.qty * batches; }
      it.recipes.add(id);
    }
  }
  const cat = (name) => CATS.find(([, rx]) => rx.test(name))?.[0] || 'Inne';
  const groups = {};
  for (const it of Object.values(items)) {
    (groups[cat(it.name)] ||= []).push({ ...it, recipes: [...it.recipes], label: it.mixed ? '' : fmtQty(it.qty, it.unit) });
  }
  const order = [...CATS.map(c => c[0]), 'Inne'];
  return {
    groups: order.filter(g => groups[g]).map(g => [g, groups[g].sort((a, b) => a.name.localeCompare(b.name, 'pl'))]),
    small: Object.values(small).map(it => ({ ...it, recipes: [...it.recipes] })).sort((a, b) => a.name.localeCompare(b.name, 'pl')),
    recipeCount: Object.keys(counts).length,
    itemCount: Object.keys(items).length,
  };
}
