const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');

// Node < 22 doesn't ship a stable global WebSocket; the Neon driver's Pool
// needs one explicitly. `ws` works in all Node 18+ versions.
neonConfig.webSocketConstructor = ws;

const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!url) {
  console.warn('[db] DATABASE_URL is not set — API will fail on requests');
}

const pool = new Pool({ connectionString: url });

// Thin helper: tagged template for simple ad-hoc reads, .query() for dynamic SQL.
async function sqlTag(strings, ...values) {
  let text = strings[0];
  for (let i = 0; i < values.length; i++) text += `$${i + 1}` + strings[i + 1];
  const { rows } = await pool.query(text, values);
  return rows;
}
sqlTag.query = (text, params) => pool.query(text, params).then((r) => r.rows);

module.exports = { sql: sqlTag, pool };
