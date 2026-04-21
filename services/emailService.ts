import { getCompanyProfile } from './mockData';
import { Client, Invoice, Contract, User } from '../types';
import { generateInvoicePDF, generateContractPDF, generateStatementPDF, PdfBase64 } from './pdfGenerator';

export interface EmailAttachment {
    filename: string;
    content: string;
    contentType?: string;
}

export interface SendEmailPayload {
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
    subject: string;
    html?: string;
    text?: string;
    attachments?: EmailAttachment[];
}

export interface EmailResult { success: boolean; message: string; id?: string; }

export const sendEmail = async (payload: SendEmailPayload): Promise<EmailResult> => {
    try {
        const res = await fetch('/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return { success: false, message: data.error || `Email failed (HTTP ${res.status}).` };
        }
        return { success: true, message: 'Email sent successfully.', id: data.id };
    } catch (e: any) {
        return { success: false, message: e?.message || 'Network error while contacting email service.' };
    }
};

const buildSender = () => {
    const profile = getCompanyProfile();
    return profile?.name ? profile.name : 'Black Ivy Media';
};

const wrapHtml = (intro: string, closing?: string) => {
    const sender = buildSender();
    return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color:#1e293b; line-height:1.55; font-size:14px; max-width:560px;">
      <p>${intro}</p>
      ${closing ? `<p>${closing}</p>` : ''}
      <p style="margin-top:24px;">Kind regards,<br/><strong>${sender}</strong></p>
    </div>`.trim();
};

export const emailInvoice = async (invoice: Invoice, client: Client, extraRecipients: string[] = []): Promise<EmailResult> => {
    if (!client.email) return { success: false, message: 'This client has no email on file.' };

    const pdf = generateInvoicePDF(invoice, client, { asBase64: true }) as PdfBase64 | void;
    if (!pdf || !pdf.base64) return { success: false, message: 'Failed to build the invoice PDF.' };

    const label = invoice.type === 'Receipt' ? 'Receipt' : invoice.type === 'Quotation' ? 'Quotation' : 'Invoice';
    const intro = invoice.type === 'Receipt'
        ? `Thank you for your payment. Please find ${label.toLowerCase()} <strong>${invoice.id}</strong> for <strong>$${invoice.total.toLocaleString()}</strong> attached for your records.`
        : `Please find ${label.toLowerCase()} <strong>${invoice.id}</strong> attached, dated ${invoice.date}, for a total of <strong>$${invoice.total.toLocaleString()}</strong>.`;

    return sendEmail({
        to: [client.email, ...extraRecipients].filter(Boolean),
        subject: `${label} ${invoice.id} — ${buildSender()}`,
        html: wrapHtml(intro, 'Please let us know if you have any questions.'),
        attachments: [{ filename: pdf.filename, content: pdf.base64 }],
    });
};

export const emailContract = async (contract: Contract, client: Client, billboardName: string, extraRecipients: string[] = []): Promise<EmailResult> => {
    if (!client.email) return { success: false, message: 'This client has no email on file.' };

    const pdf = generateContractPDF(contract, client, billboardName, { asBase64: true }) as PdfBase64 | void;
    if (!pdf || !pdf.base64) return { success: false, message: 'Failed to build the contract PDF.' };

    const intro = `Please find the rental agreement <strong>${contract.id}</strong> for <strong>${billboardName}</strong> attached. Total contract value: <strong>$${contract.totalContractValue.toLocaleString()}</strong>.`;

    return sendEmail({
        to: [client.email, ...extraRecipients].filter(Boolean),
        subject: `Rental Agreement ${contract.id} — ${buildSender()}`,
        html: wrapHtml(intro, 'Please review, sign, and return the signed copy at your convenience.'),
        attachments: [{ filename: pdf.filename, content: pdf.base64 }],
    });
};

export const emailUserInvite = async (
    invitee: Pick<User, 'firstName' | 'lastName' | 'email' | 'role'>,
    tempPassword: string,
    appUrl: string,
    mode: 'invite' | 'reset' = 'invite',
): Promise<EmailResult> => {
    if (!invitee.email) return { success: false, message: 'Recipient email is required.' };

    const sender = buildSender();
    const intro = mode === 'reset'
        ? `An administrator has reset your <strong>${sender}</strong> password.`
        : `You've been invited to join <strong>${sender}</strong> as a <strong>${invitee.role}</strong>.`;
    const followup = mode === 'reset'
        ? 'Please sign in with the temporary password below and change it right away.'
        : 'Please sign in with the temporary credentials below. Your account will be activated once an administrator approves it.';

    const pwBlock = `<code style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background:#f1f5f9; padding:4px 10px; border-radius:6px; font-size:13px; color:#0f172a;">${tempPassword}</code>`;

    const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color:#1e293b; line-height:1.55; font-size:14px; max-width:560px;">
      <p>${intro}</p>
      <p>${followup}</p>
      <table style="margin:16px 0; border-collapse:collapse; font-size:13px;">
        <tr><td style="padding:4px 16px 4px 0; color:#64748b;">Email</td><td style="padding:4px 0;"><strong>${invitee.email}</strong></td></tr>
        <tr><td style="padding:4px 16px 4px 0; color:#64748b;">Temporary password</td><td style="padding:4px 0;">${pwBlock}</td></tr>
        <tr><td style="padding:4px 16px 4px 0; color:#64748b;">Sign in at</td><td style="padding:4px 0;"><a href="${appUrl}" style="color:#2563eb;">${appUrl}</a></td></tr>
      </table>
      <p style="color:#64748b; font-size:12px;">If you weren't expecting this ${mode === 'reset' ? 'password reset' : 'invitation'}, please ignore this email.</p>
      <p style="margin-top:24px;">Kind regards,<br/><strong>${sender}</strong></p>
    </div>`.trim();

    return sendEmail({
        to: invitee.email,
        subject: mode === 'reset' ? `Password reset — ${sender}` : `You've been invited to ${sender}`,
        html,
    });
};

// ---- Staff broadcast ----
// Sends the same message to every provided recipient, one call per person.
// Per-recipient isolation matters for three reasons:
//   1. One bad address doesn't cause the whole batch to fail
//   2. Resend treats each email as its own send (no BCC leakage between staff)
//   3. We can report per-recipient success/failure back to the admin UI
// Keep MAX_CONCURRENCY modest — Resend free tier caps at a few req/sec.
export interface BroadcastResult {
    total: number;
    sent: { email: string; id?: string }[];
    failed: { email: string; message: string }[];
}

const MAX_CONCURRENCY = 4;

export const broadcastAnnouncement = async (
    recipients: { email: string; name?: string }[],
    subject: string,
    html: string,
    text?: string,
): Promise<BroadcastResult> => {
    const result: BroadcastResult = { total: recipients.length, sent: [], failed: [] };
    let cursor = 0;

    const runOne = async () => {
        while (cursor < recipients.length) {
            const idx = cursor++;
            const r = recipients[idx];
            if (!r?.email) { result.failed.push({ email: r?.email || '(blank)', message: 'No email address' }); continue; }
            try {
                const res = await sendEmail({ to: r.email, subject, html, text });
                if (res.success) result.sent.push({ email: r.email, id: res.id });
                else result.failed.push({ email: r.email, message: res.message });
            } catch (e: any) {
                result.failed.push({ email: r.email, message: e?.message || 'Unknown error' });
            }
        }
    };

    const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, recipients.length) }, runOne);
    await Promise.all(workers);
    return result;
};

// Pre-built announcement for the dual-currency rollout. Lives here (not in
// the component) so the copy can be reviewed in one place before sending.
export const buildDualCurrencyAnnouncement = () => {
    const sender = buildSender();
    const subject = `[${sender}] Dual-currency support is live`;
    const text = [
        `Dual-currency support shipped in the ${sender} CRM.`,
        '',
        'What changed:',
        '- Billboard inventory now carries a billing currency (USD or ZWG). Rate inputs show the selected code.',
        '- Rentals inherit currency from the selected billboard. Contracts, invoices, and receipts snapshot that currency at save time.',
        '- Expenses and printing jobs each carry their own currency (power in ZWG, fuel in USD — whatever fits).',
        '- Outsourced payouts and maintenance costs are per-currency too.',
        '- Dashboard, Analytics, Financials, and Statements show totals split per currency — never summed across USD and ZWG.',
        '- PDFs (invoices, contracts, statements, reports) print the correct symbol per row.',
        '',
        'How to set the default:',
        'Settings → General → Default Currency. New forms pre-fill that choice. Existing rows keep whatever currency they were saved with.',
        '',
        'One rule to remember: a single consolidated invoice (batch rentals) can only carry one currency. If you need both, run two batches.',
        '',
        `— ${sender}`,
    ].join('\n');

    const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color:#1e293b; line-height:1.55; font-size:14px; max-width:600px;">
      <h2 style="margin:0 0 16px 0; font-size:20px; color:#0f172a;">Dual-currency support is live</h2>
      <p style="margin:0 0 16px 0;">Big release: every money-bearing record in the CRM — billboards, contracts, invoices, receipts, expenses, printing jobs, outsourced payouts, maintenance — now carries its own <strong>USD</strong> or <strong>ZWG</strong> currency. Dashboards split totals per currency; nothing is ever summed across the two.</p>

      <h3 style="margin:24px 0 8px 0; font-size:15px; color:#0f172a;">What changed, per screen</h3>
      <ul style="margin:0 0 16px 20px; padding:0;">
        <li style="margin:4px 0;"><strong>Inventory</strong>: new billboards have a currency selector; side/slot rate labels show the selected code live.</li>
        <li style="margin:4px 0;"><strong>Rentals</strong>: currency is inherited from the billboard. A single batch can only carry one currency — create a second batch for the other.</li>
        <li style="margin:4px 0;"><strong>Financials</strong>: invoice/quotation forms have a currency selector. Linking a contract or a pending invoice auto-fills it.</li>
        <li style="margin:4px 0;"><strong>Payments</strong>: receipts inherit the paid invoice's currency, so ledgers never mix denominations. Client statements show balance per currency.</li>
        <li style="margin:4px 0;"><strong>Expenses</strong>: each row has its own currency. Printing job cost cards group USD and ZWG separately.</li>
        <li style="margin:4px 0;"><strong>Outsourced</strong> / <strong>Maintenance</strong>: per-row currency on payouts and costs.</li>
        <li style="margin:4px 0;"><strong>Dashboard &amp; Analytics</strong>: Revenue / Expenditure / Net Profit KPIs render as <code style="background:#f1f5f9;padding:1px 6px;border-radius:4px;">USD X · ZWG Y</code>. Margin is shown for the primary (largest-revenue) currency only.</li>
        <li style="margin:4px 0;"><strong>PDFs</strong>: invoices, contracts, statements, and reports print the correct symbol per row.</li>
      </ul>

      <h3 style="margin:24px 0 8px 0; font-size:15px; color:#0f172a;">How to set your default</h3>
      <p style="margin:0 0 16px 0;"><strong>Settings → General → Default Currency.</strong> New forms pre-fill that choice. Existing rows keep whatever currency they were originally saved with — no retroactive changes.</p>

      <h3 style="margin:24px 0 8px 0; font-size:15px; color:#0f172a;">Why no exchange-rate conversion?</h3>
      <p style="margin:0 0 16px 0;">Converting to a single reporting currency drifts as the rate moves. Split reporting keeps historical totals honest. If you need a combined view later we can revisit with a stored rate.</p>

      <p style="margin:24px 0 0 0; color:#64748b; font-size:13px;">Questions or found a screen still showing a bare <code style="background:#f1f5f9;padding:1px 6px;border-radius:4px;">$</code>? Reply to this email.</p>
      <p style="margin:16px 0 0 0;">— <strong>${sender}</strong></p>
    </div>`.trim();

    return { subject, html, text };
};

export const emailStatement = async (
    client: Client,
    transactions: Invoice[],
    activeRentals: Contract[],
    billboardNameGetter: (id: string) => string,
    extraRecipients: string[] = [],
): Promise<EmailResult> => {
    if (!client.email) return { success: false, message: 'This client has no email on file.' };

    const pdf = generateStatementPDF(client, transactions, activeRentals, billboardNameGetter, { asBase64: true }) as PdfBase64 | void;
    if (!pdf || !pdf.base64) return { success: false, message: 'Failed to build the statement PDF.' };

    const totalBilled = transactions.filter(t => t.type === 'Invoice').reduce((s, t) => s + t.total, 0);
    const totalPaid = transactions.filter(t => t.type === 'Receipt').reduce((s, t) => s + t.total, 0);
    const balance = totalBilled - totalPaid;

    const intro = `Please find your current account statement attached. Outstanding balance: <strong>$${balance.toLocaleString()}</strong>.`;

    return sendEmail({
        to: [client.email, ...extraRecipients].filter(Boolean),
        subject: `Account Statement — ${buildSender()}`,
        html: wrapHtml(intro, balance > 0 ? 'Kindly settle the outstanding amount at your earliest convenience.' : 'Thank you — your account is up to date.'),
        attachments: [{ filename: pdf.filename, content: pdf.base64 }],
    });
};
