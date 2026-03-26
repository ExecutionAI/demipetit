-- Petit Demi — Supabase schema setup
-- Run in the ExecutionAI Lab project (shared sandbox)
-- After running: Settings → API → Exposed schemas → add "petitdemi" → Save

-- 1. Create schema
CREATE SCHEMA IF NOT EXISTS petitdemi;

-- 2. Clients table
CREATE TABLE IF NOT EXISTS petitdemi.clients (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name  text NOT NULL,
  email      text UNIQUE NOT NULL,
  phone      text,
  source     text DEFAULT 'form',
  created_at timestamptz DEFAULT now()
);

-- 3. Orders table
CREATE TABLE IF NOT EXISTS petitdemi.orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid REFERENCES petitdemi.clients(id) ON DELETE SET NULL,
  status           text DEFAULT 'quote_received'
                   CHECK (status IN ('quote_received','confirmed','in_production','ready','delivered','cancelled')),
  product_type     text NOT NULL,
  cake_size        text,
  flavor           text,
  filling          text,
  quantity         int DEFAULT 1,
  decoration_type  text DEFAULT 'basic' CHECK (decoration_type IN ('basic','custom')),
  decoration_notes text,
  occasion         text,
  delivery_date    date NOT NULL,
  base_price       numeric(10,2),
  extras_price     numeric(10,2) DEFAULT 0,
  total_price      numeric(10,2),
  ai_summary       text,
  raw_quote        jsonb,
  internal_notes        text,
  ingredients_ordered   boolean DEFAULT false,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- Migration (run if table already exists):
-- ALTER TABLE petitdemi.orders ADD COLUMN IF NOT EXISTS ingredients_ordered boolean DEFAULT false;

-- 4. Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION petitdemi.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON petitdemi.orders
  FOR EACH ROW EXECUTE FUNCTION petitdemi.set_updated_at();

-- 5. Grant permissions
GRANT USAGE ON SCHEMA petitdemi TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA petitdemi TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA petitdemi TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA petitdemi GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA petitdemi GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- 6. Sample data (optional, for testing)
-- INSERT INTO petitdemi.clients (full_name, email, phone) VALUES
--   ('Anna de Vries', 'anna@example.com', '0612345678');
