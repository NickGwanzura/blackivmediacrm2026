#!/usr/bin/env node
/*
 * Weekly expenses report job.
 *
 * Queries the expenses relational mirror for the 7 days ending today,
 * builds a PDF, and emails it to the configured recipients. Intended to
 * be wired to Railway Cron: `0 15 * * 5` (Friday 15:00 UTC = 17:00 Africa/Harare).
 *
 * Env:
 *   DATABASE_URL         — Neon connection string (required, already set for app)
 *   RESEND_API_KEY       — Resend key (required, already set for app)
 *   EMAIL_FROM           — From address (falls back to "Black Ivy Media <noreply@blackivymedia.co.zw>")
 *   REPORT_RECIPIENTS    — Comma-separated list; defaults to "blessing@blackivymedia.co.zw"
 *   REPORT_WINDOW_DAYS   — Override the default 7-day window (optional)
 *
 * Exit codes: 0 on success, non-zero on failure. Railway shows this in the
 * cron job run logs. A best-effort audit_logs row is written regardless.
 */

const crypto = require('crypto');
const { sql } = require('../db');
const { Resend } = require('resend');
const jsPDF = require('jspdf').jsPDF || require('jspdf').default || require('jspdf');
require('jspdf-autotable');

const RECIPIENTS = (process.env.REPORT_RECIPIENTS || 'blessing@blackivymedia.co.zw')
  .split(',').map(s => s.trim()).filter(Boolean);
const FROM = process.env.EMAIL_FROM || 'Black Ivy Media <noreply@blackivymedia.co.zw>';
const WINDOW_DAYS = Math.max(1, Math.min(365, parseInt(process.env.REPORT_WINDOW_DAYS || '7', 10) || 7));

async function writeAuditSafe(action, details) {
  try {
    const id = `log_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await sql.query(
      `INSERT INTO audit_logs (id, actor_email, action, details, source)
       VALUES ($1,$2,$3,$4,'cron')`,
      [id, 'cron:weekly-expenses', action, details.slice(0, 2000)],
    );
  } catch (e) { console.warn('[audit] skipped:', e.message); }
}

function fmtMoney(n) {
  const v = Number(n || 0);
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? String(d) : dt.toISOString().slice(0, 10);
}

async function fetchExpenses() {
  const rows = await sql`
    SELECT id, category, description, amount, date, reference
      FROM expenses
     WHERE date >= (CURRENT_DATE - (${WINDOW_DAYS}::int - 1))
       AND date <= CURRENT_DATE
     ORDER BY date DESC, created_at DESC
  `;
  return rows;
}

async function fetchCompanyProfile() {
  try {
    const r = await sql`SELECT value FROM app_data WHERE key = 'company_profile' LIMIT 1`;
    return (r && r[0] && r[0].value) || {};
  } catch { return {}; }
}

function buildPdf({ rows, company, periodFrom, periodTo }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  // Header band
  doc.setFillColor(9, 9, 11);
  doc.rect(0, 0, pageWidth, 90, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(249, 115, 22);
  doc.text('WEEKLY EXPENSES REPORT', margin, 36);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text(company.name || 'Black Ivy Media', margin, 62);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(200, 200, 200);
  doc.text(`Period: ${periodFrom}  →  ${periodTo}`, margin, 78);

  // Summary line
  const total = rows.reduce((a, r) => a + Number(r.amount || 0), 0);
  const byCategory = rows.reduce((acc, r) => {
    const k = r.category || 'Uncategorised';
    acc[k] = (acc[k] || 0) + Number(r.amount || 0);
    return acc;
  }, {});
  const topCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  let y = 120;
  doc.text(`Total: ${fmtMoney(total)}`, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  y += 16;
  doc.setTextColor(100, 116, 139);
  doc.text(`Entries: ${rows.length}   Categories: ${Object.keys(byCategory).length}`
    + (topCategory ? `   Top: ${topCategory[0]} (${fmtMoney(topCategory[1])})` : ''), margin, y);

  // Table
  const body = rows.length === 0
    ? [['—', '—', 'No expenses recorded in this window.', '', '']]
    : rows.map(r => [
        fmtDate(r.date),
        r.category || '—',
        r.description || '—',
        r.reference || '',
        fmtMoney(r.amount),
      ]);

  doc.autoTable({
    startY: y + 20,
    head: [['Date', 'Category', 'Description', 'Reference', 'Amount']],
    body,
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: [24, 24, 27],
      textColor: 255,
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'left',
    },
    styles: { fontSize: 9, cellPadding: 6, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 90 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 80 },
      4: { cellWidth: 80, halign: 'right', fontStyle: 'bold' },
    },
    foot: rows.length > 0 ? [['', '', '', 'Total', fmtMoney(total)]] : undefined,
    footStyles: {
      fillColor: [249, 115, 22],
      textColor: 255,
      fontSize: 10,
      fontStyle: 'bold',
      halign: 'right',
    },
  });

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`${company.name || 'Black Ivy Media'}  ·  Generated ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`, margin, pageHeight - 20);
    doc.text(`Page ${i} / ${pageCount}`, pageWidth - margin, pageHeight - 20, { align: 'right' });
  }

  return Buffer.from(doc.output('arraybuffer'));
}

function buildEmailHtml({ company, periodFrom, periodTo, total, entries }) {
  const sender = company.name || 'Black Ivy Media';
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1e293b;line-height:1.6;font-size:14px;max-width:560px;">
      <div style="background:linear-gradient(135deg,#09090b 0%,#18181b 100%);color:#fff;padding:24px 28px;border-radius:14px 14px 0 0;">
        <div style="font-size:11px;letter-spacing:2px;color:#f97316;font-weight:700;margin-bottom:6px;">WEEKLY REPORT</div>
        <h1 style="margin:0;font-size:20px;font-weight:800;">Expenses · ${periodFrom} to ${periodTo}</h1>
      </div>
      <div style="background:#fff;border:1px solid #e4e4e7;border-top:none;border-radius:0 0 14px 14px;padding:24px 28px;">
        <p style="margin-top:0;">Hi Blessing,</p>
        <p>Your weekly expenses report is attached as a PDF.</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 18px;margin:18px 0;display:flex;gap:24px;">
          <div><div style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Total</div><strong style="font-size:18px;color:#f97316;">${total}</strong></div>
          <div><div style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Entries</div><strong style="font-size:18px;">${entries}</strong></div>
        </div>
        <p style="color:#64748b;font-size:12px;">Reports run automatically every Friday at 17:00 Harare time.</p>
        <p style="margin-top:20px;">Cheers,<br/><strong>${sender}</strong></p>
      </div>
    </div>
  `;
}

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is required');
  const resend = new Resend(apiKey);

  const rows = await fetchExpenses();
  const company = await fetchCompanyProfile();

  const today = new Date();
  const from = new Date(today); from.setDate(today.getDate() - (WINDOW_DAYS - 1));
  const periodFrom = from.toISOString().slice(0, 10);
  const periodTo = today.toISOString().slice(0, 10);
  const total = rows.reduce((a, r) => a + Number(r.amount || 0), 0);

  const pdf = buildPdf({ rows, company, periodFrom, periodTo });

  const result = await resend.emails.send({
    from: FROM,
    to: RECIPIENTS,
    subject: `Weekly expenses report — ${periodFrom} to ${periodTo}`,
    html: buildEmailHtml({
      company, periodFrom, periodTo,
      total: fmtMoney(total),
      entries: rows.length,
    }),
    text: `Weekly expenses report (${periodFrom} to ${periodTo})\n\nTotal: ${fmtMoney(total)}\nEntries: ${rows.length}\n\nSee attached PDF.`,
    attachments: [{
      filename: `expenses_${periodFrom}_${periodTo}.pdf`,
      content: pdf.toString('base64'),
    }],
  });

  if (result.error) throw new Error(`Resend rejected: ${result.error.message || JSON.stringify(result.error)}`);

  const msg = `Sent weekly report (${rows.length} entries, ${fmtMoney(total)}) to ${RECIPIENTS.join(', ')} — resend id ${result.data?.id}`;
  console.log('[weekly-expenses]', msg);
  await writeAuditSafe('report.weekly_expenses.sent', msg);
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('[weekly-expenses] failed:', err.message);
    await writeAuditSafe('report.weekly_expenses.failed', err.message || 'unknown error');
    process.exit(1);
  });
