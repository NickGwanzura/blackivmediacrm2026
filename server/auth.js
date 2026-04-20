const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sql } = require('./db');

// ---- Config ----
const COOKIE_NAME = 'bim_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const RESET_TOKEN_TTL_SECONDS = 60 * 60;       // 1 hour
const BCRYPT_COST = 10;

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

function issueSessionCookie(res, req, user) {
  const token = jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
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

async function upgradePasswordIfLegacy(user, plaintext) {
  // If password doesn't look like a bcrypt hash, treat it as legacy plaintext.
  if (typeof user.password !== 'string' || !user.password) return false;
  if (user.password.startsWith('$2')) return false;
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
    req.user = toClientUser(row);
    // Sliding renewal on every authenticated request.
    issueSessionCookie(res, req, req.user);
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

function getAppUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL;
  const proto = req.headers['x-forwarded-proto']?.split(',')[0].trim() || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function genTempPassword(length = 16) {
  const charset = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let pw = '';
  for (let i = 0; i < length; i++) pw += charset[bytes[i] % charset.length];
  // Ensure policy compliance.
  pw = 'A' + pw.slice(1, -1) + '7';
  return pw;
}

// ---- Router ----
function createAuthRouter({ resendClient, getCompanyName }) {
  const router = express.Router();

  router.post('/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    try {
      const row = await findUserByEmail(email);
      if (!row) return res.status(401).json({ error: 'Invalid email or password' });
      const ok = await comparePassword(row, password);
      if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
      if (row.status === 'Pending') return res.status(403).json({ error: 'Awaiting administrator approval' });
      if (row.status === 'Denied') return res.status(403).json({ error: 'Account has been suspended' });
      // Re-fetch so we return the freshly-upgraded password_hash state.
      const fresh = await findUserById(row.id);
      const user = toClientUser(fresh);
      issueSessionCookie(res, req, user);
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
      const user = toClientUser(row);
      issueSessionCookie(res, req, user); // sliding renewal
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
        const token = jwt.sign(
          { sub: row.id, purpose: 'reset' },
          getJwtSecret(),
          { expiresIn: RESET_TOKEN_TTL_SECONDS, algorithm: 'HS256' },
        );
        await sql.query(
          `UPDATE users SET password_reset_token = $1,
             password_reset_expires = NOW() + INTERVAL '1 hour', updated_at = NOW()
           WHERE id = $2`,
          [token, row.id],
        );
        const appUrl = getAppUrl(req);
        const resetUrl = `${appUrl}/?reset=${encodeURIComponent(token)}`;
        const sender = (getCompanyName && getCompanyName()) || 'Black Ivy Media';
        const html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color:#1e293b; line-height:1.55; font-size:14px; max-width:560px;">
            <p>Hi ${row.first_name || ''},</p>
            <p>We received a request to reset your <strong>${sender}</strong> password.</p>
            <p><a href="${resetUrl}" style="display:inline-block; padding:10px 18px; background:#0f172a; color:#fff; border-radius:8px; text-decoration:none; font-weight:600;">Set a new password</a></p>
            <p style="color:#64748b; font-size:12px;">This link expires in one hour. If you didn't request a reset, you can safely ignore this email.</p>
            <p style="margin-top:24px;">Kind regards,<br/><strong>${sender}</strong></p>
          </div>`.trim();
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
      if (row.password_reset_token !== token) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }
      if (row.password_reset_expires && new Date(row.password_reset_expires) < new Date()) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }
      await setPassword(row.id, password, { mustChange: false });
      const fresh = await findUserById(row.id);
      const user = toClientUser(fresh);
      issueSessionCookie(res, req, user);
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
      const fresh = await findUserById(row.id);
      const user = toClientUser(fresh);
      issueSessionCookie(res, req, user);
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
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color:#1e293b; line-height:1.55; font-size:14px; max-width:560px;">
          <p>Hi ${row.first_name || ''},</p>
          <p>Your account at <strong>${sender}</strong> has been approved by an administrator. You can now sign in.</p>
          <p><a href="${appUrl}" style="display:inline-block; padding:10px 18px; background:#059669; color:#fff; border-radius:8px; text-decoration:none; font-weight:600;">Sign in</a></p>
          <p style="margin-top:24px;">Kind regards,<br/><strong>${sender}</strong></p>
        </div>`.trim();
      await sendAuthEmail(resendClient, { to: row.email, subject: `Account approved — welcome to ${sender}`, html });
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
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color:#1e293b; line-height:1.55; font-size:14px; max-width:560px;">
          <p>You've been invited to join <strong>${sender}</strong> as a <strong>${role}</strong>.</p>
          <p>Please sign in with the temporary credentials below. Your account will activate once an administrator approves it.</p>
          <table style="margin:16px 0; border-collapse:collapse; font-size:13px;">
            <tr><td style="padding:4px 16px 4px 0; color:#64748b;">Email</td><td style="padding:4px 0;"><strong>${email}</strong></td></tr>
            <tr><td style="padding:4px 16px 4px 0; color:#64748b;">Temporary password</td><td style="padding:4px 0;"><code style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background:#f1f5f9; padding:4px 10px; border-radius:6px;">${tempPassword}</code></td></tr>
            <tr><td style="padding:4px 16px 4px 0; color:#64748b;">Sign in at</td><td style="padding:4px 0;"><a href="${appUrl}" style="color:#2563eb;">${appUrl}</a></td></tr>
          </table>
          <p style="color:#64748b; font-size:12px;">You will be required to change this password after first sign in.</p>
          <p style="margin-top:24px;">Kind regards,<br/><strong>${sender}</strong></p>
        </div>`.trim();
      await sendAuthEmail(resendClient, { to: email, subject: `You've been invited to ${sender}`, html });
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
    await sql.query(
      `INSERT INTO users (id, first_name, last_name, email, role, password, status, must_change_password, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW(), NOW())`,
      [id, 'Admin', 'User', email, 'Admin', hash, 'Active', true],
    );
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
  COOKIE_NAME,
};
