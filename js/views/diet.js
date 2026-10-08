import { DB, recipeTags } from '../db.js';
import { esc, has, badge, block, para, searchBox, chips, bindFilter, empty, refluxClass, splitList, on, onChange, openSheet, rerender, toast } from '../ui.js';
import { load, save, setExcl, todayKey, getChecks, setCheck } from '../store.js';
import { isExcluded, excludedBy, exclusionRules } from '../plan.js';

const favorites = () => load('favorites', {});

export function render(root) {
  const liked = favorites();
  const recipes = DB.przepisy.filter(recipe => !isExcluded(recipe));
  const tags = [...new Set(recipes.flatMap(recipeTags))];
  root.innerHTML = `<div class="recipe-banner"><img src="./assets/kitchen.jpg" alt="Świeże warzywa do gotowania" width="1200" height="600"><h2>Coś dobrego na dziś.</h2></div>
    <div class="section-heading recipe-heading"><span class="muted small">${recipes.length} przepisów</span><button class="linkbtn small" data-action="open-prefs">Czego nie jem</button></div>
    ${searchBox('Na co masz ochotę?')}${chips([['favorite', 'Ulubione'], ['quick', 'Do 15 min'], ...tags.map(tag => [tag, tag])])}
    <div class="recipe-grid">${recipes.map(recipe => `<article class="recipe-card" data-search="${esc(`${recipe.nazwa} ${recipe.typ_posilku} ${recipe.skladniki}`)}" data-cat="${esc([...recipeTags(recipe), ...(liked[recipe.id] ? ['favorite'] : []), ...(parseInt(recipe.czas_min, 10) <= 15 ? ['quick'] : [])].join(' '))}">
      <div class="section-heading"><span class="recipe-kind">${esc(recipeTags(recipe)[0])}</span><button class="iconbtn favorite ${liked[recipe.id] ? 'is-favorite' : ''}" data-action="recipe-favorite" data-id="${esc(recipe.id)}" aria-pressed="${!!liked[recipe.id]}" aria-label="Ulubiony: ${esc(recipe.nazwa)}" title="Ulubione">${liked[recipe.id] ? '★' : '☆'}</button></div>
      <button class="recipe-open" data-action="open-recipe" data-id="${esc(recipe.id)}"><h3>${esc(recipe.nazwa)}</h3><div class="recipe-stats"><b>${esc(recipe.czas_min)} min</b><span>${esc(recipe.bialko_g)} g białka</span></div><span class="muted small">${esc(recipe.trudnosc)} · ${esc(recipe.porcje)} ${recipe.porcje === '1' ? 'porcja' : 'porcje'}</span></button>
    </article>`).join('')}</div>${empty('Nic nie pasuje. Wybierz inną kategorię lub zmień wyszukiwanie.')}`;
  bindFilter(root);
}

function cookingList(recipe, field, separator) {
  const checks = getChecks(todayKey());
  return `<ul class="steps steps--check">${splitList(recipe[field], separator).map((text, index) => {
    const key = `cook:${recipe.id}:${field}:${index}`;
    return `<li><label><input type="checkbox" data-change="cook-check" data-key="${key}" ${checks[key] ? 'checked' : ''}><span>${esc(text)}</span></label></li>`;
  }).join('')}</ul>`;
}

export function openRecipe(id, replace = false) {
  const recipe = DB.recipeById[id];
  if (!recipe) return;
  const excluded = excludedBy(recipe);
  openSheet(recipe.nazwa, `<div class="recipe-summary"><span>${esc(recipe.czas_min)} min</span><span>${esc(recipe.porcje)} ${recipe.porcje === '1' ? 'porcja' : 'porcje'}</span><span>${esc(recipe.bialko_g)} g białka / porcję</span></div>
    ${excluded.length ? `<p class="badge warn">Zawiera: ${esc(excluded.map(rule => rule.nazwa).join(', '))}</p>` : ''}
    ${block('Składniki na wszystkie porcje', cookingList(recipe, 'skladniki', ';'))}
    ${block('Przygotowanie', cookingList(recipe, 'przygotowanie', '|'))}
    <details class="details"><summary>Wartości i wskazówki</summary><p>Na porcję: około ${esc(recipe.kcal_porcja)} kcal · ${esc(recipe.bialko_g)} g białka · ${esc(recipe.tluszcz_g)} g tłuszczu · ${esc(recipe.wegle_g)} g węglowodanów.</p><p class="small">Refluks: ${badge(recipe.refluks_ok, refluxClass(recipe.refluks_ok))}</p>${block('Sprzęt', para(recipe.sprzet))}${block('Na później', para(recipe.meal_prep))}${block('Zamienniki', para(recipe.zamienniki))}</details>
    <button class="linkbtn" data-action="recipe-reset" data-id="${esc(id)}">Wyczyść odhaczenia</button>`, { replace });
}

export function openPrefs() {
  const rules = exclusionRules();
  openSheet('Czego nie jem', `<div class="preference-list">${rules.map(rule => `<label class="preference-row"><input type="checkbox" data-change="pref-check" data-id="${esc(rule.id)}" ${rule.active ? 'checked' : ''}><span>${esc(rule.nazwa)}</span></label>`).join('')}</div><div class="field"><label for="prefInput" class="field__label">Inny składnik</label><div class="btnrow"><input type="text" id="prefInput" placeholder="np. szpinak" maxlength="80"><button class="btn" data-action="pref-add">Dodaj</button></div></div>`, { replace: true });
}

on('open-recipe', el => openRecipe(el.dataset.id));
on('recipe-favorite', el => {
  const liked = favorites();
  liked[el.dataset.id] = !liked[el.dataset.id];
  save('favorites', liked);
  el.textContent = liked[el.dataset.id] ? '★' : '☆';
  el.setAttribute('aria-pressed', String(liked[el.dataset.id]));
  el.classList.toggle('is-favorite', liked[el.dataset.id]);
  const card = el.closest('[data-cat]');
  if (card) {
    const categories = card.dataset.cat.split(' ').filter(tag => tag !== 'favorite');
    if (liked[el.dataset.id]) categories.push('favorite');
    card.dataset.cat = categories.join(' ');
    document.querySelector('[data-filter-input]')?.dispatchEvent(new Event('input'));
  }
});
onChange('cook-check', el => setCheck(todayKey(), el.dataset.key, el.checked));
on('recipe-reset', el => {
  const date = todayKey();
  Object.keys(getChecks(date)).filter(key => key.startsWith(`cook:${el.dataset.id}:`)).forEach(key => setCheck(date, key, false));
  openRecipe(el.dataset.id, true);
});
on('open-prefs', openPrefs);
onChange('pref-check', el => { setExcl(el.dataset.id, el.checked); rerender(); });
on('pref-add', () => {
  const text = document.getElementById('prefInput')?.value.trim().toLowerCase();
  if (!text || text.length < 3) return toast('Wpisz przynajmniej 3 znaki.');
  setExcl('custom:' + text, true);
  openPrefs();
  rerender();
});