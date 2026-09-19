import { parseCSV } from './csv.js';

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
  return DB.slownik.find(r => r.termin.toLowerCase().startsWith(t));
}

// Gdzie w planie występuje dane ćwiczenie (sesje + rutyny).
export function usageOf(exId) {
  const sessions = [...new Set(DB.plan.filter(r => r.id_cwiczenia === exId && /^[ABC]$/.test(r.sesja)).map(r => r.sesja))];
  const routines = [...new Set(DB.rutyny.filter(r => r.id_cwiczenia === exId).map(r => r.rutyna))];
  return { sessions, routines };
}
