let allRecipes = [];
let activeTags = new Set();
let activeSearch = '';
let activeDifficulty = '';
let activeMaxTime = 0;
let offset = 0;
const PAGE_SIZE = 12;

document.addEventListener('DOMContentLoaded', async () => {
  setupMobileNav();
  await loadNavCategories();

  const params = new URLSearchParams(window.location.search);
  const categorySlug = params.get('slug');
  const searchQuery = params.get('search') || '';

  activeSearch = searchQuery;

  await setupPageHeader(categorySlug, searchQuery);
  await loadAllTags();
  await loadRecipes(categorySlug, searchQuery);
  setupFilters();
  setupLoadMore();

  if (searchQuery) {
    const input = document.getElementById('search-input');
    if (input) input.value = searchQuery;
  }
});

async function setupPageHeader(slug, search) {
  const titleEl = document.getElementById('page-title');
  const descEl = document.getElementById('page-desc');

  if (search) {
    document.title = `Recherche : ${search} – ${SITE_CONFIG.siteName}`;
    if (titleEl) titleEl.textContent = `Recherche : « ${search} »`;
    return;
  }

  if (!slug) {
    document.title = `Toutes les recettes – ${SITE_CONFIG.siteName}`;
    if (titleEl) titleEl.textContent = 'Toutes les recettes';
    return;
  }

  const { data } = await db
    .from('categories')
    .select('name, description, image_url, banner_image_url')
    .eq('slug', slug)
    .single();

  if (data) {
    document.title = `${data.name} – ${SITE_CONFIG.siteName}`;
    if (titleEl) titleEl.textContent = data.name;
    if (descEl && data.description) descEl.textContent = data.description;
    const hero = document.getElementById('category-hero');
    const heroImage = data.banner_image_url || data.image_url;
    if (hero && heroImage) {
      hero.style.backgroundImage = `url(${heroImage})`;
      hero.classList.add('has-image');
    }
  }
}

async function loadAllTags() {
  const { data } = await db.from('tags').select('id, name, slug').order('name');
  if (!data) return;

  const container = document.getElementById('tags-filter');
  if (!container) return;

  container.innerHTML = data.map(t => `
    <button class="tag-filter" data-slug="${t.slug}" data-name="${t.name}">
      ${t.name}
    </button>`).join('');

  container.querySelectorAll('.tag-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      const slug = btn.dataset.slug;
      if (activeTags.has(slug)) {
        activeTags.delete(slug);
        btn.classList.remove('active');
      } else {
        activeTags.add(slug);
        btn.classList.add('active');
      }
      updateFiltersActiveCount();
      applyFilters();
    });
  });
}

async function loadRecipes(categorySlug, searchQuery) {
  const grid = document.getElementById('recipes-grid');
  renderSkeletons(grid, PAGE_SIZE);

  let query = db
    .from('recipes')
    .select(`
      id, title, slug, image_url, prep_time, cook_time, difficulty,
      recipe_tags(tags(name, slug)),
      recipe_categories(categories(slug))
    `)
    .eq('published', true)
    .order('created_at', { ascending: false });

  if (searchQuery) {
    query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
  }

  const { data, error } = await query;

  if (error) {
    grid.innerHTML = '<p class="empty-state">Erreur lors du chargement.</p>';
    return;
  }

  // Filter by category client-side (recipes can have multiple categories)
  allRecipes = categorySlug
    ? (data || []).filter(r =>
        r.recipe_categories?.some(rc => rc.categories?.slug === categorySlug)
      )
    : (data || []);

  renderRecipes();
}

function applyFilters() {
  renderRecipes();
}

function renderRecipes() {
  const grid = document.getElementById('recipes-grid');
  const countEl = document.getElementById('recipes-count');

  let filtered = allRecipes;

  if (activeTags.size > 0) {
    filtered = filtered.filter(r =>
      r.recipe_tags?.some(rt => activeTags.has(rt.tags?.slug))
    );
  }

  if (activeDifficulty) {
    filtered = filtered.filter(r => r.difficulty === activeDifficulty);
  }

  if (activeMaxTime > 0) {
    filtered = filtered.filter(r =>
      ((r.prep_time || 0) + (r.cook_time || 0)) <= activeMaxTime
    );
  }

  if (countEl) countEl.textContent = `${filtered.length} recette${filtered.length !== 1 ? 's' : ''}`;

  const visible = filtered.slice(0, offset + PAGE_SIZE);
  offset = visible.length;

  grid.innerHTML = '';
  if (!visible.length) {
    grid.innerHTML = '<p class="empty-state">Aucune recette ne correspond à ces critères.</p>';
  } else {
    visible.forEach(r => grid.appendChild(createRecipeCard(r)));
  }

  const btn = document.getElementById('load-more-btn');
  if (btn) btn.style.display = filtered.length > offset ? 'block' : 'none';
}

function setupFiltersToggle() {
  const toggleBtn = document.getElementById('filters-toggle-btn');
  const dropdown = document.getElementById('filters-dropdown');
  if (!toggleBtn || !dropdown) return;

  const close = () => {
    dropdown.hidden = true;
    toggleBtn.setAttribute('aria-expanded', 'false');
  };

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = dropdown.hidden;
    dropdown.hidden = !open;
    toggleBtn.setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.hidden && !dropdown.contains(e.target) && e.target !== toggleBtn && !toggleBtn.contains(e.target)) {
      close();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}

function updateFiltersActiveCount() {
  const badge = document.getElementById('filters-active-count');
  if (!badge) return;
  const count = activeTags.size + (activeDifficulty ? 1 : 0) + (activeMaxTime > 0 ? 1 : 0);
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

function setupFilters() {
  setupFiltersToggle();

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    let debounce;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        activeSearch = searchInput.value.trim();
        loadRecipes(new URLSearchParams(window.location.search).get('slug'), activeSearch);
      }, 350);
    });
  }

  document.querySelectorAll('.difficulty-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.value;
      if (activeDifficulty === val) {
        activeDifficulty = '';
        btn.classList.remove('active');
      } else {
        activeDifficulty = val;
        document.querySelectorAll('.difficulty-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
      updateFiltersActiveCount();
      applyFilters();
    });
  });

  document.querySelectorAll('.time-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = parseInt(btn.dataset.value, 10);
      if (activeMaxTime === val) {
        activeMaxTime = 0;
        btn.classList.remove('active');
      } else {
        activeMaxTime = val;
        document.querySelectorAll('.time-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
      updateFiltersActiveCount();
      applyFilters();
    });
  });

  const resetBtn = document.getElementById('reset-filters');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      activeTags.clear();
      activeDifficulty = '';
      activeMaxTime = 0;
      offset = 0;
      document.querySelectorAll('.tag-filter, .difficulty-filter, .time-filter').forEach(b =>
        b.classList.remove('active')
      );
      updateFiltersActiveCount();
      applyFilters();
    });
  }
}

function setupLoadMore() {
  const btn = document.getElementById('load-more-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    applyFilters();
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
