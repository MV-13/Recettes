document.addEventListener('DOMContentLoaded', async () => {
  setupMobileNav();
  setupHeaderSearch();
  await loadNavCategories();
  await Promise.all([loadLatestRecipes(), loadCategories()]);
});

async function loadLatestRecipes() {
  const grid = document.getElementById('latest-recipes-grid');
  renderSkeletons(grid, SITE_CONFIG.latestRecipesCount);

  const { data, error } = await db
    .from('recipes')
    .select(`
      id, title, slug, image_url, prep_time, cook_time,
      recipe_tags(tags(name, slug))
    `)
    .eq('published', true)
    .order('created_at', { ascending: false })
    .limit(SITE_CONFIG.latestRecipesCount);

  if (error || !data?.length) {
    grid.innerHTML = '<p class="empty-state">Aucune recette pour l\'instant.</p>';
    return;
  }

  grid.innerHTML = '';
  data.forEach(r => grid.appendChild(createRecipeCard(r)));
}

async function loadCategories() {
  const grid = document.getElementById('categories-grid');
  if (!grid) return;

  const { data } = await db
    .from('categories')
    .select('id, name, slug, description, image_url')
    .order('name');

  if (!data?.length) {
    grid.innerHTML = '<p class="empty-state">Aucune catégorie.</p>';
    return;
  }

  grid.innerHTML = data.map(c => `
    <a href="category.html?slug=${c.slug}" class="category-card">
      <div class="category-card-image">
        ${c.image_url ? `<img src="${c.image_url}" alt="${c.name}" loading="lazy">` : ''}
      </div>
      <div class="category-card-body">
        <h3 class="category-card-title">${c.name}</h3>
        ${c.description ? `<p class="category-card-desc">${c.description}</p>` : ''}
      </div>
    </a>`).join('');
}

function setupHeaderSearch() {
  const form = document.getElementById('hero-search-form');
  if (!form) return;
  form.addEventListener('submit', e => {
    e.preventDefault();
    const q = form.querySelector('input').value.trim();
    if (q) window.location.href = `category.html?search=${encodeURIComponent(q)}`;
  });
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
