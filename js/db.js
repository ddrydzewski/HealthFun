import { parseCSV } from './csv.js';
import { esc } from './ui.js';

// Nazwa klucza w DB -> plik w data/. Dodanie nowego CSV = jedna linia tutaj.
const FILES = {
  indeks: '00_indeks',
  profil: '01_profil_i_cele',
  slownik: '02_slownik',
  cwiczenia: '03_cwiczenia',
  plan: '04_plan_treningowy',
  rutyny: '05_rutyny_dzienne',
  skladniki: '06_skladniki',
  przepisy: '07_przepisy',
  posilki: '08_plan_posilkow_tydzien',
  zasady: '09_zasady_i_nawyki',
  suplementy: '10_suplementy',
  dziennik: '11_dziennik',
  zakupy: '12_lista_zakupow_tydzien',
  preferencje: '13_preferencje',
};

export const DB = { ready: false };

export async function loadDB() {
  const entries = await Promise.all(Object.entries(FILES).map(async ([key, file]) => {
    const res = await fetch(`./data/${file}.csv`);
    if (!res.ok) throw new Error(`Nie mogę wczytać ${file}.csv (${res.status})`);
    return [key, parseCSV(await res.text())];
  }));
  for (const [k, v] of entries) DB[k] = v;
  DB.exById = Object.fromEntries(DB.cwiczenia.map(r => [r.id, r]));
  DB.recipeById = Object.fromEntries(DB.przepisy.map(r => [r.id, r]));
  DB.ingById = Object.fromEntries(DB.skladniki.map(r => [r.id, r]));
  DB.ruleById = Object.fromEntries(DB.zasady.map(r => [r.id, r]));
  DB.ready = true;
  return DB;
}

export const WEEKDAYS = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
export const WEEKDAYS_SHORT = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
export const weekdayName = (d = new Date()) => WEEKDAYS[d.getDay()];

const byOrder = (a, b) => (+a.kolejnosc || 0) - (+b.kolejnosc || 0);

export const planForDay = (day) =>
  DB.plan.filter(r => r.faza.startsWith('Blok') && r.dzien === day).sort(byOrder);

export const sessionRows = (letter) =>
  DB.plan.filter(r => r.faza.startsWith('Blok') && r.sesja === letter).sort(byOrder);

export const sessionDay = (letter) => sessionRows(letter)[0]?.dzien || '';

export const mealsForDay = (day) =>
  DB.posilki.filter(r => r.tydzien === '1' && r.dzien === day);

export const routineNames = () => [...new Set(DB.rutyny.map(r => r.rutyna))];
export const routineRows = (name) =>
  DB.rutyny.filter(r => r.rutyna === name).sort(byOrder);

export function glossary(term) {
  const t = term.toLowerCase();
  return DB.slownik.find(r => r.termin.toLowerCase() === t) || DB.slownik.find(r => r.termin.toLowerCase().startsWith(t));
}

// Które typy przepisów pasują do slotu z planu (kolumna posilek w 08).
const SLOT_TAGS = {
  'śniadanie': ['śniadanie'],
  'II śniadanie': ['przekąska', 'śniadanie'],
  'obiad': ['obiad'],
  'przedtreningowa': ['przekąska', 'potreningowy'],
  'przekąska': ['przekąska', 'potreningowy'],
  'kolacja': ['kolacja', 'obiad', 'przekąska'],
};
export const recipeTags = (r) => String(r.typ_posilku || '').split('/').map(x => x.trim().split(' ')[0]).filter(Boolean);
export function recipesForSlot(slot) {
  const tags = SLOT_TAGS[slot] || [String(slot).split(' ')[0]];
  return DB.przepisy.filter(r => recipeTags(r).some(t => tags.includes(t)));
}
export const SLOTS = Object.keys(SLOT_TAGS);

// Auto-linkowanie pojęć ze słownika (kolumna aliasy) w dowolnym tekście.
let termRx = null, termMap = null;
function buildTermIndex() {
  termMap = {};
  const forms = [];
  for (const r of DB.slownik) {
    for (const a of String(r.aliasy || '').split(';').map(s => s.trim()).filter(s => s.length >= 3)) {
      termMap[a.toLowerCase()] = r.termin;
      forms.push(a);
    }
  }
  forms.sort((a, b) => b.length - a.length);
  const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  termRx = forms.length ? new RegExp(`(?<!\\p{L})(${forms.map(escRx).join('|')})(?!\\p{L})`, 'giu') : null;
}
export function linkTerms(text) {
  if (!text) return '';
  if (!termRx) buildTermIndex();
  const safe = esc(text);
  if (!termRx) return safe;
  return safe.replace(termRx, (m) => `<button type="button" class="term" data-action="term" data-term="${esc(termMap[m.toLowerCase()] || m)}">${m}</button>`);
}

// Gdzie w planie występuje dane ćwiczenie (sesje + rutyny).
export function usageOf(exId) {
  const sessions = [...new Set(DB.plan.filter(r => r.id_cwiczenia === exId && /^[ABC]$/.test(r.sesja)).map(r => r.sesja))];
  const routines = [...new Set(DB.rutyny.filter(r => r.id_cwiczenia === exId).map(r => r.rutyna))];
  return { sessions, routines };
}
