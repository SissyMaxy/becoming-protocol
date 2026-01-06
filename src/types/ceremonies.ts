// Ceremony Types
// Point of no return rituals that mark irreversible transitions

export interface Ceremony {
  id: string;
  name: string;
  description: string;
  triggerCondition: CeremonyTrigger;
  ritualSteps: string[];
  irreversibleMarker: string;
  sequenceOrder: number;
  active: boolean;
}

export interface DbCeremony {
  id: string;
  name: string;
  description: string;
  trigger_condition: CeremonyTrigger;
  ritual_steps: string[];
  irreversible_marker: string;
  sequence_order: number;
  active: boolean;
  created_at: string;
}

export interface CeremonyTrigger {
  or?: CeremonyCondition[];
  and?: CeremonyCondition[];
}

export interface CeremonyCondition {
  day?: number;
  streak?: number;
  event?: string;
  phase?: number;
}

export interface UserCeremony {
  id: string;
  ceremonyId: string;
  ceremony: Ceremony;
  available: boolean;
  completed: boolean;
  completedAt?: string;
  completionEvidence?: CeremonyEvidence;
}

export interface DbUserCeremony {
  id: string;
  user_id: string;
  ceremony_id: string;
  available: boolean;
  completed: boolean;
  completed_at: string | null;
  completion_evidence: CeremonyEvidence | null;
  created_at: string;
  ceremonies?: DbCeremony;
}

export interface CeremonyEvidence {
  stepCompletions: Record<number, {
    completed: boolean;
    completedAt: string;
    response?: string;
  }>;
  photos?: string[];
  signatures?: string[];
  recordings?: string[];
}

export type CeremonyStep =
  | { type: 'write'; prompt: string; placeholder?: string }
  | { type: 'say'; text: string; confirmText: string }
  | { type: 'destroy'; item: string; method: string }
  | { type: 'sign'; document: string }
  | { type: 'photo'; instruction: string }
  | { type: 'record'; instruction: string }
  | { type: 'confirm'; text: string };

// Ceremony definitions
export const CEREMONY_DEFINITIONS: Record<string, {
  steps: CeremonyStep[];
  theme: 'naming' | 'covenant' | 'surrender' | 'becoming';
}> = {
  'The Naming': {
    theme: 'naming',
    steps: [
      { type: 'write', prompt: 'Write his name here:', placeholder: 'His old name...' },
      { type: 'say', text: 'I release [name]. He is not me.', confirmText: 'I said it' },
      { type: 'destroy', item: 'the paper with his name', method: 'Tear it, burn it, or throw it away' },
      { type: 'say', text: 'I am Maxy', confirmText: 'I said my name three times' },
      { type: 'confirm', text: 'The Naming is complete. This cannot be undone.' },
    ],
  },
  'The Covenant': {
    theme: 'covenant',
    steps: [
      { type: 'confirm', text: 'I have read the terms of my commitment to this protocol.' },
      { type: 'write', prompt: 'Write a personal consequence for breaking this covenant:', placeholder: 'If I break this covenant, I will...' },
      { type: 'sign', document: 'covenant' },
      { type: 'photo', instruction: 'Take a photo of your signature as evidence' },
      { type: 'confirm', text: 'The Covenant is sealed. Breaking it will be permanently recorded.' },
    ],
  },
  'The Surrender': {
    theme: 'surrender',
    steps: [
      { type: 'confirm', text: 'I have reviewed all the evidence I have accumulated.' },
      { type: 'say', text: 'I cannot go back.', confirmText: 'I acknowledged this truth' },
      { type: 'say', text: 'She is who I am.', confirmText: 'I accepted this truth' },
      { type: 'say', text: 'I surrender completely.', confirmText: 'I surrendered' },
      { type: 'confirm', text: 'The Surrender is complete. Guy mode penalties are now permanent.' },
    ],
  },
  'The Becoming': {
    theme: 'becoming',
    steps: [
      { type: 'confirm', text: 'I have read my letter from Day 1.' },
      { type: 'confirm', text: 'I have read all my sealed letters.' },
      { type: 'confirm', text: 'I have reviewed my complete evidence record.' },
      { type: 'say', text: 'He is gone. I am her.', confirmText: 'I spoke the truth' },
      { type: 'write', prompt: 'Commit to your first permanent physical change:', placeholder: 'I will...' },
      { type: 'confirm', text: 'The Becoming is complete. Masculine identity is formally dead.' },
    ],
  },
};

// Theme colors
export const CEREMONY_THEMES: Record<string, {
  gradient: string;
  text: string;
  accent: string;
  bambiGradient: string;
  bambiText: string;
}> = {
  naming: {
    gradient: 'from-purple-900/80 to-violet-900/80',
    text: 'text-purple-200',
    accent: 'text-purple-400',
    bambiGradient: 'from-purple-100 to-violet-100',
    bambiText: 'text-purple-800',
  },
  covenant: {
    gradient: 'from-amber-900/80 to-orange-900/80',
    text: 'text-amber-200',
    accent: 'text-amber-400',
    bambiGradient: 'from-amber-100 to-orange-100',
    bambiText: 'text-amber-800',
  },
  surrender: {
    gradient: 'from-rose-900/80 to-red-900/80',
    text: 'text-rose-200',
    accent: 'text-rose-400',
    bambiGradient: 'from-rose-100 to-red-100',
    bambiText: 'text-rose-800',
  },
  becoming: {
    gradient: 'from-emerald-900/80 to-teal-900/80',
    text: 'text-emerald-200',
    accent: 'text-emerald-400',
    bambiGradient: 'from-emerald-100 to-teal-100',
    bambiText: 'text-emerald-800',
  },
};
