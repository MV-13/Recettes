// ─── State ────────────────────────────────────────────────────────────────────
let currentUser = null;
let editingRecipeId = null;
let allCategories = [];
let allTags = [];

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  db.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user ?? null;
    if (currentUser) {
      showDashboard();
    } else {
      showLogin();
    }
  });

  setupLoginForm();
  setupTabNav();
  setupRecipeModal();
  setupCategoryModal();
  setupTagModal();
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
function showLogin() {
  document.getElementById('login-section').style.display = 'flex';
  document.getElementById('dashboard-section').style.display = 'none';
}

async function showDashboard() {
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('dashboard-section').style.display = 'block';
  document.getElementById('admin-email').textContent = currentUser.email;

  await Promise.all([loadAdminRecipes(), loadAdminCategories(), loadAdminTags()]);
}

function setupLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = form.querySelector('#email').value.trim();
    const password = form.querySelector('#password').value;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Connexion…';

    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      showToast('Email ou mot de passe incorrect.', 'error');
      btn.disabled = false;
      btn.textContent = 'Se connecter';
    }
  });

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await db.auth.signOut();
  });
}

// ─── Tab navigation ───────────────────────────────────────────────────────────
function setupTabNav() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
    });
  });
}

// ─── Recipes ──────────────────────────────────────────────────────────────────
async function loadAdminRecipes() {
  const tbody = document.getElementById('recipes-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">Chargement…</td></tr>';

  const { data, error } = await db
    .from('recipes')
    .select('id, title, slug, prep_time, cook_time, published, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = '<tr><td colspan="5" class="error-cell">Erreur de chargement.</td></tr>';
    return;
  }

  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Aucune recette.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(r => `
    <tr>
      <td class="td-title">
        <span class="status-dot ${r.published ? 'published' : 'draft'}"></span>
        ${r.title}
      </td>
      <td class="td-time">${formatTime(r.prep_time)}</td>
      <td class="td-time">${formatTime(r.cook_time)}</td>
      <td class="td-status">${r.published ? 'Publié' : 'Brouillon'}</td>
      <td class="td-actions">
        <a href="../recipe.html?slug=${r.slug}" target="_blank" class="btn-icon" title="Voir">👁</a>
        <button class="btn-icon" onclick="openEditRecipe('${r.id}')" title="Modifier">✏️</button>
        <button class="btn-icon btn-danger" onclick="deleteRecipe('${r.id}', '${r.title.replace(/'/g, "\\'")}')" title="Supprimer">🗑</button>
      </td>
    </tr>`).join('');
}

async function openEditRecipe(id) {
  editingRecipeId = id;
  await loadCategoriesAndTags();

  const { data: r } = await db
    .from('recipes')
    .select(`
      *, ingredients(*), steps(*),
      recipe_categories(category_id),
      recipe_tags(tag_id)
    `)
    .eq('id', id)
    .single();

  if (!r) return;

  fillRecipeForm(r);
  openModal('recipe-modal');
}

function openNewRecipe() {
  editingRecipeId = null;
  clearRecipeForm();
  loadCategoriesAndTags().then(() => openModal('recipe-modal'));
}

function fillRecipeForm(r) {
  const f = document.getElementById('recipe-form');
  f.querySelector('#r-title').value = r.title || '';
  f.querySelector('#r-slug').value = r.slug || '';
  f.querySelector('#r-description').value = r.description || '';
  f.querySelector('#r-prep-time').value = r.prep_time || '';
  f.querySelector('#r-cook-time').value = r.cook_time || '';
  f.querySelector('#r-servings').value = r.servings || '';
  f.querySelector('#r-difficulty').value = r.difficulty || '';
  f.querySelector('#r-published').checked = r.published || false;
  f.querySelector('#r-image-preview').src = r.image_url || '';
  f.querySelector('#r-image-preview').style.display = r.image_url ? 'block' : 'none';
  f.querySelector('#r-current-image').value = r.image_url || '';

  const selectedCats = new Set(r.recipe_categories?.map(rc => rc.category_id) || []);
  f.querySelectorAll('.cat-checkbox').forEach(cb => {
    cb.checked = selectedCats.has(cb.value);
  });

  const selectedTags = new Set(r.recipe_tags?.map(rt => rt.tag_id) || []);
  f.querySelectorAll('.tag-checkbox').forEach(cb => {
    cb.checked = selectedTags.has(cb.value);
  });

  // Ingredients
  const sorted = [...(r.ingredients || [])].sort((a, b) => a.sort_order - b.sort_order);
  const ingContainer = document.getElementById('ingredients-rows');
  ingContainer.innerHTML = '';
  sorted.forEach(ing => addIngredientRow(ing));

  // Steps
  const stepsSorted = [...(r.steps || [])].sort((a, b) => a.step_number - b.step_number);
  const stepsContainer = document.getElementById('steps-rows');
  stepsContainer.innerHTML = '';
  stepsSorted.forEach(s => addStepRow(s));

  document.getElementById('recipe-modal-title').textContent = 'Modifier la recette';
}

function clearRecipeForm() {
  document.getElementById('recipe-form').reset();
  document.getElementById('r-image-preview').style.display = 'none';
  document.getElementById('ingredients-rows').innerHTML = '';
  document.getElementById('steps-rows').innerHTML = '';
  addIngredientRow();
  addStepRow();
  document.getElementById('recipe-modal-title').textContent = 'Nouvelle recette';
}

async function loadCategoriesAndTags() {
  const [{ data: cats }, { data: tags }] = await Promise.all([
    db.from('categories').select('id, name').order('name'),
    db.from('tags').select('id, name').order('name'),
  ]);

  allCategories = cats || [];
  allTags = tags || [];

  document.getElementById('r-categories').innerHTML = allCategories.map(c =>
    `<label class="checkbox-label">
      <input type="checkbox" class="cat-checkbox" value="${c.id}">
      ${c.name}
    </label>`).join('');

  document.getElementById('r-tags').innerHTML = allTags.map(t =>
    `<label class="checkbox-label">
      <input type="checkbox" class="tag-checkbox" value="${t.id}">
      ${t.name}
    </label>`).join('');
}

function addIngredientRow(data = {}) {
  const container = document.getElementById('ingredients-rows');
  const row = document.createElement('div');
  row.className = 'ingredient-row';
  row.innerHTML = `
    <input type="text" placeholder="Quantité" class="inp-qty" value="${data.quantity || ''}">
    <input type="text" placeholder="Unité" class="inp-unit" value="${data.unit || ''}">
    <input type="text" placeholder="Ingrédient *" class="inp-name" value="${data.name || ''}">
    <button type="button" class="btn-row-remove" onclick="this.closest('.ingredient-row').remove()">×</button>`;
  container.appendChild(row);
}

function addStepRow(data = {}) {
  const container = document.getElementById('steps-rows');
  const idx = container.children.length + 1;
  const row = document.createElement('div');
  row.className = 'step-row';
  row.innerHTML = `
    <input type="text" placeholder="Section (ex : Ganache, Biscuit…)" class="inp-section" value="${data.section || ''}">
    <span class="step-num">${idx}</span>
    <textarea placeholder="Description de l'étape…" class="inp-step">${data.content || ''}</textarea>
    <button type="button" class="btn-row-remove" onclick="removeStepRow(this)" title="Supprimer cette étape">×</button>`;
  container.appendChild(row);
}

function removeStepRow(btn) {
  btn.closest('.step-row').remove();
  document.querySelectorAll('#steps-rows .step-num').forEach((el, i) => {
    el.textContent = i + 1;
  });
}

function setupRecipeModal() {
  document.getElementById('add-recipe-btn')?.addEventListener('click', openNewRecipe);
  document.getElementById('add-ingredient-btn')?.addEventListener('click', () => addIngredientRow());
  document.getElementById('add-step-btn')?.addEventListener('click', () => addStepRow());

  // Slug auto-gen
  document.getElementById('r-title')?.addEventListener('input', e => {
    const slugInput = document.getElementById('r-slug');
    if (!editingRecipeId) slugInput.value = generateSlug(e.target.value);
  });

  // Image upload
  document.getElementById('r-image-upload')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;

    const label = document.getElementById('upload-label');
    label.textContent = 'Upload en cours…';

    const path = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
    const { data, error } = await db.storage
      .from(SITE_CONFIG.imagesBucket)
      .upload(path, file, { contentType: file.type });

    if (error) {
      showToast('Erreur upload image : ' + error.message, 'error');
      label.textContent = 'Choisir une image';
      return;
    }

    const { data: { publicUrl } } = db.storage
      .from(SITE_CONFIG.imagesBucket)
      .getPublicUrl(data.path);

    document.getElementById('r-current-image').value = publicUrl;
    const preview = document.getElementById('r-image-preview');
    preview.src = publicUrl;
    preview.style.display = 'block';
    label.textContent = 'Image uploadée ✓';
    showToast('Image uploadée avec succès.', 'success');
  });

  // Form submit
  document.getElementById('recipe-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    await saveRecipe();
  });
}

async function saveRecipe() {
  const f = document.getElementById('recipe-form');
  const btn = f.querySelector('.btn-save');
  btn.disabled = true;
  btn.textContent = 'Enregistrement…';

  const recipeData = {
    title: f.querySelector('#r-title').value.trim(),
    slug: f.querySelector('#r-slug').value.trim(),
    description: f.querySelector('#r-description').value.trim() || null,
    image_url: f.querySelector('#r-current-image').value || null,
    prep_time: parseInt(f.querySelector('#r-prep-time').value) || null,
    cook_time: parseInt(f.querySelector('#r-cook-time').value) || null,
    servings: parseInt(f.querySelector('#r-servings').value) || null,
    difficulty: f.querySelector('#r-difficulty').value || null,
    published: f.querySelector('#r-published').checked,
    updated_at: new Date().toISOString(),
  };

  let recipeId = editingRecipeId;

  if (recipeId) {
    const { error } = await db.from('recipes').update(recipeData).eq('id', recipeId);
    if (error) { showToast('Erreur : ' + error.message, 'error'); btn.disabled = false; btn.textContent = 'Enregistrer'; return; }
  } else {
    const { data, error } = await db.from('recipes').insert(recipeData).select('id').single();
    if (error) { showToast('Erreur : ' + error.message, 'error'); btn.disabled = false; btn.textContent = 'Enregistrer'; return; }
    recipeId = data.id;
  }

  // Sync categories
  await db.from('recipe_categories').delete().eq('recipe_id', recipeId);
  const selectedCats = [...f.querySelectorAll('.cat-checkbox:checked')].map(cb => ({
    recipe_id: recipeId,
    category_id: cb.value,
  }));
  if (selectedCats.length) await db.from('recipe_categories').insert(selectedCats);

  // Sync tags
  await db.from('recipe_tags').delete().eq('recipe_id', recipeId);
  const selectedTags = [...f.querySelectorAll('.tag-checkbox:checked')].map(cb => ({
    recipe_id: recipeId,
    tag_id: cb.value,
  }));
  if (selectedTags.length) await db.from('recipe_tags').insert(selectedTags);

  // Sync ingredients
  await db.from('ingredients').delete().eq('recipe_id', recipeId);
  const ingRows = [...f.querySelectorAll('#ingredients-rows .ingredient-row')];
  const ingredients = ingRows
    .map((row, i) => ({
      recipe_id: recipeId,
      quantity: row.querySelector('.inp-qty').value.trim() || null,
      unit: row.querySelector('.inp-unit').value.trim() || null,
      name: row.querySelector('.inp-name').value.trim(),
      sort_order: i,
    }))
    .filter(ing => ing.name);
  if (ingredients.length) await db.from('ingredients').insert(ingredients);

  // Sync steps
  await db.from('steps').delete().eq('recipe_id', recipeId);
  const stepRows = [...f.querySelectorAll('#steps-rows .step-row')];
  const steps = stepRows
    .map((row, i) => ({
      recipe_id: recipeId,
      step_number: i + 1,
      content: row.querySelector('.inp-step').value.trim(),
      section: row.querySelector('.inp-section').value.trim() || null,
    }))
    .filter(s => s.content);
  if (steps.length) await db.from('steps').insert(steps);

  closeModal('recipe-modal');
  showToast('Recette enregistrée !', 'success');
  await loadAdminRecipes();
  btn.disabled = false;
  btn.textContent = 'Enregistrer';
}

async function deleteRecipe(id, title) {
  if (!confirm(`Supprimer la recette « ${title} » ? Cette action est irréversible.`)) return;
  const { error } = await db.from('recipes').delete().eq('id', id);
  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
  showToast('Recette supprimée.', 'success');
  loadAdminRecipes();
}

// ─── Categories ───────────────────────────────────────────────────────────────
async function loadAdminCategories() {
  const container = document.getElementById('categories-list');
  container.innerHTML = '<p class="loading-text">Chargement…</p>';

  const { data } = await db.from('categories').select('*').order('name');

  if (!data?.length) {
    container.innerHTML = '<p class="empty-text">Aucune catégorie. Commencez par en créer une.</p>';
    return;
  }

  container.innerHTML = data.map(c => `
    <div class="list-item">
      <div class="list-item-info">
        <strong>${c.name}</strong>
        <span class="list-item-slug">/${c.slug}</span>
        ${c.description ? `<p class="list-item-desc">${c.description}</p>` : ''}
      </div>
      <div class="list-item-actions">
        <button class="btn-icon" onclick="editCategory(${JSON.stringify(c).replace(/"/g, '&quot;')})">✏️</button>
        <button class="btn-icon btn-danger" onclick="deleteCategory('${c.id}', '${c.name.replace(/'/g, "\\'")}')">🗑</button>
      </div>
    </div>`).join('');
}

function setupCategoryModal() {
  document.getElementById('add-category-btn')?.addEventListener('click', () => {
    document.getElementById('category-form').reset();
    document.getElementById('cat-id').value = '';
    document.getElementById('cat-current-image').value = '';
    document.getElementById('cat-image-preview').style.display = 'none';
    document.getElementById('cat-upload-label').textContent = '📷 Choisir une photo';
    document.getElementById('cat-modal-title').textContent = 'Nouvelle catégorie';
    openModal('category-modal');
  });

  document.getElementById('cat-name')?.addEventListener('input', e => {
    const idInput = document.getElementById('cat-id');
    if (!idInput.value) document.getElementById('cat-slug').value = generateSlug(e.target.value);
  });

  // Upload photo catégorie
  document.getElementById('cat-image-upload')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const label = document.getElementById('cat-upload-label');
    label.textContent = 'Upload en cours…';

    const path = `categories/${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
    const { data, error } = await db.storage
      .from(SITE_CONFIG.imagesBucket)
      .upload(path, file, { contentType: file.type });

    if (error) { showToast('Erreur upload : ' + error.message, 'error'); label.textContent = '📷 Choisir une photo'; return; }

    const { data: { publicUrl } } = db.storage.from(SITE_CONFIG.imagesBucket).getPublicUrl(data.path);
    document.getElementById('cat-current-image').value = publicUrl;
    const preview = document.getElementById('cat-image-preview');
    preview.src = publicUrl;
    preview.style.display = 'block';
    label.textContent = 'Photo uploadée ✓';
    showToast('Photo uploadée.', 'success');
  });

  document.getElementById('category-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const id = f.querySelector('#cat-id').value;
    const payload = {
      name: f.querySelector('#cat-name').value.trim(),
      slug: f.querySelector('#cat-slug').value.trim(),
      description: f.querySelector('#cat-description').value.trim() || null,
      image_url: f.querySelector('#cat-current-image').value || null,
    };

    const { error } = id
      ? await db.from('categories').update(payload).eq('id', id)
      : await db.from('categories').insert(payload);

    if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
    closeModal('category-modal');
    showToast(id ? 'Catégorie modifiée.' : 'Catégorie créée.', 'success');
    loadAdminCategories();
    loadNavCategories();
  });
}

function editCategory(c) {
  const f = document.getElementById('category-form');
  f.querySelector('#cat-id').value = c.id;
  f.querySelector('#cat-name').value = c.name;
  f.querySelector('#cat-slug').value = c.slug;
  f.querySelector('#cat-description').value = c.description || '';
  f.querySelector('#cat-current-image').value = c.image_url || '';
  const preview = document.getElementById('cat-image-preview');
  if (c.image_url) {
    preview.src = c.image_url;
    preview.style.display = 'block';
    document.getElementById('cat-upload-label').textContent = 'Changer la photo';
  } else {
    preview.style.display = 'none';
    document.getElementById('cat-upload-label').textContent = '📷 Choisir une photo';
  }
  document.getElementById('cat-modal-title').textContent = 'Modifier la catégorie';
  openModal('category-modal');
}

async function deleteCategory(id, name) {
  if (!confirm(`Supprimer la catégorie « ${name} » ?`)) return;
  const { error } = await db.from('categories').delete().eq('id', id);
  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
  showToast('Catégorie supprimée.', 'success');
  loadAdminCategories();
}

// ─── Tags ─────────────────────────────────────────────────────────────────────
async function loadAdminTags() {
  const container = document.getElementById('tags-list');
  container.innerHTML = '<p class="loading-text">Chargement…</p>';

  const { data } = await db.from('tags').select('*').order('name');

  if (!data?.length) {
    container.innerHTML = '<p class="empty-text">Aucun tag.</p>';
    return;
  }

  container.innerHTML = data.map(t => `
    <div class="list-item">
      <div class="list-item-info">
        <span class="tag" style="${t.color ? `background:${t.color}20;border-color:${t.color};color:${t.color}` : ''}">${t.name}</span>
        <span class="list-item-slug">/${t.slug}</span>
      </div>
      <div class="list-item-actions">
        <button class="btn-icon" onclick="editTag(${JSON.stringify(t).replace(/"/g, '&quot;')})">✏️</button>
        <button class="btn-icon btn-danger" onclick="deleteTag('${t.id}', '${t.name.replace(/'/g, "\\'")}')">🗑</button>
      </div>
    </div>`).join('');
}

function setupTagModal() {
  document.getElementById('add-tag-btn')?.addEventListener('click', () => {
    document.getElementById('tag-form').reset();
    document.getElementById('tag-id').value = '';
    document.getElementById('tag-modal-title').textContent = 'Nouveau tag';
    openModal('tag-modal');
  });

  document.getElementById('tag-name-input')?.addEventListener('input', e => {
    const idInput = document.getElementById('tag-id');
    if (!idInput.value) document.getElementById('tag-slug-input').value = generateSlug(e.target.value);
  });

  document.getElementById('tag-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const id = f.querySelector('#tag-id').value;
    const payload = {
      name: f.querySelector('#tag-name-input').value.trim(),
      slug: f.querySelector('#tag-slug-input').value.trim(),
      color: f.querySelector('#tag-color').value || null,
    };

    const { error } = id
      ? await db.from('tags').update(payload).eq('id', id)
      : await db.from('tags').insert(payload);

    if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
    closeModal('tag-modal');
    showToast(id ? 'Tag modifié.' : 'Tag créé.', 'success');
    loadAdminTags();
  });
}

function editTag(t) {
  const f = document.getElementById('tag-form');
  f.querySelector('#tag-id').value = t.id;
  f.querySelector('#tag-name-input').value = t.name;
  f.querySelector('#tag-slug-input').value = t.slug;
  f.querySelector('#tag-color').value = t.color || '#C84B31';
  document.getElementById('tag-modal-title').textContent = 'Modifier le tag';
  openModal('tag-modal');
}

async function deleteTag(id, name) {
  if (!confirm(`Supprimer le tag « ${name} » ?`)) return;
  const { error } = await db.from('tags').delete().eq('id', id);
  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
  showToast('Tag supprimé.', 'success');
  loadAdminTags();
}

// ─── Modal helpers ─────────────────────────────────────────────────────────────
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('modal-open');
  document.body.classList.add('modal-active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('modal-open');
  document.body.classList.remove('modal-active');
}

// Close modal on backdrop click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal')) {
    closeModal(e.target.id);
  }
});

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.modal-open').forEach(m => closeModal(m.id));
  }
});
