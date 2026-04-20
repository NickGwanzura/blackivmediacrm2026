// One-off: pull billboards from the retired Supabase project and upsert them
// into Neon (both the `billboards` relational table and the app_data['billboards']
// JSONB blob the SPA reads). Run once via: `railway run node scripts/migrate-billboards-from-supabase.mjs`.
// Idempotent: re-running won't create duplicates; IDs collide → ON CONFLICT UPDATE,
// and the JSONB blob is merged by id.

import { neon } from '@neondatabase/serverless';

const SUPABASE_URL = 'https://bqadyarwfaczqrhnhrbq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kQxrZfw4EXGtnX5hAJWsJg_t5foBnKB';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Run via `railway run`.');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

// snake_case (Supabase / Neon relational) → camelCase (app_data JSONB)
const toCamel = (row) => ({
  id: row.id,
  name: row.name,
  location: row.location,
  town: row.town,
  type: row.type,
  width: row.width,
  height: row.height,
  coordinates: row.coordinates,
  imageUrl: row.image_url ?? '',
  visibility: row.visibility ?? '',
  sideARate: row.side_a_rate ?? 0,
  sideBRate: row.side_b_rate ?? 0,
  sideAStatus: row.side_a_status ?? 'Available',
  sideBStatus: row.side_b_status ?? 'Available',
  sideAClientId: row.side_a_client_id ?? null,
  sideBClientId: row.side_b_client_id ?? null,
  ratePerSlot: row.rate_per_slot ?? 0,
  totalSlots: row.total_slots ?? 0,
  rentedSlots: row.rented_slots ?? 0,
  createdAt: row.created_at,
});

async function fetchFromSupabase() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/billboards?select=*`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status} ${res.statusText}`);
  return res.json();
}

async function main() {
  console.log('[1/5] Fetching billboards from Supabase...');
  const supaRows = await fetchFromSupabase();
  console.log(`      → got ${supaRows.length} rows`);

  console.log('[2/5] Counting current Neon state...');
  const [{ count: neonCountBefore }] = await sql`SELECT COUNT(*)::int AS count FROM billboards`;
  const existingBlob = await sql`SELECT value FROM app_data WHERE key = 'billboards' LIMIT 1`;
  const existingArr = Array.isArray(existingBlob?.[0]?.value) ? existingBlob[0].value : [];
  console.log(`      → relational: ${neonCountBefore}, app_data blob: ${existingArr.length}`);

  console.log('[3/5] Upserting into billboards (relational)...');
  let upserted = 0;
  for (const r of supaRows) {
    await sql`
      INSERT INTO billboards (
        id, name, location, town, type, width, height, coordinates,
        image_url, visibility, side_a_rate, side_b_rate,
        side_a_status, side_b_status, side_a_client_id, side_b_client_id,
        rate_per_slot, total_slots, rented_slots, created_at
      ) VALUES (
        ${r.id}, ${r.name}, ${r.location}, ${r.town}, ${r.type},
        ${r.width}, ${r.height}, ${JSON.stringify(r.coordinates)}::jsonb,
        ${r.image_url ?? ''}, ${r.visibility ?? ''},
        ${r.side_a_rate ?? 0}, ${r.side_b_rate ?? 0},
        ${r.side_a_status ?? 'Available'}, ${r.side_b_status ?? 'Available'},
        ${r.side_a_client_id ?? null}, ${r.side_b_client_id ?? null},
        ${r.rate_per_slot ?? 0}, ${r.total_slots ?? 0}, ${r.rented_slots ?? 0},
        ${r.created_at ?? new Date().toISOString()}
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        location = EXCLUDED.location,
        town = EXCLUDED.town,
        type = EXCLUDED.type,
        width = EXCLUDED.width,
        height = EXCLUDED.height,
        coordinates = EXCLUDED.coordinates,
        image_url = EXCLUDED.image_url,
        visibility = EXCLUDED.visibility,
        side_a_rate = EXCLUDED.side_a_rate,
        side_b_rate = EXCLUDED.side_b_rate,
        side_a_status = EXCLUDED.side_a_status,
        side_b_status = EXCLUDED.side_b_status,
        rate_per_slot = EXCLUDED.rate_per_slot,
        total_slots = EXCLUDED.total_slots,
        rented_slots = EXCLUDED.rented_slots
    `;
    upserted += 1;
  }
  console.log(`      → upserted ${upserted} rows`);

  console.log('[4/5] Merging into app_data.billboards blob...');
  const incomingCamel = supaRows.map(toCamel);
  const byId = new Map();
  for (const b of existingArr) if (b && b.id) byId.set(b.id, b);
  for (const b of incomingCamel) byId.set(b.id, { ...(byId.get(b.id) ?? {}), ...b });
  const mergedArr = [...byId.values()];

  await sql`
    INSERT INTO app_data (key, value, updated_at)
    VALUES ('billboards', ${JSON.stringify(mergedArr)}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
  console.log(`      → blob now has ${mergedArr.length} items`);

  console.log('[5/5] Verifying...');
  const [{ count: neonCountAfter }] = await sql`SELECT COUNT(*)::int AS count FROM billboards`;
  const finalBlob = await sql`SELECT jsonb_array_length(value) AS len FROM app_data WHERE key = 'billboards'`;
  console.log(`      → relational: ${neonCountAfter} (was ${neonCountBefore})`);
  console.log(`      → blob: ${finalBlob[0]?.len ?? 0} items`);
  console.log('Done.');
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
