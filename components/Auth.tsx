
import React, { useEffect, useState } from 'react';
import { login, register, requestPasswordReset, confirmPasswordReset } from '../services/authService';
import { RELEASE_NOTES } from '../services/mockData';
import { User, Lock, Mail, ArrowRight, Loader2, ArrowLeft, Send, ShieldAlert, CheckCircle } from 'lucide-react';

interface AuthProps {
    onLogin: () => void;
}

type AuthMode = 'login' | 'register' | 'forgot' | 'verify_email' | 'email_sent' | 'pending_approval' | 'reset_confirm' | 'reset_success';

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
    const [mode, setMode] = useState<AuthMode>('login');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // Form State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [resetToken, setResetToken] = useState<string | null>(null);

    // Detect ?reset=<token> on mount and switch into the reset-confirm flow.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('reset');
        if (token) {
            setResetToken(token);
            setMode('reset_confirm');
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');
        setIsLoading(true);

        try {
            if (mode === 'login') {
                const user = await login(email, password);
                if (user) onLogin();
            } else if (mode === 'register') {
                if (!firstName || !lastName) {
                    setError('Please fill in all fields');
                    setIsLoading(false);
                    return;
                }
                await register(firstName, lastName, email, password);
                setMode('pending_approval');
            } else if (mode === 'forgot') {
                await requestPasswordReset(email);
                setMode('email_sent');
            } else if (mode === 'reset_confirm') {
                if (!resetToken) {
                    setError('Missing reset token');
                    setIsLoading(false);
                    return;
                }
                await confirmPasswordReset(resetToken, newPassword);
                setMode('reset_success');
                // Clean up URL so refresh doesn't re-enter reset flow.
                try {
                    const url = new URL(window.location.href);
                    url.searchParams.delete('reset');
                    window.history.replaceState({}, document.title, url.toString());
                } catch { /* ignore */ }
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const toggleMode = (newMode: AuthMode) => {
        setMode(newMode);
        setError('');
        setSuccessMessage('');
        setPassword('');
        setNewPassword('');
    };

    const renderPendingScreen = () => (
        <div className="text-center space-y-6 animate-fade-in">
            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                <ShieldAlert size={32} />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Registration Pending</h2>
                <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                    Your account has been created successfully. However, for security reasons, all new accounts require <span className="font-bold text-slate-700">Administrator Approval</span> before you can log in.
                </p>
                <p className="text-slate-500 mt-4 text-sm">
                    You'll receive an email once your account is approved.
                </p>
            </div>
            <div className="pt-4">
                <button onClick={() => toggleMode('login')} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold uppercase tracking-wider text-xs hover:bg-slate-800 transition-all">Back to Login</button>
            </div>
        </div>
    );

    const renderSentScreen = () => (
        <div className="text-center space-y-6 animate-fade-in">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                <Send size={28} className="ml-1" />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Check your inbox</h2>
                <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                    If an account exists for <span className="font-bold text-slate-700">{email}</span>, we've sent instructions to reset your password. The link expires in one hour.
                </p>
            </div>
            <div className="pt-4">
                <button onClick={() => toggleMode('login')} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold uppercase tracking-wider text-xs hover:bg-slate-800 transition-all">Back to Login</button>
            </div>
        </div>
    );

    const renderResetSuccessScreen = () => (
        <div className="text-center space-y-6 animate-fade-in">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle size={32} />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Password updated</h2>
                <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                    Your password has been changed. You're now signed in.
                </p>
            </div>
            <div className="pt-4">
                <button onClick={onLogin} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold uppercase tracking-wider text-xs hover:bg-slate-800 transition-all">Continue</button>
            </div>
        </div>
    );

    const screenMode = mode === 'pending_approval' || mode === 'email_sent' || mode === 'reset_success';

    return (
        <div className="min-h-screen w-full flex bg-white font-sans relative">
            {/* Version Badge - Premium Box with Changelog */}
            <div className="absolute bottom-6 left-6 z-50 bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 p-5 rounded-3xl shadow-2xl flex flex-col gap-0 max-w-sm transition-all duration-500 cursor-default group hidden lg:flex hover:bg-black hover:border-zinc-700 hover:shadow-orange-900/20">
                <div className="flex items-center gap-4 mb-1">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white font-black text-xl shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shrink-0">
                        v{RELEASE_NOTES[0].version.split('.')[0]}
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Latest Update</p>
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                        </div>
                        <p className="text-base font-bold text-white tracking-tight leading-none group-hover:text-orange-50 transition-colors">{RELEASE_NOTES[0].title}</p>
                        <p className="text-xs text-zinc-600 font-mono mt-1 group-hover:text-zinc-500 transition-colors">v{RELEASE_NOTES[0].version} • {RELEASE_NOTES[0].date}</p>
                    </div>
                </div>

                {/* Expandable Changelog */}
                <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
                    <div className="overflow-hidden">
                        <div className="pt-4 mt-2 border-t border-zinc-800/50">
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2 pl-1">What's New</p>
                            <ul className="space-y-2.5">
                                {RELEASE_NOTES[0].features.map((feature, idx) => (
                                    <li key={idx} className="text-xs text-zinc-400 flex items-start gap-2.5 leading-relaxed group/item hover:text-zinc-200 transition-colors">
                                        <span className="mt-1.5 w-1 h-1 rounded-full bg-orange-500 shrink-0 group-hover/item:scale-150 transition-transform"></span>
                                        <span>{feature}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* Left Side - Brand Visual */}
            <div className="hidden lg:flex w-1/2 bg-black relative items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-800/20 via-black to-black opacity-50"></div>

                <div className="relative z-10 flex flex-col items-center">
                    <div className="text-center">
                        <h1 className="text-6xl font-black text-white tracking-tighter mb-6 leading-tight select-none">
                          COMMAND <br/> THE <span className="text-orange-500">VIEW.</span>
                        </h1>
                        <p className="text-zinc-500 text-lg max-w-md mx-auto leading-relaxed">
                            The ultimate operating system for premium outdoor advertising management.
                        </p>
                    </div>
                </div>
            </div>

            {/* Right Side - Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white relative">
                <div className="w-full max-w-md">
                    {/* Mobile Logo Fallback */}
                    <div className="lg:hidden mb-12 text-center">
                        <h1 className="text-4xl font-black text-slate-900 tracking-tighter leading-tight select-none">
                            COMMAND <span className="text-orange-500">THE VIEW</span>
                        </h1>
                    </div>

                    {mode === 'pending_approval' ? renderPendingScreen() :
                     mode === 'email_sent' ? renderSentScreen() :
                     mode === 'reset_success' ? renderResetSuccessScreen() : (
                        <>
                            <div className="text-left mb-10">
                                <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">
                                    {mode === 'login' ? 'Welcome back' :
                                     mode === 'register' ? 'Create account' :
                                     mode === 'forgot' ? 'Reset Password' :
                                     'Set a new password'}
                                </h1>
                                <p className="text-slate-500">
                                    {mode === 'login' && 'Enter your credentials to access the dashboard.'}
                                    {mode === 'register' && 'Enter your details to get started.'}
                                    {mode === 'forgot' && 'Enter your email to receive a reset link.'}
                                    {mode === 'reset_confirm' && 'Enter a new password to complete the reset.'}
                                </p>
                            </div>

                            {error && (
                                <div className="bg-red-50 border border-red-100 text-red-600 text-sm p-4 rounded-xl mb-6 flex items-center gap-3 animate-fade-in">
                                    <div className="w-1 h-1 bg-red-500 rounded-full"></div> {error}
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-6">
                                {mode === 'register' && (
                                    <div className="grid grid-cols-2 gap-4 animate-fade-in">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">First Name</label>
                                            <div className="relative">
                                                <User className="absolute left-3 top-3.5 text-slate-400" size={18} />
                                                <input
                                                    type="text"
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-sm font-medium"
                                                    placeholder="John"
                                                    value={firstName}
                                                    onChange={e => setFirstName(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Last Name</label>
                                            <div className="relative">
                                                <User className="absolute left-3 top-3.5 text-slate-400" size={18} />
                                                <input
                                                    type="text"
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-sm font-medium"
                                                    placeholder="Doe"
                                                    value={lastName}
                                                    onChange={e => setLastName(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {mode !== 'reset_confirm' && (
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                                            Email Address
                                        </label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-3.5 text-slate-400" size={18} />
                                            <input
                                                type="email"
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-sm font-medium"
                                                placeholder="name@blackivy.com"
                                                value={email}
                                                onChange={e => setEmail(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>
                                )}

                                {(mode === 'login' || mode === 'register') && (
                                    <div className="space-y-1.5 animate-fade-in">
                                        <div className="flex justify-between items-center">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Password</label>
                                            {mode === 'login' && (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleMode('forgot')}
                                                    className="text-xs text-orange-600 hover:text-orange-700 font-bold transition-colors"
                                                >
                                                    Forgot Password?
                                                </button>
                                            )}
                                        </div>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-3.5 text-slate-400" size={18} />
                                            <input
                                                type="password"
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-sm font-medium"
                                                placeholder="••••••••"
                                                value={password}
                                                onChange={e => setPassword(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>
                                )}

                                {mode === 'reset_confirm' && (
                                    <div className="space-y-1.5 animate-fade-in">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">New password</label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-3.5 text-slate-400" size={18} />
                                            <input
                                                type="password"
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all text-sm font-medium"
                                                placeholder="At least 8 chars, 1 uppercase, 1 digit"
                                                value={newPassword}
                                                onChange={e => setNewPassword(e.target.value)}
                                                required
                                                minLength={8}
                                            />
                                        </div>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full bg-black text-white py-3.5 rounded-xl font-bold uppercase tracking-wider text-sm hover:bg-zinc-900 transition-all transform hover:scale-[1.01] flex items-center justify-center gap-2 mt-6 shadow-xl shadow-black/10"
                                >
                                    {isLoading ? <Loader2 className="animate-spin" size={18} /> : (
                                        mode === 'login' ? 'Sign In' :
                                        mode === 'register' ? 'Create Account' :
                                        mode === 'forgot' ? 'Send Reset Link' :
                                        'Set New Password'
                                    )}
                                    {!isLoading && <ArrowRight size={18} />}
                                </button>
                            </form>

                            {!screenMode && (
                                <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col items-center gap-4">
                                    {(mode === 'forgot' || mode === 'reset_confirm') ? (
                                        <button
                                            onClick={() => toggleMode('login')}
                                            className="text-slate-500 text-sm hover:text-slate-900 font-medium flex items-center justify-center gap-2 mx-auto transition-colors"
                                        >
                                            <ArrowLeft size={16} /> Back to Login
                                        </button>
                                    ) : (
                                        <p className="text-slate-500 text-sm">
                                            {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
                                            <button
                                                onClick={() => toggleMode(mode === 'login' ? 'register' : 'login')}
                                                className="ml-2 text-black font-bold hover:underline focus:outline-none"
                                            >
                                                {mode === 'login' ? 'Register' : 'Login'}
                                            </button>
                                        </p>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
