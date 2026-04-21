/**
 * Accessible Modal. Focus trap, escape, scroll lock, ARIA, portal, enter/exit
 * animations, mobile bottom-sheet layout, variant styling, composable slots.
 *
 * z-index registry: modal z-[100] (configurable) | ConfirmDialog z-[9998] | Toast z-[9999].
 * Backward compatible: all new props are optional and default to prior behavior.
 */
import React, {
  useEffect, useRef, useCallback, useState, useId, useMemo,
  isValidElement, Children,
} from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, AlertTriangle, CheckCircle2, Info, AlertCircle } from 'lucide-react';

type ModalVariant = 'default' | 'danger' | 'success' | 'warning' | 'info';
type ModalRole = 'dialog' | 'alertdialog';
type MobileLayout = 'center' | 'sheet';
type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'full';

interface AccessibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  size?: ModalSize;
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  footer?: React.ReactNode;
  // Additive props (defaults preserve prior behavior)
  description?: React.ReactNode;
  icon?: React.ReactNode;
  variant?: ModalVariant;
  role?: ModalRole;
  initialFocusRef?: React.RefObject<HTMLElement>;
  mobileLayout?: MobileLayout;
  preventClose?: boolean;
  hideHeader?: boolean;
  onConfirmKey?: () => void;
  zIndex?: number;
}

const VARIANT_ICON_BG: Record<ModalVariant, string> = {
  default: 'bg-slate-100 text-slate-700 border-slate-200',
  danger: 'bg-red-100 text-red-600 border-red-200',
  success: 'bg-emerald-100 text-emerald-600 border-emerald-200',
  warning: 'bg-amber-100 text-amber-600 border-amber-200',
  info: 'bg-indigo-100 text-indigo-600 border-indigo-200',
};

const VARIANT_ACCENT: Record<ModalVariant, string> = {
  default: 'bg-transparent',
  danger: 'bg-red-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  info: 'bg-indigo-500',
};

const DEFAULT_VARIANT_ICON: Record<ModalVariant, React.ReactNode> = {
  default: null,
  danger: <AlertTriangle size={20} />,
  success: <CheckCircle2 size={20} />,
  warning: <AlertCircle size={20} />,
  info: <Info size={20} />,
};

const EXIT_MS = 140;

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

interface ModalSlotProps { children: React.ReactNode; className?: string; }
type SlotComponent<P> = React.FC<P> & { __modalSlot?: string };

export const ModalBody: SlotComponent<ModalSlotProps> = ({ children }) => <>{children}</>;
ModalBody.__modalSlot = 'body';

const ModalSlotFooter: SlotComponent<ModalSlotProps> = ({ children }) => <>{children}</>;
ModalSlotFooter.__modalSlot = 'footer';

interface ModalSectionProps { title?: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode; className?: string; }
export const ModalSection: React.FC<ModalSectionProps> = ({ title, icon, children, className = '' }) => (
  <div className={`bg-white rounded-3xl p-6 border border-slate-200 shadow-sm ${className}`.trim()}>
    {title && (
      <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
        {icon && <span className="text-indigo-600 flex items-center">{icon}</span>}
        {title}
      </h4>
    )}
    {children}
  </div>
);

/* -------------------------------------------------------------------------- */
/*  Main modal                                                                */
/* -------------------------------------------------------------------------- */

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface AccessibleModalComponent extends React.FC<AccessibleModalProps> {
  Body: typeof ModalBody;
  Footer: typeof ModalSlotFooter;
  Section: typeof ModalSection;
}

const AccessibleModalInner: React.FC<AccessibleModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  footer,
  description,
  icon,
  variant = 'default',
  role = 'dialog',
  initialFocusRef,
  mobileLayout = 'center',
  preventClose = false,
  hideHeader = false,
  onConfirmKey,
  zIndex = 100,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);
  const reactId = useId();
  const titleId = `omc-modal-title-${reactId}`;
  const descId = `omc-modal-desc-${reactId}`;

  // `mounted` controls whether anything is rendered. `visible` drives the
  // enter vs exit animation. On close we keep mounted=true for EXIT_MS so
  // the exit animation can play, then unmount. Never animates in on initial
  // render when isOpen starts false (mounted stays false).
  const [mounted, setMounted] = useState(isOpen);
  const [visible, setVisible] = useState(isOpen);
  const wasOpen = useRef(isOpen);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      wasOpen.current = true;
      return () => cancelAnimationFrame(raf);
    }
    if (wasOpen.current) {
      setVisible(false);
      const t = window.setTimeout(() => setMounted(false), EXIT_MS);
      wasOpen.current = false;
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [isOpen]);

  // Focus management + scroll lock on open. Runs when the modal first becomes
  // visible (isOpen true), not on close.
  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = '';
      return;
    }

    previousActiveElement.current = document.activeElement;
    document.body.style.overflow = 'hidden';

    // Defer focus one frame so the portal content has mounted.
    const raf = requestAnimationFrame(() => {
      if (!contentRef.current) return;

      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else if (role === 'alertdialog') {
        contentRef.current.focus();
      } else {
        const first = contentRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        if (first) first.focus();
        else contentRef.current.focus();
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = '';
    };
  }, [isOpen, initialFocusRef, role]);

  // Restore focus once the component fully unmounts (not just on close flip,
  // so the restore happens after the exit animation completes).
  useEffect(() => {
    return () => {
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, []);

  const getFocusables = useCallback((): HTMLElement[] => {
    if (!contentRef.current) return [];
    return Array.from(contentRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!preventClose) onClose();
        return;
      }

      if (e.key === 'Enter' && onConfirmKey) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        const isTextField =
          tag === 'TEXTAREA' ||
          (tag === 'INPUT' &&
            !['button', 'submit', 'checkbox', 'radio'].includes(
              (target as HTMLInputElement).type,
            )) ||
          target?.isContentEditable;
        if (!isTextField) {
          e.preventDefault();
          onConfirmKey();
          return;
        }
      }

      if (e.key === 'Tab') {
        // Re-query on every Tab so dynamically mounted inputs are trapped too.
        const focusables = getFocusables();
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose, preventClose, onConfirmKey, getFocusables],
  );

  // Split children into body vs footer slots (additive; raw children fallback).
  const { bodySlot, footerSlot } = useMemo(() => {
    const bodyNodes: React.ReactNode[] = [];
    let slotFooter: React.ReactNode = null;
    let foundSlot = false;

    Children.forEach(children, (child) => {
      if (isValidElement(child)) {
        const marker = (child.type as { __modalSlot?: string })?.__modalSlot;
        if (marker === 'footer') {
          slotFooter = child.props.children;
          foundSlot = true;
          return;
        }
        if (marker === 'body') {
          bodyNodes.push(child.props.children);
          foundSlot = true;
          return;
        }
      }
      bodyNodes.push(child);
    });

    return {
      bodySlot: foundSlot ? bodyNodes : children,
      footerSlot: slotFooter,
    };
  }, [children]);

  const resolvedFooter = footerSlot ?? footer;

  if (!mounted) return null;
  if (typeof document === 'undefined') return null;

  const describedBy = description ? descId : undefined;
  const resolvedIcon = icon ?? DEFAULT_VARIANT_ICON[variant];
  const showIconCircle = !!resolvedIcon && !hideHeader;

  const isSheet = mobileLayout === 'sheet';

  const sizeClasses: Record<ModalSize, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl lg:max-w-3xl',
    xxl: 'max-w-3xl lg:max-w-4xl xl:max-w-5xl',
    full: 'max-w-5xl lg:max-w-6xl xl:max-w-7xl',
  };

  const centerPositioning = 'items-center justify-center p-4';
  const sheetPositioning = 'items-end justify-center p-0 sm:items-center sm:justify-center sm:p-4';
  const overlayPositioning = isSheet ? sheetPositioning : centerPositioning;

  const centerContent = `rounded-3xl max-h-[85vh] lg:max-h-[90vh] ${sizeClasses[size]}`;
  const sheetContent = `rounded-t-3xl rounded-b-none max-h-[90vh] w-full sm:rounded-3xl sm:max-h-[85vh] sm:lg:max-h-[90vh] sm:${sizeClasses[size]}`;
  const contentSizing = isSheet ? sheetContent : centerContent;

  // Animation classes driven by `visible`. Sheet mode gets a mobile-only
  // slide-in; the sm+ scale-in override is handled inside the <style> block
  // via a media query because Tailwind's sm: prefix can't target custom
  // class names reliably.
  const backdropAnim = visible ? 'omc-modal-backdrop-in' : 'omc-modal-backdrop-out';
  const panelAnim = visible
    ? isSheet
      ? 'omc-modal-sheet-in'
      : 'omc-modal-panel-in'
    : 'omc-modal-panel-out';

  const node = (
    <div
      ref={overlayRef}
      style={{ zIndex }}
      className={`fixed inset-0 bg-slate-900/60 backdrop-blur-md flex ${overlayPositioning} ${backdropAnim}`}
      onClick={(e) => {
        if (closeOnOverlayClick && !preventClose && e.target === overlayRef.current) {
          onClose();
        }
      }}
      onKeyDown={handleKeyDown}
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={describedBy}
    >
      <div
        ref={contentRef}
        tabIndex={-1}
        className={`bg-white shadow-2xl w-full border border-slate-100 overflow-hidden transform flex flex-col outline-none ${contentSizing} ${panelAnim}`}
      >
        {/* Optional variant accent bar */}
        {variant !== 'default' && !hideHeader && (
          <div className={`h-1 w-full flex-shrink-0 ${VARIANT_ACCENT[variant]}`} aria-hidden="true" />
        )}

        {/* Header */}
        {!hideHeader && (
          <div className="flex items-start justify-between p-6 border-b border-slate-100 flex-shrink-0 gap-4">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              {showIconCircle && (
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${VARIANT_ICON_BG[variant]}`}
                  aria-hidden="true"
                >
                  {resolvedIcon}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-xl font-bold text-slate-900">
                  {title}
                </h2>
                {description && (
                  <div id={descId} className="mt-1 text-sm text-slate-500">
                    {description}
                  </div>
                )}
              </div>
            </div>
            {showCloseButton && !preventClose && (
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors shrink-0"
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
          {bodySlot}
        </div>

        {/* Footer */}
        {resolvedFooter && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
            {resolvedFooter}
          </div>
        )}
      </div>

      {/* Scoped keyframes — inline to avoid touching tailwind config. Class
          names are namespaced (omc-modal-*) to prevent collisions with any
          globally-defined `animate-fade-in` utility. Respects
          prefers-reduced-motion. */}
      <style>{`
        @keyframes omc-modal-fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes omc-modal-fade-out { from { opacity: 1 } to { opacity: 0 } }
        @keyframes omc-modal-scale-in {
          from { opacity: 0; transform: scale(0.96) translateY(4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes omc-modal-scale-out {
          from { opacity: 1; transform: scale(1); }
          to   { opacity: 0; transform: scale(0.98); }
        }
        @keyframes omc-modal-sheet-slide-in {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        .omc-modal-backdrop-in  { animation: omc-modal-fade-in 160ms ease-out both; }
        .omc-modal-backdrop-out { animation: omc-modal-fade-out ${EXIT_MS}ms ease-in both; }
        .omc-modal-panel-in     { animation: omc-modal-scale-in 180ms ease-out both; }
        .omc-modal-panel-out    { animation: omc-modal-scale-out ${EXIT_MS}ms ease-in both; }
        .omc-modal-sheet-in     { animation: omc-modal-sheet-slide-in 220ms ease-out both; }
        @media (min-width: 640px) {
          .omc-modal-sheet-in   { animation: omc-modal-scale-in 180ms ease-out both; }
        }
        @media (prefers-reduced-motion: reduce) {
          .omc-modal-backdrop-in,
          .omc-modal-backdrop-out,
          .omc-modal-panel-in,
          .omc-modal-panel-out,
          .omc-modal-sheet-in { animation: none !important; }
        }
      `}</style>
    </div>
  );

  return createPortal(node, document.body);
};

export const AccessibleModal = AccessibleModalInner as AccessibleModalComponent;
AccessibleModal.Body = ModalBody;
AccessibleModal.Footer = ModalSlotFooter;
AccessibleModal.Section = ModalSection;

/* -------------------------------------------------------------------------- */
/*  ModalFooter + ModalButton helpers (pre-existing exports; kept as-is)      */
/* -------------------------------------------------------------------------- */

const FOOTER_ALIGN: Record<'end' | 'between' | 'center', string> = {
  end: 'justify-end',
  between: 'justify-between',
  center: 'justify-center',
};

export const ModalFooter: React.FC<{
  children: React.ReactNode;
  align?: 'end' | 'between' | 'center';
}> = ({ children, align = 'end' }) => (
  <div className={`flex items-center gap-3 w-full ${FOOTER_ALIGN[align]}`}>{children}</div>
);

const BUTTON_VARIANT: Record<'primary' | 'secondary' | 'danger', string> = {
  primary: 'bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-900/20',
  danger: 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/30',
  secondary: 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100',
};

export const ModalButton: React.FC<{
  variant: 'primary' | 'secondary' | 'danger';
  onClick?: () => void;
  type?: 'button' | 'submit';
  form?: string;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
}> = ({ variant, onClick, type = 'button', form, disabled, loading, children }) => {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      form={form}
      onClick={onClick}
      disabled={isDisabled}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${BUTTON_VARIANT[variant]}`}
    >
      {loading && <Loader2 className="animate-spin" size={14} />}
      {children}
    </button>
  );
};

export default AccessibleModal;
