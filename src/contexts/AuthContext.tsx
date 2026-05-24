import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type SignUpResult = {
  /** True if Supabase created the user. False only on hard errors. */
  ok: boolean;
  /** True when email confirmation is required and no session was returned. */
  needsEmailConfirmation: boolean;
  error: AuthError | null;
};

type AuthActionResult = {
  ok: boolean;
  error: AuthError | null;
};

/**
 * Optional knobs for the signup call. Used today by the magic-link invite
 * handoff (DEL-45) to land the user back on `/invite/:token` after they
 * click the email confirmation link, so the claim RPC can run.
 */
export type SignUpOptions = {
  emailRedirectTo?: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  /** True until the initial getSession() resolves. Use this to avoid flashing the login page. */
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    options?: SignUpOptions,
  ) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<AuthActionResult>;
  /**
   * Trigger the Supabase "send recovery email" flow. The email contains a
   * one-time link that, when clicked, opens the app at
   * `/reset-password/confirm` with a `PASSWORD_RECOVERY` session — at that
   * point the user can call `updatePassword` to set a new one.
   */
  requestPasswordReset: (email: string) => Promise<AuthActionResult>;
  /**
   * Set a new password for the currently-signed-in user. Used by the
   * reset-password confirm flow once the recovery link has put us in a
   * password-recovery session.
   */
  updatePassword: (newPassword: string) => Promise<AuthActionResult>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // 1. Hydrate from whatever's in storage on first mount. The `.catch`
    //    guards against getSession() rejecting (e.g. a transient
    //    localStorage error in private-mode quota) — without it, `loading`
    //    would stay `true` forever and strand the user on `Splash`.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    // 2. Subscribe to all subsequent changes (login, logout, token refresh,
    //    cross-tab sync). This is what makes session persistence "just work".
    //
    //    Note: the `PASSWORD_RECOVERY` event also flows through here when
    //    the user lands from a recovery email link. We don't special-case
    //    it — the recovery session looks like any other session, and the
    //    `/reset-password/confirm` route is what gates the password-change
    //    UI behind it.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      // If the very first event arrives before getSession() resolves,
      // make sure we don't keep the app in loading state forever.
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,

      async signUp(email, password, options) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: options?.emailRedirectTo
            ? { emailRedirectTo: options.emailRedirectTo }
            : undefined,
        });
        if (error) {
          return { ok: false, needsEmailConfirmation: false, error };
        }
        // When email confirmation is enabled in the Supabase dashboard,
        // signUp returns a user but no session — they must click the link.
        const needsEmailConfirmation = data.session === null;
        return { ok: true, needsEmailConfirmation, error: null };
      },

      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { ok: !error, error };
      },

      async signOut() {
        const { error } = await supabase.auth.signOut();
        return { ok: !error, error };
      },

      async requestPasswordReset(email) {
        // The `redirectTo` decides where Supabase sends the user when they
        // click the link in the email. We point at the confirm route on
        // the current origin — works in dev (`http://localhost:5173`) and
        // in production (`https://delta-green-fawn.vercel.app`) without
        // any env config. The URL must be on the allow-list in the
        // Supabase dashboard's Auth → URL Configuration page.
        const redirectTo = `${window.location.origin}/reset-password/confirm`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        return { ok: !error, error };
      },

      async updatePassword(newPassword) {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        return { ok: !error, error };
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
