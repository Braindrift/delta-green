/**
 * Labelled form input used across the auth screens.
 *
 * Renders a small uppercase label, the input, and (when present) an
 * inline error message styled in the same amber-stamp register used by
 * placeholder banners elsewhere in the app.
 *
 * The visual brief from the design doc (§3) is paper/typewriter mood —
 * monospace type, green-dim borders, no rounded corners above 2px, hover
 * states that glow rather than recolour. The input chrome here mirrors
 * the sidebar's search input (`.dg-search-wrap`) so the two read as the
 * same idiom.
 *
 * The component is uncontrolled-passthrough: it forwards every `<input>`
 * prop except `id`, `className`, `type`, and the label/error pair. That
 * keeps the call sites tidy — the page passes `value`, `onChange`,
 * `required`, `autoComplete`, etc. directly without us re-typing them.
 */

import { forwardRef, useId, type InputHTMLAttributes } from 'react';

export type AuthFormFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> & {
  /** Label text — rendered in small uppercase monospace above the input. */
  label: string;
  /** Field-level error message. When present, the field is marked invalid. */
  error?: string | null;
  /** Optional helper text shown under the input when there's no error. */
  hint?: string;
};

export const AuthFormField = forwardRef<HTMLInputElement, AuthFormFieldProps>(
  function AuthFormField({ label, error, hint, ...inputProps }, ref) {
    // `useId` gives us a stable unique id that survives Strict Mode's
    // double-render. Used to wire `<label htmlFor>` to the input and to
    // point `aria-describedby` at the error message.
    const reactId = useId();
    const inputId = `auth-field-${reactId}`;
    const errorId = error ? `${inputId}-error` : undefined;
    const hintId = !error && hint ? `${inputId}-hint` : undefined;

    return (
      <div className="mb-5">
        <label
          htmlFor={inputId}
          className="block font-ui text-[10px] tracking-[0.18em] text-green-bright uppercase mb-[6px]"
        >
          {label}
        </label>

        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId ?? hintId}
          className={[
            'dg-auth-input w-full font-body text-[13px] text-paper bg-desk-groove',
            'border border-green-dim px-3 py-[9px] tracking-[0.04em]',
            'placeholder:text-green-mid/60 placeholder:tracking-normal',
            'focus:outline-none focus:border-green-mid focus:bg-green-void',
            'transition-colors duration-150',
            error ? 'border-red-faded focus:border-red-stamp' : '',
          ].join(' ')}
          {...inputProps}
        />

        {error ? (
          <p
            id={errorId}
            role="alert"
            className="font-ui text-[10px] tracking-[0.1em] text-red-stamp mt-[6px] uppercase"
          >
            {error}
          </p>
        ) : hint ? (
          <p
            id={hintId}
            className="font-ui text-[10px] tracking-[0.1em] text-green-mid/80 mt-[6px]"
          >
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
