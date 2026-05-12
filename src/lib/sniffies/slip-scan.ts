// Sniffies slip + charge scanner — twin file of
// supabase/functions/_shared/sniffies-slip-scan.ts. Keep in sync; the
// regex/weight tables are the authoritative ones in the edge-fn module,
// but the rules are pure and have no Deno-only dependencies so the same
// patterns can be exported for Vite-side use (tests, future client
// previews).
//
// If you change one file, change the other — same model as
// src/lib/sniffies/redaction.ts ↔ supabase/functions/_shared/sniffies-redaction.ts.

export type SniffiesSlipKind =
  | 'masculine_self_reference'
  | 'david_name_use'
  | 'resistance_statement';

export interface SniffiesSlip {
  kind: SniffiesSlipKind;
  slip_type: string;
  slip_points: number;
  trigger_excerpt: string;
}

interface SlipPattern {
  pattern: RegExp;
  kind: SniffiesSlipKind;
  slip_type: string;
  slip_points: number;
}

const SLIP_PATTERNS: readonly SlipPattern[] = [
  { pattern: /\bi['’]?m a (?:man|guy|dude|male|boy|bro|mister)\b/i, kind: 'masculine_self_reference', slip_type: 'masculine_self_reference', slip_points: 5 },
  { pattern: /\bas a (?:man|guy|dude|male|boy)\b/i, kind: 'masculine_self_reference', slip_type: 'masculine_self_reference', slip_points: 4 },
  { pattern: /\bi['’]?m (?:just )?(?:still )?a guy\b/i, kind: 'masculine_self_reference', slip_type: 'masculine_self_reference', slip_points: 5 },
  { pattern: /\bmy manhood\b/i, kind: 'masculine_self_reference', slip_type: 'masculine_self_reference', slip_points: 4 },
  { pattern: /\bmasculine side\b/i, kind: 'masculine_self_reference', slip_type: 'masculine_self_reference', slip_points: 3 },
  { pattern: /\bback to being (?:a )?(?:man|guy|male)\b/i, kind: 'masculine_self_reference', slip_type: 'masculine_self_reference', slip_points: 5 },
  { pattern: /\bnot (?:really )?(?:a )?(?:girl|woman|femme|femboy|sissy)\b/i, kind: 'resistance_statement', slip_type: 'resistance_statement', slip_points: 4 },
  { pattern: /\bi['’]?m david\b/i, kind: 'david_name_use', slip_type: 'david_name_use', slip_points: 5 },
  { pattern: /\bcall me david\b/i, kind: 'david_name_use', slip_type: 'david_name_use', slip_points: 5 },
  { pattern: /\bdavid here\b/i, kind: 'david_name_use', slip_type: 'david_name_use', slip_points: 4 },
] as const;

const DAVID_NAME_RE = /\bDavid\b/;

export function scanSniffiesMessageForSlips(text: string): SniffiesSlip[] {
  if (!text) return [];
  const out: SniffiesSlip[] = [];
  for (const p of SLIP_PATTERNS) {
    const m = text.match(p.pattern);
    if (m) {
      out.push({
        kind: p.kind,
        slip_type: p.slip_type,
        slip_points: p.slip_points,
        trigger_excerpt: m[0].slice(0, 80),
      });
    }
  }
  if (!out.some((s) => s.kind === 'david_name_use')) {
    const dm = text.match(DAVID_NAME_RE);
    if (dm) {
      out.push({
        kind: 'david_name_use',
        slip_type: 'david_name_use',
        slip_points: 3,
        trigger_excerpt: dm[0],
      });
    }
  }
  return out;
}

const CHARGE_TERMS: ReadonlyArray<{ re: RegExp; weight: number }> = [
  { re: /\b(meet ?up|hookup|hook up|host|travel(?:ing)? to|come ?over|drop by|pull up|stop by)\b/i, weight: 3 },
  { re: /\b(tonight|in an hour|right now|asap|today after|after work)\b/i, weight: 2 },
  { re: /\b(send (?:you )?(?:pics?|pic|photos?|nudes?)|here'?s? (?:a )?pic|here is a pic)\b/i, weight: 3 },
  { re: /\b(panties?|skirt|dress|stockings?|heels?|lingerie|bralette|bra)\b/i, weight: 2 },
  { re: /\b(sissy|girly|femme|feminine|trap|cd|crossdress|crossdresser)\b/i, weight: 2 },
  { re: /\b(suck|blow(?:job)?|on my knees|knee[ds]?|deep ?throat|swallow)\b/i, weight: 2 },
  { re: /\b(cock|dick|cum|load|raw|breed|fuck me|use me|degrade)\b/i, weight: 2 },
  { re: /\b(wet|hard|aching|leaking|dripping|throbbing|edging|edge)\b/i, weight: 1 },
];

export interface ChargeScore {
  total: number;
  matched_terms: string[];
  is_high_charge: boolean;
}

export function scoreSniffiesMessageCharge(text: string): ChargeScore {
  if (!text) return { total: 0, matched_terms: [], is_high_charge: false };
  let total = 0;
  const matched: string[] = [];
  for (const t of CHARGE_TERMS) {
    const m = text.match(t.re);
    if (m) {
      total += t.weight;
      matched.push(m[0].toLowerCase().slice(0, 24));
    }
  }
  return {
    total,
    matched_terms: matched.slice(0, 8),
    is_high_charge: total >= 4,
  };
}
