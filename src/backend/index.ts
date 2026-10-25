import { SUPABASE_KEY, SUPABASE_URL } from '../config';
import { LocalBackend } from './local';
import { SupabaseBackend } from './supabase';
import type { Backend, BackendMode } from './types';

const cache: Partial<Record<BackendMode, Backend>> = {};

export const onlineAvailable = Boolean(SUPABASE_URL && SUPABASE_KEY);

export function getBackend(mode: BackendMode): Backend {
  if (mode === 'online' && !onlineAvailable) throw new Error('Online-Modus ist nicht konfiguriert');
  if (!cache[mode]) cache[mode] = mode === 'online' ? new SupabaseBackend(SUPABASE_URL, SUPABASE_KEY) : new LocalBackend();
  return cache[mode]!;
}

export * from './types';
