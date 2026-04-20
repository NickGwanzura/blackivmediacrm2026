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
  side_a_client_id TEXT,
  side_b_client_id TEXT,
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

-- ---- Audit log ----
-- Append-only forensic record. Written by /audit/log (client-forwarded events)
-- and by server-side hooks in /auth and /sync. UPDATE/DELETE should be
-- revoked from the application role at the DB level once a Neon-compatible
-- migration path exists.
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_email TEXT,
  actor_id    TEXT,
  actor_role  TEXT,
  action      TEXT NOT NULL,
  details     TEXT,
  ip          TEXT,
  source      TEXT NOT NULL DEFAULT 'server'
);
CREATE INDEX IF NOT EXISTS audit_logs_ts_idx ON audit_logs (ts DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (actor_email);

-- ---- CRM module ----
-- Sales pipeline mirrors. Populated by POST /sync from the frontend.

CREATE TABLE IF NOT EXISTS crm_companies (
  id             TEXT PRIMARY KEY,
  name           TEXT,
  industry       TEXT,
  website        TEXT,
  street_address TEXT,
  city           TEXT,
  country        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_contacts (
  id           TEXT PRIMARY KEY,
  company_id   TEXT,
  full_name    TEXT,
  job_title    TEXT,
  phone        TEXT,
  email        TEXT,
  linkedin_url TEXT,
  is_primary   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_opportunities (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT,
  primary_contact_id    TEXT,
  secondary_contact_id  TEXT,
  location_interest     TEXT,
  billboard_type        TEXT,
  campaign_duration     TEXT,
  estimated_value       NUMERIC,
  actual_value          NUMERIC,
  status                TEXT NOT NULL DEFAULT 'new',
  stage                 TEXT NOT NULL DEFAULT 'new_lead',
  lead_source           TEXT,
  last_contact_date     TEXT,
  next_follow_up_date   TEXT,
  call_outcome_notes    TEXT,
  number_of_attempts    INTEGER NOT NULL DEFAULT 0,
  assigned_to           TEXT,
  created_by            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at             TIMESTAMPTZ,
  closed_reason         TEXT,
  days_in_current_stage INTEGER NOT NULL DEFAULT 0,
  stage_history         JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS crm_touchpoints (
  id               TEXT PRIMARY KEY,
  opportunity_id   TEXT,
  type             TEXT,
  direction        TEXT,
  subject          TEXT,
  content          TEXT,
  client_response  TEXT,
  outcome          TEXT,
  sentiment        TEXT,
  duration_seconds INTEGER,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_tasks (
  id               TEXT PRIMARY KEY,
  opportunity_id   TEXT,
  type             TEXT,
  title            TEXT,
  description      TEXT,
  due_date         TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  priority         TEXT NOT NULL DEFAULT 'medium',
  assigned_to      TEXT,
  completed_by     TEXT,
  completed_at     TIMESTAMPTZ,
  completion_notes TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_email_threads (
  id               TEXT PRIMARY KEY,
  opportunity_id   TEXT,
  contact_id       TEXT,
  subject          TEXT,
  messages         JSONB NOT NULL DEFAULT '[]',
  status           TEXT NOT NULL DEFAULT 'active',
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_count       INTEGER NOT NULL DEFAULT 0,
  open_count       INTEGER NOT NULL DEFAULT 0,
  click_count      INTEGER NOT NULL DEFAULT 0,
  reply_count      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS crm_call_logs (
  id               TEXT PRIMARY KEY,
  opportunity_id   TEXT,
  contact_id       TEXT,
  phone_number     TEXT,
  direction        TEXT,
  started_at       TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  outcome          TEXT,
  notes            TEXT,
  recording_url    TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
