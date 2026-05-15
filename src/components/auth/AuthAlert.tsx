/**
 * Form-level alert banner.
 *
 * Two variants:
 *  - `error` — bordered in `red-faded`, with a small "AUTHENTICATION ERROR"
 *    or similar caller-supplied prefix in red-stamp.
 *  - `notice` — bordered in `green-dim`, used for confirmations like "we
 *    sent you a reset link" or "check your email".
 *
 * Inline-field errors live in `AuthFormField`. This component is for the
 * form-wide messages — auth failures from Supabase, post-submit success
 * confirmations.
 */

import type { ReactNode } from 'react';

export type AuthAlertProps = {
  variant: 'error' | 'notice';
  /** Short uppercase prefix label — e.g. "AUTH ERROR", "TRANSMISSION SENT". */
  title: string;
  children: ReactNode;
};

export function AuthAlert({ variant, title, children }: AuthAlertProps) {
  const isError = variant === 'error';
  const role = isError ? 'alert' : 'status';

  return (
    <div
      role={role}
      className={[
        'mb-5 border px-4 py-3',
        isError ? 'border-red-faded bg-red-faded/[0.08]' : 'border-green-dim bg-green-dim/[0.12]',
      ].join(' ')}
    >
      <div
        className={[
          'font-stamp text-xs tracking-[0.18em] uppercase mb-1',
          isError ? 'text-red-stamp' : 'text-green-accent',
        ].join(' ')}
      >
        {title}
      </div>
      <div className="font-ui text-[11px] tracking-[0.04em] text-paper-worn leading-relaxed">
        {children}
      </div>
    </div>
  );
}
