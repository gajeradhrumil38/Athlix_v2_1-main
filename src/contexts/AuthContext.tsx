import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  deleteAccountLocal,
  getCurrentUserAsync,
  getProfile,
  LocalProfile as UserProfile,
  LocalUser as User,
  signOutLocal,
  subscribeToAuth,
  updateProfile as persistProfile,
} from '../lib/supabaseData';

type Session = { user: User } | null;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  isPasswordRecovery: false,
  clearPasswordRecovery: () => {},
  signOut: async () => {},
  deleteAccount: async () => {},
  refreshProfile: async () => {},
  updateProfile: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    const handler = () => setIsPasswordRecovery(true);
    window.addEventListener('athlix:password-recovery', handler);
    return () => window.removeEventListener('athlix:password-recovery', handler);
  }, []);

  const loadProfile = async (userId?: string | null) => {
    if (!userId) {
      setProfile(null);
      return;
    }

    const data = await getProfile(userId);
    setProfile(data);
  };

  const syncAuthState = async (nextSession: Session | null) => {
    setSession(nextSession);
    setUser(nextSession?.user ?? null);

    try {
      await loadProfile(nextSession?.user?.id ?? null);
    } catch (error) {
      console.warn('Failed to sync auth state:', error);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    let unsubscribeRef: (() => void) | null = null;

    const run = async () => {
      // Step 1: Determine real initial auth state before setting up subscription.
      // This prevents subscribeToAuth's immediate listener(null) call from
      // setting loading=false before we know whether a session actually exists.
      try {
        const currentUser = await getCurrentUserAsync();
        if (!mounted) return;
        await syncAuthState(currentUser ? { user: currentUser } : null);
      } catch (error) {
        console.warn('Failed to initialize auth:', error);
        if (!mounted) return;
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
      } finally {
        // Step 2: Subscribe to future auth changes (login / logout / token refresh)
        // only AFTER the initial state is confirmed. The immediate listener call
        // from subscribeToAuth will now use the already-correct currentUserCache.
        if (mounted) {
          unsubscribeRef = subscribeToAuth(async (nextUser) => {
            if (!mounted) return;
            await syncAuthState(nextUser ? { user: nextUser } : null);
          });
        }
      }
    };

    run();

    return () => {
      mounted = false;
      unsubscribeRef?.();
    };
  }, []);

  const refreshProfile = async () => {
    await loadProfile(user?.id ?? null);
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return;

    // Optimistic update — UI reflects change immediately
    setProfile((prev) => (prev ? { ...prev, ...updates } : prev));
    const data = await persistProfile(user.id, updates);
    // Sync with authoritative server response
    setProfile(data);
  };

  const signOut = async () => {
    await signOutLocal();
  };

  const deleteAccount = async () => {
    if (!user) return;
    await deleteAccountLocal(user.id);
  };

  const clearPasswordRecovery = () => setIsPasswordRecovery(false);

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, isPasswordRecovery, clearPasswordRecovery, signOut, deleteAccount, refreshProfile, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
