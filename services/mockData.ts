import { Billboard, BillboardType, Client, Contract, Invoice, Expense, User, PrintingJob, OutsourcedBillboard, AuditLogEntry, CompanyProfile, VAT_RATE, MaintenanceLog } from '../types';
import { toast } from '../components/Toast';

export const ZIM_TOWNS = [
  "Harare", "Bulawayo", "Mutare", "Gweru", "Kwekwe", 
  "Masvingo", "Chinhoyi", "Marondera", "Kadoma", "Victoria Falls", 
  "Beitbridge", "Zvishavane", "Bindura", "Chitungwiza",
  "Mutoko", "Nyamapanda", "Rusape", "Karoi", "Kariba", "Gwanda", 
  "Plumtree", "Hwange", "Chegutu", "Norton", "Chipinge", "Gokwe", 
  "Ruwa", "Redcliff", "Chivhu", "Shamva", "Nyanga"
];

// CLEAN SLATE - START FROM SCRATCH
const INITIAL_BILLBOARDS: Billboard[] = [];
const INITIAL_CLIENTS: Client[] = [];
const INITIAL_CONTRACTS: Contract[] = [];

// --- Persistence Helpers ---
const STORAGE_KEYS = {
    BILLBOARDS: 'bi_billboards',
    CONTRACTS: 'bi_contracts',
    INVOICES: 'bi_invoices',
    EXPENSES: 'bi_expenses',
    USERS: 'bi_users',
    CLIENTS: 'bi_clients',
    LOGS: 'bi_logs',
    OUTSOURCED: 'bi_outsourced',
    PRINTING: 'bi_printing',
    MAINTENANCE: 'bi_maintenance',
    LOGO: 'bi_logo',
    PROFILE: 'bi_company_profile',
    LAST_BACKUP: 'bi_last_backup_meta',
    LAST_CLOUD_SYNC: 'bi_last_cloud_sync',
    AUTO_BACKUP: 'bi_auto_backup_data',
    CLOUD_MIRROR: 'bi_google_cloud_mirror',
    DATA_VERSION: 'bi_data_version',
    API_URL: 'bi_api_url', // New key for SQL/API Backend
    API_KEY: 'bi_api_key'  // Optional auth key
};

const loadFromStorage = <T>(key: string, defaultValue: T | null): T | null => {
    try {
        const stored = localStorage.getItem(key);
        if (stored === null) return defaultValue;
        return JSON.parse(stored);
    } catch (e) {
        console.error(`Error loading ${key}`, e);
        return defaultValue;
    }
};

// --- REMOTE SYNC LOGIC ---
// The API server (in /server) speaks a simple Node-style protocol on the
// same origin that serves this SPA: empty URL = same origin. Point at a
// different host only when the API is deployed separately.
const DEFAULT_API_URL = '';
const DEFAULT_API_KEY = '';

let remoteApiUrl = localStorage.getItem(STORAGE_KEYS.API_URL) ?? DEFAULT_API_URL;
let remoteApiKey = localStorage.getItem(STORAGE_KEYS.API_KEY) ?? DEFAULT_API_KEY;

// Migrate legacy Supabase URLs left over from older installs — they point
// at the decommissioned Supabase project and will 404 against the new API.
if (remoteApiUrl && remoteApiUrl.includes('supabase.co')) {
    localStorage.removeItem(STORAGE_KEYS.API_URL);
    localStorage.removeItem(STORAGE_KEYS.API_KEY);
    remoteApiUrl = DEFAULT_API_URL;
    remoteApiKey = DEFAULT_API_KEY;
}

export const setApiConfig = (url: string, key: string) => {
    // Remove trailing slash if present
    const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    remoteApiUrl = cleanUrl;
    remoteApiKey = key;
    localStorage.setItem(STORAGE_KEYS.API_URL, cleanUrl);
    localStorage.setItem(STORAGE_KEYS.API_KEY, key);
};

export const getApiConfig = () => ({ url: remoteApiUrl, key: remoteApiKey });

const pushToRemote = async (key: string, data: any) => {
    const collectionName = key.replace('bi_', '');

    // Never push plaintext passwords over /sync. The auth server strips them
    // too, but sanitize client-side as defence-in-depth — also prevents any
    // legacy localStorage copy from leaking into request logs.
    let payload: any = data;
    if (key === STORAGE_KEYS.USERS && Array.isArray(data)) {
        payload = data.map((u: any) => {
            if (!u || typeof u !== 'object') return u;
            const { password, ...rest } = u;
            return rest;
        });
    }

    try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (remoteApiKey) headers['Authorization'] = `Bearer ${remoteApiKey}`;

        const response = await fetch(`${remoteApiUrl}/sync`, {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({ collection: collectionName, data: payload }),
        });
        if (!response.ok) {
            const errText = await response.text();
            console.warn(`Sync Push Failed for ${collectionName} (${response.status}):`, errText);
        }
    } catch (e) {
        console.warn(`Failed to push ${key} to remote backend:`, e);
    }
};

const deleteFromRemote = async (collectionName: string, id: string) => {
    try {
        const headers: Record<string, string> = {};
        if (remoteApiKey) headers['Authorization'] = `Bearer ${remoteApiKey}`;
        await fetch(`${remoteApiUrl}/delete/${encodeURIComponent(collectionName)}/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers,
            credentials: 'include',
        });
    } catch (e) {
        console.error(`Delete remote failed for ${collectionName} ${id}`, e);
    }
};

// EXPORTED FUNCTION TO SEED DATABASE
export const forcePushToRemote = async (): Promise<{success: boolean, message: string}> => {
    console.log("Starting full push to remote...");
    const collections = [
        { key: STORAGE_KEYS.BILLBOARDS, data: billboards },
        { key: STORAGE_KEYS.CLIENTS, data: clients },
        { key: STORAGE_KEYS.CONTRACTS, data: contracts },
        { key: STORAGE_KEYS.INVOICES, data: invoices },
        { key: STORAGE_KEYS.EXPENSES, data: expenses },
        { key: STORAGE_KEYS.USERS, data: users },
        { key: STORAGE_KEYS.MAINTENANCE, data: maintenanceLogs },
        { key: STORAGE_KEYS.OUTSOURCED, data: outsourcedBillboards },
        { key: STORAGE_KEYS.PRINTING, data: printingJobs },
        { key: STORAGE_KEYS.PROFILE, data: companyProfile },
        { key: STORAGE_KEYS.LOGO, data: companyLogo }
    ];

    try {
        for (const item of collections) {
            await pushToRemote(item.key, item.data);
        }
        return { success: true, message: "All local data pushed to Neon successfully." };
    } catch (e: any) {
        return { success: false, message: `Upload failed: ${e.message}` };
    }
};

export const validateConnection = async (url: string, key: string): Promise<{success: boolean, step: string, message: string}> => {
    const cleanUrl = (url || '').endsWith('/') ? url.slice(0, -1) : (url || '');

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const headers: Record<string, string> = {};
        if (key) headers['Authorization'] = `Bearer ${key}`;

        const res = await fetch(`${cleanUrl}/health/db`, { headers, credentials: 'include', signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) {
            if (res.status === 401) return { success: false, step: 'Authentication', message: "Invalid API key." };
            if (res.status === 503) return { success: false, step: 'Database', message: "API reached, but Neon is unreachable." };
            return { success: false, step: 'API', message: `Status ${res.status}: ${res.statusText}` };
        }

        const data = await res.json();
        if (!data.ok) return { success: false, step: 'Database', message: data.error || 'Neon unreachable' };

        return { success: true, step: 'Complete', message: 'Connected to Neon-backed API.' };
    } catch (e: any) {
        const msg = e.name === 'AbortError' ? 'Connection timed out' : (e.message || 'Unknown error');
        return { success: false, step: 'Reachability', message: msg };
    }
};

/**
 * Smart Merge Engine
 * This function merges remote data with local data.
 * It prevents "Server Wins" from deleting locally created items that haven't synced yet.
 */
const mergeCollections = (local: any[], remote: any[]): any[] => {
    if (!remote || !Array.isArray(remote)) return local;
    if (!local || !Array.isArray(local)) return remote;

    const remoteMap = new Map(remote.map(item => [item.id, item]));
    const merged = [...remote];

    // Iterate local items
    local.forEach(localItem => {
        if (!remoteMap.has(localItem.id)) {
            // Item exists locally but not on remote.
            // Check if it's a valid ID (contains timestamp)
            // Format example: CLI-1627384... or just raw timestamps
            const idParts = localItem.id.split('-');
            const timestamp = idParts.length > 1 ? parseInt(idParts[1]) : parseInt(localItem.id);
            
            // If we can parse a valid timestamp, assume it's a new item created recently
            if (!isNaN(timestamp) && timestamp > 0) {
                // Keep local item (it's likely new and waiting to push)
                merged.push(localItem);
            } else {
                // If ID is weird or static and missing from remote, assume it was deleted on remote.
                // However, for safety in this app version, we err on side of caution: KEEP IT
                merged.push(localItem); 
            }
        }
    });

    // Remove duplicates (by ID) just in case, preferring the merged version
    const uniqueMap = new Map();
    merged.forEach(item => uniqueMap.set(item.id, item));
    return Array.from(uniqueMap.values());
};

export const pullFromRemote = async (shouldReload: boolean = false): Promise<{success: boolean, message: string}> => {
    try {
        if (shouldReload) console.log("Attempting to pull data from Backend...");

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const headers: Record<string, string> = {};
        if (remoteApiKey) headers['Authorization'] = `Bearer ${remoteApiKey}`;

        const response = await fetch(`${remoteApiUrl}/sync/all`, { headers, credentials: 'include', signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
            const remoteData: any = await response.json();

            // --- SMART MERGE LOGIC ---
            // 1. Billboards
            if (remoteData.billboards && Array.isArray(remoteData.billboards)) {
                billboards = mergeCollections(billboards, remoteData.billboards);
                saveToStorage(STORAGE_KEYS.BILLBOARDS, billboards, false);
            } else if (billboards && billboards.length > 0) {
                // If remote is empty but we have data, push ours (Auto-Seed)
                pushToRemote(STORAGE_KEYS.BILLBOARDS, billboards);
            }

            // 2. Clients
            if (remoteData.clients && Array.isArray(remoteData.clients)) {
                clients = mergeCollections(clients, remoteData.clients);
                saveToStorage(STORAGE_KEYS.CLIENTS, clients, false);
            } else if (clients && clients.length > 0) {
                pushToRemote(STORAGE_KEYS.CLIENTS, clients);
            }

            // 3. Contracts
            if (remoteData.contracts && Array.isArray(remoteData.contracts)) {
                contracts = mergeCollections(contracts, remoteData.contracts);
                saveToStorage(STORAGE_KEYS.CONTRACTS, contracts, false);
            } else if (contracts && contracts.length > 0) {
                pushToRemote(STORAGE_KEYS.CONTRACTS, contracts);
            }

            // 4. Invoices
            if (remoteData.invoices && Array.isArray(remoteData.invoices)) {
                invoices = mergeCollections(invoices, remoteData.invoices);
                saveToStorage(STORAGE_KEYS.INVOICES, invoices, false);
            } else if (invoices && invoices.length > 0) {
                pushToRemote(STORAGE_KEYS.INVOICES, invoices);
            }

            // 5. Expenses
            if (remoteData.expenses && Array.isArray(remoteData.expenses)) {
                expenses = mergeCollections(expenses, remoteData.expenses);
                saveToStorage(STORAGE_KEYS.EXPENSES, expenses, false);
            } else if (expenses && expenses.length > 0) {
                pushToRemote(STORAGE_KEYS.EXPENSES, expenses);
            }

            // 6. Users
            if (remoteData.users && Array.isArray(remoteData.users)) {
                users = mergeCollections(users, remoteData.users);
                saveToStorage(STORAGE_KEYS.USERS, users, false);
            } else if (users && users.length > 0) {
                pushToRemote(STORAGE_KEYS.USERS, users);
            }

            // 7. Maintenance
            if (remoteData.maintenanceLogs && Array.isArray(remoteData.maintenanceLogs)) {
                maintenanceLogs = mergeCollections(maintenanceLogs, remoteData.maintenanceLogs);
                saveToStorage(STORAGE_KEYS.MAINTENANCE, maintenanceLogs, false);
            } else if (maintenanceLogs && maintenanceLogs.length > 0) {
                pushToRemote(STORAGE_KEYS.MAINTENANCE, maintenanceLogs);
            }

            // 8. Outsourced
            if (remoteData.outsourcedBillboards && Array.isArray(remoteData.outsourcedBillboards)) {
                outsourcedBillboards = mergeCollections(outsourcedBillboards, remoteData.outsourcedBillboards);
                saveToStorage(STORAGE_KEYS.OUTSOURCED, outsourcedBillboards, false);
            } else if (outsourcedBillboards && outsourcedBillboards.length > 0) {
                pushToRemote(STORAGE_KEYS.OUTSOURCED, outsourcedBillboards);
            }
            
            // Handle Company Profile & Logo (Single Objects, direct overwrite usually fine, but let's check nulls)
            if (remoteData.company_profile) {
                companyProfile = remoteData.company_profile;
                saveToStorage(STORAGE_KEYS.PROFILE, companyProfile, false);
            } else if (companyProfile) {
                pushToRemote(STORAGE_KEYS.PROFILE, companyProfile);
            }

            if (remoteData.logo) {
                companyLogo = remoteData.logo;
                saveToStorage(STORAGE_KEYS.LOGO, companyLogo, false);
            } else if (companyLogo) {
                pushToRemote(STORAGE_KEYS.LOGO, companyLogo);
            }
            
            if (shouldReload) {
                console.log("Data synchronized from Backend.");
                window.location.reload(); 
            }
            return { success: true, message: "Data synchronized successfully." };
        } else {
            return { success: false, message: `Server Error: ${response.status} ${response.statusText}` };
        }
    } catch (e: any) {
        if (shouldReload) console.warn("Failed to pull from remote:", e);
        const msg = e.name === 'AbortError' ? 'Connection Timed Out' : e.message;
        return { success: false, message: `Connection Failed: ${msg}` };
    }
};

const saveToStorage = (key: string, data: any, sync = true): Promise<void> => {
    try {
        const serialized = JSON.stringify(data);
        localStorage.setItem(key, serialized);
        if (sync) return pushToRemote(key, data); // Return the sync promise
    } catch (e: any) {
        console.error(`Error saving ${key}`, e);
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            toast.warning('Storage Full! Critical Data Warning. Please Download Backup in Settings immediately.', 'Storage Critical');
        } else {
            console.warn("Data save failed.");
        }
    }
    return Promise.resolve();
};

const escapeSQL = (str: string) => {
    if (typeof str !== 'string') return str;
    return str.replace(/'/g, "''");
};

export const generateSQLDump = () => {
    let sql = `-- Black Ivy Media SQL Dump\n-- Generated: ${new Date().toISOString()}\n\n`;

    const createTable = (tableName: string, sampleObj: any) => {
        if (!sampleObj) return '';
        let cols = Object.keys(sampleObj).map(key => {
            const val = sampleObj[key];
            let type = 'VARCHAR(255)';
            if (typeof val === 'number') type = 'DECIMAL(10,2)';
            if (typeof val === 'boolean') type = 'BOOLEAN';
            if (key === 'id') return `  ${key} VARCHAR(255) PRIMARY KEY`;
            return `  ${key} ${type}`;
        }).join(',\n');
        return `CREATE TABLE IF NOT EXISTS ${tableName} (\n${cols}\n);\n`;
    };

    const createInserts = (tableName: string, data: any[]) => {
        if (!data.length) return '';
        const keys = Object.keys(data[0]);
        const values = data.map(item => {
            const vals = keys.map(k => {
                const v = item[k];
                if (v === null || v === undefined) return 'NULL';
                if (typeof v === 'string') return `'${escapeSQL(v)}'`;
                if (typeof v === 'object') return `'${escapeSQL(JSON.stringify(v))}'`;
                return v;
            }).join(', ');
            return `(${vals})`;
        }).join(',\n');
        return `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES \n${values};\n`;
    };

    if (billboards.length > 0) {
        sql += createTable('billboards', billboards[0]);
        sql += createInserts('billboards', billboards);
        sql += '\n';
    }
    if (clients.length > 0) {
        sql += createTable('clients', clients[0]);
        sql += createInserts('clients', clients);
        sql += '\n';
    }
    if (contracts.length > 0) {
        sql += createTable('contracts', contracts[0]);
        sql += createInserts('contracts', contracts);
        sql += '\n';
    }
    if (invoices.length > 0) {
        const flatInvoices = invoices.map(i => ({...i, items: JSON.stringify(i.items)}));
        sql += createTable('invoices', flatInvoices[0]);
        sql += createInserts('invoices', flatInvoices);
        sql += '\n';
    }
    if (maintenanceLogs.length > 0) {
        sql += createTable('maintenance_logs', maintenanceLogs[0]);
        sql += createInserts('maintenance_logs', maintenanceLogs);
        sql += '\n';
    }
    return sql;
};

export const downloadSQL = () => {
    const sql = generateSQLDump();
    const blob = new Blob([sql], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `black_ivy_dump_${new Date().toISOString().split('T')[0]}.sql`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const downloadServerCode = () => {};
export const downloadPackageJson = () => {};
export const downloadEnvFile = (c:string) => {};

export const getStorageUsage = () => {
    let total = 0;
    for (const key in localStorage) {
        if (localStorage.hasOwnProperty(key) && key.startsWith('bi_')) {
            total += (localStorage[key].length * 2);
        }
    }
    return (total / 1024).toFixed(2);
};

// --- Mutable Stores & Initialization ---

export let billboards: Billboard[] = loadFromStorage(STORAGE_KEYS.BILLBOARDS, null) || INITIAL_BILLBOARDS;
if (!loadFromStorage(STORAGE_KEYS.BILLBOARDS, null)) {
    saveToStorage(STORAGE_KEYS.BILLBOARDS, billboards, false);
}

export let clients: Client[] = loadFromStorage(STORAGE_KEYS.CLIENTS, null) || INITIAL_CLIENTS;
if (!loadFromStorage(STORAGE_KEYS.CLIENTS, null)) {
    saveToStorage(STORAGE_KEYS.CLIENTS, clients, false);
}

export let contracts: Contract[] = loadFromStorage(STORAGE_KEYS.CONTRACTS, null) || INITIAL_CONTRACTS;
if (!loadFromStorage(STORAGE_KEYS.CONTRACTS, null)) {
    saveToStorage(STORAGE_KEYS.CONTRACTS, contracts, false);
}

// Auto-Migration logic
const currentDataVersion = '2.1.5'; 
const storedVersion = localStorage.getItem(STORAGE_KEYS.DATA_VERSION);

export let invoices: Invoice[] = loadFromStorage(STORAGE_KEYS.INVOICES, []) || [];
export let expenses: Expense[] = loadFromStorage(STORAGE_KEYS.EXPENSES, []) || [];
export let auditLogs: AuditLogEntry[] = loadFromStorage(STORAGE_KEYS.LOGS, [
    { id: 'log-init', timestamp: new Date().toLocaleString(), action: 'System Init', details: 'System started', user: 'System' }
]) || [];

export let outsourcedBillboards: OutsourcedBillboard[] = loadFromStorage(STORAGE_KEYS.OUTSOURCED, []) || [];
export let printingJobs: PrintingJob[] = loadFromStorage(STORAGE_KEYS.PRINTING, []) || [];
export let maintenanceLogs: MaintenanceLog[] = loadFromStorage(STORAGE_KEYS.MAINTENANCE, []) || [];

// The client-side user store is now a cache hydrated from the server's
// /sync/all (or /auth/me). It starts empty — no default admin is seeded here
// because the real admin is created server-side on first boot. See
// server/auth.js → ensureInitialAdmin.
export let users: User[] = loadFromStorage(STORAGE_KEYS.USERS, null) || [];

// --- Current user reference (set by services/authService.ts on login) ---
// authService imports from this file, so mockData keeps a lazy-set reference
// instead of doing the reverse import (which would be circular).
let currentUserRef: User | null = null;
export const setCurrentUserRef = (u: User | null) => { currentUserRef = u; };
export const getCurrentUserRef = (): User | null => currentUserRef;

// === SELF-HEALING MECHANISM ===
const attemptDataRecovery = () => {
    if (billboards.length === 0) {
        const backupSources = [STORAGE_KEYS.AUTO_BACKUP, STORAGE_KEYS.CLOUD_MIRROR];
        let restored = false;

        for (const source of backupSources) {
            try {
                const raw = localStorage.getItem(source);
                if (raw) {
                    const backup = JSON.parse(raw);
                    const data = backup.data || backup;
                    
                    if (data.billboards && data.billboards.length > 0) {
                        console.warn(`⚠️ Primary data empty. SELF-HEALING: Restoring from ${source}`);
                        
                        billboards = data.billboards;
                        clients = data.clients || [];
                        contracts = data.contracts || [];
                        invoices = data.invoices || [];
                        expenses = data.expenses || [];
                        // Users are now authoritative on the server. Don't
                        // restore the local users cache from legacy backups —
                        // the next /auth/me call will re-hydrate it.
                        outsourcedBillboards = data.outsourcedBillboards || [];
                        maintenanceLogs = data.maintenanceLogs || [];
                        
                        saveToStorage(STORAGE_KEYS.BILLBOARDS, billboards);
                        saveToStorage(STORAGE_KEYS.CLIENTS, clients);
                        saveToStorage(STORAGE_KEYS.CONTRACTS, contracts);
                        saveToStorage(STORAGE_KEYS.INVOICES, invoices);
                        saveToStorage(STORAGE_KEYS.EXPENSES, expenses);
                        saveToStorage(STORAGE_KEYS.MAINTENANCE, maintenanceLogs);
                        saveToStorage(STORAGE_KEYS.OUTSOURCED, outsourcedBillboards);
                        
                        restored = true;
                        break;
                    }
                }
            } catch (e) {
                console.error(`Self-healing failed for source ${source}`, e);
            }
        }
        
        if (restored) {
            const log: AuditLogEntry = { 
                id: `log-heal-${Date.now()}`, 
                timestamp: new Date().toLocaleString(), 
                action: 'System Recovery', 
                details: 'Automatically restored data from backup after update check.', 
                user: 'System' 
            };
            auditLogs = [log, ...auditLogs];
            saveToStorage(STORAGE_KEYS.LOGS, auditLogs);
        }
    }
};

attemptDataRecovery();

export const logAction = (action: string, details: string) => {
    const who = currentUserRef?.email || 'System';
    const log: AuditLogEntry = { id: `log-${Date.now()}`, timestamp: new Date().toLocaleString(), action, details, user: who };
    auditLogs = [log, ...auditLogs];
    saveToStorage(STORAGE_KEYS.LOGS, auditLogs);
};

let companyLogo = loadFromStorage(STORAGE_KEYS.LOGO, null) || '';
if (!loadFromStorage(STORAGE_KEYS.LOGO, null)) {
    saveToStorage(STORAGE_KEYS.LOGO, companyLogo, false);
}

const DEFAULT_PROFILE: CompanyProfile = {
    name: "Black Ivy Media",
    vatNumber: "VAT-9928371",
    regNumber: "REG-2026/001",
    email: "info@blackivy.co.zw",
    supportEmail: "support@blackivy.co.zw",
    phone: "+263 772 123 456",
    website: "www.blackivymedia.co.zw",
    address: "123 Samora Machel Ave",
    city: "Harare",
    country: "Zimbabwe"
};
let companyProfile: CompanyProfile = loadFromStorage(STORAGE_KEYS.PROFILE, null) || DEFAULT_PROFILE;
if (!loadFromStorage(STORAGE_KEYS.PROFILE, null)) {
    saveToStorage(STORAGE_KEYS.PROFILE, companyProfile, false);
}

let lastBackupDate = loadFromStorage(STORAGE_KEYS.LAST_BACKUP, null) || 'Never';
let lastCloudSyncDate = loadFromStorage(STORAGE_KEYS.LAST_CLOUD_SYNC, null) || 'Never';

export const setCompanyLogo = (url: string) => { 
    companyLogo = url; 
    saveToStorage(STORAGE_KEYS.LOGO, companyLogo);
};

export const updateCompanyProfile = (profile: CompanyProfile) => {
    companyProfile = profile;
    saveToStorage(STORAGE_KEYS.PROFILE, companyProfile);
    logAction('Settings Update', 'Updated company profile details');
};

if (storedVersion !== currentDataVersion) {
    // Purge any legacy plaintext passwords that may linger in the local cache
    // from pre-auth-rewrite installs. The server is the source of truth now.
    users = users.map(u => {
        const { password, ...rest } = u as any;
        return { ...rest, status: rest.status || 'Active' } as User;
    });
    const existingProfile = loadFromStorage(STORAGE_KEYS.PROFILE, null) as CompanyProfile | null;
    if (existingProfile && (existingProfile.name.includes("Dreambox") || !existingProfile.name)) {
        updateCompanyProfile(DEFAULT_PROFILE);
    }
    saveToStorage(STORAGE_KEYS.USERS, users, false);
    localStorage.setItem(STORAGE_KEYS.DATA_VERSION, currentDataVersion);
}

export const syncBillboardAvailability = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const resetBillboards = billboards.map(b => ({
        ...b,
        sideAStatus: 'Available' as 'Available' | 'Rented',
        sideBStatus: 'Available' as 'Available' | 'Rented',
        sideAClientId: undefined as string | undefined,
        sideBClientId: undefined as string | undefined,
        rentedSlots: 0
    }));

    contracts.forEach(contract => {
        if (contract.status !== 'Active') return;
        const endDate = new Date(contract.endDate);
        if (endDate < today) return;

        const boardIndex = resetBillboards.findIndex(b => b.id === contract.billboardId);
        if (boardIndex === -1) return;

        const board = resetBillboards[boardIndex];

        if (board.type === BillboardType.Static) {
            if (contract.side === 'A' || contract.details.includes('Side A') || contract.details.includes('Side A & B')) {
                board.sideAStatus = 'Rented';
                board.sideAClientId = contract.clientId;
            }
            if (contract.side === 'B' || contract.details.includes('Side B') || contract.details.includes('Side A & B')) {
                board.sideBStatus = 'Rented';
                board.sideBClientId = contract.clientId;
            }
            if (contract.side === 'Both') {
                board.sideAStatus = 'Rented';
                board.sideBStatus = 'Rented';
                board.sideAClientId = contract.clientId;
                board.sideBClientId = contract.clientId;
            }
        } else if (board.type === BillboardType.LED) {
            board.rentedSlots = Math.min((board.rentedSlots || 0) + 1, board.totalSlots || 10);
        }
    });

    billboards = resetBillboards;
    saveToStorage(STORAGE_KEYS.BILLBOARDS, billboards);
};

syncBillboardAvailability();

export const createSystemBackup = () => {
    const now = new Date().toLocaleString();
    lastBackupDate = now;
    saveToStorage(STORAGE_KEYS.LAST_BACKUP, lastBackupDate);
    
    return JSON.stringify({
        version: currentDataVersion,
        timestamp: new Date().toISOString(),
        data: {
            billboards, contracts, clients, invoices, expenses, 
            users, outsourcedBillboards, auditLogs, printingJobs, maintenanceLogs, companyLogo, companyProfile
        }
    }, null, 2);
};

export const recordCloudSync = async () => {
    const now = new Date().toLocaleString();
    
    // 1. Create Backup Blob
    const backupData = {
        timestamp: new Date().toISOString(),
        data: {
            billboards, contracts, clients, invoices, expenses, 
            users, outsourcedBillboards, auditLogs, printingJobs, maintenanceLogs, companyLogo, companyProfile
        }
    };
    
    // 2. Save Metadata Locally
    saveToStorage(STORAGE_KEYS.CLOUD_MIRROR, backupData, false); // Don't trigger standard sync yet
    lastCloudSyncDate = now;
    saveToStorage(STORAGE_KEYS.LAST_CLOUD_SYNC, lastCloudSyncDate, false);
    
    // 3. Perform Full Remote Push (Synchronize all tables)
    if(remoteApiUrl) {
        try {
            await forcePushToRemote();
            // Also push the metadata blob for good measure
            pushToRemote('full_backup', backupData);
            logAction('Cloud Sync', 'Restore Point: Full database synchronization completed.');
        } catch (e) {
            logAction('Cloud Sync', 'Restore Point Failed: Could not push to remote.');
            throw e;
        }
    } else {
        logAction('Cloud Sync', 'Local snapshot created (No Remote API Configured)');
    }
    
    return now;
};

export const restoreDefaultBillboards = () => { return 0; };

export const triggerAutoBackup = () => {
    const backupData = {
        timestamp: new Date().toISOString(),
        data: {
            billboards, contracts, clients, invoices, expenses, 
            users, outsourcedBillboards, auditLogs, printingJobs, maintenanceLogs, companyLogo, companyProfile
        }
    };
    saveToStorage(STORAGE_KEYS.AUTO_BACKUP, backupData);
    return new Date().toLocaleString();
};

export const runAutoBilling = () => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    let generatedCount = 0;

    if (!contracts || contracts.length === 0) return 0;

    // Group active contracts by Client ID
    const contractsByClient: { [key: string]: Contract[] } = {};
    
    contracts.forEach(contract => {
        if (contract.status === 'Active') {
            if (!contractsByClient[contract.clientId]) contractsByClient[contract.clientId] = [];
            contractsByClient[contract.clientId].push(contract);
        }
    });

    // Process each client
    Object.keys(contractsByClient).forEach(clientId => {
        const clientContracts = contractsByClient[clientId];
        const client = clients.find(c => c.id === clientId);
        if (!client) return;

        const billDay = client.billingDay || 28; // Default to 28th if not set
        
        // Safety check for days in month
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const effectiveBillDay = Math.min(billDay, daysInMonth);
        
        if (today.getDate() < effectiveBillDay) return;

        // Check if already billed for this month
        const alreadyBilled = invoices.some(inv => {
            if (inv.clientId !== clientId) return false;
            if (inv.type !== 'Invoice') return false;
            
            const invDate = new Date(inv.date);
            const isSameMonth = invDate.getMonth() === currentMonth && invDate.getFullYear() === currentYear;
            
            if (!isSameMonth) return false;
            
            if (inv.contractIds) {
                return inv.contractIds.some(id => clientContracts.map(c => c.id).includes(id));
            }
            if (inv.contractId) {
                return clientContracts.map(c => c.id).includes(inv.contractId);
            }
            return false; 
        });

        if (!alreadyBilled) {
            // Set Invoice Date to the billing day
            const invoiceDate = new Date(currentYear, currentMonth, effectiveBillDay);
            const invoiceDateStr = invoiceDate.toISOString().split('T')[0];

            // Create ONE consolidated invoice
            const invoiceItems: { description: string; amount: number }[] = [];
            const linkedContractIds: string[] = [];
            let totalSubtotal = 0;
            let hasVat = false;

            clientContracts.forEach(contract => {
                const billboard = billboards.find(b => b.id === contract.billboardId);
                const desc = `Rental: ${billboard?.name || 'Billboard'} (${contract.details})`;
                
                invoiceItems.push({ 
                    description: `${desc} - ${today.toLocaleDateString('default', { month: 'long', year: 'numeric' })}`, 
                    amount: contract.monthlyRate 
                });
                
                totalSubtotal += contract.monthlyRate;
                linkedContractIds.push(contract.id);
                if (contract.hasVat) hasVat = true; 
            });

            if (totalSubtotal > 0) {
                const vatAmount = hasVat ? totalSubtotal * VAT_RATE : 0;
                
                const newInvoice: Invoice = {
                    id: `INV-AUTO-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`,
                    contractIds: linkedContractIds,
                    clientId: clientId,
                    date: invoiceDateStr,
                    items: invoiceItems,
                    subtotal: totalSubtotal,
                    vatAmount: vatAmount,
                    total: totalSubtotal + vatAmount,
                    status: 'Pending',
                    type: 'Invoice'
                };

                invoices = [newInvoice, ...invoices];
                generatedCount++;
            }
        }
    });

    if (generatedCount > 0) {
        saveToStorage(STORAGE_KEYS.INVOICES, invoices);
        logAction('Auto-Billing', `Generated ${generatedCount} consolidated invoices for ${today.toLocaleDateString('default', { month: 'long' })}.`);
    }
    return generatedCount;
};

export const runMaintenanceScheduler = () => {
    let generatedTasks = 0;
    const today = new Date();
    
    billboards.forEach(billboard => {
        const assetLogs = maintenanceLogs
            .filter(l => l.billboardId === billboard.id)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
        const lastLog = assetLogs[0];
        let shouldSchedule = false;
        
        if (!lastLog) {
            shouldSchedule = true;
        } else {
            const lastDate = new Date(lastLog.date);
            const threeMonthsLater = new Date(lastDate);
            threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
            if (today >= threeMonthsLater) {
                shouldSchedule = true;
            }
        }
        
        const hasPending = assetLogs.some(l => l.status === 'Needs Attention');
        const isAlreadyScheduled = lastLog && (lastLog.status === 'Needs Attention' || (lastLog as any).status === 'Scheduled');

        if (shouldSchedule && !isAlreadyScheduled && !hasPending) {
            const nextDue = new Date(); 
            const newLog: MaintenanceLog = {
                id: `MNT-AUTO-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                billboardId: billboard.id,
                date: nextDue.toISOString().split('T')[0],
                type: 'Structural',
                technician: 'Unassigned',
                notes: 'Automated System: 3-Month Structural Safety Check Due',
                status: 'Needs Attention',
                nextDueDate: nextDue.toISOString().split('T')[0]
            };
            
            maintenanceLogs = [newLog, ...maintenanceLogs];
            generatedTasks++;
        }
    });

    if (generatedTasks > 0) {
        saveToStorage(STORAGE_KEYS.MAINTENANCE, maintenanceLogs);
        logAction('Maintenance Scheduler', `Auto-generated ${generatedTasks} structural check tasks.`);
    }
    return generatedTasks;
};

export const getAutoBackupStatus = () => {
    const autoBackup = loadFromStorage(STORAGE_KEYS.AUTO_BACKUP, null);
    return autoBackup ? new Date(autoBackup.timestamp).toLocaleString() : 'None';
};

export const getLastManualBackupDate = () => lastBackupDate;
export const getLastCloudSyncDate = () => lastCloudSyncDate;

export const restoreSystemBackup = (jsonString: string): boolean => {
    try {
        const backup = JSON.parse(jsonString);
        if(!backup.data) throw new Error("Invalid Backup Format");
        
        saveToStorage(STORAGE_KEYS.BILLBOARDS, backup.data.billboards || []);
        saveToStorage(STORAGE_KEYS.CONTRACTS, backup.data.contracts || []);
        saveToStorage(STORAGE_KEYS.CLIENTS, backup.data.clients || []);
        saveToStorage(STORAGE_KEYS.INVOICES, backup.data.invoices || []);
        saveToStorage(STORAGE_KEYS.EXPENSES, backup.data.expenses || []);
        saveToStorage(STORAGE_KEYS.USERS, backup.data.users || []);
        saveToStorage(STORAGE_KEYS.OUTSOURCED, backup.data.outsourcedBillboards || []);
        saveToStorage(STORAGE_KEYS.LOGS, backup.data.auditLogs || []);
        saveToStorage(STORAGE_KEYS.PRINTING, backup.data.printingJobs || []);
        saveToStorage(STORAGE_KEYS.MAINTENANCE, backup.data.maintenanceLogs || []);
        saveToStorage(STORAGE_KEYS.LOGO, backup.data.companyLogo || '');
        saveToStorage(STORAGE_KEYS.PROFILE, backup.data.companyProfile || DEFAULT_PROFILE);

        return true;
    } catch(e) {
        console.error("Restore failed:", e);
        return false;
    }
};

export const RELEASE_NOTES = [
    {
        version: '2.1.5',
        date: '21/8/2025',
        title: 'Billing & Sync Improvements',
        features: [
            'Billing: Invoices now generated with precise billing dates matching client preferences.',
            'Cloud Sync: "Restore Point" now performs a full database synchronization to the Neon-backed API.',
            'Fixes: Improved date handling for short months in auto-billing.'
        ]
    },
    {
        version: '2.1.4',
        date: '20/8/2025',
        title: 'Reliable Cloud Sync',
        features: [
            'Bulk Import: Improved stability for large imports (e.g. 48+ billboards) ensuring they are synced to cloud.',
            'Data Integrity: Added asynchronous verification for batch operations.',
            'Core: Optimized backend synchronization to handle network delays gracefully.'
        ]
    },
    {
        version: '2.1.3',
        date: '20/8/2025',
        title: 'Selection Bug Fixes',
        features: [
            'Fixed an issue where billboards were not selectable in Rentals and Outsourced modules.',
            'Improved data synchronization reliability for dropdown menus.',
            'Fixed layout issues causing click blocking on selection inputs.'
        ]
    },
    {
        version: '2.1.2',
        date: '19/8/2025',
        title: 'Inventory Bulk Operations',
        features: [
            'Batch Edit: Select multiple assets to update Town or reset Status in one go.',
            'Batch Delete: Bulk deletion capability for managing inventory cleanup.',
            'UI: Added selection checkboxes and sticky action bar to Billboard inventory.'
        ]
    }
];

export const getBillboards = () => billboards || [];
export const getContracts = () => contracts || [];
export const getInvoices = () => invoices || [];
export const getExpenses = () => expenses || [];
export const getAuditLogs = () => auditLogs || [];
export const getUsers = () => users || [];
export const getClients = () => clients || [];
export const getOutsourcedBillboards = () => outsourcedBillboards || [];
export const getMaintenanceLogs = () => maintenanceLogs || [];
export const getCompanyLogo = () => companyLogo;
export const getCompanyProfile = () => companyProfile;

export const resetSystemData = () => {
    localStorage.clear();
    window.location.reload();
};

export const findUserByEmail = (email: string) => users.find(u => u.email.toLowerCase() === email.toLowerCase());

export const getPendingInvoices = () => invoices.filter(inv => inv.status === 'Pending' && inv.type === 'Invoice');

export const getClientFinancials = (clientId: string) => {
    const clientInvoices = invoices.filter(i => i.clientId === clientId && i.type === 'Invoice');
    const clientReceipts = invoices.filter(i => i.clientId === clientId && i.type === 'Receipt');
    const totalBilled = clientInvoices.reduce((acc, curr) => acc + curr.total, 0);
    const totalPaid = clientReceipts.reduce((acc, curr) => acc + curr.total, 0);
    return { totalBilled, totalPaid, balance: totalBilled - totalPaid };
};

export const getTransactions = (clientId: string) => invoices.filter(i => i.clientId === clientId && (i.type === 'Invoice' || i.type === 'Receipt')).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

export const getNextBillingDetails = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    const activeContracts = contracts.filter(c => c.clientId === clientId && c.status === 'Active');
    const today = new Date();
    let earliestDate: Date | null = null;
    let totalAmount = 0;
    const billDays = new Set<number>();

    if (client && client.billingDay) {
         billDays.add(client.billingDay);
         let targetDate = new Date(today.getFullYear(), today.getMonth(), client.billingDay);
         if (targetDate <= today) targetDate = new Date(today.getFullYear(), today.getMonth() + 1, client.billingDay);
         earliestDate = targetDate;
         totalAmount = activeContracts.reduce((acc, c) => acc + c.monthlyRate, 0);
    } else {
        if (activeContracts.length === 0) return null;
        activeContracts.forEach(c => {
            const start = new Date(c.startDate);
            const day = start.getDate();
            billDays.add(day);
            let targetDate = new Date(today.getFullYear(), today.getMonth(), day);
            if (targetDate <= today) targetDate = new Date(today.getFullYear(), today.getMonth() + 1, day);
            if (!earliestDate || targetDate < earliestDate) earliestDate = targetDate;
            totalAmount += c.monthlyRate;
        });
    }
    if (totalAmount === 0 && activeContracts.length === 0) return null;
    return { date: earliestDate ? earliestDate.toLocaleDateString() : 'N/A', amount: totalAmount, days: Array.from(billDays).sort((a,b) => a-b) };
};

export const getUpcomingBillings = () => {
    const results: { clientName: string; date: string; amount: number; day: string }[] = [];
    clients.forEach(client => {
        const details = getNextBillingDetails(client.id);
        if (details && details.date !== 'N/A') {
            const formattedDays = details.days.map(d => {
                const j = d % 10, k = d % 100;
                if (j === 1 && k !== 11) return d + "st";
                if (j === 2 && k !== 12) return d + "nd";
                if (j === 3 && k !== 13) return d + "rd";
                return d + "th";
            }).join(', ');
            results.push({ clientName: client.companyName, date: details.date, amount: details.amount, day: formattedDays });
        }
    });
    return results.sort((a, b) => new Date(a.date).getTime() - new Date(a.date).getTime());
};

export const getExpiringContracts = () => {
    const today = new Date();
    const thirtyDaysOut = new Date();
    thirtyDaysOut.setDate(today.getDate() + 30);
    return contracts.filter(c => {
        const endDate = new Date(c.endDate);
        return endDate >= today && endDate <= thirtyDaysOut && c.status === 'Active';
    });
};

export const getOverdueInvoices = () => invoices.filter(i => i.status === 'Pending' || i.status === 'Overdue');
export const getSystemAlertCount = () => getExpiringContracts().length + getOverdueInvoices().length + maintenanceLogs.filter(l => new Date(l.nextDueDate) <= new Date() || l.status === 'Needs Attention').length;

export const getFinancialTrends = () => {
    const today = new Date();
    const result = [];
    
    for (let i = 5; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthName = d.toLocaleString('default', { month: 'short' });
        const year = d.getFullYear();
        const monthIndex = d.getMonth();

        const monthlyRevenue = invoices
            .filter(inv => {
                const invDate = new Date(inv.date);
                return inv.type === 'Invoice' && invDate.getMonth() === monthIndex && invDate.getFullYear() === year;
            })
            .reduce((acc, curr) => acc + curr.total, 0);

        const monthlyExpenses = expenses
            .filter(exp => {
                const expDate = new Date(exp.date);
                return expDate.getMonth() === monthIndex && expDate.getFullYear() === year;
            })
            .reduce((acc, curr) => acc + curr.amount, 0);
            
        const monthlyPrinting = printingJobs
            .filter(job => {
                const jobDate = new Date(job.date);
                return jobDate.getMonth() === monthIndex && jobDate.getFullYear() === year;
            })
            .reduce((acc, curr) => acc + curr.totalCost, 0);

        const totalExpenses = monthlyExpenses + monthlyPrinting;

        result.push({
            name: monthName,
            revenue: monthlyRevenue,
            expenses: totalExpenses,
            margin: monthlyRevenue - totalExpenses
        });
    }

    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const activeContractRevenue = contracts
        .filter(c => c.status === 'Active').reduce((acc, c) => acc + c.monthlyRate, 0);
    
    const avgExpenses = result.slice(-3).reduce((acc, curr) => acc + curr.expenses, 0) / 3 || 0;

    result.push({
        name: nextMonth.toLocaleString('default', { month: 'short' }) + ' (Proj)',
        revenue: activeContractRevenue,
        expenses: Math.round(avgExpenses),
        margin: activeContractRevenue - Math.round(avgExpenses),
        isProjection: true
    });

    return result;
};

// -- Data Accessors --
// Removed duplicate deleteFromRemote declaration

export const addBillboard = (billboard: Billboard) => { 
    billboards = [...billboards, billboard]; 
    saveToStorage(STORAGE_KEYS.BILLBOARDS, billboards); 
    logAction('Create Billboard', `Added ${billboard.name} (${billboard.type})`); 
};

// New Bulk Operation
export const bulkAddBillboards = async (newBoards: Billboard[]) => {
    if (newBoards.length === 0) return;
    billboards = [...billboards, ...newBoards];
    await saveToStorage(STORAGE_KEYS.BILLBOARDS, billboards); // Await sync
    logAction('Bulk Import', `Imported ${newBoards.length} billboards`);
};

// Bulk Update for properties (Used by Batch Actions)
export const bulkUpdateBillboards = (updatedBoards: Billboard[]) => {
    if (updatedBoards.length === 0) return;
    
    // Create a map for faster lookup
    const updateMap = new Map(updatedBoards.map(b => [b.id, b]));
    
    billboards = billboards.map(b => updateMap.get(b.id) || b);
    saveToStorage(STORAGE_KEYS.BILLBOARDS, billboards);
    logAction('Bulk Update', `Batch updated ${updatedBoards.length} billboards`);
};

export const updateBillboard = (updated: Billboard) => { 
    billboards = billboards.map(b => b.id === updated.id ? updated : b); 
    saveToStorage(STORAGE_KEYS.BILLBOARDS, billboards); 
    logAction('Update Billboard', `Updated details for ${updated.name}`); 
};
export const deleteBillboard = (id: string) => { 
    const target = billboards.find(b => b.id === id); 
    if (target) { 
        billboards = billboards.filter(b => b.id !== id); 
        saveToStorage(STORAGE_KEYS.BILLBOARDS, billboards); 
        deleteFromRemote('billboards', id);
        logAction('Delete Billboard', `Removed ${target.name} from inventory`);
    }
};

export const addContract = (contract: Contract) => { 
    contracts = [...contracts, contract]; 
    saveToStorage(STORAGE_KEYS.CONTRACTS, contracts); 
    syncBillboardAvailability();
    logAction('Create Contract', `New contract for ${contract.billboardId}`); 
};

export const bulkAddContracts = async (newContracts: Contract[]) => {
    if (newContracts.length === 0) return;
    contracts = [...contracts, ...newContracts];
    await saveToStorage(STORAGE_KEYS.CONTRACTS, contracts);
    syncBillboardAvailability();
    logAction('Bulk Import', `Imported ${newContracts.length} contracts`);
};

export const deleteContract = (id: string) => {
    const contract = contracts.find(c => c.id === id);
    if(contract) {
        contracts = contracts.filter(c => c.id !== id);
        saveToStorage(STORAGE_KEYS.CONTRACTS, contracts);
        deleteFromRemote('contracts', id);
        syncBillboardAvailability();
        logAction('Delete Contract', `Removed contract ${id}`);
    }
};

export const addInvoice = (invoice: Invoice) => { invoices = [invoice, ...invoices]; saveToStorage(STORAGE_KEYS.INVOICES, invoices); logAction('Create Invoice', `Created ${invoice.type} #${invoice.id} ($${invoice.total})`); };
export const markInvoiceAsPaid = (id: string) => { invoices = invoices.map(i => i.id === id ? { ...i, status: 'Paid' } : i); saveToStorage(STORAGE_KEYS.INVOICES, invoices); logAction('Payment', `Marked Invoice #${id} as Paid`); };
export const addExpense = (expense: Expense) => { expenses = [expense, ...expenses]; saveToStorage(STORAGE_KEYS.EXPENSES, expenses); logAction('Expense', `Recorded expense: ${expense.description} ($${expense.amount})`); };

export const addClient = (client: Client) => { 
    clients = [...clients, client]; 
    saveToStorage(STORAGE_KEYS.CLIENTS, clients); 
    logAction('Create Client', `Added ${client.companyName}`); 
};

export const bulkAddClients = async (newClients: Client[]) => {
    if (newClients.length === 0) return;
    clients = [...clients, ...newClients];
    await saveToStorage(STORAGE_KEYS.CLIENTS, clients);
    logAction('Bulk Import', `Imported ${newClients.length} clients`);
};

export const updateClient = (updated: Client) => {
    clients = clients.map(c => c.id === updated.id ? updated : c);
    saveToStorage(STORAGE_KEYS.CLIENTS, clients);
    logAction('Update Client', `Updated info for ${updated.companyName}`);
};
export const deleteClient = (id: string) => { 
    const target = clients.find(c => c.id === id); 
    if (target) { 
        clients = clients.filter(c => c.id !== id); 
        saveToStorage(STORAGE_KEYS.CLIENTS, clients); 
        deleteFromRemote('clients', id);
        logAction('Delete Client', `Removed ${target.companyName}`); 
    }
};
export const addUser = (user: User) => { users = [...users, user]; saveToStorage(STORAGE_KEYS.USERS, users); logAction('User Mgmt', `Added user ${user.email}`); };
export const updateUser = (updated: User) => { users = users.map(u => u.id === updated.id ? updated : u); saveToStorage(STORAGE_KEYS.USERS, users); logAction('User Mgmt', `Updated user ${updated.email}`); };
export const deleteUser = (id: string) => { 
    users = users.filter(u => u.id !== id); 
    saveToStorage(STORAGE_KEYS.USERS, users); 
    deleteFromRemote('users', id);
    logAction('User Mgmt', `Deleted user ID ${id}`); 
};
export const addOutsourcedBillboard = (b: OutsourcedBillboard) => { outsourcedBillboards = [...outsourcedBillboards, b]; saveToStorage(STORAGE_KEYS.OUTSOURCED, outsourcedBillboards); logAction('Outsourcing', `Added outsourced unit ${b.billboardId}`); };
export const updateOutsourcedBillboard = (updated: OutsourcedBillboard) => { outsourcedBillboards = outsourcedBillboards.map(b => b.id === updated.id ? updated : b); saveToStorage(STORAGE_KEYS.OUTSOURCED, outsourcedBillboards); };
export const deleteOutsourcedBillboard = (id: string) => { outsourcedBillboards = outsourcedBillboards.filter(b => b.id !== id); saveToStorage(STORAGE_KEYS.OUTSOURCED, outsourcedBillboards); };

export const addMaintenanceLog = (log: MaintenanceLog) => {
    maintenanceLogs = [log, ...maintenanceLogs];
    saveToStorage(STORAGE_KEYS.MAINTENANCE, maintenanceLogs);
    logAction('Maintenance', `Logged ${log.type} for billboard ${log.billboardId}`);
    
    if (log.cost && log.cost > 0) {
        addExpense({
            id: `EXP-M-${log.id}`,
            category: 'Maintenance',
            description: `${log.type} for Asset`,
            amount: log.cost,
            date: log.date,
            reference: log.id
        });
    }
};

export { 
  billboards as mockBillboards,
  clients as mockClients,
  contracts as mockContracts,
  invoices as mockInvoices,
  expenses as mockExpenses,
  printingJobs as mockPrintingJobs,
  outsourcedBillboards as mockOutsourcedBillboards
};