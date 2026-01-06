// Arousal-Gated Commitments Types
// Commitments that can only be made in specific arousal states

export type BindingLevel = 'soft' | 'hard' | 'permanent';

export type ArousalState =
  | 'baseline'
  | 'building'
  | 'sweet_spot'
  | 'overwhelming'
  | 'subspace';

export interface ArousalGatedCommitment {
  id: string;
  commitmentType: string;
  description: string;
  requiresArousalState: ArousalState[];
  requiresDenialDay: number;
  requiresPhase: number;
  bindingLevel: BindingLevel;
  active: boolean;
}

export interface DbArousalGatedCommitment {
  id: string;
  commitment_type: string;
  description: string;
  requires_arousal_state: ArousalState[];
  requires_denial_day: number;
  requires_phase: number;
  binding_level: string;
  active: boolean;
  created_at: string;
}

export interface UserCommitment {
  id: string;
  commitmentId?: string;
  commitment?: ArousalGatedCommitment;
  commitmentText: string;
  bindingLevel: BindingLevel;
  madeAt: string;
  arousalState?: ArousalState;
  denialDay?: number;
  status: 'active' | 'broken' | 'fulfilled';
  brokenAt?: string;
  fulfilledAt?: string;
  evidence?: CommitmentEvidence;
}

export interface DbUserCommitment {
  id: string;
  user_id: string;
  commitment_id: string | null;
  commitment_text: string;
  binding_level: string;
  made_at: string;
  arousal_state: string | null;
  denial_day: number | null;
  status: string;
  broken_at: string | null;
  fulfilled_at: string | null;
  evidence: CommitmentEvidence | null;
  created_at: string;
  arousal_gated_commitments?: DbArousalGatedCommitment;
}

export interface CommitmentEvidence {
  photos?: string[];
  notes?: string[];
  timestamps?: string[];
}

// Binding level descriptions
export const BINDING_LEVEL_INFO: Record<BindingLevel, {
  label: string;
  description: string;
  canBreak: boolean;
  breakConsequence: string;
}> = {
  soft: {
    label: 'Soft',
    description: 'A promise to yourself. Breaking is noted but not penalized.',
    canBreak: true,
    breakConsequence: 'Logged to your record.',
  },
  hard: {
    label: 'Hard',
    description: 'A binding commitment. Breaking has real consequences.',
    canBreak: true,
    breakConsequence: 'Investment decay, streak impact, and permanent record.',
  },
  permanent: {
    label: 'Permanent',
    description: 'Irrevocable. This commitment cannot be broken.',
    canBreak: false,
    breakConsequence: 'This commitment cannot be broken. It will happen.',
  },
};

// Pre-defined commitment types
export const COMMITMENT_TYPES: Record<string, {
  template: string;
  variables?: string[];
}> = {
  extend_denial_7_days: {
    template: 'I commit to extending my denial by 7 more days.',
  },
  accept_permanent_chastity_goal: {
    template: 'I accept permanent chastity as my end goal.',
  },
  schedule_disclosure: {
    template: 'I commit to telling {person} about my journey by {date}.',
    variables: ['person', 'date'],
  },
  hrt_research_commitment: {
    template: 'I commit to completing HRT research by {date}.',
    variables: ['date'],
  },
  wardrobe_purge: {
    template: 'I commit to removing 50% of my masculine wardrobe.',
  },
  name_commitment: {
    template: 'I commit to using only the name Maxy internally.',
  },
  social_expansion: {
    template: 'I commit to telling one more person about who I am.',
  },
};

// Arousal state verification prompts
export const AROUSAL_VERIFICATION: Record<ArousalState, string> = {
  baseline: 'You are calm and clear-headed.',
  building: 'You feel arousal building, but remain in control.',
  sweet_spot: 'You are deeply aroused but aware. The perfect state for truth.',
  overwhelming: 'You are overwhelmed with need. Decisions made here are binding.',
  subspace: 'You have surrendered. In this state, truth flows freely.',
};
