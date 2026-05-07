/**
 * useVaultGate — single chokepoint for vault access.
 *
 * Today: returns `{ kind: 'soft', verified, verify, lock }`. The vault shows
 * a confirm modal once per session before revealing thumbnails; subsequent
 * navigations stay revealed until `lock()` (or page reload).
 *
 * After feature/stealth-mode-2026-04-30 lands, swap the implementation here
 * to read `stealth_settings.pin_lock_enabled` and return `{ kind: 'pin' }`
 * when set, with PIN-entry UI gating `verify`. Vault component code does NOT
 * change — it asks the hook whether the user has cleared the gate, nothing
 * else.
 *
 * `kind` lets the calling UI render the right copy ("are you sure" vs
 * "enter PIN") without inspecting any other state.
 *
 * TODO(post-stealth-merge): read stealth_settings.pin_lock_enabled, swap to
 * 'pin' kind when set, plumb PIN entry through verify().
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

// In-memory session reveal — survives navigation within the SPA, not page
// reload. Same trade-off as the soft modal: the user is already past auth;
// we're protecting against shoulder-surfing on the device, not theft.
let sessionVerified = false;

export type VaultGate =
  | { kind: 'loading' }
  | { kind: 'soft'; verified: boolean; verify: () => void; lock: () => void; blurThumbnails: boolean }
  | { kind: 'pin'; verified: boolean; verify: (pin: string) => Promise<boolean>; lock: () => void; blurThumbnails: boolean };

export function useVaultGate(): VaultGate {
  const { user } = useAuth();
  const [verified, setVerified] = useState<boolean>(sessionVerified);
  const [blur, setBlur] = useState<boolean>(true);
  const [loaded, setLoaded] = useState<boolean>(false);

  useEffect(() => {
    if (!user?.id) { setLoaded(true); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('vault_privacy_settings')
        .select('blur_thumbnails')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data && typeof (data as { blur_thumbnails?: boolean }).blur_thumbnails === 'boolean') {
        setBlur((data as { blur_thumbnails: boolean }).blur_thumbnails);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const verify = useCallback(() => {
    sessionVerified = true;
    setVerified(true);
  }, []);

  const lock = useCallback(() => {
    sessionVerified = false;
    setVerified(false);
  }, []);

  if (!loaded) return { kind: 'loading' };
  return { kind: 'soft', verified, verify, lock, blurThumbnails: blur };
}
