import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Resend } from 'resend';

neonConfig.webSocketConstructor = ws;

const DATABASE_URL = process.env.DATABASE_URL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Black Ivy Media <onboarding@resend.dev>';
const APP_URL = process.env.APP_URL;

const email = process.argv[2];
const firstName = process.argv[3];

if (!email || !firstName) {
  console.error('Usage: node send-password-reset.mjs <email> <firstName>');
  process.exit(1);
}

if (!DATABASE_URL || !RESEND_API_KEY) {
  console.error('DATABASE_URL and RESEND_API_KEY are required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const resend = new Resend(RESEND_API_KEY);
const BCRYPT_COST = 12;

function genTempPassword(length = 16) {
  const charset = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  for (let attempt = 0; attempt < 5; attempt++) {
    const bytes = crypto.randomBytes(length);
    let pw = '';
    for (let i = 0; i < length; i++) pw += charset[bytes[i] % charset.length];
    if (pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw)) return pw;
  }
  throw new Error('Failed to generate temp password');
}

function renderCredentialBlock(email, tempPassword) {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; margin:0 0 28px;">
    <tr><td style="padding:20px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
        <tr>
          <td style="padding:6px 0; color:#94a3b8; font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; width:130px; vertical-align:top;">Email</td>
          <td style="padding:6px 0; font-size:14px; color:#0f172a;"><strong>${email}</strong></td>
        </tr>
        <tr>
          <td style="padding:6px 0; color:#94a3b8; font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; vertical-align:top;">Temporary Password</td>
          <td style="padding:6px 0;"><code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace; background:#ffffff; border:1px solid #e2e8f0; padding:6px 12px; border-radius:6px; font-size:13px; color:#0f172a; font-weight:600; display:inline-block;">${tempPassword}</code></td>
        </tr>
      </table>
    </td></tr>
  </table>`;
}

function renderBrandedEmail({ sender, preheader, heading, greeting, bodyHtml, ctaLabel, ctaUrl, footnote }) {
  const safeSender = (sender || 'Black Ivy Media').toUpperCase();
  const accent = '#f97316';
  const ink = '#0f172a';
  const muted = '#64748b';
  const ctaHtml = ctaUrl && ctaLabel
    ? `<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;"><tr><td style="border-radius:10px; background:${accent};">
         <a href="${ctaUrl}" style="display:inline-block; padding:14px 32px; color:#ffffff; font-size:14px; font-weight:700; text-decoration:none; letter-spacing:0.02em; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">${ctaLabel} &rarr;</a>
       </td></tr></table>`
    : '';
  const greetingHtml = greeting ? `<p style="margin:0 0 20px; color:${muted}; font-size:14px;">${greeting}</p>` : '';
  const footnoteHtml = footnote ? `<p style="margin:0; color:#94a3b8; font-size:12px; line-height:1.6;">${footnote}</p>` : '';
  const preheaderHtml = preheader
    ? `<div style="display:none; overflow:hidden; line-height:1px; font-size:1px; color:transparent; opacity:0; max-height:0; max-width:0;">${preheader}</div>`
    : '';
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

async function main() {
  try {
    const existing = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
    if (existing.rows.length === 0) {
      console.error('User not found');
      await pool.end();
      process.exit(1);
    }

    const user = existing.rows[0];
    const tempPassword = genTempPassword();
    const hash = await bcrypt.hash(tempPassword, BCRYPT_COST);

    // Update password and set must_change_password = true
    await pool.query(
      `UPDATE users SET password = $1, must_change_password = true, updated_at = NOW() WHERE id = $2`,
      [hash, user.id],
    );

    console.log('Password updated for user:', user.id);

    const sender = 'Black Ivy Media';
    const bodyHtml = `
      <p style="margin:0 0 20px;">An administrator has reset your <strong>${sender}</strong> password. Please sign in with the temporary credentials below and change it right away.</p>
      ${renderCredentialBlock(email, tempPassword)}
    `;

    const html = renderBrandedEmail({
      sender,
      preheader: `Your ${sender} password has been reset. Sign in with the temporary credentials inside.`,
      heading: 'Password reset',
      greeting: `Hi ${firstName},`,
      bodyHtml,
      ctaLabel: `Sign in to ${sender}`,
      ctaUrl: APP_URL,
      footnote: 'For security, please change this password immediately after signing in.',
    });

    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: [email],
      subject: `Password reset — ${sender}`,
      html,
    });

    if (result.error) {
      console.error('Resend error:', result.error.message);
      await pool.end();
      process.exit(1);
    }

    console.log('Password reset email sent. ID:', result.data?.id);
    await pool.end();
  } catch (e) {
    console.error('Error:', e.message);
    await pool.end();
    process.exit(1);
  }
}

main();
