import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { Resend } from 'resend';

neonConfig.webSocketConstructor = ws;

const DATABASE_URL = process.env.DATABASE_URL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Black Ivy Media <onboarding@resend.dev>';
const APP_URL = process.env.APP_URL || null;
const DRY_RUN = process.argv.includes('--dry-run');

if (!DATABASE_URL) { console.error('DATABASE_URL is required'); process.exit(1); }
if (!RESEND_API_KEY) { console.error('RESEND_API_KEY is required'); process.exit(1); }

const pool = new Pool({ connectionString: DATABASE_URL });
const resend = new Resend(RESEND_API_KEY);

const sender = 'Black Ivy Media';
const accent = '#f97316';
const ink = '#0f172a';
const muted = '#64748b';

const SUBJECT = `New in ${sender}: Edit, Expire & Archive Contracts`;

const ctaHtml = APP_URL
  ? `<table cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;"><tr><td style="border-radius:10px; background:${accent};">
     <a href="${APP_URL}" style="display:inline-block; padding:14px 32px; color:#ffffff; font-size:14px; font-weight:700; text-decoration:none; letter-spacing:0.02em; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">Open ${sender} &rarr;</a>
   </td></tr></table>`
  : '';

function renderHtml(firstName) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${SUBJECT}</title></head>
<body style="margin:0; padding:0; background:#f1f5f9;">
<div style="display:none; overflow:hidden; line-height:1px; font-size:1px; color:transparent; opacity:0; max-height:0; max-width:0;">You can now edit, mark expired, and archive contracts in ${sender}.</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#f1f5f9; margin:0; padding:0;">
  <tr><td align="center" style="padding:40px 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:600px; width:100%; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(15,23,42,0.06);">
      <tr><td style="background:#000000; padding:28px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
          <td style="font-size:20px; font-weight:900; letter-spacing:-0.03em; color:#ffffff;">${sender.toUpperCase()}</td>
          <td align="right" style="font-size:10px; letter-spacing:0.18em; text-transform:uppercase; font-weight:700; color:${accent};">Product Update</td>
        </tr></table>
      </td></tr>
      <tr><td style="height:4px; background:${accent}; line-height:4px; font-size:4px;">&nbsp;</td></tr>
      <tr><td style="padding:40px; color:${ink}; font-size:15px; line-height:1.65;">
        <h1 style="margin:0 0 10px; font-size:26px; font-weight:800; color:${ink}; letter-spacing:-0.02em; line-height:1.2;">Contracts got sharper.</h1>
        <p style="margin:0 0 24px; color:${muted}; font-size:14px;">${greeting}</p>
        <p style="margin:0 0 20px;">We've shipped three new actions on the <strong>Contracts</strong> page so you can keep agreements accurate without leaving the list.</p>

        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:0 0 24px;">
          <tr><td style="padding:14px 0; border-top:1px solid #e2e8f0;">
            <div style="font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${accent}; margin-bottom:4px;">Edit</div>
            <div style="font-size:15px; color:${ink}; font-weight:600;">Change dates, rates, and details</div>
            <div style="font-size:13px; color:${muted}; margin-top:4px;">Total contract value recomputes live as you adjust monthly rate, install, print, or VAT.</div>
          </td></tr>
          <tr><td style="padding:14px 0; border-top:1px solid #e2e8f0;">
            <div style="font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${accent}; margin-bottom:4px;">Mark Expired</div>
            <div style="font-size:15px; color:${ink}; font-weight:600;">Release the billboard immediately</div>
            <div style="font-size:13px; color:${muted}; margin-top:4px;">End a contract early with one click — the asset frees up and availability re-syncs automatically.</div>
          </td></tr>
          <tr><td style="padding:14px 0; border-top:1px solid #e2e8f0; border-bottom:1px solid #e2e8f0;">
            <div style="font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${accent}; margin-bottom:4px;">Archive</div>
            <div style="font-size:15px; color:${ink}; font-weight:600;">Hide old contracts, keep the history</div>
            <div style="font-size:13px; color:${muted}; margin-top:4px;">Archived contracts disappear from the main list but stay restorable from the Archived filter.</div>
          </td></tr>
        </table>

        <p style="margin:0 0 20px;">You'll find them behind a new row of filter chips at the top of the Contracts page: <strong>All · Active · Pending · Expired · Archived</strong>.</p>

        ${ctaHtml}
        <p style="margin:0; color:#94a3b8; font-size:12px; line-height:1.6;">Questions or feedback? Reply to this email and we'll take a look.</p>
      </td></tr>
      <tr><td style="background:#fafafa; padding:24px 40px; border-top:1px solid #e5e7eb;">
        <p style="margin:0 0 4px; color:${muted}; font-size:13px; font-weight:700;">${sender}</p>
        <p style="margin:0; color:#94a3b8; font-size:11px; line-height:1.6;">Premium outdoor advertising management &middot; Harare, Zimbabwe</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

async function main() {
  const { rows } = await pool.query(
    `SELECT email, first_name FROM users WHERE email IS NOT NULL AND email <> '' AND COALESCE(status, 'Active') = 'Active'`
  );
  if (rows.length === 0) { console.log('No recipients found.'); await pool.end(); return; }

  console.log(`Recipients: ${rows.length}${DRY_RUN ? ' (dry run — no emails will be sent)' : ''}`);
  let sent = 0, failed = 0;

  for (const r of rows) {
    const to = String(r.email).trim();
    if (!to) continue;
    const html = renderHtml(r.first_name || '');
    if (DRY_RUN) { console.log(`[dry-run] would send to ${to}`); sent++; continue; }
    try {
      const result = await resend.emails.send({ from: EMAIL_FROM, to: [to], subject: SUBJECT, html });
      if (result.error) { console.error(`FAIL ${to}: ${result.error.message}`); failed++; }
      else { console.log(`OK   ${to}  id=${result.data?.id}`); sent++; }
    } catch (e) {
      console.error(`FAIL ${to}: ${e.message}`);
      failed++;
    }
    // Gentle pacing to stay within Resend rate limits.
    await new Promise(res => setTimeout(res, 250));
  }

  console.log(`\nDone. sent=${sent} failed=${failed}`);
  await pool.end();
}

main().catch(async (e) => { console.error('Error:', e.message); try { await pool.end(); } catch {} process.exit(1); });
