#!/usr/bin/env node
/*
 * One-shot: seed an Admin user and email them login instructions.
 * Combines server/create-user.js (DB upsert) with the Resend invite path
 * so a freshly provisioned admin gets credentials in their inbox without
 * a separate email step.
 *
 * Differences from create-user.js:
 *   - generates a strong temporary password (caller never picks it)
 *   - forces must_change_password = true so the temp pw is single-use
 *   - sends the credentials via Resend immediately after the upsert
 *
 * Run via Railway CLI so DATABASE_URL / RESEND_API_KEY / EMAIL_FROM are
 * pulled from the production environment:
 *
 *   railway run node server/jobs/seed-admin-and-invite.js \
 *     <email> [role] [firstName] [lastName]
 *
 * role defaults to Admin; valid roles match server/create-user.js
 * (Admin | Manager | Staff). On success the script prints the temp
 * password to stdout as a fallback in case the email gets filtered.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sql } = require('../db');
const { Resend } = require('resend');

const VALID_ROLES = ['Admin', 'Manager', 'Staff'];
const BCRYPT_COST = 10;
const APP_URL = process.env.APP_URL || 'https://blackivymediacrm.live';
const FROM = process.env.EMAIL_FROM || 'Black Ivy Media <noreply@blackivymediacrm.co.zw>';

// 16 chars, base64-url alphabet, prefixed with "A1" so the
// uppercase + digit policy in server/create-user.js is always satisfied.
function generateTempPassword() {
  const random = crypto.randomBytes(12).toString('base64')
    .replace(/\+/g, 'a').replace(/\//g, 'b').replace(/=/g, '');
  return `A1${random}`.slice(0, 16);
}

function buildInviteHtml({ firstName, email, tempPassword, role }) {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1e293b;line-height:1.55;font-size:14px;max-width:560px;">
      <p>Hi ${firstName || 'there'},</p>
      <p>You've been provisioned an <strong>${role}</strong> account on the Black Ivy Media CRM. Sign in with the temporary credentials below — you'll be prompted to set your own password on first login.</p>
      <table style="margin:16px 0;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:4px 16px 4px 0;color:#64748b;">Sign in at</td><td style="padding:4px 0;"><a href="${APP_URL}" style="color:#2563eb;">${APP_URL}</a></td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b;">Email</td><td style="padding:4px 0;"><strong>${email}</strong></td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#64748b;">Temporary password</td><td style="padding:4px 0;"><code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f1f5f9;padding:4px 10px;border-radius:6px;font-size:13px;color:#0f172a;">${tempPassword}</code></td></tr>
      </table>
      <p style="color:#64748b;font-size:12px;">If you weren't expecting this account, please ignore this email and let us know.</p>
      <p style="margin-top:24px;">Welcome aboard,<br/><strong>Black Ivy Media</strong></p>
    </div>`.trim();
}

async function main() {
  const [, , emailArg, roleArg, firstNameArg, lastNameArg] = process.argv;
  if (!emailArg) {
    console.error('Usage: node server/jobs/seed-admin-and-invite.js <email> [role] [firstName] [lastName]');
    process.exit(1);
  }
  const email = emailArg.trim().toLowerCase();
  const role = roleArg || 'Admin';
  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role "${role}". Expected one of: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }
  const firstName = firstNameArg || (email.split('@')[0] || 'User').replace(/[^a-zA-Z]/g, '').slice(0, 30) || 'User';
  const lastName = lastNameArg || '';

  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is required');

  const tempPassword = generateTempPassword();
  const hash = await bcrypt.hash(tempPassword, BCRYPT_COST);

  const existing = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1`;
  let userId;
  if (existing.length > 0) {
    userId = existing[0].id;
    await sql.query(
      `UPDATE users
          SET first_name = $1, last_name = $2, role = $3,
              password = $4, status = 'Active', must_change_password = true,
              password_reset_token = NULL, password_reset_expires = NULL,
              updated_at = NOW()
        WHERE id = $5`,
      [firstName, lastName, role, hash, userId],
    );
    console.log(`Updated existing user ${email} (id=${userId}) — role=${role}, status=Active, must_change_password=true`);
  } else {
    userId = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await sql.query(
      `INSERT INTO users (id, first_name, last_name, email, role, password,
          status, must_change_password, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'Active', true, NOW(), NOW())`,
      [userId, firstName, lastName, email, role, hash],
    );
    console.log(`Created user ${email} (id=${userId}) — role=${role}, status=Active, must_change_password=true`);
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `Your ${role} account on Black Ivy Media CRM`,
    html: buildInviteHtml({ firstName, email, tempPassword, role }),
    text: [
      `Hi ${firstName || 'there'},`,
      '',
      `You've been provisioned a ${role} account on the Black Ivy Media CRM.`,
      `Sign in at ${APP_URL} with these temporary credentials — you'll be`,
      `prompted to set your own password on first login.`,
      '',
      `Email:              ${email}`,
      `Temporary password: ${tempPassword}`,
      '',
      `Welcome aboard,`,
      `Black Ivy Media`,
    ].join('\n'),
  });
  if (result.error) throw new Error(`Resend rejected: ${result.error.message || JSON.stringify(result.error)}`);

  console.log(`Sent invite email to ${email} (resend id ${result.data?.id})`);
  console.log(`Temporary password (also in the email): ${tempPassword}`);

  try {
    await sql.query(
      `INSERT INTO audit_logs (id, actor_email, action, details, source)
       VALUES ($1, 'cli:seed-admin', 'user.seeded_via_cli', $2, 'cli')`,
      [`log_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
       `email=${email} role=${role} userId=${userId}`],
    );
  } catch (e) { console.warn('[audit] skipped:', e.message); }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed-admin-and-invite] failed:', err.message);
    process.exit(1);
  });
