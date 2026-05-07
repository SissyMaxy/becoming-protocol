export type StealthIconVariant = 'default' | 'calculator' | 'notes';

export interface StealthSettings {
  icon_variant: StealthIconVariant;
  neutral_notifications: boolean;
  panic_close_enabled: boolean;
  pin_lock_enabled: boolean;
}

export const DEFAULT_STEALTH_SETTINGS: StealthSettings = {
  icon_variant: 'default',
  neutral_notifications: false,
  panic_close_enabled: false,
  pin_lock_enabled: false,
};

export const ICON_VARIANT_LABELS: Record<StealthIconVariant, { name: string; description: string }> = {
  default: {
    name: 'BP',
    description: 'The default protocol icon and name.',
  },
  calculator: {
    name: 'Calculator',
    description: 'Disguised as a calculator app on your home screen.',
  },
  notes: {
    name: 'Notes',
    description: 'Disguised as a notes app on your home screen.',
  },
};

export interface StealthPinRow {
  user_id: string;
  pin_hash: string;
  pin_salt: string;
  pin_iterations: number;
  pin_set_at: string;
  failed_attempts: number;
  locked_until: string | null;
  last_attempt_at: string | null;
  updated_at: string;
}

export interface PinAttemptResult {
  ok: boolean;
  reason?: 'wrong_pin' | 'locked' | 'no_pin_set' | 'error';
  lockedUntil?: Date | null;
  remainingAttempts?: number;
}
