import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X, Loader2 } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  variant: ToastVariant;
  title?: string;
  message: string;
  duration: number;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
}

interface ToastApi {
  success: (message: string, title?: string) => string;
  error: (message: string, title?: string) => string;
  warning: (message: string, title?: string) => string;
  info: (message: string, title?: string) => string;
  dismiss: (id: string) => void;
  confirm: (opts: ConfirmOptions | string) => Promise<boolean>;
  // showToast is a legacy-style convenience (Dreambox-origin CRM module) that
  // picks the right variant based on type. Retained so ported components can
  // consume `useToast()` without edits.
  showToast: (message: string, type?: ToastVariant, durationMs?: number) => string;
}

const ToastContext = createContext<ToastApi | null>(null);

let imperativeApi: ToastApi | null = null;
export const toast: ToastApi = {
  success: (m, t) => imperativeApi ? imperativeApi.success(m, t) : (console.warn('[toast]', m), ''),
  error:   (m, t) => imperativeApi ? imperativeApi.error(m, t)   : (console.warn('[toast]', m), ''),
  warning: (m, t) => imperativeApi ? imperativeApi.warning(m, t) : (console.warn('[toast]', m), ''),
  info:    (m, t) => imperativeApi ? imperativeApi.info(m, t)    : (console.warn('[toast]', m), ''),
  dismiss: (id) => imperativeApi?.dismiss(id),
  confirm: (opts) => imperativeApi ? imperativeApi.confirm(opts) : Promise.resolve(window.confirm(typeof opts === 'string' ? opts : opts.message)),
  showToast: (m, type = 'info') => imperativeApi ? imperativeApi.showToast(m, type) : (console.warn('[toast]', m), ''),
};

const DEFAULT_DURATION = 4200;

let idCounter = 0;
const nextId = () => `t_${Date.now().toString(36)}_${(++idCounter).toString(36)}`;

const variantStyles: Record<ToastVariant, { border: string; iconWrap: string; Icon: typeof CheckCircle2; accent: string }> = {
  success: { border: 'border-emerald-100', iconWrap: 'bg-emerald-50 text-emerald-600', Icon: CheckCircle2, accent: 'bg-emerald-500' },
  error:   { border: 'border-red-100',     iconWrap: 'bg-red-50 text-red-600',         Icon: AlertCircle,   accent: 'bg-red-500' },
  warning: { border: 'border-amber-100',   iconWrap: 'bg-amber-50 text-amber-600',     Icon: AlertTriangle, accent: 'bg-amber-500' },
  info:    { border: 'border-sky-100',     iconWrap: 'bg-sky-50 text-sky-600',         Icon: Info,          accent: 'bg-sky-500' },
};

const ToastCard: React.FC<{ toast: ToastItem; onClose: () => void }> = ({ toast, onClose }) => {
  const { border, iconWrap, Icon, accent } = variantStyles[toast.variant];
  return (
    <div
      role={toast.variant === 'error' ? 'alert' : 'status'}
      className={`relative flex items-start gap-3 bg-white/95 backdrop-blur-xl shadow-xl shadow-slate-900/5 ${border} border rounded-2xl px-4 py-3 pr-10 w-80 max-w-[calc(100vw-2rem)] overflow-hidden pointer-events-auto animate-toast-in`}
    >
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`} />
      <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${iconWrap}`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        {toast.title && <p className="text-sm font-bold text-slate-900 leading-tight tracking-tight mb-0.5">{toast.title}</p>}
        <p className="text-sm text-slate-600 leading-snug break-words whitespace-pre-line">{toast.message}</p>
      </div>
      <button
        onClick={onClose}
        aria-label="Dismiss"
        className="absolute top-2 right-2 text-slate-400 hover:text-slate-700 p-1 rounded-md transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
};

interface PendingConfirm extends ConfirmOptions {
  id: string;
  resolve: (value: boolean) => void;
}

const ConfirmDialog: React.FC<{ pending: PendingConfirm; onResolve: (v: boolean) => void }> = ({ pending, onResolve }) => {
  const isDanger = pending.variant === 'danger';
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onResolve(false);
      else if (e.key === 'Enter') onResolve(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onResolve]);

  return (
    <div className="fixed inset-0 z-[9998] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-white/20 max-w-md w-full overflow-hidden">
        <div className={`p-5 flex items-center gap-3 ${isDanger ? 'bg-red-50' : 'bg-slate-50'} border-b border-slate-100`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDanger ? 'bg-red-100 text-red-600' : 'bg-slate-200 text-slate-700'}`}>
            <AlertTriangle size={20} />
          </div>
          <h3 className="text-base font-bold text-slate-900 tracking-tight">{pending.title || (isDanger ? 'Confirm Action' : 'Please Confirm')}</h3>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">{pending.message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 bg-slate-50/70 border-t border-slate-100">
          <button
            ref={cancelRef}
            onClick={() => onResolve(false)}
            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
          >
            {pending.cancelLabel || 'Cancel'}
          </button>
          <button
            onClick={() => onResolve(true)}
            className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-white shadow-lg transition-colors ${isDanger ? 'bg-red-600 hover:bg-red-700 shadow-red-500/30' : 'bg-slate-900 hover:bg-slate-800 shadow-slate-900/20'}`}
          >
            {pending.confirmLabel || (isDanger ? 'Delete' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts(ts => ts.filter(t => t.id !== id));
    const handle = timers.current.get(id);
    if (handle) { clearTimeout(handle); timers.current.delete(id); }
  }, []);

  const push = useCallback((variant: ToastVariant, message: string, title?: string): string => {
    const id = nextId();
    const item: ToastItem = { id, variant, message, title, duration: DEFAULT_DURATION };
    setToasts(ts => [item, ...ts].slice(0, 6));
    const handle = setTimeout(() => dismiss(id), item.duration);
    timers.current.set(id, handle);
    return id;
  }, [dismiss]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current.clear(); }, []);

  const confirm = useCallback((opts: ConfirmOptions | string): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const normalized: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts;
      setPending({ ...normalized, id: nextId(), resolve });
    });
  }, []);

  const resolveConfirm = useCallback((value: boolean) => {
    setPending(p => { p?.resolve(value); return null; });
  }, []);

  const api = useMemo<ToastApi>(() => ({
    success: (m, t) => push('success', m, t),
    error:   (m, t) => push('error',   m, t),
    warning: (m, t) => push('warning', m, t),
    info:    (m, t) => push('info',    m, t),
    dismiss,
    confirm,
    showToast: (m, type = 'info') => push(type, m),
  }), [push, dismiss, confirm]);

  useEffect(() => {
    imperativeApi = api;
    return () => { imperativeApi = null; };
  }, [api]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <ToastCard key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
      {pending && <ConfirmDialog pending={pending} onResolve={resolveConfirm} />}
      <style>{`
        @keyframes toast-in {
          from { transform: translateX(20px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        .animate-toast-in { animation: toast-in 180ms ease-out both; }
      `}</style>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastApi => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    const warn = (m: string) => { console.warn('[toast]', m); return ''; };
    return {
      success: (m) => warn(m),
      error:   (m) => warn(m),
      warning: (m) => warn(m),
      info:    (m) => warn(m),
      dismiss: () => {},
      confirm: (opts) => Promise.resolve(window.confirm(typeof opts === 'string' ? opts : opts.message)),
    };
  }
  return ctx;
};

export const LoaderIcon = Loader2;
