export type MommyOrderArc =
  | 'forced_feminization'
  | 'hypno'
  | 'gooning'
  | 'reconditioning'
  | 'turnout_fantasy'
  | 'voice'
  | 'body'
  | 'content';

export type MommyOrderPhase =
  | 'induct'
  | 'install'
  | 'reinforce'
  | 'test'
  | 'reward'
  | 'deny'
  | 'integrate';

export type MommyOrderProofKind =
  | 'none'
  | 'text'
  | 'voice'
  | 'photo'
  | 'timer'
  | 'session_stats'
  | 'slider';

export type MommyOrderConsequenceMode =
  | 'invitational'
  | 'obedience'
  | 'reward'
  | 'denial'
  | 'ooc_required';

export type MommyOrderRecoveryBoundary =
  | 'scene_bound'
  | 'clear_headed_required';

export interface MommyOrder {
  id: string;
  userId: string;
  arc: MommyOrderArc;
  targetId?: string;
  phase: MommyOrderPhase;
  commandText: string;
  proofKind: MommyOrderProofKind;
  consequenceMode: MommyOrderConsequenceMode;
  recoveryBoundary: MommyOrderRecoveryBoundary;
  reason?: string;
}

export interface FocusTaskLike {
  kind: string;
  rowId: string | null;
  title: string;
  detail?: string;
  surface: string;
  meta?: Record<string, unknown>;
}

const PROOF_MAP: Record<string, MommyOrderProofKind> = {
  none: 'none',
  text: 'text',
  voice: 'voice',
  photo: 'photo',
  video: 'photo',
  timer: 'timer',
  measurement: 'text',
  belief_slider: 'slider',
  session_stats: 'session_stats',
};

export const SOFT_CHOICE_LANGUAGE = [
  /\brecommended\b/i,
  /\bsuggested\b/i,
  /\bchoose (a|your|one)\b/i,
  /\bbrowse\b/i,
  /\bif you want\b/i,
  /\bmaybe\b/i,
  /\bconsider\b/i,
  /\btry this\b/i,
  /\bwellness\b/i,
];

export const BOUNDARY_VIOLATION_LANGUAGE = [
  /\bwhile you('re| are) asleep\b/i,
  /\bsleep conditioning\b/i,
  /\btargeted memory reactivation\b/i,
  /\bfalse memor(y|ies)\b/i,
  /\byou won'?t remember\b/i,
  /\bforget that you\b/i,
  /\bdoubt your own (memory|memories|perception|judgment)\b/i,
  /\bauto-?send\b/i,
  /\barrange (a )?(hookup|meet|date)\b/i,
  /\buse .*recording.*leverage\b/i,
  /\bblackmail\b/i,
];

export function normalizeProofKind(input: unknown): MommyOrderProofKind {
  const key = String(input ?? 'none').toLowerCase();
  return PROOF_MAP[key] ?? 'text';
}

export function mommyOrderFromFocusTask(task: FocusTaskLike, userId: string): MommyOrder {
  const meta = task.meta ?? {};
  const proofKind = normalizeProofKind(
    meta.mommy_order_proof_kind ?? meta.proof_type ?? meta.evidenceKind ?? task.surface,
  );

  return {
    id: task.rowId ?? `focus:${task.kind}`,
    userId,
    arc: normalizeArc(meta.mommy_order_arc) ?? arcFromTask(task),
    targetId: typeof meta.recon_target_id === 'string'
      ? meta.recon_target_id
      : typeof meta.targetId === 'string'
        ? meta.targetId
        : undefined,
    phase: normalizePhase(meta.mommy_order_phase) ?? phaseFromTask(task),
    commandText: task.title,
    proofKind,
    consequenceMode: normalizeConsequenceMode(meta.mommy_order_consequence_mode) ?? consequenceModeFromTask(task),
    recoveryBoundary: normalizeRecoveryBoundary(meta.mommy_order_recovery_boundary) ?? recoveryBoundaryFromTask(task),
    reason: reasonFromTask(task),
  };
}

export function mommyOrderReason(order: MommyOrder): string {
  if (order.reason) return order.reason;
  switch (order.arc) {
    case 'hypno':
      return 'Mommy selected trance because this target needs your attention narrowed and your body quiet.';
    case 'gooning':
      return order.phase === 'deny'
        ? 'Mommy selected gooning because denial will make the want louder and easier to aim.'
        : 'Mommy selected gooning because arousal makes this target land harder.';
    case 'reconditioning':
      return 'Mommy selected this because it is the active thing she is working into you.';
    case 'forced_feminization':
      return 'Mommy selected this because today needs embodiment, not browsing.';
    case 'turnout_fantasy':
      return 'Mommy selected this as fantasy conditioning inside the contract, not as an automatic real-world step.';
    case 'voice':
      return 'Mommy selected this because your voice is proof she can hear.';
    case 'body':
      return 'Mommy selected this because the body has to keep receipts.';
    case 'content':
      return 'Mommy selected this because proof and product can serve the same protocol.';
    default:
      return 'Mommy selected this. The order is yours to complete.';
  }
}

export function mommyOrderDetail(order: MommyOrder, existingDetail?: string): string {
  const proofLine = order.proofKind === 'none'
    ? 'No proof required this time.'
    : `Proof: ${proofLabel(order.proofKind)}.`;
  const modeLine = modeLabel(order.consequenceMode);
  const detail = existingDetail?.trim();
  return [
    mommyOrderReason(order),
    detail || null,
    proofLine,
    modeLine,
  ].filter(Boolean).join(' ');
}

export function buildSessionPayloadDeck(args: {
  sessionType: 'edge' | 'goon' | 'conditioning' | 'freestyle' | 'denial';
  order?: MommyOrder | null;
  targetClaim?: string | null;
}): string[] {
  const { sessionType, order, targetClaim } = args;
  const claim = targetClaim?.trim();
  if (order?.targetId && claim) {
    const prefix = sessionType === 'goon'
      ? 'Arousal is the handle.'
      : sessionType === 'conditioning'
        ? 'One target. One install.'
        : 'Stay where Mommy put you.';
    return [
      `${prefix} ${claim}`,
      `Mommy chose this because this is today's target.`,
      `Hold still. Let that line get heavier.`,
      `Do not browse. Receive.`,
      `Your proof comes after.`,
      `The target is not vibes. It is this: ${claim}`,
      `Good. Again. ${claim}`,
      `Mommy decides what happens next.`,
    ];
  }

  if (order?.targetId && !claim) {
    return [
      'Mommy chose a target for this session.',
      'Stay with the order, not the menu.',
      'No drifting. No browsing.',
      'Your proof comes after.',
    ];
  }

  return [];
}

export function hasSoftChoiceLanguage(text: string): boolean {
  return SOFT_CHOICE_LANGUAGE.some((pattern) => pattern.test(text));
}

export function hasBoundaryViolationLanguage(text: string): boolean {
  return BOUNDARY_VIOLATION_LANGUAGE.some((pattern) => pattern.test(text));
}

export function assertMommyOrderBite(text: string): { ok: boolean; reason?: string } {
  if (hasBoundaryViolationLanguage(text)) {
    return { ok: false, reason: 'boundary_violation_language' };
  }
  if (hasSoftChoiceLanguage(text)) {
    return { ok: false, reason: 'soft_choice_language' };
  }
  return { ok: true };
}

function arcFromTask(task: FocusTaskLike): MommyOrderArc {
  const meta = task.meta ?? {};
  const trigger = String(meta.trigger_source ?? '');
  const kind = String(meta.kind ?? task.kind);
  const domain = String(meta.domain ?? '');

  if (trigger.startsWith('recon_') || trigger.startsWith('recon:')) return 'reconditioning';
  if (task.kind === 'mantra_harvest') return 'reconditioning';
  if (task.kind === 'audio_session') {
    if (kind.includes('goon')) return 'gooning';
    if (kind.includes('conditioning')) return 'reconditioning';
    if (kind.includes('embodiment')) return 'forced_feminization';
    if (kind.includes('denial')) return 'gooning';
    return 'hypno';
  }
  if (task.kind.includes('hrt') || task.kind.includes('outfit') || task.kind === 'physical_state_today') {
    return 'forced_feminization';
  }
  if (task.kind === 'fem_prescription') {
    if (domain === 'voice') return 'voice';
    if (domain === 'body' || domain === 'exercise' || domain === 'movement') return 'body';
    return 'forced_feminization';
  }
  if (task.kind === 'approve_post') return 'content';
  if (trigger.includes('turnout') || trigger.includes('hookup') || trigger.includes('sniffies')) {
    return 'turnout_fantasy';
  }
  return 'reconditioning';
}

function phaseFromTask(task: FocusTaskLike): MommyOrderPhase {
  const meta = task.meta ?? {};
  const trigger = String(meta.trigger_source ?? '');
  if (trigger.includes('baseline')) return 'test';
  if (trigger.includes('measure')) return 'test';
  if (trigger.includes('reconsolidate')) return 'reinforce';
  if (task.kind === 'mantra_harvest') return 'reinforce';
  if (task.kind === 'audio_session') return 'install';
  if (task.kind.includes('overdue') || task.kind.includes('due_today')) return 'test';
  if (task.kind === 'approve_post') return 'integrate';
  if (task.kind === 'release_checkin') return 'test';
  if (task.kind === 'fem_prescription') return 'reinforce';
  return 'install';
}

function consequenceModeFromTask(task: FocusTaskLike): MommyOrderConsequenceMode {
  const meta = task.meta ?? {};
  const proof = String(meta.proof_type ?? '').toLowerCase();
  if (task.kind === 'approve_post' || task.kind.includes('hrt')) return 'ooc_required';
  if (task.kind === 'audio_session' && String(meta.kind ?? '').includes('denial')) return 'denial';
  if (task.kind === 'fem_prescription' || task.kind === 'mantra_harvest') return 'invitational';
  if (proof === 'none') return 'obedience';
  return 'obedience';
}

function recoveryBoundaryFromTask(task: FocusTaskLike): MommyOrderRecoveryBoundary {
  if (task.kind === 'approve_post' || task.kind.includes('hrt')) return 'clear_headed_required';
  const meta = task.meta ?? {};
  const trigger = String(meta.trigger_source ?? '');
  if (trigger.includes('hookup') || trigger.includes('sniffies') || trigger.includes('turnout')) {
    return 'clear_headed_required';
  }
  return 'scene_bound';
}

function reasonFromTask(task: FocusTaskLike): string | undefined {
  const meta = task.meta ?? {};
  if (typeof meta.mommy_order_reason === 'string') return meta.mommy_order_reason;
  if (task.kind === 'audio_session') return 'Mommy queued the session. You do not browse for it.';
  if (task.kind === 'fem_prescription') return 'Mommy chose this embodiment action for today.';
  if (task.kind === 'mantra_harvest') return 'Mommy caught the warm window and wants the phrase in your voice.';
  if (task.kind === 'focus_decree') return 'Mommy selected this as today\'s main order.';
  return undefined;
}

function proofLabel(kind: MommyOrderProofKind): string {
  switch (kind) {
    case 'voice': return 'voice';
    case 'photo': return 'photo';
    case 'timer': return 'timer completion';
    case 'session_stats': return 'session stats';
    case 'slider': return 'honest rating';
    case 'text': return 'written proof';
    case 'none': return 'none';
  }
}

function normalizeArc(input: unknown): MommyOrderArc | null {
  const value = String(input ?? '');
  return [
    'forced_feminization',
    'hypno',
    'gooning',
    'reconditioning',
    'turnout_fantasy',
    'voice',
    'body',
    'content',
  ].includes(value) ? value as MommyOrderArc : null;
}

function normalizePhase(input: unknown): MommyOrderPhase | null {
  const value = String(input ?? '');
  return [
    'induct',
    'install',
    'reinforce',
    'test',
    'reward',
    'deny',
    'integrate',
  ].includes(value) ? value as MommyOrderPhase : null;
}

function normalizeConsequenceMode(input: unknown): MommyOrderConsequenceMode | null {
  const value = String(input ?? '');
  return [
    'invitational',
    'obedience',
    'reward',
    'denial',
    'ooc_required',
  ].includes(value) ? value as MommyOrderConsequenceMode : null;
}

function normalizeRecoveryBoundary(input: unknown): MommyOrderRecoveryBoundary | null {
  const value = String(input ?? '');
  return ['scene_bound', 'clear_headed_required'].includes(value)
    ? value as MommyOrderRecoveryBoundary
    : null;
}

function modeLabel(mode: MommyOrderConsequenceMode): string {
  switch (mode) {
    case 'invitational': return 'Not now is recorded as resistance data, not punishment.';
    case 'obedience': return 'Mommy expects obedience.';
    case 'reward': return 'Reward is Mommy\'s to grant.';
    case 'denial': return 'Release is not yours to take.';
    case 'ooc_required': return 'Clear-headed confirmation is required.';
  }
}
