/**
 * Clean, accessible form primitives for modals.
 *
 * Design goals:
 * - Labels sit *above* inputs so they never overlap or get cut off.
 * - Full rounded border (not just a bottom line) so the hit-area is obvious.
 * - Clear focus ring + border colour shift.
 * - Consistent vertical rhythm (space-y-1.5 label→input, gap-4 between fields).
 */
import React from 'react';
import { ChevronDown } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Input                                                             */
/* ------------------------------------------------------------------ */

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
  ({ label, hint, className = '', ...rest }, ref) => (
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
        {label}
      </label>
      <input
        ref={ref}
        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-[3px] focus:ring-slate-900/8 focus:border-slate-900 transition-all"
        {...rest}
      />
      {hint && <p className="text-[11px] text-slate-400 font-medium">{hint}</p>}
    </div>
  )
);
FormInput.displayName = 'FormInput';

/* ------------------------------------------------------------------ */
/*  Select                                                            */
/* ------------------------------------------------------------------ */

interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
  hint?: string;
}

export const FormSelect = React.forwardRef<HTMLSelectElement, FormSelectProps>(
  ({ label, options, hint, className = '', ...rest }, ref) => (
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
        {label}
      </label>
      <div className="relative">
        <select
          ref={ref}
          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 appearance-none focus:outline-none focus:ring-[3px] focus:ring-slate-900/8 focus:border-slate-900 transition-all cursor-pointer pr-10"
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
      </div>
      {hint && <p className="text-[11px] text-slate-400 font-medium">{hint}</p>}
    </div>
  )
);
FormSelect.displayName = 'FormSelect';

/* ------------------------------------------------------------------ */
/*  Textarea                                                          */
/* ------------------------------------------------------------------ */

interface FormTextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
}

export const FormTextArea = React.forwardRef<HTMLTextAreaElement, FormTextAreaProps>(
  ({ label, hint, className = '', rows = 3, ...rest }, ref) => (
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
        {label}
      </label>
      <textarea
        ref={ref}
        rows={rows}
        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-[3px] focus:ring-slate-900/8 focus:border-slate-900 transition-all resize-none"
        {...rest}
      />
      {hint && <p className="text-[11px] text-slate-400 font-medium">{hint}</p>}
    </div>
  )
);
FormTextArea.displayName = 'FormTextArea';

/* ------------------------------------------------------------------ */
/*  Checkbox                                                          */
/* ------------------------------------------------------------------ */

interface FormCheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

export const FormCheckbox: React.FC<FormCheckboxProps> = ({
  label,
  checked,
  onChange,
  className = '',
}) => (
  <label
    className={`inline-flex items-center gap-2.5 cursor-pointer select-none group ${className}`}
    onClick={(e) => e.stopPropagation()}
  >
    <div
      onClick={() => onChange(!checked)}
      className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0 ${
        checked
          ? 'bg-indigo-600 border-indigo-600'
          : 'bg-white border-slate-300 group-hover:border-indigo-400'
      }`}
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 6L5 9L10 3"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
    <span className="text-sm font-medium text-slate-700">{label}</span>
  </label>
);

/* ------------------------------------------------------------------ */
/*  Section                                                           */
/* ------------------------------------------------------------------ */

interface FormSectionProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const FormSection: React.FC<FormSectionProps> = ({
  title,
  description,
  icon,
  children,
  className = '',
}) => (
  <div className={`space-y-4 ${className}`}>
    {(title || description) && (
      <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
        {icon && <span className="text-indigo-600">{icon}</span>}
        {title && (
          <h4 className="text-sm font-bold text-slate-900">{title}</h4>
        )}
        {description && (
          <p className="text-xs text-slate-500 font-medium ml-auto">{description}</p>
        )}
      </div>
    )}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Row (full-width fields inside a section)                          */
/* ------------------------------------------------------------------ */

interface FormRowProps {
  children: React.ReactNode;
  className?: string;
}

export const FormRow: React.FC<FormRowProps> = ({ children, className = '' }) => (
  <div className={`col-span-1 md:col-span-2 ${className}`}>{children}</div>
);

/* ------------------------------------------------------------------ */
/*  Inline number stepper (for currency / qty inputs)                 */
/* ------------------------------------------------------------------ */

interface FormNumberProps extends FormInputProps {
  min?: number;
  max?: number;
  step?: number;
}

export const FormNumber = React.forwardRef<HTMLInputElement, FormNumberProps>(
  ({ label, hint, min, max, step, className = '', ...rest }, ref) => (
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
        {label}
      </label>
      <input
        ref={ref}
        type="number"
        min={min}
        max={max}
        step={step}
        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-[3px] focus:ring-slate-900/8 focus:border-slate-900 transition-all"
        {...rest}
      />
      {hint && <p className="text-[11px] text-slate-400 font-medium">{hint}</p>}
    </div>
  )
);
FormNumber.displayName = 'FormNumber';

/* ------------------------------------------------------------------ */
/*  Date input                                                        */
/* ------------------------------------------------------------------ */

interface FormDateProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  hint?: string;
}

export const FormDate = React.forwardRef<HTMLInputElement, FormDateProps>(
  ({ label, hint, className = '', ...rest }, ref) => (
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
        {label}
      </label>
      <input
        ref={ref}
        type="date"
        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-[3px] focus:ring-slate-900/8 focus:border-slate-900 transition-all"
        {...rest}
      />
      {hint && <p className="text-[11px] text-slate-400 font-medium">{hint}</p>}
    </div>
  )
);
FormDate.displayName = 'FormDate';
