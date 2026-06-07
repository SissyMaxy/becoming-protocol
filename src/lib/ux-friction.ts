// UX friction detector — adaptive loop signal source. (Wish d93efde1, mig 599.)
//
// Detects product/UI friction in a chat message so the adaptive loop can turn
// it into a signal + fix-wish. Precision-tuned: auto-wish creation makes
// false positives expensive, and the protocol's chat corpus is full of
// arousal phrasing ("i can't take it", "this is too much") that must NOT
// register as product friction.
//
// PARITY: keep detectUxFriction() in sync with detect_ux_friction(p_text) in
// migration 599 (the enforcement copy on the chat trigger).

export type FrictionKind =
  | 'not_working' | 'would_be_better' | 'broken' | 'this_is_annoying'
  | 'what_should_this_do' | 'cant_figure_out' | 'ui_element_broken'

const RULES: { kind: FrictionKind; re: RegExp }[] = [
  { kind: 'not_working', re: /(is ?n['’]t|is not|does ?n['’]t|does not|not) (work|working|loading|saving|updating)/ },
  { kind: 'would_be_better', re: /(it |this |that )?would be (more useful|better|nicer|cleaner|easier)/ },
  { kind: 'broken', re: /\b(broken|buggy|glitch|glitched)\b/ },
  { kind: 'this_is_annoying', re: /this (is|feels) (annoying|frustrating|confusing|clunky|broken|useless)/ },
  { kind: 'what_should_this_do', re: /what (should|does|is) (this|it|that)( supposed to)? (do|even do|doing)/ },
  { kind: 'cant_figure_out', re: /can['’]?t (figure out|find|get|see) (it|this|the|where|how)/ },
  { kind: 'ui_element_broken', re: /(the (app|button|page|card|screen|form|counter|gate|timer)) .{0,30}(broke|broken|wrong|missing|gone|stuck|not work|does ?n['’]?t)/ },
]

export function detectUxFriction(text: string): FrictionKind | null {
  if (!text || text.length < 8) return null
  const t = text.toLowerCase()
  for (const r of RULES) if (r.re.test(t)) return r.kind
  return null
}
