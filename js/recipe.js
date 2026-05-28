document.addEventListener('DOMContentLoaded', async () => {
  setupMobileNav();
  await loadNavCategories();

  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');

  if (!slug) {
    showError('Recette introuvable.');
    return;
  }

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
      steps(id, step_number, content, image_url),
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

  // Breadcrumb categories
  const breadcrumb = document.getElementById('recipe-breadcrumb');
  if (breadcrumb && r.recipe_categories?.length) {
    breadcrumb.innerHTML = r.recipe_categories.map(rc =>
      `<a href="category.html?slug=${rc.categories.slug}">${rc.categories.name}</a>`
    ).join(' · ');
  }

  // Title & description
  document.getElementById('recipe-title').textContent = r.title;
  const descEl = document.getElementById('recipe-description');
  if (r.description) descEl.textContent = r.description;
  else descEl.style.display = 'none';

  // Meta info
  const meta = document.getElementById('recipe-meta');
  meta.innerHTML = [
    r.prep_time ? `<div class="meta-badge"><span class="meta-icon">⏱️</span><div><span class="meta-label">Préparation</span><span class="meta-value">${formatTime(r.prep_time)}</span></div></div>` : '',
    r.cook_time ? `<div class="meta-badge"><span class="meta-icon">🔥</span><div><span class="meta-label">Cuisson</span><span class="meta-value">${formatTime(r.cook_time)}</span></div></div>` : '',
    r.servings ? `<div class="meta-badge"><span class="meta-icon">👥</span><div><span class="meta-label">Portions</span><span class="meta-value">${r.servings}</span></div></div>` : '',
    r.difficulty ? `<div class="meta-badge"><span class="meta-icon">📊</span><div><span class="meta-label">Difficulté</span><span class="meta-value difficulty-${r.difficulty}">${r.difficulty}</span></div></div>` : '',
  ].join('');

  // Tags
  const tagsEl = document.getElementById('recipe-tags');
  if (r.recipe_tags?.length) {
    tagsEl.innerHTML = r.recipe_tags.map(rt =>
      `<a href="category.html?search=${encodeURIComponent(rt.tags.name)}" class="tag">${rt.tags.name}</a>`
    ).join('');
  } else tagsEl.style.display = 'none';

  // Ingredients
  const sorted = [...(r.ingredients || [])].sort((a, b) => a.sort_order - b.sort_order);
  const ingList = document.getElementById('ingredients-list');
  if (sorted.length) {
    ingList.innerHTML = sorted.map(ing => `
      <li class="ingredient-item">
        <label class="ingredient-check">
          <input type="checkbox" class="ingredient-checkbox">
          <span class="checkmark"></span>
          <span class="ingredient-text">
            ${ing.quantity ? `<span class="ingredient-qty">${ing.quantity}${ing.unit ? ' ' + ing.unit : ''}</span> ` : ''}
            ${ing.name}
          </span>
        </label>
      </li>`).join('');
  } else {
    ingList.closest('section').style.display = 'none';
  }

  // Steps
  const stepsSorted = [...(r.steps || [])].sort((a, b) => a.step_number - b.step_number);
  const stepsList = document.getElementById('steps-list');
  if (stepsSorted.length) {
    stepsList.innerHTML = stepsSorted.map(s => `
      <li class="step-item">
        <div class="step-number">${s.step_number}</div>
        <div class="step-content">
          <p>${s.content.replace(/\n/g, '<br>')}</p>
          ${s.image_url ? `<img src="${s.image_url}" alt="Étape ${s.step_number}" class="step-image" loading="lazy">` : ''}
        </div>
      </li>`).join('');
  } else {
    stepsList.closest('section').style.display = 'none';
  }

  // Show content, hide loading
  document.getElementById('recipe-loading').style.display = 'none';
  document.getElementById('recipe-content').style.display = 'block';
}

function setupCheckboxes() {
  document.addEventListener('change', e => {
    if (e.target.classList.contains('ingredient-checkbox')) {
      const label = e.target.closest('.ingredient-check');
      label?.classList.toggle('checked', e.target.checked);
    }
  });
}

function setupPrint() {
  const btn = document.getElementById('print-btn');
  if (btn) btn.addEventListener('click', () => window.print());
}

function showError(msg) {
  document.getElementById('recipe-loading').style.display = 'none';
  const errEl = document.getElementById('recipe-error');
  if (errEl) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }
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
