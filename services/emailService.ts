import { getApiConfig, getCompanyProfile } from './mockData';
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

const emailEndpoint = () => {
    const { url } = getApiConfig();
    return `${url}/email/send`;
};

export const sendEmail = async (payload: SendEmailPayload): Promise<EmailResult> => {
    const { url, key } = getApiConfig();
    if (!url) {
        return { success: false, message: 'Cloud API URL is not configured. Open Settings → Cloud Database to set it.' };
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (key) headers['Authorization'] = `Bearer ${key}`;
    try {
        const res = await fetch(emailEndpoint(), { method: 'POST', headers, body: JSON.stringify(payload) });
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
