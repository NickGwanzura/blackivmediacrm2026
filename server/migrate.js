const { sql } = require('./db');

// Idempotent migration runner. Runs on every boot. Each statement uses
// IF NOT EXISTS (or the INFORMATION_SCHEMA dance for ADD COLUMN IF NOT
// EXISTS on Postgres < 9.6; Neon is PG 15+ so native support is available).
// Never throws past the catch — missing columns will surface via failing
// features, but the server should still come up for everything else.
const STATEMENTS = [
  // ---- billboards (inventory) ----
  // Some older installs were seeded before the billboards table landed in
  // schema.sql, so relational mirroring silently dropped every /sync and the
  // Inventory screen showed nothing. Create it here so boot is self-healing.
  `CREATE TABLE IF NOT EXISTS billboards (
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
   )`,
  // Client-assignment columns were added after the initial schema, so pre-
  // existing billboards tables are missing them.
  `ALTER TABLE billboards ADD COLUMN IF NOT EXISTS side_a_client_id TEXT`,
  `ALTER TABLE billboards ADD COLUMN IF NOT EXISTS side_b_client_id TEXT`,

  // ---- users ----
  // Ensure the users relational mirror has the auth columns we need.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  // Monotonic per-user counter used to invalidate outstanding session
  // cookies after a password change / reset. Each session JWT carries the
  // epoch it was issued against; requireAuth rejects tokens whose epoch is
  // stale.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS session_epoch INTEGER NOT NULL DEFAULT 1`,
  // Email uniqueness is important for login. Add a unique index if not present.
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_lower ON users (LOWER(email))`,

  // ---- Audit log ----
  // Append-only forensic record. Previously this lived only in localStorage
  // (trivially tamperable). Server-side /audit/log + /auth hooks now write
  // here too, so there is a Postgres record of who did what.
  `CREATE TABLE IF NOT EXISTS audit_logs (
     id          TEXT PRIMARY KEY,
     ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     actor_email TEXT,
     actor_id    TEXT,
     actor_role  TEXT,
     action      TEXT NOT NULL,
     details     TEXT,
     ip          TEXT,
     source      TEXT NOT NULL DEFAULT 'server'
   )`,
  `CREATE INDEX IF NOT EXISTS audit_logs_ts_idx ON audit_logs (ts DESC)`,
  `CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (actor_email)`,

  // ---- CRM module ----
  // Sales pipeline tables, mirrored from the app_data KV store on /sync.
  `CREATE TABLE IF NOT EXISTS crm_companies (
     id             TEXT PRIMARY KEY,
     name           TEXT,
     industry       TEXT,
     website        TEXT,
     street_address TEXT,
     city           TEXT,
     country        TEXT,
     created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS crm_contacts (
     id           TEXT PRIMARY KEY,
     company_id   TEXT,
     full_name    TEXT,
     job_title    TEXT,
     phone        TEXT,
     email        TEXT,
     linkedin_url TEXT,
     is_primary   BOOLEAN NOT NULL DEFAULT FALSE,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS crm_opportunities (
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
   )`,
  `CREATE TABLE IF NOT EXISTS crm_touchpoints (
     id              TEXT PRIMARY KEY,
     opportunity_id  TEXT,
     type            TEXT,
     direction       TEXT,
     subject         TEXT,
     content         TEXT,
     client_response TEXT,
     outcome         TEXT,
     sentiment       TEXT,
     duration_seconds INTEGER,
     created_by      TEXT,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS crm_tasks (
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
   )`,
  `CREATE TABLE IF NOT EXISTS crm_email_threads (
     id              TEXT PRIMARY KEY,
     opportunity_id  TEXT,
     contact_id      TEXT,
     subject         TEXT,
     messages        JSONB NOT NULL DEFAULT '[]',
     status          TEXT NOT NULL DEFAULT 'active',
     last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     sent_count      INTEGER NOT NULL DEFAULT 0,
     open_count      INTEGER NOT NULL DEFAULT 0,
     click_count     INTEGER NOT NULL DEFAULT 0,
     reply_count     INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS crm_call_logs (
     id              TEXT PRIMARY KEY,
     opportunity_id  TEXT,
     contact_id      TEXT,
     phone_number    TEXT,
     direction       TEXT,
     started_at      TIMESTAMPTZ,
     ended_at        TIMESTAMPTZ,
     duration_seconds INTEGER NOT NULL DEFAULT 0,
     outcome         TEXT,
     notes           TEXT,
     recording_url   TEXT,
     created_by      TEXT,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
];

async function runMigrations() {
  // Previously we bailed if the users table was missing so ALTERs wouldn't
  // error. That also skipped the billboards self-heal. Run every statement
  // independently — each is wrapped in IF NOT EXISTS and the per-statement
  // catch below converts failures into warnings.
  for (const statement of STATEMENTS) {
    try {
      await sql.query(statement);
      console.log(`[migrate] ok: ${statement.slice(0, 80)}${statement.length > 80 ? '…' : ''}`);
    } catch (e) {
      console.warn(`[migrate] failed: ${statement.slice(0, 80)}… — ${e.message}`);
    }
  }
}

module.exports = { runMigrations };
