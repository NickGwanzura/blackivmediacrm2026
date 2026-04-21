/**
 * String Sanitization Utilities
 * Safe string handling for user inputs
 */

/**
 * Generate a unique ID
 */
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Sanitize a string by removing dangerous characters
 */
export const sanitizeString = (input: string | undefined): string => {
  if (!input) return '';
  
  return input
    .trim()
    // Remove null bytes
    .replace(/\x00/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove control characters
    .replace(/[\x01-\x1F\x7F]/g, '')
    // Limit length (safety)
    .substring(0, 1000);
};

/**
 * Sanitize HTML content (for rich text fields)
 */
export const sanitizeHtml = (input: string | undefined): string => {
  if (!input) return '';
  
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
};

/**
 * Format phone number for display
 */
export const formatPhoneNumber = (phone: string | undefined): string => {
  if (!phone) return '';
  
  // Basic formatting for Zimbabwe numbers
  const cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.length === 10 && cleaned.startsWith('0')) {
    return `+263 ${cleaned.substring(1, 3)} ${cleaned.substring(3, 6)} ${cleaned.substring(6)}`;
  }
  
  if (cleaned.length === 12 && cleaned.startsWith('263')) {
    return `+${cleaned.substring(0, 3)} ${cleaned.substring(3, 5)} ${cleaned.substring(5, 8)} ${cleaned.substring(8)}`;
  }
  
  return phone;
};

/**
 * Format currency for display.
 *
 * USD renders with the familiar $ prefix ($1,234). ZWG (Zimbabwe Gold, ISO
 * 4217 code added 2024) is not yet in every runtime's CLDR data — an
 * unrecognised Intl `currency` can throw RangeError on older engines — so
 * we format it manually as "ZWG 1,234" to keep rendering stable everywhere.
 * An explicit symbol prefix is intentional: the two currencies must look
 * visibly distinct in every table and card since their totals are never
 * summed together.
 */
export const formatCurrency = (
  amount: number | undefined | null,
  currency: string = 'USD',
): string => {
  if (amount === undefined || amount === null || !Number.isFinite(amount)) return '-';

  const code = (currency || 'USD').toUpperCase();

  if (code === 'ZWG') {
    const body = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
    return `ZWG ${body}`;
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Unknown/unsupported code — degrade to "<CODE> <number>"
    const body = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
    return `${code} ${body}`;
  }
};

/**
 * Group { currency, amount } rows into a { USD: n, ZWG: n } map.
 * Used by dashboards to split revenue/expense/profit totals instead of
 * incorrectly summing mixed-currency rows into a single scalar.
 */
export const sumByCurrency = <T>(
  rows: T[],
  getAmount: (row: T) => number | undefined,
  getCurrency: (row: T) => string | undefined,
  defaultCurrency: string = 'USD',
): Record<string, number> => {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    const amt = getAmount(row);
    if (amt === undefined || amt === null || !Number.isFinite(amt)) continue;
    const code = (getCurrency(row) || defaultCurrency).toUpperCase();
    totals[code] = (totals[code] || 0) + amt;
  }
  return totals;
};

/**
 * Render a { USD: n, ZWG: n } map as a compact multi-line string for KPI
 * cards. Zero-value currencies are dropped. When the map is empty the
 * fallback currency renders as 0 so cards never show a bare "-".
 */
export const formatCurrencyTotals = (
  totals: Record<string, number>,
  fallback: string = 'USD',
): string => {
  const entries = Object.entries(totals).filter(([, v]) => Number.isFinite(v) && v !== 0);
  if (entries.length === 0) return formatCurrency(0, fallback);
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, value]) => formatCurrency(value, code))
    .join(' · ');
};

/**
 * Truncate text with ellipsis
 */
export const truncateText = (text: string | undefined, maxLength: number): string => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
};

/**
 * Convert string to URL-safe slug
 */
export const slugify = (text: string | undefined): string => {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

/**
 * Parse and normalize URL
 */
export const normalizeUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  
  let normalized = url.trim();
  
  // Add protocol if missing
  if (!normalized.match(/^https?:\/\//i)) {
    normalized = 'https://' + normalized;
  }
  
  return normalized;
};
