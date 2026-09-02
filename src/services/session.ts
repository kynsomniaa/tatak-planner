import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { AppSession } from '../types';
import { accountEmailForUsername, cloudConfigured, supabase } from './supabase';

const SESSION_KEY = 'cpe-pathfinder.local-session.v2';
const ACCOUNTS_KEY = 'cpe-pathfinder.local-accounts.v2';

interface LocalAccount {
  id: string;
  username: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
}

const normalizeUsername = (value: string): string => value.trim().toLowerCase();

const readAccounts = async (): Promise<LocalAccount[]> => {
  const stored = await AsyncStorage.getItem(ACCOUNTS_KEY);
  return stored ? (JSON.parse(stored) as LocalAccount[]) : [];
};

const hashPassword = (password: string, salt: string): Promise<string> =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${password}`);

export async function restoreSession(): Promise<AppSession | null> {
  if (cloudConfigured && supabase) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const user = data.session?.user;
    if (!user) return null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, role')
      .eq('id', user.id)
      .maybeSingle();
    return {
      id: user.id,
      username: profile?.username ?? user.user_metadata.username ?? 'student',
      role: profile?.role ?? 'student',
    };
  }
  const stored = await AsyncStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  const session = JSON.parse(stored) as Partial<AppSession>;
  if (!session.id || !session.username) {
    await AsyncStorage.removeItem(SESSION_KEY);
    return null;
  }
  const exists = (await readAccounts()).some((account) => account.id === session.id);
  return exists ? (session as AppSession) : null;
}

export async function signIn(
  username: string,
  password: string,
  createAccount: boolean,
): Promise<AppSession> {
  const normalized = normalizeUsername(username);
  if (!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(normalized)) {
    throw new Error('Username must be 3–24 characters using letters, numbers, dots, dashes, or underscores.');
  }
  if (password.length < 6) throw new Error('Password must contain at least 6 characters.');

  if (cloudConfigured && supabase) {
    const email = accountEmailForUsername(normalized);
    if (createAccount) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username: username.trim() } },
      });
      if (error) throw error;
      if (!data.user) throw new Error('Account creation did not return a user.');
      if (!data.session) {
        throw new Error('Disable email confirmation in Supabase Auth because anonymous username accounts have no inbox.');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) throw new Error('The account session could not be created.');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('username, role')
      .eq('id', authData.user.id)
      .single();
    if (profileError) throw profileError;
    return { id: authData.user.id, username: profile.username, role: profile.role };
  }

  const accounts = await readAccounts();
  const existing = accounts.find((account) => account.username === normalized);
  let account: LocalAccount;

  if (createAccount) {
    if (existing) throw new Error('That username already exists on this device.');
    const salt = Crypto.randomUUID();
    account = {
      id: `local-${Crypto.randomUUID()}`,
      username: normalized,
      salt,
      passwordHash: await hashPassword(password, salt),
      createdAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify([...accounts, account]));
  } else {
    if (!existing) throw new Error('No local account uses that username. Create it first.');
    const candidateHash = await hashPassword(password, existing.salt);
    if (candidateHash !== existing.passwordHash) throw new Error('Incorrect password.');
    account = existing;
  }

  const session: AppSession = { id: account.id, username: account.username, role: 'student' };
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function signOut(): Promise<void> {
  if (cloudConfigured && supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return;
  }
  await AsyncStorage.removeItem(SESSION_KEY);
}
