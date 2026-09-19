// Stan użytkownika w localStorage (prefiks hf:). Dane z CSV są tylko do odczytu.
const P = 'hf:';
export const load = (k, d) => {
  try { const v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch { return d; }
};
export const save = (k, v) => localStorage.setItem(P + k, JSON.stringify(v));

const pad = (n) => String(n).padStart(2, '0');
export const todayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const shiftKey = (k, days) => { const d = parseKey(k); d.setDate(d.getDate() + days); return todayKey(d); };

// Dzienne "ptaszki": posiłki, rutyny, licznik przerw, trening.
export const getChecks = (date) => load('checks', {})[date] || {};
export function setCheck(date, key, val) {
  const all = load('checks', {});
  all[date] = { ...(all[date] || {}), [key]: val };
  save('checks', all);
}

// Dziennik — klucze kolumn identyczne jak w 11_dziennik.csv.
export const getJournal = () => load('journal', {});
export const getEntry = (date) => getJournal()[date] || {};
export function setEntry(date, patch) {
  const j = getJournal();
  j[date] = { ...(j[date] || {}), ...patch };
  save('journal', j);
}
export function mergeJournal(rows) {
  const j = getJournal();
  let n = 0;
  for (const r of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.data)) continue;
    j[r.data] = { ...(j[r.data] || {}), ...r };
    n++;
  }
  save('journal', j);
  return n;
}

// Serie z treningu: { date: { EX14: [{kg, reps}, ...] } }
export const getWorkout = (date) => load('workout', {})[date] || {};
export function setWorkoutSet(date, exId, idx, field, val) {
  const all = load('workout', {});
  const day = all[date] || (all[date] = {});
  const sets = day[exId] || (day[exId] = []);
  sets[idx] = { ...(sets[idx] || {}), [field]: val };
  save('workout', all);
}
export function lastWorkoutFor(exId, before) {
  const all = load('workout', {});
  const dates = Object.keys(all)
    .filter(d => d < before && (all[d][exId] || []).some(s => s && (s.kg || s.reps)))
    .sort();
  const d = dates.at(-1);
  return d ? { date: d, sets: all[d][exId].filter(Boolean) } : null;
}

export const getShop = () => load('shop', {});
export function setShop(key, val) { const s = getShop(); s[key] = val; save('shop', s); }
export const clearShop = () => save('shop', {});

export const getSettings = () => ({ theme: 'auto', ...load('settings', {}) });
export const setSettings = (patch) => save('settings', { ...getSettings(), ...patch });

// Mój plan posiłków: nadpisania dni { dayIdx: [ {id, slot, time} | {custom, kcal, slot, time} ] }
export const getPlanOverrides = () => load('plan', {});
export function setDayPlan(dayIdx, meals) { const p = getPlanOverrides(); p[dayIdx] = meals; save('plan', p); }
export function resetDayPlan(dayIdx) { const p = getPlanOverrides(); delete p[dayIdx]; save('plan', p); }

// Czego nie jem: { P01: true/false, 'custom:słowo': true }
export const getExcl = () => load('excl', {});
export function setExcl(key, val) { const e = getExcl(); if (val == null) delete e[key]; else e[key] = val; save('excl', e); }
