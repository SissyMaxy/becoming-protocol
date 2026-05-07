import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useStealthSettings } from '../../hooks/useStealthSettings';
import { usePanicClose } from '../../hooks/usePanicClose';
import { isPinSet } from '../../lib/stealth/pin';
import { BlankScreen } from './BlankScreen';
import { PinGate } from './PinGate';

const BACKGROUND_THRESHOLD_MS = 60 * 1000;

export interface StealthShellProps {
  children: React.ReactNode;
}

export function StealthShell({ children }: StealthShellProps) {
  const { user } = useAuth();
  const { settings, loading } = useStealthSettings();
  const [pinSet, setPinSet] = useState<boolean | null>(null);
  const [pinPassed, setPinPassed] = useState(false);
  const [showBlank, setShowBlank] = useState(false);
  const lastBackgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!user) {
      setPinSet(null);
      setPinPassed(false);
      return;
    }
    let cancelled = false;
    isPinSet(user.id).then((v) => {
      if (!cancelled) setPinSet(v);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Re-prompt for PIN if app was backgrounded > 60s.
  useEffect(() => {
    if (!settings.pin_lock_enabled) return;
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        lastBackgroundedAt.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        const last = lastBackgroundedAt.current;
        if (last !== null && Date.now() - last > BACKGROUND_THRESHOLD_MS) {
          setPinPassed(false);
        }
        lastBackgroundedAt.current = null;
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [settings.pin_lock_enabled]);

  const triggerPanic = useCallback(() => {
    setShowBlank(true);
    if (settings.pin_lock_enabled) {
      setPinPassed(false);
    }
    // Best-effort modal cleanup. Components that render fixed-position
    // overlays via portals usually listen to keydown=Escape, so we
    // dispatch one to dismiss them. Anything ignoring it gets covered
    // by the BlankScreen's z-index regardless.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    // Clear hash routing so coming back doesn't restore the previous view.
    if (window.location.hash) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [settings.pin_lock_enabled]);

  usePanicClose({ enabled: settings.panic_close_enabled, onPanic: triggerPanic });

  // Always-reachable safety surfaces. The PIN gate must NOT block
  // /privacy or routes the user can use to disengage.
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  const isSafetyRoute = path === '/privacy';

  if (loading || pinSet === null) {
    return <>{children}</>;
  }

  if (showBlank) {
    return (
      <BlankScreen
        variant={settings.icon_variant}
        onTap={() => {
          setShowBlank(false);
        }}
      />
    );
  }

  if (settings.pin_lock_enabled && pinSet && !pinPassed && !isSafetyRoute) {
    return <PinGate onUnlock={() => setPinPassed(true)} />;
  }

  return <>{children}</>;
}
