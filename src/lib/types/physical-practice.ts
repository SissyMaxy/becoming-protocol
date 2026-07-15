// Types for the 011 physical practice ladder (oral + bottoming drill tracks).
// snake_case DbXxx mirrors the supabase-js row shape (mig 680); camel PhysicalXxx
// is the app shape. Mappers below.

export type PhysicalTrack = 'oral' | 'bottoming';
export type PhysicalProgressStatus = 'active' | 'paused' | 'complete';

export interface DbPhysicalRung {
  id: string;
  track: PhysicalTrack;
  rung_order: number;
  slug: string;
  title: string;
  prop: string | null;
  technique_focus: string;
  edict_template: string;
  is_size_step: boolean;
  requires_prep_attestation: boolean;
  is_prep_step: boolean;
  safety_notes: string | null;
}

export interface PhysicalRung {
  id: string;
  track: PhysicalTrack;
  rungOrder: number;
  slug: string;
  title: string;
  prop: string | null;
  techniqueFocus: string;
  edictTemplate: string;
  isSizeStep: boolean;
  requiresPrepAttestation: boolean;
  isPrepStep: boolean;
  safetyNotes: string | null;
}

export interface PhysicalProgress {
  track: PhysicalTrack;
  activeRungOrder: number;
  status: PhysicalProgressStatus;
  prepAttestedAt: string | null;
}

export interface PhysicalLog {
  rungOrder: number;
  comfortRating: number; // 0–10
  completedAt: string;   // ISO
}

export function toPhysicalRung(r: DbPhysicalRung): PhysicalRung {
  return {
    id: r.id,
    track: r.track,
    rungOrder: r.rung_order,
    slug: r.slug,
    title: r.title,
    prop: r.prop,
    techniqueFocus: r.technique_focus,
    edictTemplate: r.edict_template,
    isSizeStep: r.is_size_step,
    requiresPrepAttestation: r.requires_prep_attestation,
    isPrepStep: r.is_prep_step,
    safetyNotes: r.safety_notes,
  };
}
