// Confession → embodied-action autobinding — decision validation. (Wish
// 849ae5af, mig 603.)
//
// Validates an LLM bind proposal before it becomes a decree, and maps the
// proof kind to the handler_decrees.proof_type enum. Pure + tested; the
// confession-action-bind edge fn mirrors this. Keeps the binder honest: no
// clerical "type it back" commands, must be embodied (voice/photo).

export type ProofKind = 'voice' | 'photo'
export type DecreeProofType = 'audio' | 'photo'

export interface BindProposal {
  should_bind?: boolean
  embodied_command?: string
  proof_kind?: string
  topic_tag?: string
}

export interface ValidBind {
  embodied_command: string
  proof_kind: ProofKind
  decree_proof_type: DecreeProofType
  topic_tag: string
}

// Clerical / typing-only commands are rejected — decrees must be embodied
// (feedback_no_clerical_decrees). Cheap heuristic on the command text.
const CLERICAL_RE = /\b(type|write|copy|paste|repeat in (the )?chat|fill (in|out)|log it|enter (it|the))\b/i

export function validateBind(p: BindProposal): ValidBind | null {
  if (!p || p.should_bind !== true) return null
  const cmd = (p.embodied_command ?? '').trim()
  if (cmd.length < 12) return null
  if (CLERICAL_RE.test(cmd)) return null

  const kind: ProofKind = p.proof_kind === 'photo' ? 'photo' : 'voice'
  return {
    embodied_command: cmd,
    proof_kind: kind,
    decree_proof_type: kind === 'photo' ? 'photo' : 'audio',
    topic_tag: (p.topic_tag ?? 'general').slice(0, 40),
  }
}

// 24-72h out, varied by a 0..1 jitter (edge fn passes Math.random()).
export function bindDeadlineMs(jitter: number, now = Date.now()): number {
  const hours = 24 + Math.max(0, Math.min(1, jitter)) * 48
  return now + hours * 3600_000
}
