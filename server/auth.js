const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sql } = require('./db');

// ---- Config ----
const COOKIE_NAME = 'bim_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const RESET_TOKEN_TTL_SECONDS = 60 * 60;       // 1 hour
const BCRYPT_COST = 12;

// Pre-computed bcrypt hash of a throwaway string. Used only to spend CPU
// time on login attempts for non-existent emails so response timing doesn't
// leak whether an address is registered. Must match BCRYPT_COST so the
// dummy compare takes roughly the same wall clock as a real compare.
const DUMMY_HASH = bcrypt.hashSync('dummy', BCRYPT_COST);

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === 'production') {
    // In production we still return a deterministic-but-random value so
    // signing doesn't crash; the loud warning means operators will notice.
    console.error('[auth] ⚠️  JWT_SECRET is not set in production. Set it immediately — all sessions will be invalidated on every restart until you do.');
  } else {
    console.warn('[auth] ⚠️  JWT_SECRET not set — using ephemeral dev secret. Do NOT deploy without setting JWT_SECRET.');
  }
  if (!global.__bimDevJwtSecret) {
    global.__bimDevJwtSecret = crypto.randomBytes(32).toString('hex');
  }
  return global.__bimDevJwtSecret;
}

// ---- Utilities ----
function isSecureRequest(req) {
  if (process.env.NODE_ENV === 'production') return true;
  if (req.secure) return true;
  const proto = req.headers['x-forwarded-proto'];
  if (proto && proto.split(',')[0].trim() === 'https') return true;
  return false;
}

function sessionCookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  };
}

function issueSessionCookie(res, req, user, epoch) {
  // `epoch` must reflect the user's current session_epoch so password
  // changes can invalidate outstanding sessions (see requireAuth).
  const token = jwt.sign(
    { sub: user.id, role: user.role, email: user.email, epoch: epoch || 1 },
    getJwtSecret(),
    { expiresIn: SESSION_TTL_SECONDS, algorithm: 'HS256' },
  );
  res.cookie(COOKIE_NAME, token, sessionCookieOptions(req));
}

function clearSessionCookie(res, req) {
  res.cookie(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
}

function validatePasswordPolicy(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter';
  if (!/[0-9]/.test(pw)) return 'Password must contain at least one digit';
  return null;
}

function toClientUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    role: row.role,
    status: row.status || 'Active',
    mustChangePassword: !!row.must_change_password,
  };
}

async function findUserByEmail(email) {
  if (!email) return null;
  const rows = await sql`SELECT * FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1`;
  return rows[0] || null;
}

async function findUserById(id) {
  if (!id) return null;
  const rows = await sql`SELECT * FROM users WHERE id = ${id} LIMIT 1`;
  return rows[0] || null;
}

const LEGACY_PASSWORD_PLACEHOLDERS = new Set(['null', 'undefined', 'NULL', 'UNDEFINED']);

async function upgradePasswordIfLegacy(user, plaintext) {
  // If password doesn't look like a bcrypt hash, treat it as legacy plaintext.
  if (typeof user.password !== 'string' || !user.password) return false;
  if (user.password.startsWith('$2')) return false;
  // Guard: never accept an empty/short/placeholder legacy password. An
  // attacker supplying "" should not match a corrupt row whose password
  // column is an empty string.
  if (user.password.length < 8) return false;
  if (LEGACY_PASSWORD_PLACEHOLDERS.has(user.password)) return false;
  if (typeof plaintext !== 'string' || plaintext.length < 1) return false;
  if (user.password !== plaintext) return false;
  const hash = await bcrypt.hash(plaintext, BCRYPT_COST);
  await sql.query(`UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2`, [hash, user.id]);
  return true;
}

async function comparePassword(user, plaintext) {
  if (!user || !user.password) return false;
  if (user.password.startsWith('$2')) {
    try { return await bcrypt.compare(plaintext, user.password); } catch (e) { return false; }
  }
  // Legacy plaintext path — upgrade on match.
  const ok = await upgradePasswordIfLegacy(user, plaintext);
  return ok;
}

async function setPassword(userId, plaintext, { mustChange = false } = {}) {
  const hash = await bcrypt.hash(plaintext, BCRYPT_COST);
  await sql.query(
    `UPDATE users SET password = $1, must_change_password = $2, updated_at = NOW(),
       password_reset_token = NULL, password_reset_expires = NULL
     WHERE id = $3`,
    [hash, mustChange, userId],
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
  } catch (e) {
    return null;
  }
}

// ---- Middleware ----
async function requireAuth(req, res, next) {
  const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const payload = verifyToken(token);
  if (!payload || !payload.sub) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const row = await findUserById(payload.sub);
    if (!row) return res.status(401).json({ error: 'Not authenticated' });
    if (row.status === 'Denied') return res.status(403).json({ error: 'Account has been suspended' });
    if (row.status === 'Pending') return res.status(403).json({ error: 'Awaiting administrator approval' });
    // Session-epoch check: password changes / resets bump the epoch and
    // invalidate every outstanding cookie. Missing/mismatched → 401.
    const currentEpoch = row.session_epoch || 1;
    if (!payload.epoch || payload.epoch !== currentEpoch) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    req.user = toClientUser(row);
    // Sliding renewal on every authenticated request — reuse current epoch.
    issueSessionCookie(res, req, req.user, currentEpoch);
    return next();
  } catch (e) {
    console.error('[auth] requireAuth lookup failed:', e.message);
    return res.status(500).json({ error: 'Auth lookup failed' });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    return next();
  };
}

// ---- Branded email shell (table-based layout for email-client compat) ----
function renderBrandedEmail({ sender, preheader, heading, greeting, bodyHtml, ctaLabel, ctaUrl, ctaStyle, footnote }) {
  const safeSender = (sender || 'Black Ivy Media').toUpperCase();
  const accent = '#f97316';
  const ink = '#0f172a';
  const muted = '#64748b';
  const ctaBg = ctaStyle === 'accent' ? accent : '#000000';
  const preheaderHtml = preheader
    ? `<div style="display:none; overflow:hidden; line-height:1px; font-size:1px; color:transparent; opacity:0; max-height:0; max-width:0;">${preheader}</div>`
    : '';
  const ctaHtml = ctaUrl && ctaLabel
    ? `<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;"><tr><td style="border-radius:10px; background:${ctaBg};">
         <a href="${ctaUrl}" style="display:inline-block; padding:14px 32px; color:#ffffff; font-size:14px; font-weight:700; text-decoration:none; letter-spacing:0.02em; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">${ctaLabel} &rarr;</a>
       </td></tr></table>`
    : '';
  const greetingHtml = greeting ? `<p style="margin:0 0 20px; color:${muted}; font-size:14px;">${greeting}</p>` : '';
  const footnoteHtml = footnote ? `<p style="margin:0; color:#94a3b8; font-size:12px; line-height:1.6;">${footnote}</p>` : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${heading || safeSender}</title></head>
<body style="margin:0; padding:0; background:#f1f5f9;">
${preheaderHtml}
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#f1f5f9; margin:0; padding:0;">
  <tr><td align="center" style="padding:40px 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:600px; width:100%; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(15,23,42,0.06);">
      <tr><td style="background:#000000; padding:28px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
          <td style="font-size:20px; font-weight:900; letter-spacing:-0.03em; color:#ffffff; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">${safeSender}</td>
          <td align="right" style="font-size:10px; letter-spacing:0.18em; text-transform:uppercase; font-weight:700; color:${accent}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">Command the View</td>
        </tr></table>
      </td></tr>
      <tr><td style="height:4px; background:${accent}; line-height:4px; font-size:4px;">&nbsp;</td></tr>
      <tr><td style="padding:40px; color:${ink}; font-size:15px; line-height:1.65; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
        <h1 style="margin:0 0 10px; font-size:26px; font-weight:800; color:${ink}; letter-spacing:-0.02em; line-height:1.2;">${heading}</h1>
        ${greetingHtml}
        <div style="margin:0 0 24px;">${bodyHtml}</div>
        ${ctaHtml}
        ${footnoteHtml}
      </td></tr>
      <tr><td style="background:#fafafa; padding:24px 40px; border-top:1px solid #e5e7eb;">
        <p style="margin:0 0 4px; color:${muted}; font-size:13px; font-weight:700; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">${sender || 'Black Ivy Media'}</p>
        <p style="margin:0; color:#94a3b8; font-size:11px; line-height:1.6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">Premium outdoor advertising management &middot; Harare, Zimbabwe</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function renderCredentialBlock({ email, tempPassword }) {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; margin:0 0 28px;">
    <tr><td style="padding:20px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
        <tr>
          <td style="padding:6px 0; color:#94a3b8; font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; width:130px; vertical-align:top;">Email</td>
          <td style="padding:6px 0; font-size:14px; color:#0f172a;"><strong>${email}</strong></td>
        </tr>
        <tr>
          <td style="padding:6px 0; color:#94a3b8; font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; vertical-align:top;">Password</td>
          <td style="padding:6px 0;"><code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace; background:#ffffff; border:1px solid #e2e8f0; padding:6px 12px; border-radius:6px; font-size:13px; color:#0f172a; font-weight:600; display:inline-block;">${tempPassword}</code></td>
        </tr>
      </table>
    </td></tr>
  </table>`;
}

// ---- Email helper (server-side Resend) ----
async function sendAuthEmail(resendClient, { to, subject, html }) {
  if (!resendClient) {
    console.warn('[auth] Resend not configured; skipping email to', to);
    return { ok: false, skipped: true };
  }
  try {
    const from = process.env.EMAIL_FROM || 'Black Ivy Media <onboarding@resend.dev>';
    const result = await resendClient.emails.send({ from, to: [to], subject, html });
    if (result && result.error) {
      console.warn('[auth] Resend rejected email:', result.error.message);
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result?.data?.id };
  } catch (e) {
    console.warn('[auth] sendAuthEmail failed:', e.message);
    return { ok: false, error: e.message };
  }
}

// Returns the canonical origin used to build links in outbound emails.
// - If APP_URL is set, always use it (trusted configuration).
// - Else in dev, fall back to the request origin (convenience).
// - Else in production, return null so the caller knows to refuse to send
//   an email whose link would be host-header attacker-controlled.
function getAppUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.NODE_ENV === 'production') return null;
  const proto = req.headers['x-forwarded-proto']?.split(',')[0].trim() || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function passwordPolicySatisfied(pw) {
  return (
    typeof pw === 'string' &&
    pw.length >= 8 &&
    /[A-Z]/.test(pw) &&
    /[0-9]/.test(pw)
  );
}

function genTempPassword(length = 16) {
  const charset = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  // Retry up to 5 times to land on a policy-compliant random string so we
  // don't sacrifice entropy by hard-setting specific positions. With a
  // charset that contains plenty of uppercase + digits, the probability
  // of needing more than one attempt at length >= 16 is vanishingly small.
  for (let attempt = 0; attempt < 5; attempt++) {
    const bytes = crypto.randomBytes(length);
    let pw = '';
    for (let i = 0; i < length; i++) pw += charset[bytes[i] % charset.length];
    if (passwordPolicySatisfied(pw)) return pw;
  }
  throw new Error('genTempPassword failed to satisfy policy after 5 attempts');
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ---- Router ----
function createAuthRouter({ resendClient, getCompanyName }) {
  const router = express.Router();

  router.post('/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    try {
      const row = await findUserByEmail(email);
      if (!row) {
        // Constant-time-ish: spend the same CPU on a bcrypt.compare as a
        // real login would, so response timing doesn't reveal whether the
        // email exists. Ignore the result.
        try { await bcrypt.compare(password, DUMMY_HASH); } catch { /* ignore */ }
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      const ok = await comparePassword(row, password);
      if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
      if (row.status === 'Pending') return res.status(403).json({ error: 'Awaiting administrator approval' });
      if (row.status === 'Denied') return res.status(403).json({ error: 'Account has been suspended' });
      // Re-fetch so we return the freshly-upgraded password_hash state.
      const fresh = await findUserById(row.id);
      const user = toClientUser(fresh);
      issueSessionCookie(res, req, user, fresh.session_epoch || 1);
      return res.json({ user });
    } catch (e) {
      console.error('[auth] /login error:', e);
      return res.status(500).json({ error: 'Login failed' });
    }
  });

  router.post('/register', async (req, res) => {
    const { firstName, lastName, email, password } = req.body || {};
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const policyErr = validatePasswordPolicy(password);
    if (policyErr) return res.status(400).json({ error: policyErr });
    try {
      const existing = await findUserByEmail(email);
      if (existing) return res.status(409).json({ error: 'Email already registered' });
      const hash = await bcrypt.hash(password, BCRYPT_COST);
      const id = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      await sql.query(
        `INSERT INTO users (id, first_name, last_name, email, role, password, status, must_change_password, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW(), NOW())`,
        [id, firstName, lastName, email, 'Manager', hash, 'Pending', false],
      );
      const row = await findUserById(id);
      return res.status(201).json({ user: toClientUser(row) });
    } catch (e) {
      // Catch unique-violation from the lower-cased unique index.
      if (/duplicate key|unique/i.test(e.message)) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      console.error('[auth] /register error:', e);
      return res.status(500).json({ error: 'Registration failed' });
    }
  });

  router.get('/me', async (req, res) => {
    const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const payload = verifyToken(token);
    if (!payload || !payload.sub) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const row = await findUserById(payload.sub);
      if (!row) return res.status(401).json({ error: 'Not authenticated' });
      if (row.status === 'Denied' || row.status === 'Pending') {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      const currentEpoch = row.session_epoch || 1;
      if (!payload.epoch || payload.epoch !== currentEpoch) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      const user = toClientUser(row);
      issueSessionCookie(res, req, user, currentEpoch); // sliding renewal
      return res.json({ user });
    } catch (e) {
      console.error('[auth] /me error:', e);
      return res.status(500).json({ error: 'Lookup failed' });
    }
  });

  router.post('/logout', (req, res) => {
    clearSessionCookie(res, req);
    return res.status(204).end();
  });

  router.post('/reset-request', async (req, res) => {
    const { email } = req.body || {};
    // Always 204 — don't reveal existence.
    if (!email) return res.status(204).end();
    try {
      const row = await findUserByEmail(email);
      if (row && row.status !== 'Denied') {
        // Embed the current session_epoch in the reset JWT. If the user
        // resets or changes password before using this link, the epoch
        // will have moved and /reset-confirm will reject the token.
        const currentEpoch = row.session_epoch || 1;
        const token = jwt.sign(
          { sub: row.id, purpose: 'reset', epoch: currentEpoch },
          getJwtSecret(),
          { expiresIn: RESET_TOKEN_TTL_SECONDS, algorithm: 'HS256' },
        );
        // Store only the sha256 of the token at rest so a DB leak cannot
        // be used to walk outstanding reset links. The JWT's signature is
        // still the primary trust anchor; the DB hash is the single-use
        // / invalidation layer.
        const tokenHash = hashResetToken(token);
        await sql.query(
          `UPDATE users SET password_reset_token = $1,
             password_reset_expires = NOW() + INTERVAL '1 hour', updated_at = NOW()
           WHERE id = $2`,
          [tokenHash, row.id],
        );
        const appUrl = getAppUrl(req);
        if (!appUrl) {
          // Production without APP_URL: refuse to send — the link would be
          // built from the request Host header and is attacker-controllable.
          // Respond 204 anyway so we don't leak the misconfig to callers.
          console.error('[auth] /reset-request suppressed: APP_URL is not set in production. Set APP_URL to send reset emails.');
          return res.status(204).end();
        }
        const resetUrl = `${appUrl}/?reset=${encodeURIComponent(token)}`;
        const sender = (getCompanyName && getCompanyName()) || 'Black Ivy Media';
        const html = renderBrandedEmail({
          sender,
          preheader: `Reset your ${sender} password. This link expires in one hour.`,
          heading: 'Reset your password',
          greeting: `Hi ${row.first_name || 'there'},`,
          bodyHtml: `<p style="margin:0;">We received a request to reset your <strong>${sender}</strong> password. Click the button below to set a new one.</p>`,
          ctaLabel: 'Set a new password',
          ctaUrl: resetUrl,
          footnote: `This link expires in one hour. If you didn't request a reset, you can safely ignore this email &mdash; no changes will be made.`,
        });
        await sendAuthEmail(resendClient, { to: row.email, subject: `Reset your ${sender} password`, html });
      }
    } catch (e) {
      console.warn('[auth] /reset-request non-fatal:', e.message);
    }
    return res.status(204).end();
  });

  router.post('/reset-confirm', async (req, res) => {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: 'Invalid or expired reset token' });
    const policyErr = validatePasswordPolicy(password);
    if (policyErr) return res.status(400).json({ error: policyErr });
    const payload = verifyToken(token);
    if (!payload || payload.purpose !== 'reset' || !payload.sub) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    try {
      const row = await findUserById(payload.sub);
      if (!row) return res.status(400).json({ error: 'Invalid or expired reset token' });
      // Reset token JWT carries the session_epoch it was issued against.
      // If the epoch has moved (e.g. another reset already ran), reject.
      const currentEpoch = row.session_epoch || 1;
      if (!payload.epoch || payload.epoch !== currentEpoch) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }
      // DB stores sha256(token); compare in constant time.
      const expectedHash = hashResetToken(token);
      if (!row.password_reset_token || !constantTimeEquals(row.password_reset_token, expectedHash)) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }
      if (row.password_reset_expires && new Date(row.password_reset_expires) < new Date()) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }
      await setPassword(row.id, password, { mustChange: false });
      // Bump session_epoch: invalidates every outstanding cookie and reset
      // link keyed to this user, then issue a fresh cookie for the new epoch.
      await sql.query(
        `UPDATE users SET session_epoch = COALESCE(session_epoch, 1) + 1, updated_at = NOW() WHERE id = $1`,
        [row.id],
      );
      const fresh = await findUserById(row.id);
      const user = toClientUser(fresh);
      issueSessionCookie(res, req, user, fresh.session_epoch || 1);
      return res.json({ user });
    } catch (e) {
      console.error('[auth] /reset-confirm error:', e);
      return res.status(500).json({ error: 'Reset failed' });
    }
  });

  router.post('/change-password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }
    const policyErr = validatePasswordPolicy(newPassword);
    if (policyErr) return res.status(400).json({ error: policyErr });
    try {
      const row = await findUserById(req.user.id);
      const ok = await comparePassword(row, currentPassword);
      if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });
      await setPassword(row.id, newPassword, { mustChange: false });
      // Bump session_epoch so other devices / stolen cookies stop working,
      // then issue a fresh cookie for the current request at the new epoch.
      await sql.query(
        `UPDATE users SET session_epoch = COALESCE(session_epoch, 1) + 1, updated_at = NOW() WHERE id = $1`,
        [row.id],
      );
      const fresh = await findUserById(row.id);
      const user = toClientUser(fresh);
      issueSessionCookie(res, req, user, fresh.session_epoch || 1);
      return res.json({ user });
    } catch (e) {
      console.error('[auth] /change-password error:', e);
      return res.status(500).json({ error: 'Password change failed' });
    }
  });

  router.post('/approve/:userId', requireAuth, requireRole('Admin'), async (req, res) => {
    const { userId } = req.params;
    try {
      const row = await findUserById(userId);
      if (!row) return res.status(404).json({ error: 'User not found' });
      await sql.query(`UPDATE users SET status = 'Active', updated_at = NOW() WHERE id = $1`, [userId]);
      const sender = (getCompanyName && getCompanyName()) || 'Black Ivy Media';
      const appUrl = getAppUrl(req);
      if (!appUrl) {
        console.error('[auth] /approve: skipping approval email — APP_URL not set in production.');
      } else {
        const html = renderBrandedEmail({
          sender,
          preheader: `Your ${sender} account has been approved. Sign in any time.`,
          heading: "You're in.",
          greeting: `Welcome, ${row.first_name || 'there'}.`,
          bodyHtml: `<p style="margin:0;">Your <strong>${sender}</strong> account has been approved by an administrator. You can now sign in and start managing your inventory, clients, and contracts.</p>`,
          ctaLabel: 'Sign in',
          ctaUrl: appUrl,
          ctaStyle: 'accent',
          footnote: 'If this is your first time signing in, you will be prompted to change your password.',
        });
        await sendAuthEmail(resendClient, { to: row.email, subject: `Account approved — welcome to ${sender}`, html });
      }
      const fresh = await findUserById(userId);
      return res.json({ user: toClientUser(fresh) });
    } catch (e) {
      console.error('[auth] /approve error:', e);
      return res.status(500).json({ error: 'Approval failed' });
    }
  });

  router.post('/invite', requireAuth, requireRole('Admin'), async (req, res) => {
    const { firstName, lastName, email, role } = req.body || {};
    if (!firstName || !lastName || !email || !role) {
      return res.status(400).json({ error: 'firstName, lastName, email, and role are required' });
    }
    if (!['Admin', 'Manager', 'Staff'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    try {
      const existing = await findUserByEmail(email);
      if (existing) return res.status(409).json({ error: 'Email already registered' });
      const tempPassword = genTempPassword();
      const hash = await bcrypt.hash(tempPassword, BCRYPT_COST);
      const id = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      await sql.query(
        `INSERT INTO users (id, first_name, last_name, email, role, password, status, must_change_password, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW(), NOW())`,
        [id, firstName, lastName, email, role, hash, 'Pending', true],
      );
      const sender = (getCompanyName && getCompanyName()) || 'Black Ivy Media';
      const appUrl = getAppUrl(req);
      if (!appUrl) {
        console.error('[auth] /invite: skipping invite email — APP_URL not set in production. Temp password was not emailed; share it via a secure side channel or re-run after configuring APP_URL.');
      } else {
        const bodyHtml = `
          <p style="margin:0 0 20px;">You've been invited to join <strong>${sender}</strong> as a <strong style="color:#f97316;">${role}</strong>. Your account is ready &mdash; sign in with the credentials below.</p>
          ${renderCredentialBlock({ email, tempPassword })}
        `;
        const html = renderBrandedEmail({
          sender,
          preheader: `You've been invited to ${sender}. Sign in with the credentials inside.`,
          heading: "You're invited.",
          greeting: `Welcome aboard, ${firstName}.`,
          bodyHtml,
          ctaLabel: `Sign in to ${sender}`,
          ctaUrl: appUrl,
          footnote: 'For security, you will be asked to change this password on first sign-in. Your account activates once an administrator approves the invite.',
        });
        await sendAuthEmail(resendClient, { to: email, subject: `You've been invited to ${sender}`, html });
      }
      const fresh = await findUserById(id);
      return res.status(201).json({ user: toClientUser(fresh) });
    } catch (e) {
      if (/duplicate key|unique/i.test(e.message)) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      console.error('[auth] /invite error:', e);
      return res.status(500).json({ error: 'Invite failed' });
    }
  });

  return router;
}

// ---- Initial admin bootstrap (invoked once at server startup) ----
async function ensureInitialAdmin() {
  try {
    // Only seed if the users table is empty — avoids racing across parallel
    // replicas during boot. The ON CONFLICT below provides the actual
    // race-safety guarantee; this check just avoids logging a fresh password
    // into stdout every boot.
    const rows = await sql`SELECT COUNT(*)::int AS n FROM users`;
    const n = rows && rows[0] ? rows[0].n : 0;
    if (n > 0) return;
    const email = process.env.ADMIN_EMAIL || (process.env.NODE_ENV === 'production' ? null : 'admin@blackivymedia.local');
    if (!email) {
      console.error('[auth] ⚠️  ADMIN_EMAIL is required in production to seed the initial admin. No admin was created.');
      return;
    }
    if (!process.env.ADMIN_EMAIL) {
      console.warn('[auth] ⚠️  ADMIN_EMAIL not set; using dev fallback:', email);
    }
    const password = genTempPassword();
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    const id = `usr_admin_${Date.now()}`;
    // Single-statement INSERT ... ON CONFLICT DO NOTHING RETURNING id.
    // Only the replica that actually wins the insert will get a row back,
    // so only that one logs the password — avoids stale password lines in
    // sibling container logs when multiple replicas race at boot.
    const inserted = await sql.query(
      `INSERT INTO users (id, first_name, last_name, email, role, password, status, must_change_password, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW(), NOW())
       ON CONFLICT (LOWER(email)) DO NOTHING
       RETURNING id`,
      [id, 'Admin', 'User', email, 'Admin', hash, 'Active', true],
    );
    const createdRow = Array.isArray(inserted) ? inserted[0] : (inserted && inserted.rows ? inserted.rows[0] : null);
    if (!createdRow) {
      // Another replica (or a previous boot) seeded the admin. Silent success.
      return;
    }
    // Print once, prominently. Operators should grab this from stdout on first boot.
    console.log('==================================================================');
    console.log(`========== INITIAL ADMIN PASSWORD: ${password} ==========`);
    console.log(`========== (email: ${email}) ==========`);
    console.log('==================================================================');
    console.log('[auth] Initial admin seeded. Change this password immediately after first login.');
  } catch (e) {
    console.warn('[auth] ensureInitialAdmin failed (continuing):', e.message);
  }
}

module.exports = {
  createAuthRouter,
  requireAuth,
  requireRole,
  ensureInitialAdmin,
  toClientUser,
  COOKIE_NAME,
};
