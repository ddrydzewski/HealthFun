import { DB, WEEKDAYS_SHORT } from '../db.js';
import { toCSV } from '../csv.js';
import { esc, has, plural, on, onInput, onChange, openSheet, navigate, toast, rerender, fmtShort } from '../ui.js';
import { todayKey, parseKey, shiftKey, getJournal, getEntry, setEntry, mergeJournal, getChecks } from '../store.js';

// Definicja formularza — klucze = kolumny 11_dziennik.csv.
const FIELDS = [
  { group: 'Rano', items: [
    { k: 'waga_kg', l: 'Waga (kg)', t: 'num', step: 0.1, ph: '82.6' },
    { k: 'sen_h', l: 'Sen (h)', t: 'num', step: 0.5, ph: '7.5' },
    { k: 'jakosc_snu_1_5', l: 'Jakość snu', t: 'scale', min: 1, max: 5, labels: ['fatalnie', 'słabo', 'ok', 'dobrze', 'wypoczęty'] },
    { k: 'obwod_pasa_cm', l: 'Obwód pasa (cm) — raz w tygodniu, na pępku', t: 'num', step: 0.5, ph: '96' },
  ] },
  { group: 'Ciało (wieczorem)', items: [
    { k: 'refluks_0_3', l: 'Refluks', t: 'scale', min: 0, max: 3, labels: ['brak', 'lekkie odbijanie', 'pieczenie', 'silny / w nocy'] },
    { k: 'spiete_posladki_0_3', l: 'Spięte pośladki', t: 'scale', min: 0, max: 3, labels: ['luźno', 'czuję', 'przeszkadza', 'bez rolowania nie zasnę'] },
    { k: 'rolowanie_tak_nie', l: 'Musiałem rolować, żeby zasnąć', t: 'yesno' },
    { k: 'bol_biodro_0_10', l: 'Ból biodra', t: 'range', min: 0, max: 10 },
    { k: 'bol_kregoslup_0_10', l: 'Ból kręgosłupa', t: 'range', min: 0, max: 10 },
  ] },
  { group: 'Dzień', items: [
    { k: 'energia_1_5', l: 'Energia', t: 'scale', min: 1, max: 5, labels: ['zero', 'mało', 'ok', 'dobrze', 'pełen energii'] },
    { k: 'stres_1_5', l: 'Stres', t: 'scale', min: 1, max: 5, labels: ['brak', 'lekki', 'średni', 'duży', 'bardzo duży'] },
    { k: 'kroki', l: 'Kroki', t: 'num', step: 100, ph: '8000' },
    { k: 'przerwy_biurowe_ile', l: 'Przerwy biurowe (ile)', t: 'num', ph: '5' },
    { k: 'woda_l', l: 'Woda (l)', t: 'num', step: 0.1, ph: '2.5' },
    { k: 'rutyna_rano', l: 'Rutyna rano', t: 'yesno' },
    { k: 'rutyna_wieczor', l: 'Rutyna wieczór', t: 'yesno' },
  ] },
  { group: 'Trening', items: [
    { k: 'trening_sesja', l: 'Sesja', t: 'choice', opts: ['-', 'A', 'B', 'C'] },
    { k: 'trening_wykonany', l: 'Wykonany', t: 'choice', opts: ['tak', 'częściowo', 'nie'] },
    { k: 'RPE_sesji_1_10', l: 'RPE sesji (cel 7–8)', t: 'range', min: 1, max: 10 },
    { k: 'glowne_ciezary_kg', l: 'Główne ciężary', t: 'text', ph: 'goblet 16×12 / RDL 2×14×10' },
  ] },
  { group: 'Dieta', items: [
    { k: 'kcal_szacunek', l: 'Kalorie (szacunek z planu)', t: 'num', step: 10, ph: '2150' },
    { k: 'bialko_g_szacunek', l: 'Białko g (szacunek)', t: 'num', ph: '170' },
    { k: 'posilek_ktory_zaszkodzil', l: 'Posiłek, który zaszkodził (np. R04)', t: 'text', ph: '-' },
  ] },
  { group: 'Notatki', items: [{ k: 'notatki', l: 'Jak minął dzień?', t: 'textarea' }] },
];

export function render(root, dateParam) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam || '') ? dateParam : todayKey();
  const isToday = date === todayKey();
  if (isToday) autofill(date);
  const e = getEntry(date);
  const d = parseKey(date);
  root.innerHTML = `
  ${summary()}
  <section class="card">
    <div class="datenav">
      <button type="button" class="iconbtn" data-action="j-date" data-d="${shiftKey(date, -1)}" aria-label="Poprzedni dzień"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
      <div class="datenav__mid"><b>${isToday ? 'Dziś' : WEEKDAYS_SHORT[d.getDay()]}, ${esc(d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' }))}</b>${isToday ? '' : `<button type="button" class="linkbtn" data-action="j-date" data-d="${todayKey()}">wróć do dziś</button>`}</div>
      <button type="button" class="iconbtn" data-action="j-date" data-d="${shiftKey(date, 1)}" aria-label="Następny dzień" ${isToday ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
    </div>
    <p class="muted small">Zapisuje się samo. Nie musisz wypełniać wszystkiego — waga, refluks, pośladki i rolowanie to minimum. <button type="button" class="linkbtn" data-action="j-help">Jak wypełniać?</button></p>
  </section>
  ${FIELDS.map(g => `<section class="card"><h3>${esc(g.group)}</h3>${g.items.map(f => field(f, e[f.k], date)).join('')}</section>`).join('')}
  <section class="card">
    <h3>Twoje dane = Twoje CSV</h3>
    <p class="muted small">Eksport tworzy plik w formacie 11_dziennik.csv (te same kolumny). Import łączy wpisy po dacie.</p>
    <div class="btnrow">
      <button type="button" class="btn" data-action="j-export">Eksport CSV</button>
      <label class="btn btn--ghost">Import CSV<input type="file" accept=".csv,text/csv" data-change="j-import" hidden></label>
    </div>
  </section>`;
}

function field(f, v, date) {
  const val = v ?? '';
  const attrs = `data-input="j" data-k="${f.k}" data-date="${date}"`;
  let ctl = '';
  switch (f.t) {
    case 'num': ctl = `<input type="number" inputmode="decimal" step="${f.step || 1}" placeholder="${esc(f.ph || '')}" value="${esc(val)}" ${attrs}>`; break;
    case 'text': ctl = `<input type="text" placeholder="${esc(f.ph || '')}" value="${esc(val)}" ${attrs}>`; break;
    case 'textarea': ctl = `<textarea rows="3" placeholder="Co zauważyłeś? Co zadziałało?" ${attrs}>${esc(val)}</textarea>`; break;
    case 'range': ctl = `<div class="rangewrap"><input type="range" min="${f.min}" max="${f.max}" step="1" value="${esc(val === '' ? f.min : val)}" ${attrs} data-range="1" class="${val === '' ? 'unset' : ''}"><output>${val === '' ? '–' : esc(val)}</output></div>`; break;
    case 'scale': {
      const n = f.max - f.min + 1;
      ctl = `<div class="scale">${Array.from({ length: n }, (_, i) => { const x = String(f.min + i); return `<button type="button" class="scale__b ${String(val) === x ? 'on' : ''}" data-action="j-set" data-k="${f.k}" data-v="${x}" data-date="${date}">${x}</button>`; }).join('')}</div>
        <div class="muted small scale__label">${val === '' ? (f.labels ? f.labels.join(' · ') : '') : esc(f.labels?.[+val - f.min] ?? '')}</div>`;
      break;
    }
    case 'yesno': ctl = `<div class="scale scale--wide">${['tak', 'nie'].map(x => `<button type="button" class="scale__b ${val === x ? 'on' : ''}" data-action="j-set" data-k="${f.k}" data-v="${x}" data-date="${date}">${x}</button>`).join('')}</div>`; break;
    case 'choice': ctl = `<div class="scale scale--wide">${f.opts.map(x => `<button type="button" class="scale__b ${val === x ? 'on' : ''}" data-action="j-set" data-k="${f.k}" data-v="${x}" data-date="${date}">${esc(x)}</button>`).join('')}</div>`; break;
  }
  return `<div class="field"><label class="field__label">${esc(f.l)}</label>${ctl}</div>`;
}

// Uzupełnij z dzisiejszych "ptaszków" (rutyny, przerwy, trening) — tylko puste pola.
function autofill(date) {
  const c = getChecks(date);
  const e = getEntry(date);
  const patch = {};
  const rano = Object.keys(c).find(k => k.startsWith('rutyna:Rano'));
  const wiecz = Object.keys(c).find(k => k.startsWith('rutyna:Wieczór'));
  if (!has(e.rutyna_rano) && rano && c[rano]) patch.rutyna_rano = 'tak';
  if (!has(e.rutyna_wieczor) && wiecz && c[wiecz]) patch.rutyna_wieczor = 'tak';
  if (!has(e.przerwy_biurowe_ile) && c.biuro > 0) patch.przerwy_biurowe_ile = String(c.biuro);
  if (!has(e.trening_sesja) && c.workout) { patch.trening_sesja = c.workout; patch.trening_wykonany = 'tak'; }
  if (Object.keys(patch).length) setEntry(date, patch);
}

// ---------- podsumowanie ----------
function summary() {
  const j = getJournal();
  const dates = Object.keys(j).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  if (!dates.length) return `<section class="card card--soft"><div class="eyebrow">Podsumowanie</div><p class="muted">Po kilku dniach wpisów zobaczysz tu średnią wagę, pas, refluks i trend rolowania.</p></section>`;
  const today = todayKey();
  const inRange = (from, to) => dates.filter(k => k >= from && k < to);
  const num = (k, col) => { const v = parseFloat(String(j[k]?.[col] || '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
  const avg = (keys, col) => { const vs = keys.map(k => num(k, col)).filter(v => v != null); return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null; };
  const w1 = avg(inRange(shiftKey(today, -6), shiftKey(today, 1)), 'waga_kg');
  const w0 = avg(inRange(shiftKey(today, -13), shiftKey(today, -6)), 'waga_kg');
  const last7 = inRange(shiftKey(today, -6), shiftKey(today, 1));
  const refl = avg(last7, 'refluks_0_3');
  const roll = last7.filter(k => j[k].rolowanie_tak_nie === 'tak').length;
  const trainings = last7.filter(k => j[k].trening_wykonany === 'tak').length;
  const waistKey = [...dates].reverse().find(k => num(k, 'obwod_pasa_cm') != null);
  const waist = waistKey ? num(waistKey, 'obwod_pasa_cm') : null;
  const series = dates.filter(k => k >= shiftKey(today, -29)).map(k => num(k, 'waga_kg')).filter(v => v != null);
  const delta = (w1 != null && w0 != null) ? w1 - w0 : null;
  const f1 = (v) => v == null ? '–' : v.toFixed(1);
  return `<section class="card card--soft">
    <div class="card__head"><div class="eyebrow">Ostatnie 7 dni</div><span class="muted small">${plural(last7.length, 'wpis', 'wpisy', 'wpisów')}</span></div>
    <div class="stats">
      <div><b>${f1(w1)}</b><span>waga śr. kg</span>${delta != null ? `<i class="${delta <= 0 ? 'ok' : 'warn'}">${delta > 0 ? '+' : ''}${delta.toFixed(1)} vs poprz.</i>` : ''}</div>
      <div><b>${f1(waist)}</b><span>pas cm${waistKey ? ` (${fmtShort(waistKey)})` : ''}</span></div>
      <div><b>${f1(refl)}</b><span>refluks śr. 0–3</span></div>
      <div><b>${roll}<small>/${last7.length || 0}</small></b><span>dni z rolowaniem</span></div>
      <div><b>${trainings}<small>/3</small></b><span>treningi</span></div>
    </div>
    ${series.length > 1 ? `<div class="sparkwrap">${spark(series)}<div class="muted small">Waga, ostatnie 30 dni (${series.length} pomiarów)</div></div>` : ''}
  </section>`;
}
function spark(vals) {
  const w = 300, h = 56, min = Math.min(...vals), max = Math.max(...vals), r = (max - min) || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 4 - ((v - min) / r) * (h - 8)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}"/></svg>`;
}

// ---------- akcje ----------
onInput('j', (el) => {
  setEntry(el.dataset.date, { [el.dataset.k]: el.value });
  if (el.dataset.range) { el.classList.remove('unset'); el.nextElementSibling.textContent = el.value; }
});
on('j-set', (el) => {
  const cur = getEntry(el.dataset.date)[el.dataset.k];
  setEntry(el.dataset.date, { [el.dataset.k]: cur === el.dataset.v ? '' : el.dataset.v });
  rerender();
});
on('j-date', (el) => navigate(`#/dziennik/${el.dataset.d}`));
on('j-help', () => {
  const legend = DB.dziennik.filter(r => r.data === 'LEGENDA');
  openSheet('Jak wypełniać dziennik', `<div class="kvlist kvlist--col">${legend.map(r => `<div><span>${esc(r.dzien_tyg.replace(/_/g, ' '))}</span><b>${esc(r.waga_kg)}</b></div>`).join('')}</div>`);
});
on('j-export', () => {
  const cols = DB.dziennik.columns;
  const j = getJournal();
  const rows = Object.keys(j).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort().map(k => ({ ...j[k], data: k, dzien_tyg: WEEKDAYS_SHORT[parseKey(k).getDay()] }));
  if (!rows.length) return toast('Brak wpisów do eksportu');
  const blob = new Blob(['\uFEFF' + toCSV(cols, rows)], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `dziennik_${todayKey()}.csv` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`Wyeksportowano ${plural(rows.length, 'wpis', 'wpisy', 'wpisów')}`);
});
onChange('j-import', async (el) => {
  const file = el.files?.[0];
  if (!file) return;
  const { parseCSV } = await import('../csv.js');
  const rows = parseCSV(await file.text());
  const n = mergeJournal(rows);
  el.value = '';
  toast(n ? `Zaimportowano ${plural(n, 'wpis', 'wpisy', 'wpisów')}` : 'Nie znalazłem wierszy z datą YYYY-MM-DD');
  rerender();
});
