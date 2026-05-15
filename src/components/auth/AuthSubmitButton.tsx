/**
 * Primary submit button for the auth screens.
 *
 * Visually inherits from the toolbar's `.dg-toolbar-btn-primary` — bright
 * green text on a near-transparent fill with a green-mid border and a
 * subtle glow on hover — but at a larger size suitable for a primary
 * call-to-action. The dropdown's "+ NEW RECORD" button is the closest
 * authenticated-surface analogue, and this button is intentionally a
 * larger sibling of it.
 *
 * While `loading` is true the button:
 *   - is disabled (prevents double-submit),
 *   - shows the supplied `loadingLabel`,
 *   - shows a pulsing dot in front of the label so the user sees
 *     something is happening even when the network is slow.
 */

import type { ButtonHTMLAttributes } from 'react';

export type AuthSubmitButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'className' | 'children'
> & {
  /** Default label, shown when not loading. */
  label: string;
  /** Label shown while `loading` is true. */
  loadingLabel: string;
  /** Disables the button and swaps to the loading label. */
  loading?: boolean;
};

export function AuthSubmitButton({
  label,
  loadingLabel,
  loading = false,
  disabled,
  ...buttonProps
}: AuthSubmitButtonProps) {
  // `disabled` on a button can come from two places — `loading` from us,
  // or the caller's own disable logic (e.g. "form is empty"). OR them.
  const isDisabled = loading || disabled;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      className={[
        'dg-auth-submit w-full',
        'font-ui text-[11px] tracking-[0.22em] uppercase',
        'px-4 py-[11px]',
        'text-green-accent border border-green-mid bg-green-accent/[0.06]',
        'cursor-pointer transition-all duration-150',
        'flex items-center justify-center gap-[10px]',
        'hover:bg-green-accent/[0.12] hover:border-green-bright',
        'hover:shadow-[0_0_12px_rgba(116,176,110,0.18)]',
        'focus:outline-none focus:border-green-accent focus:bg-green-accent/[0.14]',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none',
      ].join(' ')}
      {...buttonProps}
    >
      {loading ? (
        <>
          <span
            aria-hidden="true"
            className="dg-status-dot inline-block w-[5px] h-[5px] rounded-full bg-green-accent"
          />
          {loadingLabel}
        </>
      ) : (
        label
      )}
    </button>
  );
}
