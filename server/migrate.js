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
  // Email uniqueness is important for login. Add a unique index if not present.
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_lower ON users (LOWER(email))`,
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
