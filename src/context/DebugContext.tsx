/**
 * Debug Mode Context
 *
 * Provides hidden debug mode access for development features.
 * Activated by tapping the version number 5 times quickly.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const DEBUG_STORAGE_KEY = 'debug_mode_enabled';
const TAP_THRESHOLD_MS = 500; // Time window for consecutive taps
const TAPS_REQUIRED = 5;

interface DebugModeContextType {
  isDebugMode: boolean;
  enableDebugMode: () => void;
  disableDebugMode: () => void;
  toggleDebugMode: () => void;
  // Tap tracking for hidden activation
  registerTap: () => void;
  tapCount: number;
}

const DebugModeContext = createContext<DebugModeContextType | undefined>(undefined);

export function DebugModeProvider({ children }: { children: React.ReactNode }) {
  const [isDebugMode, setIsDebugMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DEBUG_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [tapCount, setTapCount] = useState(0);
  const [lastTapTime, setLastTapTime] = useState(0);

  // Persist debug mode state
  useEffect(() => {
    try {
      localStorage.setItem(DEBUG_STORAGE_KEY, isDebugMode ? 'true' : 'false');
    } catch {
      // Ignore storage errors
    }
  }, [isDebugMode]);

  const enableDebugMode = useCallback(() => {
    setIsDebugMode(true);
  }, []);

  const disableDebugMode = useCallback(() => {
    setIsDebugMode(false);
  }, []);

  const toggleDebugMode = useCallback(() => {
    setIsDebugMode(prev => !prev);
  }, []);

  // Register a tap for hidden activation
  const registerTap = useCallback(() => {
    const now = Date.now();

    if (now - lastTapTime > TAP_THRESHOLD_MS) {
      // Reset tap count if too much time has passed
      setTapCount(1);
    } else {
      // Increment tap count
      setTapCount(prev => {
        const newCount = prev + 1;
        if (newCount >= TAPS_REQUIRED) {
          // Enable debug mode after required taps
          setIsDebugMode(true);
          return 0; // Reset count
        }
        return newCount;
      });
    }

    setLastTapTime(now);
  }, [lastTapTime]);

  const value: DebugModeContextType = {
    isDebugMode,
    enableDebugMode,
    disableDebugMode,
    toggleDebugMode,
    registerTap,
    tapCount,
  };

  return (
    <DebugModeContext.Provider value={value}>
      {children}
    </DebugModeContext.Provider>
  );
}

export function useDebugMode(): DebugModeContextType {
  const context = useContext(DebugModeContext);
  if (context === undefined) {
    throw new Error('useDebugMode must be used within a DebugModeProvider');
  }
  return context;
}

// Optional hook that doesn't throw if used outside provider
export function useDebugModeOptional(): DebugModeContextType | null {
  const context = useContext(DebugModeContext);
  return context ?? null;
}
