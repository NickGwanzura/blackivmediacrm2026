
import { User } from '../types';
import { getUsers, addUser, findUserByEmail, pullFromRemote } from './mockData';

// Simulated delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const login = async (email: string, password: string): Promise<User | null> => {
    // CRITICAL FIX: Pull latest data (especially user statuses) from backend before validating
    // This ensures that if an Admin approved the user on another device, this device knows about it.
    try {
        await pullFromRemote(false);
    } catch (e) {
        console.warn("Pre-login sync failed, checking local cache only.");
    }

    await delay(1000); 
    const user = findUserByEmail(email);
    
    if (user && user.password === password) {
        // Double check status after fresh pull
        if (user.status === 'Pending') {
            throw new Error("Account is pending administrator approval.");
        }
        if (user.status === 'Denied') {
            throw new Error("Account has been deactivated.");
        }
        localStorage.setItem('billboard_user', JSON.stringify(user));
        return user;
    }
    
    return null;
};

export const register = async (firstName: string, lastName: string, email: string, password: string): Promise<void> => {
    await delay(2000); // Network delay
    
    // Ensure we have latest users before checking duplicates
    try { await pullFromRemote(false); } catch(e) {}

    const existing = findUserByEmail(email);
    if (existing) {
        throw new Error("Email already registered");
    }

    const newUser: User = {
        id: Date.now().toString(),
        firstName,
        lastName,
        email,
        password,
        role: 'Manager', // Default role for external sign-ups
        status: 'Pending' // Requires admin approval
    };

    // Store user but don't log them in
    addUser(newUser);
    console.log(`[AUTH] Registration Pending Approval for: ${email}`);
};

export const resetPassword = async (email: string): Promise<void> => {
    await delay(2000);
    const user = findUserByEmail(email);
    if (!user) {
        // Security: don't reveal existence
        console.warn(`[AUTH] Password reset requested for unknown email: ${email}`);
        return;
    }
    console.log(`[AUTH] Password Reset Link Sent to: ${email}`);
    return;
};

export const logout = () => {
    localStorage.removeItem('billboard_user');
};

export const getCurrentUser = (): User | null => {
    const stored = localStorage.getItem('billboard_user');
    return stored ? JSON.parse(stored) : null;
};
