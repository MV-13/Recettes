// Initialisation du client Supabase (partagé par toutes les pages)
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Utilitaires communs ───────────────────────────────────────────────────

function formatTime(minutes) {
  if (!minutes && minutes !== 0) return '–';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

function generateSlug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container') || (() => {
    const el = document.createElement('div');
    el.id = 'toast-container';
    document.body.appendChild(el);
    return el;
  })();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.classList.add('toast-visible'), 10);
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function createRecipeCard(recipe) {
  const card = document.createElement('article');
  card.className = 'recipe-card';

  const tags = recipe.recipe_tags?.slice(0, 3).map(rt =>
    `<span class="tag tag-sm">${rt.tags.name}</span>`
  ).join('') || '';

  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);

  card.innerHTML = `
    <a href="recipe.html?slug=${recipe.slug}" class="recipe-card-link">
      <div class="recipe-card-image">
        ${recipe.image_url
          ? `<img src="${recipe.image_url}" alt="${recipe.title}" loading="lazy">`
          : `<div class="recipe-card-placeholder"></div>`}
      </div>
      <div class="recipe-card-body">
        <h3 class="recipe-card-title">${recipe.title}</h3>
        <div class="recipe-card-meta">
          ${recipe.prep_time ? `<span class="meta-item"><svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><polyline points="12,6 12,12 16,14" stroke="currentColor" stroke-width="2" fill="none"/></svg> ${formatTime(recipe.prep_time)}</span>` : ''}
          ${recipe.cook_time ? `<span class="meta-item">🔥 ${formatTime(recipe.cook_time)}</span>` : ''}
          ${totalTime === 0 && !recipe.prep_time && !recipe.cook_time ? '' : ''}
        </div>
        ${tags ? `<div class="recipe-card-tags">${tags}</div>` : ''}
      </div>
    </a>`;

  return card;
}

function renderSkeletons(container, count = 6) {
  container.innerHTML = Array(count).fill(`
    <div class="recipe-card skeleton">
      <div class="recipe-card-image skeleton-box"></div>
      <div class="recipe-card-body">
        <div class="skeleton-line skeleton-title"></div>
        <div class="skeleton-line skeleton-short"></div>
        <div class="skeleton-line skeleton-short"></div>
      </div>
    </div>`).join('');
}

// Charge et affiche les catégories dans la nav (desktop + menu mobile)
async function loadNavCategories() {
  const navList = document.getElementById('nav-categories');
  const mobileList = document.getElementById('mobile-nav-categories');
  if (!navList && !mobileList) return;

  const { data } = await db.from('categories').select('name, slug').order('name');
  if (!data) return;

  if (navList) {
    navList.innerHTML = data.map(c =>
      `<li><a href="category.html?slug=${c.slug}" class="nav-link">${c.name}</a></li>`
    ).join('');
  }

  if (mobileList) {
    mobileList.innerHTML = data.map(c =>
      `<a href="category.html?slug=${c.slug}" class="nav-link">${c.name}</a>`
    ).join('');
  }
}
