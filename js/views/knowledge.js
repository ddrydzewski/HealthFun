import { DB, linkTerms } from '../db.js';
import { esc, has, seg, badge, block, para, searchBox, chips, bindFilter, empty, on, openSheet } from '../ui.js';

export function render(root, sub = 'zasady') {
  const s = ['cele', 'zasady', 'slownik', 'suplementy'].includes(sub) ? sub : 'zasady';
  let html = seg('wiedza', [['zasady', 'Na co dzień'], ['slownik', 'Pojęcia'], ['cele', 'Mój cel']], s);
  if (s === 'cele') html += goalsView();
  else if (s === 'zasady') html += rulesView();
  else if (s === 'slownik') html += glossaryView();
  else html += supplementsView();
  root.innerHTML = html;
  bindFilter(root);
}

const human = (s) => s.replace(/_/g, ' ');

function goalsView() {
  const cats = [...new Set(DB.profil.map(r => r.kategoria))];
  const key = DB.profil.filter(r => ['cel_kcal', 'bialko', 'tluszcz', 'weglowodany'].includes(r.parametr));
  return `
  <section class="card">
    <div class="eyebrow">Twoje liczby — orientacyjnie</div>
    <div class="macros">${key.map(r => `<div><b>≈${esc(r.wartosc)}</b><span>${esc(r.parametr === 'cel_kcal' ? 'kcal' : human(r.parametr) + ' g')}</span></div>`).join('')}</div>
    <div class="card__sub">To widełki, nie wyrok: ±200 kcal i ±20 g białka dziennie to nadal idealnie. Liczy się średnia z tygodnia i to, że robisz to za miesiąc dalej.</div>
  </section>
  ${cats.map(c => `<section class="card"><h3>${esc(c)}</h3>
    ${DB.profil.filter(r => r.kategoria === c).map(r => `<details class="details"><summary><span class="kv"><span>${esc(human(r.parametr))}</span><b>${esc(r.wartosc)} ${esc(r.jednostka)}</b></span></summary>
      ${para(r.co_to_znaczy_prosto)}${has(r.jak_obliczono_lub_zrodlo) ? `<p class="muted small">Skąd: ${esc(r.jak_obliczono_lub_zrodlo)}</p>` : ''}</details>`).join('')}
  </section>`).join('')}`;
}

function rulesView() {
  const cats = [...new Set(DB.zasady.map(r => r.kategoria))];
  return `${searchBox('Szukaj zasady…')}${chips([['1', 'priorytet 1', 'chip--ok'], ...cats.map(c => [c, c])])}
  <section class="card card--list">
    ${DB.zasady.map(r => `<details class="details" data-search="${esc(`${r.zasada} ${r.dlaczego_prosto} ${r.kategoria}`)}" data-cat="${esc(`${r.kategoria} ${r.priorytet}`)}">
      <summary><b>${esc(r.zasada)}</b></summary>
      ${ruleBody(r)}
    </details>`).join('')}
    ${empty('Brak zasad dla tego filtra.')}
  </section>`;
}
const ruleBody = (r) => `<p>${linkTerms(r.dlaczego_prosto)}</p>${block('Jak wdrożyć', has(r.jak_wdrozyc) ? `<p>${linkTerms(r.jak_wdrozyc)}</p>` : '', 'block--soft')}${has(r.zrodlo_lub_konsensus) ? `<p class="muted small">Źródło: ${esc(r.zrodlo_lub_konsensus)}</p>` : ''}`;

export function openRule(id) {
  const r = DB.ruleById[id];
  if (!r) return;
  openSheet(r.zasada, `<div class="badges">${badge(r.kategoria, 'accent')}${badge(`priorytet ${r.priorytet}`, r.priorytet === '1' ? 'ok' : 'muted')}</div>${ruleBody(r)}`);
}

function glossaryView() {
  const cats = [...new Set(DB.slownik.map(r => r.kategoria))];
  return `${searchBox('Szukaj pojęcia…')}${chips(cats.map(c => [c, c]))}
  <section class="card card--list">
    ${DB.slownik.map(r => `<details class="details" data-search="${esc(`${r.termin} ${r.wyjasnienie_prosto}`)}" data-cat="${esc(r.kategoria)}">
      <summary><b>${esc(r.termin)}</b></summary>
      <p>${esc(shortMeaning(r))}</p>${has(r.przyklad_lub_analogia) ? `<p class="muted small">${esc(r.przyklad_lub_analogia)}</p>` : ''}
    </details>`).join('')}
    ${empty('Nie znaleziono tego pojęcia.')}
  </section>`;
}

function supplementsView() {
  return `<p class="muted intro">Tylko to, co ma twarde dowody. Reszta rynku to marketing — pieniądze lepiej wydać na wagę kuchenną i cięższe hantle.</p>
  ${DB.suplementy.map(s => `<section class="card ${s.priorytet === '1' ? 'card--outline' : ''}">
    <div class="card__head"><h3>${esc(s.nazwa)}</h3>${has(s.priorytet) ? badge(`priorytet ${s.priorytet}`, s.priorytet === '1' ? 'ok' : 'muted') : badge('nie', 'bad')}</div>
    <div class="kvlist">
      <div><span>Dawka</span><b>${esc(s.dawka)}</b></div>
      ${has(s.kiedy) ? `<div><span>Kiedy</span><b>${esc(s.kiedy)}</b></div>` : ''}
      <div><span>Dowody</span><b>${esc(s.poziom_dowodow)}</b></div>
    </div>
    <p>${esc(s.po_co_prosto)}</p>
    ${block('Refluks i bezpieczeństwo', para(s.uwagi_refluks_i_bezpieczenstwo), 'block--callout')}
    <p class="muted small">Źródło: ${esc(s.zrodlo)}</p>
  </section>`).join('')}`;
}

on('open-rule', (el) => openRule(el.dataset.id));

export function shortMeaning(term) {
  const simple = {
    rir: 'Ile powtórzeń możesz jeszcze zrobić. RIR 2 = kończysz serię z zapasem dwóch powtórzeń.',
    tempo: 'Szybkość ruchu. 3-1-1-0 = 3 sekundy opuszczania, 1 sekunda pauzy, 1 sekunda podnoszenia, bez pauzy na górze.',
    superset: 'Dwa ćwiczenia wykonywane jedno po drugim. Przerwa dopiero po obu.',
    deload: 'Lżejszy tydzień treningu, żeby odpocząć i odzyskać siły.',
    core: 'Mięśnie brzucha i tułowia, które pomagają utrzymać stabilne ciało.',
  };
  return simple[term.termin.toLowerCase().split(' ')[0]] || term.wyjasnienie_prosto;
}
