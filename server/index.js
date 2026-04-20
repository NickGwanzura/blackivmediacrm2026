const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const { sql } = require('./db');
const { Resend } = require('resend');
const { createAuthRouter, requireAuth, requireRole, ensureInitialAdmin, toClientUser } = require('./auth');
const { runMigrations } = require('./migrate');

const app = express();
// Railway terminates TLS at its edge. Trust the first proxy hop so req.secure
// and cookie Secure detection work correctly behind X-Forwarded-* headers.
app.set('trust proxy', 1);
// Default small JSON body limit — protects /auth/* and other small endpoints
// from trivial DoS via oversized bodies. Routes that legitimately need more
// (e.g. /sync, /email/send with attachments) opt in to a larger limit at the
// route level.
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

const resendClient = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// ---- CORS ----
// Parse ALLOWED_ORIGIN as a comma-separated allowlist. An empty allowlist in
// dev means "reflect the request origin" for convenience; in production, an
// empty allowlist means "do not set CORS headers" (safe for same-origin Railway
// deploys).
const CORS_ALLOWLIST = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

let corsDevWarningLogged = false;
if (process.env.NODE_ENV === 'production' && CORS_ALLOWLIST.length === 0) {
  console.warn('[cors] ⚠️  ALLOWED_ORIGIN is empty in production. CORS headers will not be set — this is safe for same-origin deploys but will block cross-origin browsers.');
}

app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  const inAllowlist = requestOrigin && CORS_ALLOWLIST.includes(requestOrigin);
  const devReflect =
    !inAllowlist &&
    process.env.NODE_ENV !== 'production' &&
    CORS_ALLOWLIST.length === 0 &&
    !!requestOrigin;

  if (devReflect && !corsDevWarningLogged) {
    console.warn('[cors] ⚠️  ALLOWED_ORIGIN is empty in development — reflecting request Origin. Set ALLOWED_ORIGIN before deploying.');
    corsDevWarningLogged = true;
  }

  if (inAllowlist || devReflect) {
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-KEY');
  }
  // Never emit Access-Control-Allow-Origin: * — it would break credentialed
  // requests and is unsafe for an authenticated API.
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---- Auth routes (cookie-based, public) ----
// Company name is read lazily from app_data so emails reflect branding changes.
async function getCompanyNameFromDb() {
  try {
    const rows = await sql`SELECT value FROM app_data WHERE key = 'company_profile' LIMIT 1`;
    const profile = rows && rows[0] ? rows[0].value : null;
    if (profile && profile.name) return profile.name;
  } catch (e) { /* ignore */ }
  return 'Black Ivy Media';
}

// ---- Audit writer ----
// Writes to the append-only audit_logs table. Never throws — audit failures
// should never prevent the actual request from succeeding. Returns the row id
// on success, or null on failure (logged to stderr).
const crypto = require('crypto');
async function writeAudit({ req, action, details, actor, source = 'server' }) {
  try {
    const id = `log_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const u = actor || req?.user || null;
    const ip =
      (req?.headers?.['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
      req?.socket?.remoteAddress || null;
    await sql.query(
      `INSERT INTO audit_logs (id, actor_email, actor_id, actor_role, action, details, ip, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        u?.email || null,
        u?.id || null,
        u?.role || null,
        String(action || 'unknown').slice(0, 200),
        details ? String(details).slice(0, 2000) : null,
        ip ? String(ip).slice(0, 64) : null,
        source,
      ],
    );
    return id;
  } catch (e) {
    console.error('[audit] write failed:', e.message);
    return null;
  }
}
app.locals.writeAudit = writeAudit;

app.use('/auth', createAuthRouter({
  resendClient,
  getCompanyName: () => {
    // Synchronous fallback; the helper above is async and used only when a
    // fresher name is important. Most paths use this sync cached value.
    return process.env.COMPANY_NAME || 'Black Ivy Media';
  },
  writeAudit,
}));

// ---- Protected endpoints ----
// Every write goes through requireAuth. /sync and /delete allow any
// authenticated user (with per-collection guards below for sensitive
// collections like users); admin-only endpoints like /force-push require Admin.
app.use('/sync', requireAuth);
app.use('/delete', requireAuth);
app.use('/email', requireAuth, requireRole('Admin', 'Manager'));
app.use('/force-push', requireAuth, requireRole('Admin'));
app.use('/audit', requireAuth);

// ---- Audit log endpoints ----
// POST /audit/log — any authenticated client can forward a client-originated
// event. Actor attribution is taken from the session, NOT the request body —
// so `logAction` in the browser cannot spoof another user.
app.post('/audit/log', async (req, res) => {
  const { action, details } = req.body || {};
  if (!action) return res.status(400).json({ error: 'action is required' });
  const id = await writeAudit({ req, action, details, source: 'client' });
  res.json({ ok: true, id });
});

// GET /audit/log — Admin only. Returns the most recent N entries (default 500).
app.get('/audit/log', requireRole('Admin'), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '500', 10) || 500, 5000);
  try {
    const rows = await sql`
      SELECT id, ts, actor_email, actor_id, actor_role, action, details, ip, source
        FROM audit_logs ORDER BY ts DESC LIMIT ${limit}
    `;
    res.json({ logs: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// /health is a liveness probe (process up) so a Neon outage doesn't take
// down the container. /health/db is the readiness probe exposed to the UI.
app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/health/db', async (_req, res) => {
  try {
    await sql`SELECT 1`;
    res.json({ ok: true, db: 'up' });
  } catch (e) {
    res.status(503).json({ ok: false, db: 'down', error: e.message });
  }
});

// GET /sync/all → returns { [key]: value } for every row in app_data.
// Requires auth so the users JSONB (which historically contained plaintext
// passwords) is never returned to anonymous callers. Sensitive user fields
// are stripped from the response even for authenticated callers — password
// state only flows through /auth/*.
app.get('/sync/all', requireAuth, async (_req, res) => {
  try {
    const rows = await sql`SELECT key, value FROM app_data`;
    const out = {};
    for (const r of rows) out[r.key] = r.value;
    // Users are authoritative in the `users` SQL table (auth.js owns writes
    // via /auth/invite, /auth/register, /auth/approve, etc). The `app_data`
    // users blob is a legacy cache and can drift. Always overwrite it with
    // the live table so Settings → User Access Control sees every account.
    const userRows = await sql`SELECT * FROM users ORDER BY created_at ASC NULLS LAST, id ASC`;
    out.users = userRows.map(toClientUser);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /sync  body: { collection: string, data: any }
// Uses a route-level 10 MB parser because bulk imports (billboards, contracts,
// full backups) can legitimately be multi-MB.
app.post('/sync', express.json({ limit: '10mb' }), async (req, res) => {
  const { collection } = req.body || {};
  let { data } = req.body || {};
  if (!collection) return res.status(400).json({ error: 'collection is required' });

  // Audit logs are append-only and owned exclusively by /audit/log. Reject
  // any client attempt to overwrite the KV `logs` blob — that was the old
  // localStorage attack surface.
  if (collection === 'logs' || collection === 'auditLogs') {
    writeAudit({ req, action: 'sync.rejected', details: `Attempt to /sync protected collection "${collection}"` });
    return res.status(403).json({ error: 'Audit logs cannot be written via /sync' });
  }

  // Privilege-escalation guard: writing to the users collection can grant
  // Admin role / Active status / clear mustChangePassword. Only admins.
  if (collection === 'users') {
    if (!req.user || req.user.role !== 'Admin') {
      writeAudit({ req, action: 'sync.denied', details: `Non-admin (${req.user?.email || 'anon'}) tried to /sync users` });
      return res.status(403).json({ error: 'Admin role required to sync users' });
    }
    // Even for admins, never let /sync touch password state. Those fields
    // are owned exclusively by /auth/*.
    if (Array.isArray(data)) {
      data = data.map((u) => {
        if (!u || typeof u !== 'object') return u;
        const {
          password,
          password_reset_token,
          password_reset_expires,
          ...rest
        } = u;
        return rest;
      });
    }
  }

  try {
    await sql`
      INSERT INTO app_data (key, value, updated_at)
      VALUES (${collection}, ${JSON.stringify(data)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
    await mirrorRelational(collection, data);
    // Fire-and-forget audit — lightweight, no row counts to avoid PII in logs
    // for large collections. Count is just the array length for context.
    const n = Array.isArray(data) ? data.length : (typeof data === 'object' && data ? 1 : 0);
    writeAudit({ req, action: 'sync.write', details: `collection=${collection} rows=${n}` });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /delete/:collection/:id → removes a row from the relational mirror
app.delete('/delete/:collection/:id', async (req, res) => {
  const { collection, id } = req.params;
  // Deleting a user is an admin-only action (account lifecycle).
  if (collection === 'users') {
    if (!req.user || req.user.role !== 'Admin') {
      writeAudit({ req, action: 'delete.denied', details: `Non-admin tried to delete users/${id}` });
      return res.status(403).json({ error: 'Admin role required to delete users' });
    }
  }
  // audit_logs is append-only; refuse even if called directly.
  if (collection === 'audit_logs' || collection === 'logs' || collection === 'auditLogs') {
    writeAudit({ req, action: 'delete.rejected', details: `Attempt to delete audit_logs/${id}` });
    return res.status(403).json({ error: 'Audit logs are append-only' });
  }
  const table = RELATIONAL_TABLES[collection];
  if (!table) return res.json({ ok: true, skipped: true });
  try {
    await sql.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    writeAudit({ req, action: 'delete.row', details: `${collection}/${id}` });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /email/send  body: { to, cc?, bcc?, subject, html?, text?, attachments?: [{filename, content (base64), contentType?}] }
// Attachments can be large (invoice PDFs + supporting docs), so this route
// opts into a 25 MB parser. Total decoded attachment bytes are additionally
// capped below at 10 MB.
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
app.post('/email/send', express.json({ limit: '25mb' }), async (req, res) => {
  if (!resendClient) {
    return res.status(500).json({ error: 'RESEND_API_KEY is not configured on the server.' });
  }
  const { to, cc, bcc, subject, html, text, attachments, replyTo } = req.body || {};
  if (!to || !subject || (!html && !text)) {
    return res.status(400).json({ error: 'to, subject, and html or text are required' });
  }
  try {
    // `from` is always derived from env — never trust client-supplied `from`.
    const from = process.env.EMAIL_FROM || 'Black Ivy Media <onboarding@resend.dev>';

    let normalizedAttachments;
    if (Array.isArray(attachments)) {
      const filtered = attachments.filter((a) => a && a.filename && a.content);
      let totalBytes = 0;
      const decoded = [];
      for (const a of filtered) {
        const buf = Buffer.from(a.content, 'base64');
        totalBytes += buf.length;
        if (totalBytes > MAX_ATTACHMENT_BYTES) {
          return res.status(413).json({ error: 'Total attachments exceed 10 MB' });
        }
        decoded.push({
          filename: a.filename,
          content: buf,
          contentType: a.contentType || 'application/pdf',
        });
      }
      normalizedAttachments = decoded.length ? decoded : undefined;
    }

    // Audit log: record who sent what to whom. No body included — just the
    // metadata needed to track down abuse later.
    try {
      console.log('[email]', req.user?.email || 'unknown', '→', to, subject);
    } catch { /* best-effort logging */ }
    writeAudit({
      req,
      action: 'email.send',
      details: `to=${Array.isArray(to) ? to.join(',') : to} subject="${String(subject).slice(0, 120)}"`,
    });

    const result = await resendClient.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
      bcc: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined,
      replyTo: replyTo || undefined,
      subject,
      html,
      text,
      attachments: normalizedAttachments,
    });

    if (result && result.error) {
      return res.status(502).json({ error: result.error.message || 'Resend rejected the email.' });
    }
    res.json({ ok: true, id: result?.data?.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Relational mirroring ----
const RELATIONAL_TABLES = {
  billboards: 'billboards',
  clients: 'clients',
  contracts: 'contracts',
  invoices: 'invoices',
  expenses: 'expenses',
  users: 'users',
  maintenance: 'maintenance_logs',
  // CRM module
  crmCompanies: 'crm_companies',
  crmContacts: 'crm_contacts',
  crmOpportunities: 'crm_opportunities',
  crmTouchpoints: 'crm_touchpoints',
  crmTasks: 'crm_tasks',
  crmEmailThreads: 'crm_email_threads',
  crmCallLogs: 'crm_call_logs',
};

// Map camelCase app item → snake_case row for the relational mirror
const ROW_MAPPERS = {
  billboards: (b) => ({
    id: b.id, name: b.name, location: b.location, town: b.town, type: b.type,
    width: b.width, height: b.height, coordinates: b.coordinates, image_url: b.imageUrl,
    visibility: b.visibility, side_a_rate: b.sideARate, side_b_rate: b.sideBRate,
    side_a_status: b.sideAStatus, side_b_status: b.sideBStatus,
    side_a_client_id: b.sideAClientId || null, side_b_client_id: b.sideBClientId || null,
    rate_per_slot: b.ratePerSlot, total_slots: b.totalSlots, rented_slots: b.rentedSlots,
  }),
  clients: (c) => ({
    id: c.id, company_name: c.companyName, contact_person: c.contactPerson,
    email: c.email, phone: c.phone, billing_day: c.billingDay, status: c.status,
  }),
  contracts: (c) => ({
    id: c.id, client_id: c.clientId, billboard_id: c.billboardId,
    start_date: c.startDate || null, end_date: c.endDate || null,
    monthly_rate: c.monthlyRate, installation_cost: c.installationCost,
    printing_cost: c.printingCost, total_contract_value: c.totalContractValue,
    status: c.status, details: c.details, side: c.side,
    slot_number: c.slotNumber, has_vat: c.hasVat,
  }),
  invoices: (i) => ({
    id: i.id, client_id: i.clientId,
    contract_id: i.contractId || (Array.isArray(i.contractIds) && i.contractIds[0]) || null,
    date: i.date || null, items: i.items, subtotal: i.subtotal,
    vat_amount: i.vatAmount, total: i.total, status: i.status, type: i.type,
    payment_method: i.paymentMethod, payment_reference: i.paymentReference,
  }),
  expenses: (e) => ({
    id: e.id, category: e.category, description: e.description,
    amount: e.amount, date: e.date || null, reference: e.reference,
  }),
  // Note: password is intentionally NOT mapped — it's stripped upstream in
  // the /sync handler. Password writes go through /auth/* only.
  users: (u) => ({
    id: u.id, first_name: u.firstName, last_name: u.lastName,
    email: u.email, role: u.role,
    status: u.status || 'Active',
    must_change_password: !!u.mustChangePassword,
  }),
  maintenance: (m) => ({
    id: m.id, billboard_id: m.billboardId, date: m.date || null, type: m.type,
    technician: m.technician, notes: m.notes, status: m.status,
    next_due_date: m.nextDueDate || null, cost: m.cost,
  }),

  // ---- CRM mirrors ----
  crmCompanies: (c) => ({
    id: c.id, name: c.name, industry: c.industry, website: c.website,
    street_address: c.streetAddress, city: c.city, country: c.country,
  }),
  crmContacts: (c) => ({
    id: c.id, company_id: c.companyId, full_name: c.fullName,
    job_title: c.jobTitle, phone: c.phone, email: c.email,
    linkedin_url: c.linkedinUrl, is_primary: !!c.isPrimary,
  }),
  crmOpportunities: (o) => ({
    id: o.id, company_id: o.companyId,
    primary_contact_id: o.primaryContactId,
    secondary_contact_id: o.secondaryContactId || null,
    location_interest: o.locationInterest,
    billboard_type: o.billboardType,
    campaign_duration: o.campaignDuration,
    estimated_value: o.estimatedValue,
    actual_value: o.actualValue,
    status: o.status || 'new',
    stage: o.stage || 'new_lead',
    lead_source: o.leadSource,
    last_contact_date: o.lastContactDate,
    next_follow_up_date: o.nextFollowUpDate,
    call_outcome_notes: o.callOutcomeNotes,
    number_of_attempts: o.numberOfAttempts || 0,
    assigned_to: o.assignedTo,
    created_by: o.createdBy,
    closed_at: o.closedAt || null,
    closed_reason: o.closedReason,
    days_in_current_stage: o.daysInCurrentStage || 0,
    stage_history: Array.isArray(o.stageHistory) ? o.stageHistory : [],
  }),
  crmTouchpoints: (t) => ({
    id: t.id, opportunity_id: t.opportunityId, type: t.type,
    direction: t.direction, subject: t.subject, content: t.content,
    client_response: t.clientResponse, outcome: t.outcome,
    sentiment: t.sentiment, duration_seconds: t.durationSeconds,
    created_by: t.createdBy,
  }),
  crmTasks: (t) => ({
    id: t.id, opportunity_id: t.opportunityId, type: t.type,
    title: t.title, description: t.description, due_date: t.dueDate,
    status: t.status || 'pending', priority: t.priority || 'medium',
    assigned_to: t.assignedTo, completed_by: t.completedBy,
    completed_at: t.completedAt || null, completion_notes: t.completionNotes,
    created_by: t.createdBy,
  }),
  crmEmailThreads: (e) => ({
    id: e.id, opportunity_id: e.opportunityId, contact_id: e.contactId,
    subject: e.subject,
    messages: Array.isArray(e.messages) ? e.messages : [],
    status: e.status || 'active',
    last_activity_at: e.lastActivityAt || null,
    sent_count: e.sentCount || 0, open_count: e.openCount || 0,
    click_count: e.clickCount || 0, reply_count: e.replyCount || 0,
  }),
  crmCallLogs: (c) => ({
    id: c.id, opportunity_id: c.opportunityId, contact_id: c.contactId,
    phone_number: c.phoneNumber, direction: c.direction,
    started_at: c.startedAt || null, ended_at: c.endedAt || null,
    duration_seconds: c.durationSeconds || 0, outcome: c.outcome,
    notes: c.notes, recording_url: c.recordingUrl, created_by: c.createdBy,
  }),
};

async function mirrorRelational(collection, data) {
  const table = RELATIONAL_TABLES[collection];
  const mapper = ROW_MAPPERS[collection];
  if (!table || !mapper || !Array.isArray(data) || data.length === 0) return;

  const rows = data.map(mapper);
  const cols = Object.keys(rows[0]);
  const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = EXCLUDED.${c}`).join(', ');

  // Build a single parameterised insert — cheaper and atomic
  const placeholders = [];
  const params = [];
  rows.forEach((row, rIdx) => {
    const rowPh = cols.map((c, cIdx) => `$${rIdx * cols.length + cIdx + 1}`);
    placeholders.push(`(${rowPh.join(', ')})`);
    for (const c of cols) {
      const v = row[c];
      // JSONB columns need JSON string; driver handles objects via json casting
      params.push(v === undefined ? null : v);
    }
  });

  const jsonbCast = new Set(['coordinates', 'items']);
  const colList = cols.map((c) => (jsonbCast.has(c) ? `${c}` : c)).join(', ');
  const valuesSql = placeholders.join(', ');

  const query =
    `INSERT INTO ${table} (${colList}) VALUES ${valuesSql} ` +
    `ON CONFLICT (id) DO UPDATE SET ${updates}`;

  // @neondatabase/serverless: sql.query handles positional params
  await sql.query(query, params);
}

// ---- Static SPA (used when run as a container on Railway) ----
const distDir = path.resolve(__dirname, '..', 'dist');
app.use(express.static(distDir));
app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));

module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 8080;
  if (process.env.NODE_ENV === 'production' && !process.env.APP_URL) {
    console.warn('[boot] ⚠️  APP_URL is not set in production. Password-reset emails will be suppressed to prevent host-header injection. Set APP_URL to the canonical public origin (e.g. https://crm.example.com).');
  }
  // Best-effort migrations + admin seeding. Never crash the server on
  // failure — the API should still come up for observability.
  (async () => {
    try { await runMigrations(); } catch (e) { console.warn('[boot] migrations failed (continuing):', e.message); }
    try { await ensureInitialAdmin(); } catch (e) { console.warn('[boot] initial admin seed failed (continuing):', e.message); }
  })();
  app.listen(port, '0.0.0.0', () => {
    console.log(`[bim-crm] listening on :${port}`);
  });
}
