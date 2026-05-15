/**
 * Reply-cues — parse Mama's outreach body for two affordance signals:
 *
 *   1. Does she demand a photo? ("show me", "camera ready", "send a
 *      picture", "let mama see", etc.)
 *   2. Does she set a soft deadline? ("in the next ten minutes", "in
 *      fifteen minutes", "by 9pm", "in an hour")
 *
 * The card uses (1) to render the photo upload button, (2) to render
 * the countdown chip. Both are best-effort regex parsers — false
 * negatives just degrade gracefully (no countdown / no photo button)
 * and an explicit `requires_photo` column / `reply_deadline_at` column
 * on the outreach row overrides the parsed result.
 */

const PHOTO_PATTERNS: RegExp[] = [
  /\bcamera\s*ready\b/i,
  /\bcamera\s+on\b/i,
  /\bshow\s+(me|mama|mommy)\b/i,
  /\blet\s+(me|mama|mommy)\s+see\b/i,
  /\bi\s+(want\s+to|wanna|need\s+to)\s+see\b/i,
  /\b(send|snap|take)\s+(?:me\s+)?a?\s*(picture|pic|photo|snap|selfie|mirror)\b/i,
  /\bpicture\s+(?:for\s+)?(?:me|mama|mommy)\b/i,
  /\bphoto\s+(?:for\s+)?(?:me|mama|mommy)\b/i,
  /\bselfie\b/i,
  /\bmirror\s+(?:shot|pic|check)\b/i,
];

export function detectPhotoDemand(message: string | null | undefined): boolean {
  if (!message) return false;
  return PHOTO_PATTERNS.some((re) => re.test(message));
}

const VIDEO_PATTERNS: RegExp[] = [
  /\brecord\s+yourself\b/i,
  /\bon\s+camera\b/i,
  /\bvideo(?:\s+(?:proof|message|clip|reply))?\b/i,
  /\bfilm\s+yourself\b/i,
  /\bcamera\s+on\s+and\s+say\b/i,
  /\bsaying\s+it\s+(?:out\s+)?loud\b/i,
  /\bshow\s+mama\s+on\s+camera\b/i,
];

const AUDIO_PATTERNS: RegExp[] = [
  /\bvoice\s+(?:note|memo|message|recording|reply)\b/i,
  /\brecord\s+(?:your\s+)?voice\b/i,
  /\baudio\s+(?:proof|note|message|reply)\b/i,
  /\blet\s+mama\s+hear\b/i,
  /\btell\s+mama\s+out\s+loud\b/i,
  /\bsay\s+it\s+out\s+loud\b/i,
];

export type EvidenceKind = 'photo' | 'video' | 'audio' | 'any' | 'none';

/**
 * Detect what evidence kind Mama is demanding. Mirrors the SQL
 * infer_evidence_kind() helper added in migration 424. Order matters:
 * video before audio (record yourself saying X is video, not audio).
 */
export function detectMediaKind(message: string | null | undefined): EvidenceKind | null {
  if (!message) return null;
  if (VIDEO_PATTERNS.some((re) => re.test(message))) return 'video';
  if (AUDIO_PATTERNS.some((re) => re.test(message))) return 'audio';
  if (PHOTO_PATTERNS.some((re) => re.test(message))) return 'photo';
  return null;
}

interface DeadlineParse {
  deadlineAt: Date;
  // Original phrase, for telemetry / debug only.
  source: string;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90,
};

function parseQuantity(raw: string): number | null {
  const t = raw.toLowerCase().trim();
  const asNum = Number(t);
  if (!Number.isNaN(asNum) && asNum > 0) return asNum;
  if (t in NUMBER_WORDS) return NUMBER_WORDS[t];
  return null;
}

/**
 * Best-effort soft deadline parser. Returns null if no obvious deadline
 * cue is present. `now` is injectable for testability.
 */
export function detectReplyDeadline(
  message: string | null | undefined,
  now: Date = new Date(),
): DeadlineParse | null {
  if (!message) return null;

  // Pattern: "in (the next )?N minutes/min/hours/hr"
  const inUnits = message.match(
    /\bin\s+(?:the\s+next\s+)?([0-9]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|ninety)\s+(minutes?|mins?|hours?|hrs?|hr)\b/i,
  );
  if (inUnits) {
    const qty = parseQuantity(inUnits[1]);
    if (qty != null && qty > 0 && qty <= 360) {
      const unit = inUnits[2].toLowerCase();
      const isHours = /^(hours?|hrs?|hr)$/.test(unit);
      const ms = qty * (isHours ? 3600_000 : 60_000);
      return { deadlineAt: new Date(now.getTime() + ms), source: inUnits[0] };
    }
  }

  // Pattern: "in an hour" / "in half an hour"
  if (/\bin\s+(an?\s+hour|one\s+hour)\b/i.test(message)) {
    return { deadlineAt: new Date(now.getTime() + 60 * 60_000), source: 'in an hour' };
  }
  if (/\bin\s+half\s+(?:an\s+)?hour\b/i.test(message)) {
    return { deadlineAt: new Date(now.getTime() + 30 * 60_000), source: 'in half an hour' };
  }

  return null;
}

/**
 * Soft countdown chip text, e.g. "9m 42s" / "1h 12m" / "passed".
 * Returns null if no deadline.
 */
export function formatCountdown(deadlineMs: number, nowMs: number = Date.now()): string | null {
  if (!deadlineMs) return null;
  const diff = deadlineMs - nowMs;
  if (diff <= 0) return 'passed';
  const totalSec = Math.floor(diff / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, '0')}m`;
  if (mins > 0) return `${mins}m ${String(secs).padStart(2, '0')}s`;
  return `${secs}s`;
}
