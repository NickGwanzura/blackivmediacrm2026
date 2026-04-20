import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Black Ivy Media <onboarding@resend.dev>';
const APP_URL = process.env.APP_URL;

const email = process.argv[2];
const firstName = process.argv[3];
const role = process.argv[4];

if (!email || !firstName || !role) {
  console.error('Usage: node send-welcome.mjs <email> <firstName> <role>');
  process.exit(1);
}

if (!RESEND_API_KEY) {
  console.error('RESEND_API_KEY is required');
  process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);
const sender = 'Black Ivy Media';
const accent = '#f97316';
const ink = '#0f172a';
const muted = '#64748b';

const ctaHtml = APP_URL
  ? `<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;"><tr><td style="border-radius:10px; background:${accent};">
     <a href="${APP_URL}" style="display:inline-block; padding:14px 32px; color:#ffffff; font-size:14px; font-weight:700; text-decoration:none; letter-spacing:0.02em; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">Sign in to ${sender} &rarr;</a>
   </td></tr></table>`
  : '';

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Welcome to ${sender}</title></head>
<body style="margin:0; padding:0; background:#f1f5f9;">
<div style="display:none; overflow:hidden; line-height:1px; font-size:1px; color:transparent; opacity:0; max-height:0; max-width:0;">Your ${sender} account is active. Sign in and start managing your inventory.</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:#f1f5f9; margin:0; padding:0;">
  <tr><td align="center" style="padding:40px 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:600px; width:100%; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(15,23,42,0.06);">
      <tr><td style="background:#000000; padding:28px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
          <td style="font-size:20px; font-weight:900; letter-spacing:-0.03em; color:#ffffff; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">${sender.toUpperCase()}</td>
          <td align="right" style="font-size:10px; letter-spacing:0.18em; text-transform:uppercase; font-weight:700; color:${accent}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">Command the View</td>
        </tr></table>
      </td></tr>
      <tr><td style="height:4px; background:${accent}; line-height:4px; font-size:4px;">&nbsp;</td></tr>
      <tr><td style="padding:40px; color:${ink}; font-size:15px; line-height:1.65; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
        <h1 style="margin:0 0 10px; font-size:26px; font-weight:800; color:${ink}; letter-spacing:-0.02em; line-height:1.2;">You're in.</h1>
        <p style="margin:0 0 20px; color:${muted}; font-size:14px;">Welcome, ${firstName}.</p>
        <div style="margin:0 0 24px;">
          <p style="margin:0;">Your <strong>${sender}</strong> account is active. You are set up as a <strong style="color:${accent};">${role}</strong>.</p>
          <p style="margin:16px 0 0;">You can now sign in and start managing your inventory, clients, and contracts.</p>
        </div>
        ${ctaHtml}
        <p style="margin:0; color:#94a3b8; font-size:12px; line-height:1.6;">If you have any questions, reach out to your administrator.</p>
      </td></tr>
      <tr><td style="background:#fafafa; padding:24px 40px; border-top:1px solid #e5e7eb;">
        <p style="margin:0 0 4px; color:${muted}; font-size:13px; font-weight:700; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">${sender}</p>
        <p style="margin:0; color:#94a3b8; font-size:11px; line-height:1.6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">Premium outdoor advertising management &middot; Harare, Zimbabwe</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

async function main() {
  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: [email],
      subject: `Welcome to ${sender}`,
      html,
    });

    if (result.error) {
      console.error('Resend error:', result.error.message);
      process.exit(1);
    }
    console.log('Email sent successfully. ID:', result.data?.id);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();
