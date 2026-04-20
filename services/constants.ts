// Constants used by the CRM module. Kept minimal — the rest of the app uses
// inline constants in mockData.ts.

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_REGEX = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;

export const VAT_RATE = 0.15;
export const DEFAULT_CURRENCY = 'USD';

export const STORAGE_KEYS = {
  CRM_COMPANIES: 'db_crm_companies',
  CRM_CONTACTS: 'db_crm_contacts',
  CRM_OPPORTUNITIES: 'db_crm_opportunities',
  CRM_TOUCHPOINTS: 'db_crm_touchpoints',
  CRM_TASKS: 'db_crm_tasks',
  CRM_EMAIL_THREADS: 'db_crm_email_threads',
  CRM_CALL_LOGS: 'db_crm_call_logs',
  CRM_CSV_IMPORT_HISTORY: 'db_crm_csv_import_history',
} as const;
