/**
 * Minimal toast notification system.
 *
 * Designed for the access-denied surface introduced by DEL-43 and the leave /
 * kick / delete flows that follow (DEL-44, DEL-48, DEL-49). Three kinds: info,
 * success, error. Auto-dismiss after a configurable timeout (default 5s).
 *
 * ## Mounting
 *
 * `<ToastProvider>` wraps the app inside `<AuthProvider>` so toasts survive
 * route changes (the same Provider instance stays mounted across the route
 * tree). The visual container is rendered as a top-right stack inside the
 * provider tree, not via a portal — Tailwind `z-50` keeps it above the
 * sticky header.
 *
 * ## Hook contract
 *
 * `useToast()` exposes `showToast(kind, message)` and `dismissToast(id)`.
 * Callers that need a follow-up redirect can read back the returned id, but
 * typical usage is fire-and-forget.
 *
 * `showToast` is *idempotent on message text within a 200ms window*: rapid
 * duplicates (e.g. effect double-fire from React strict mode) collapse to a
 * single toast. This avoids a strict-mode-induced double notification on
 * `ManageGuard` redirects without forcing every caller to thread a ref.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type ToastKind = 'info' | 'success' | 'error';

export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
};

export type ToastContextValue = {
  toasts: Toast[];
  showToast: (kind: ToastKind, message: string) => string;
  dismissToast: (id: string) => void;
};

/* -------------------------------------------------------------------------- */
/*  Context                                                                   */
/* -------------------------------------------------------------------------- */

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/** How long a toast lingers before auto-dismiss. Match the design language's
 *  "stamp fades after a beat" feel — long enough to read a short sentence,
 *  short enough to not clutter the screen. */
const AUTO_DISMISS_MS = 5000;

/** Idempotency window for duplicate messages — strict mode's effect-double-fire
 *  is the main thing this guards against. */
const DEDUPE_WINDOW_MS = 200;

/* -------------------------------------------------------------------------- */
/*  Provider                                                                  */
/* -------------------------------------------------------------------------- */

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const recentRef = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (kind: ToastKind, message: string): string => {
      const dedupeKey = `${kind}::${message}`;
      const now = Date.now();
      const last = recentRef.current.get(dedupeKey);
      if (last !== undefined && now - last < DEDUPE_WINDOW_MS) {
        return '';
      }
      recentRef.current.set(dedupeKey, now);

      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `toast-${now}-${Math.random().toString(36).slice(2, 8)}`;

      const toast: Toast = { id, kind, message };
      setToasts((prev) => [...prev, toast]);

      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timersRef.current.delete(id);
      }, AUTO_DISMISS_MS);
      timersRef.current.set(id, timer);

      return id;
    },
    [],
  );

  // Clean up timers on unmount so we don't leak a setTimeout after the
  // provider tree comes down (test teardown, hot reload).
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, showToast, dismissToast }),
    [toasts, showToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/*  Visual stack                                                              */
/* -------------------------------------------------------------------------- */

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-[64px] right-6 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const palette = TOAST_PALETTE[toast.kind];

  return (
    <div
      className={[
        'pointer-events-auto px-4 py-3 border bg-desk-edge',
        'flex items-start gap-3 min-w-[260px]',
        palette.border,
      ].join(' ')}
      role={toast.kind === 'error' ? 'alert' : 'status'}
    >
      <div className="flex-1">
        <div
          className={[
            'font-stamp text-[11px] tracking-[0.18em] uppercase',
            palette.label,
          ].join(' ')}
        >
          {palette.heading}
        </div>
        <div className="font-ui text-[11px] tracking-[0.06em] text-paper mt-1 leading-relaxed">
          {toast.message}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="font-ui text-[14px] leading-none text-paper-dark hover:text-paper transition-colors mt-[1px]"
      >
        ×
      </button>
    </div>
  );
}

const TOAST_PALETTE: Record<
  ToastKind,
  { border: string; label: string; heading: string }
> = {
  info: {
    border: 'border-green-dim',
    label: 'text-green-bright',
    heading: 'Notice',
  },
  success: {
    border: 'border-green-mid',
    label: 'text-green-accent',
    heading: 'Confirmed',
  },
  error: {
    border: 'border-red-faded',
    label: 'text-red-stamp',
    heading: 'Transmission denied',
  },
};

/* -------------------------------------------------------------------------- */
/*  Hook                                                                      */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return ctx;
}
