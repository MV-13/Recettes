-- ════════════════════════════════════════════════════════════
-- SCHÉMA SUPABASE – Mes Recettes
-- Coller et exécuter dans : Dashboard → SQL Editor → New query
-- ════════════════════════════════════════════════════════════

-- ── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Tables ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  description text,
  image_url   text,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tags (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name  text NOT NULL,
  slug  text NOT NULL UNIQUE,
  color text DEFAULT '#C84B31'
);

CREATE TABLE IF NOT EXISTS recipes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  slug        text NOT NULL UNIQUE,
  description text,
  image_url   text,
  prep_time   integer CHECK (prep_time >= 0),
  cook_time   integer CHECK (cook_time >= 0),
  servings    integer CHECK (servings > 0),
  difficulty  text CHECK (difficulty IN ('facile', 'moyen', 'difficile')),
  published   boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipe_categories (
  recipe_id   uuid REFERENCES recipes(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (recipe_id, category_id)
);

CREATE TABLE IF NOT EXISTS recipe_tags (
  recipe_id uuid REFERENCES recipes(id) ON DELETE CASCADE,
  tag_id    uuid REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (recipe_id, tag_id)
);

CREATE TABLE IF NOT EXISTS ingredients (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id  uuid REFERENCES recipes(id) ON DELETE CASCADE,
  name       text NOT NULL,
  quantity   text,
  unit       text,
  sort_order integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS steps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   uuid REFERENCES recipes(id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  content     text NOT NULL,
  image_url   text
);

-- ── Index pour les performances ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_recipes_slug      ON recipes(slug);
CREATE INDEX IF NOT EXISTS idx_recipes_published ON recipes(published);
CREATE INDEX IF NOT EXISTS idx_recipes_created   ON recipes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_categories_slug   ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_tags_slug         ON tags(slug);
CREATE INDEX IF NOT EXISTS idx_ingredients_recipe ON ingredients(recipe_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_steps_recipe       ON steps(recipe_id, step_number);

-- ── Trigger updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER recipes_updated_at
  BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ════════════════════════════════════════════════════════════

ALTER TABLE categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags           ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_tags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients    ENABLE ROW LEVEL SECURITY;
ALTER TABLE steps          ENABLE ROW LEVEL SECURITY;

-- Lecture publique (recettes publiées seulement)
CREATE POLICY "public_read_categories" ON categories FOR SELECT USING (true);
CREATE POLICY "public_read_tags"       ON tags       FOR SELECT USING (true);

CREATE POLICY "public_read_recipes"
  ON recipes FOR SELECT USING (published = true);

CREATE POLICY "public_read_recipe_categories"
  ON recipe_categories FOR SELECT USING (
    EXISTS (SELECT 1 FROM recipes r WHERE r.id = recipe_id AND r.published = true)
  );

CREATE POLICY "public_read_recipe_tags"
  ON recipe_tags FOR SELECT USING (
    EXISTS (SELECT 1 FROM recipes r WHERE r.id = recipe_id AND r.published = true)
  );

CREATE POLICY "public_read_ingredients"
  ON ingredients FOR SELECT USING (
    EXISTS (SELECT 1 FROM recipes r WHERE r.id = recipe_id AND r.published = true)
  );

CREATE POLICY "public_read_steps"
  ON steps FOR SELECT USING (
    EXISTS (SELECT 1 FROM recipes r WHERE r.id = recipe_id AND r.published = true)
  );

-- Écriture : utilisateurs authentifiés uniquement (toi, l'admin)
CREATE POLICY "auth_all_categories"        ON categories        FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_tags"              ON tags              FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_recipes"           ON recipes           FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_recipe_categories" ON recipe_categories FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_recipe_tags"       ON recipe_tags       FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_ingredients"       ON ingredients       FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_steps"             ON steps             FOR ALL USING (auth.role() = 'authenticated');

-- ════════════════════════════════════════════════════════════
-- DONNÉES D'EXEMPLE (optionnel – à supprimer si non voulu)
-- ════════════════════════════════════════════════════════════

INSERT INTO categories (name, slug, description) VALUES
  ('Entrées',     'entrees',     'Salades, soupes et amuse-bouches'),
  ('Plats',       'plats',       'Les plats principaux du quotidien'),
  ('Desserts',    'desserts',    'Gâteaux, tartes et douceurs'),
  ('Apéros',      'aperos',      'Petites bouchées et dips'),
  ('Petit-déjeuner', 'petit-dejeuner', 'Commencer la journée du bon pied')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO tags (name, slug, color) VALUES
  ('Végétarien',  'vegetarien',  '#5B8A5F'),
  ('Vegan',       'vegan',       '#4CAF50'),
  ('Sans gluten', 'sans-gluten', '#FF9800'),
  ('Rapide',      'rapide',      '#2196F3'),
  ('Économique',  'economique',  '#9C27B0'),
  ('Festif',      'festif',      '#E91E63')
ON CONFLICT (slug) DO NOTHING;
