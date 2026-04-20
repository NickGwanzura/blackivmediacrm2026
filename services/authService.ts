import { User } from '../types';
import { getApiConfig } from './mockData';

// --- Cache of the current user -------------------------------------------
// Source of truth is always the server (via /auth/me). The localStorage copy
// is only used as a hydration hint to avoid sidebar flicker on first paint.
// No sensitive fields are cached (no password, no token — cookies are HttpOnly).
const CACHE_KEY = 'bim_current_user';

let currentUser: User | null = (() => {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        // Strip anything sensitive that an older version may have stored.
        if (parsed && typeof parsed === 'object' && 'password' in parsed) delete parsed.password;
        return parsed;
    } catch {
        return null;
    }
})();

const setCachedUser = (user: User | null) => {
    currentUser = user;
    try {
        if (user) {
            const { password, ...safe } = user as any; // defensive
            localStorage.setItem(CACHE_KEY, JSON.stringify(safe));
        } else {
            localStorage.removeItem(CACHE_KEY);
        }
    } catch { /* ignore */ }

    // Notify the rest of the codebase about the current user (e.g. mockData's
    // audit logger reads this). Lazy import avoids a circular dependency.
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require('./mockData');
        if (mod && typeof mod.setCurrentUserRef === 'function') {
            mod.setCurrentUserRef(user);
        }
    } catch { /* best-effort */ }
};

const authBase = () => {
    const { url } = getApiConfig();
    return url || '';
};

type AuthError = Error & { status?: number };

const throwFromResponse = async (res: Response): Promise<never> => {
    let message = `HTTP ${res.status}`;
    try {
        const body = await res.json();
        if (body && body.error) message = body.error;
    } catch { /* ignore */ }
    const err: AuthError = new Error(message);
    err.status = res.status;
    throw err;
};

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${authBase()}${path}`, {
        ...init,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...(init.headers || {}),
        },
    });
    return res;
}

// --- Public API -----------------------------------------------------------

export const login = async (email: string, password: string): Promise<User> => {
    const res = await authFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok) await throwFromResponse(res);
    const data = await res.json();
    setCachedUser(data.user);
    return data.user;
};

export const register = async (
    firstName: string,
    lastName: string,
    email: string,
    password: string,
): Promise<void> => {
    const res = await authFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ firstName, lastName, email, password }),
    });
    if (!res.ok) await throwFromResponse(res);
    // Success returns { user } with status=Pending, but we intentionally
    // don't sign the user in — they must be approved first.
};

export const logout = async (): Promise<void> => {
    try {
        await authFetch('/auth/logout', { method: 'POST' });
    } catch { /* ignore network errors on logout */ }
    setCachedUser(null);
};

export const getCurrentUserAsync = async (): Promise<User | null> => {
    try {
        const res = await authFetch('/auth/me', { method: 'GET' });
        if (res.status === 401) {
            setCachedUser(null);
            return null;
        }
        if (!res.ok) return currentUser; // transient error — keep cache
        const data = await res.json();
        setCachedUser(data.user);
        return data.user;
    } catch {
        // Network blip — return whatever we have cached.
        return currentUser;
    }
};

export const getCurrentUser = (): User | null => currentUser;

export const requestPasswordReset = async (email: string): Promise<void> => {
    // Server returns 204 whether or not the email exists.
    await authFetch('/auth/reset-request', {
        method: 'POST',
        body: JSON.stringify({ email }),
    });
};

export const confirmPasswordReset = async (token: string, newPassword: string): Promise<User> => {
    const res = await authFetch('/auth/reset-confirm', {
        method: 'POST',
        body: JSON.stringify({ token, password: newPassword }),
    });
    if (!res.ok) await throwFromResponse(res);
    const data = await res.json();
    setCachedUser(data.user);
    return data.user;
};

export const changePassword = async (current: string, next: string): Promise<User> => {
    const res = await authFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    if (!res.ok) await throwFromResponse(res);
    const data = await res.json();
    setCachedUser(data.user);
    return data.user;
};

// Used by Settings → Approve button.
export const approveUser = async (userId: string): Promise<User> => {
    const res = await authFetch(`/auth/approve/${encodeURIComponent(userId)}`, {
        method: 'POST',
    });
    if (!res.ok) await throwFromResponse(res);
    const data = await res.json();
    return data.user;
};

// Used by Settings → Invite modal. Replaces the old client-side addUser flow
// for the "create a new account with a temporary password" case.
export const inviteUser = async (
    firstName: string,
    lastName: string,
    email: string,
    role: User['role'],
): Promise<User> => {
    const res = await authFetch('/auth/invite', {
        method: 'POST',
        body: JSON.stringify({ firstName, lastName, email, role }),
    });
    if (!res.ok) await throwFromResponse(res);
    const data = await res.json();
    return data.user;
};
