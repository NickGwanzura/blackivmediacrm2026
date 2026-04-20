-- Black Ivy Media CRM - Neon schema
-- Primary store is the key-value `app_data` table. The relational
-- mirrors exist for reporting/BI queries; the app treats app_data as truth.

CREATE TABLE IF NOT EXISTS app_data (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billboards (
  id              TEXT PRIMARY KEY,
  name            TEXT,
  location        TEXT,
  town            TEXT,
  type            TEXT,
  width           NUMERIC,
  height          NUMERIC,
  coordinates     JSONB,
  image_url       TEXT,
  visibility      TEXT,
  side_a_rate     NUMERIC,
  side_b_rate     NUMERIC,
  side_a_status   TEXT,
  side_b_status   TEXT,
  rate_per_slot   NUMERIC,
  total_slots     INTEGER,
  rented_slots    INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  id              TEXT PRIMARY KEY,
  company_name    TEXT,
  contact_person  TEXT,
  email           TEXT,
  phone           TEXT,
  billing_day     INTEGER,
  status          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contracts (
  id                    TEXT PRIMARY KEY,
  client_id             TEXT,
  billboard_id          TEXT,
  start_date            DATE,
  end_date              DATE,
  monthly_rate          NUMERIC,
  installation_cost     NUMERIC,
  printing_cost         NUMERIC,
  total_contract_value  NUMERIC,
  status                TEXT,
  details               TEXT,
  side                  TEXT,
  slot_number           INTEGER,
  has_vat               BOOLEAN,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id                 TEXT PRIMARY KEY,
  client_id          TEXT,
  contract_id        TEXT,
  date               DATE,
  items              JSONB,
  subtotal           NUMERIC,
  vat_amount         NUMERIC,
  total              NUMERIC,
  status             TEXT,
  type               TEXT,
  payment_method     TEXT,
  payment_reference  TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id           TEXT PRIMARY KEY,
  category     TEXT,
  description  TEXT,
  amount       NUMERIC,
  date         DATE,
  reference    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id                     TEXT PRIMARY KEY,
  first_name             TEXT,
  last_name              TEXT,
  email                  TEXT UNIQUE,
  role                   TEXT,
  -- Stored as a bcrypt hash (prefix $2a$/$2b$). Legacy plaintext rows are
  -- transparently re-hashed on the next successful /auth/login.
  password               TEXT,
  -- Approval workflow: 'Active' | 'Pending' | 'Denied'
  status                 TEXT DEFAULT 'Active',
  -- When TRUE the user is forced through /auth/change-password on next login
  must_change_password   BOOLEAN DEFAULT FALSE,
  -- Server-issued reset token (JWT, purpose=reset). Cleared on use.
  password_reset_token   TEXT,
  password_reset_expires TIMESTAMPTZ,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);
-- Note: server/migrate.js adds status / must_change_password / reset columns
-- idempotently for installations that created the users table pre-auth-rewrite.

CREATE TABLE IF NOT EXISTS maintenance_logs (
  id              TEXT PRIMARY KEY,
  billboard_id    TEXT,
  date            DATE,
  type            TEXT,
  technician      TEXT,
  notes           TEXT,
  status          TEXT,
  next_due_date   DATE,
  cost            NUMERIC,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
