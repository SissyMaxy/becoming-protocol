/**
 * upload — pure helpers backing the PhotoUploadWidget. Extracted so the
 * round-trip is testable without mounting React.
 *
 * The widget composes these helpers in this order:
 *   1. Pick file → object URL preview (browser-only, not here)
 *   2. uploadVerificationPhoto(...)  — storage + DB insert
 *   3. analyzeVerificationPhoto(...) — vision call
 *   4. updateVerificationReview(...) — write back the verdict
 */

// Loosely-typed supabase shape — only the .from(table).update().eq().eq() chain
// is exercised. Allows the helper to accept either the project-typed client
// (src/lib/supabase) or a hand-rolled mock from tests without dragging in
// the full SupabaseClient type. The leaf is a thenable, not strictly a
// Promise — supabase-js returns its own filter-builder which is awaitable.
type Thenable<T> = PromiseLike<T>;
type LooseSupabase = {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => Thenable<{ data: unknown; error: unknown }>;
      };
    };
  };
};

export type VerificationType =
  | 'wardrobe_acquisition'
  | 'posture_check'
  | 'mirror_affirmation'
  | 'mantra_recitation'
  | 'pose_hold'
  | 'freeform';

export type DirectiveKind =
  | 'handler_decree'
  | 'arousal_touch_task'
  | 'body_feminization_directive'
  | 'daily_outfit_mandate'
  | 'wardrobe_item'
  | 'mommy_mantra'
  | 'freeform';

/**
 * Maps the user-facing verification taxonomy to the legacy task_type
 * the analyze-photo prompt selector understands. Single source of truth;
 * the widget AND any future surface using the taxonomy should import this
 * rather than duplicating the table.
 */
export const TASK_TYPE_FOR: Record<VerificationType, string> = {
  wardrobe_acquisition: 'outfit',
  posture_check: 'mirror_check',
  mirror_affirmation: 'mirror_check',
  mantra_recitation: 'mirror_check',
  pose_hold: 'pose',
  freeform: 'general',
};

/**
 * Maps an arousal_touch_tasks.category value to the verification taxonomy.
 * Returns null when the category doesn't imply observable proof (e.g.
 * 'edge_then_stop' is private; no photo CTA should appear).
 */
export function photoTypeForTouchCategory(category: string): VerificationType | null {
  switch (category) {
    case 'mantra_aloud': return 'mantra_recitation';
    case 'mirror_admission': return 'mirror_affirmation';
    case 'pose_hold': return 'pose_hold';
    case 'panty_check':
    case 'public_micro':
      return 'freeform';
    default:
      return null;
  }
}

/** Storage path: must start with `${userId}/...` to satisfy the
 * verification-photos bucket's RLS policy. */
export function buildStoragePath(userId: string, ext: string): string {
  const safeExt = (ext || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
  const rand = Math.random().toString(36).slice(2, 8);
  return `${userId}/verifications/${Date.now()}-${rand}.${safeExt}`;
}

/**
 * Round-trip helper used by the PhotoUploadWidget. Takes an already-uploaded
 * photoUrl and a fresh verification_photos.id, calls /api/handler/analyze-photo,
 * and writes the resulting review_state back to the row.
 *
 * Returns the analysis text + the final review_state. Throws on transport
 * errors; vision-side refusals are returned as `{ analysis, reviewState: 'denied' }`
 * the same way analyze-photo handles them.
 */
export interface AnalyzePhotoResult {
  analysis: string;
  reviewState: 'approved' | 'denied';
}

export async function analyzeAndPersist(
  supabase: LooseSupabase,
  args: {
    photoId: string;
    photoUrl: string;
    taskType: string;
    caption?: string;
    userId: string;
    accessToken: string;
    fetchImpl?: typeof fetch;
  },
): Promise<AnalyzePhotoResult> {
  const f = args.fetchImpl ?? fetch;
  const res = await f('/api/handler/analyze-photo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.accessToken}`,
    },
    body: JSON.stringify({
      photoId: args.photoId,
      photoUrl: args.photoUrl,
      taskType: args.taskType,
      caption: args.caption,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`analyze-photo ${res.status}: ${body.slice(0, 120)}`);
  }
  const json = (await res.json()) as { analysis?: string; approved?: boolean };
  const reviewState: AnalyzePhotoResult['reviewState'] = json.approved ? 'approved' : 'denied';

  await supabase
    .from('verification_photos')
    .update({ review_state: reviewState })
    .eq('id', args.photoId)
    .eq('user_id', args.userId);

  return { analysis: json.analysis ?? '', reviewState };
}
