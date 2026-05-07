import { supabase } from '../supabase';
import { hashPin, verifyPin, isValidPinFormat } from './crypto';
import {
  isCurrentlyLocked,
  nextStateOnFailure,
  nextStateOnSuccess,
  LockoutState,
} from './lockout';
import type { PinAttemptResult, StealthPinRow } from './types';

interface PinFetchResult {
  row: StealthPinRow | null;
  error: string | null;
}

async function fetchPinRow(userId: string): Promise<PinFetchResult> {
  const { data, error } = await supabase
    .from('stealth_pin')
    .select('user_id, pin_hash, pin_salt, pin_iterations, pin_set_at, failed_attempts, locked_until, last_attempt_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    return { row: null, error: error.message };
  }
  return { row: (data as StealthPinRow | null), error: null };
}

export async function isPinSet(userId: string): Promise<boolean> {
  const { row } = await fetchPinRow(userId);
  return row !== null;
}

export async function setPin(userId: string, newPin: string, currentPin?: string): Promise<{ ok: boolean; error?: string }> {
  if (!isValidPinFormat(newPin)) {
    return { ok: false, error: 'PIN must be 4–6 digits.' };
  }
  const { row, error } = await fetchPinRow(userId);
  if (error) return { ok: false, error };

  if (row) {
    if (!currentPin) {
      return { ok: false, error: 'Enter your current PIN to change it.' };
    }
    const matched = await verifyPin(currentPin, row.pin_hash, row.pin_salt, row.pin_iterations);
    if (!matched) {
      return { ok: false, error: 'Current PIN is incorrect.' };
    }
  }

  const hashed = await hashPin(newPin);
  const upsertRow = {
    user_id: userId,
    pin_hash: hashed.hash,
    pin_salt: hashed.salt,
    pin_iterations: hashed.iterations,
    pin_set_at: new Date().toISOString(),
    failed_attempts: 0,
    locked_until: null,
    last_attempt_at: null,
  };
  const { error: upsertErr } = await supabase
    .from('stealth_pin')
    .upsert(upsertRow, { onConflict: 'user_id' });
  if (upsertErr) {
    return { ok: false, error: upsertErr.message };
  }
  return { ok: true };
}

export async function clearPin(userId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('stealth_pin').delete().eq('user_id', userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function attemptPin(userId: string, pin: string): Promise<PinAttemptResult> {
  if (!isValidPinFormat(pin)) {
    return { ok: false, reason: 'wrong_pin' };
  }
  const { row, error } = await fetchPinRow(userId);
  if (error) return { ok: false, reason: 'error' };
  if (!row) return { ok: false, reason: 'no_pin_set' };

  const now = new Date();
  const state: LockoutState = {
    failed_attempts: row.failed_attempts,
    locked_until: row.locked_until ? new Date(row.locked_until) : null,
  };
  if (isCurrentlyLocked(state, now)) {
    return { ok: false, reason: 'locked', lockedUntil: state.locked_until };
  }

  const matched = await verifyPin(pin, row.pin_hash, row.pin_salt, row.pin_iterations);
  if (matched) {
    const next = nextStateOnSuccess();
    await supabase
      .from('stealth_pin')
      .update({
        failed_attempts: next.failed_attempts,
        locked_until: next.locked_until,
        last_attempt_at: now.toISOString(),
      })
      .eq('user_id', userId);
    return { ok: true };
  }

  const next = nextStateOnFailure(state, now);
  await supabase
    .from('stealth_pin')
    .update({
      failed_attempts: next.failed_attempts,
      locked_until: next.locked_until ? next.locked_until.toISOString() : null,
      last_attempt_at: now.toISOString(),
    })
    .eq('user_id', userId);

  if (next.isLocked) {
    return { ok: false, reason: 'locked', lockedUntil: next.locked_until };
  }
  return { ok: false, reason: 'wrong_pin', remainingAttempts: next.remainingAttempts };
}
