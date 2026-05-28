// ─── State portions ────────────────────────────────────────────────────────────
let originalServings = null;
let currentServings = null;
let parsedIngredients = []; // { ...ingredient, parsedQty: number|NaN }

document.addEventListener('DOMContentLoaded', async () => {
  setupMobileNav();
  await loadNavCategories();

  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');

  if (!slug) { showError('Recette introuvable.'); return; }
  await loadRecipe(slug);
  setupCheckboxes();
  setupPrint();
});

async function loadRecipe(slug) {
  const { data: recipe, error } = await db
    .from('recipes')
    .select(`
      id, title, slug, description, image_url,
      prep_time, cook_time, servings, difficulty, published,
      ingredients(id, name, quantity, unit, sort_order),
      steps(id, step_number, content, image_url, section),
      recipe_tags(tags(name, slug, color)),
      recipe_categories(categories(name, slug))
    `)
    .eq('slug', slug)
    .eq('published', true)
    .single();

  if (error || !recipe) {
    showError('Cette recette est introuvable ou n\'est pas publiée.');
    return;
  }

  document.title = `${recipe.title} – ${SITE_CONFIG.siteName}`;
  renderRecipe(recipe);
}

function renderRecipe(r) {
  // Hero image
  const hero = document.getElementById('recipe-hero');
  if (r.image_url) {
    hero.style.backgroundImage = `url(${r.image_url})`;
    hero.classList.add('has-image');
  }

  // Breadcrumb catégories
  const breadcrumb = document.getElementById('recipe-breadcrumb');
  if (breadcrumb && r.recipe_categories?.length) {
    breadcrumb.innerHTML = r.recipe_categories.map(rc =>
      `<a href="category.html?slug=${rc.categories.slug}">${rc.categories.name}</a>`
    ).join(' · ');
  }

  // Titre & description
  document.getElementById('recipe-title').textContent = r.title;
  const descEl = document.getElementById('recipe-description');
  if (r.description) descEl.textContent = r.description;
  else descEl.style.display = 'none';

  // Meta badges (sans portions — gérées par l'ajusteur)
  const meta = document.getElementById('recipe-meta');
  meta.innerHTML = [
    r.prep_time ? `<div class="meta-badge"><span class="meta-icon">⏱️</span><div><span class="meta-label">Préparation</span><span class="meta-value">${formatTime(r.prep_time)}</span></div></div>` : '',
    r.cook_time ? `<div class="meta-badge"><span class="meta-icon">🔥</span><div><span class="meta-label">Cuisson</span><span class="meta-value">${formatTime(r.cook_time)}</span></div></div>` : '',
    r.difficulty ? `<div class="meta-badge"><span class="meta-icon">📊</span><div><span class="meta-label">Difficulté</span><span class="meta-value difficulty-${r.difficulty}">${r.difficulty}</span></div></div>` : '',
  ].join('');

  // Tags
  const tagsEl = document.getElementById('recipe-tags');
  if (r.recipe_tags?.length) {
    tagsEl.innerHTML = r.recipe_tags.map(rt =>
      `<a href="category.html?search=${encodeURIComponent(rt.tags.name)}" class="tag">${rt.tags.name}</a>`
    ).join('');
  } else tagsEl.style.display = 'none';

  // ── Ingrédients ──────────────────────────────────────────────────────────────
  const sorted = [...(r.ingredients || [])].sort((a, b) => a.sort_order - b.sort_order);
  parsedIngredients = sorted.map(ing => ({
    ...ing,
    parsedQty: parseRecipeQuantity(ing.quantity),
  }));

  renderIngredients();

  // ── Ajusteur de portions ─────────────────────────────────────────────────────
  if (r.servings) {
    originalServings = r.servings;
    currentServings = r.servings;
    setupServingsAdjuster();
  }

  // ── Étapes ───────────────────────────────────────────────────────────────────
  const stepsSorted = [...(r.steps || [])].sort((a, b) => a.step_number - b.step_number);
  renderSteps(stepsSorted);

  // Afficher le contenu
  document.getElementById('recipe-loading').style.display = 'none';
  document.getElementById('recipe-content').style.display = 'block';
}

// ─── Ingrédients ──────────────────────────────────────────────────────────────

function renderIngredients() {
  const ingList = document.getElementById('ingredients-list');
  if (!parsedIngredients.length) {
    ingList.closest('section').style.display = 'none';
    return;
  }

  const ratio = originalServings ? currentServings / originalServings : 1;

  ingList.innerHTML = parsedIngredients.map((ing, i) => {
    const qtyDisplay = buildQuantityDisplay(ing, ratio);
    return `
      <li class="ingredient-item">
        <label class="ingredient-check">
          <input type="checkbox" class="ingredient-checkbox">
          <span class="checkmark"></span>
          <span class="ingredient-text">
            ${qtyDisplay ? `<span class="ingredient-qty" data-index="${i}">${qtyDisplay}</span> ` : ''}
            ${ing.name}
          </span>
        </label>
      </li>`;
  }).join('');
}

function buildQuantityDisplay(ing, ratio = 1) {
  if (!ing.quantity) return '';
  if (!isNaN(ing.parsedQty)) {
    const adjusted = ing.parsedQty * ratio;
    return formatRecipeQuantity(adjusted) + (ing.unit ? ' ' + ing.unit : '');
  }
  // Quantité non numérique (ex: "quelques", "au goût") → afficher tel quel
  return ing.quantity + (ing.unit ? ' ' + ing.unit : '');
}

// ─── Ajusteur de portions ──────────────────────────────────────────────────────

function setupServingsAdjuster() {
  const adjuster = document.getElementById('servings-adjuster');
  const countEl = document.getElementById('servings-count');
  const pluralEl = document.getElementById('servings-plural');

  adjuster.style.display = 'flex';
  updateServingsDisplay();

  document.getElementById('servings-minus').addEventListener('click', () => {
    if (currentServings > 1) {
      currentServings--;
      updateServingsDisplay();
      renderIngredients();
    }
  });

  document.getElementById('servings-plus').addEventListener('click', () => {
    if (currentServings < 99) {
      currentServings++;
      updateServingsDisplay();
      renderIngredients();
    }
  });

  document.getElementById('servings-reset').addEventListener('click', () => {
    currentServings = originalServings;
    updateServingsDisplay();
    renderIngredients();
  });

  function updateServingsDisplay() {
    countEl.textContent = currentServings;
    pluralEl.textContent = currentServings > 1 ? 's' : '';
    document.getElementById('servings-reset').style.display =
      currentServings === originalServings ? 'none' : 'inline-flex';
  }
}

// ─── Étapes avec sections ──────────────────────────────────────────────────────

function renderSteps(steps) {
  const stepsList = document.getElementById('steps-list');
  if (!steps.length) {
    stepsList.closest('section').style.display = 'none';
    return;
  }

  stepsList.innerHTML = '';
  let currentSection = null;
  let stepNumInSection = 0;

  steps.forEach(s => {
    // Nouvelle section
    if (s.section && s.section !== currentSection) {
      currentSection = s.section;
      stepNumInSection = 0;
      const header = document.createElement('li');
      header.className = 'step-section-header';
      header.textContent = s.section;
      stepsList.appendChild(header);
    }

    stepNumInSection++;
    const li = document.createElement('li');
    li.className = 'step-item';
    li.innerHTML = `
      <div class="step-number">${s.section ? stepNumInSection : s.step_number}</div>
      <div class="step-content">
        <p>${s.content.replace(/\n/g, '<br>')}</p>
        ${s.image_url ? `<img src="${s.image_url}" alt="Étape ${s.step_number}" class="step-image" loading="lazy">` : ''}
      </div>`;
    stepsList.appendChild(li);
  });
}

// ─── Parsing / formatage des quantités ────────────────────────────────────────

function parseRecipeQuantity(str) {
  if (!str) return NaN;
  const s = str.trim();
  // Nombre décimal simple : "200", "1.5", "0,5"
  const simple = parseFloat(s.replace(',', '.'));
  if (!isNaN(simple) && /^[\d.,]+$/.test(s)) return simple;
  // Fraction : "1/2", "3/4"
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return parseInt(frac[1]) / parseInt(frac[2]);
  // Nombre mixte : "1 1/2", "2 1/4"
  const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
  return NaN;
}

// Affiche la quantité avec des fractions Unicode si pertinent
function formatRecipeQuantity(n) {
  if (isNaN(n) || n <= 0) return '';
  if (Number.isInteger(n)) return String(n);

  const fractions = [
    [1, 8, '⅛'], [1, 4, '¼'], [1, 3, '⅓'],
    [3, 8, '⅜'], [1, 2, '½'], [5, 8, '⅝'],
    [2, 3, '⅔'], [3, 4, '¾'], [7, 8, '⅞'],
  ];

  const whole = Math.floor(n);
  const frac = n - whole;

  for (const [num, den, sym] of fractions) {
    if (Math.abs(frac - num / den) < 0.04) {
      return whole > 0 ? `${whole}${sym}` : sym;
    }
  }

  // Arrondi à 1 décimale
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function setupCheckboxes() {
  document.addEventListener('change', e => {
    if (e.target.classList.contains('ingredient-checkbox')) {
      e.target.closest('.ingredient-check')?.classList.toggle('checked', e.target.checked);
    }
  });
}

function setupPrint() {
  document.getElementById('print-btn')?.addEventListener('click', () => window.print());
}

function showError(msg) {
  document.getElementById('recipe-loading').style.display = 'none';
  const errEl = document.getElementById('recipe-error');
  if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
}

function setupMobileNav() {
  const btn = document.getElementById('hamburger');
  const nav = document.getElementById('mobile-nav');
  if (!btn || !nav) return;
  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('nav-open');
    btn.setAttribute('aria-expanded', open);
  });
}
