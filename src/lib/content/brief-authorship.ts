// Brief Authorship — Handler captures Maxy's authored text from chat.
//
// Flow:
//   1. Handler sees a forced-authorship brief in context (has handler_draft)
//   2. Handler demands Maxy write her own version in chat
//   3. Maxy types her text
//   4. Handler calls submitMaxyAuthorship() with her text
//   5. Submission created (approved), brief flips to ready_to_post
//   6. Auto-poster publishes on next tick
//
// The Handler can also call this if it's satisfied with an edit Maxy made
// to the draft ("close enough — posting it").

import { supabase } from '../supabase';

/**
 * Submit Maxy's authored text for a specific brief. Creates an approved
 * content_submission and flips the brief to ready_to_post.
 *
 * Returns the submission id, or null if something went wrong.
 */
export async function submitMaxyAuthorship(
  userId: string,
  briefId: string,
  authoredText: string,
  handlerNotes?: string,
): Promise<string | null> {
  try {
    const { data: brief } = await supabase
      .from('content_production_briefs')
      .select('id, status, brief_type')
      .eq('id', briefId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!brief) return null;

    const { data: sub, error } = await supabase.from('content_submissions').insert({
      user_id: userId,
      brief_id: briefId,
      asset_type: 'text',
      asset_text: authoredText.trim(),
      status: 'approved',
      compliance_score: 10,
      handler_notes: handlerNotes || 'maxy-authored via Handler chat',
      reviewed_at: new Date().toISOString(),
    }).select('id').single();

    if (error || !sub) return null;

    await supabase.from('content_production_briefs')
      .update({ status: 'ready_to_post' })
      .eq('id', briefId);

    return sub.id;
  } catch {
    return null;
  }
}

/**
 * Get the list of briefs currently awaiting Maxy's authorship (have a
 * handler_draft, status is awaiting_upload, deadline hasn't passed).
 * Used by the Handler to know which briefs to demand fulfillment on.
 */
export async function getPendingAuthorshipBriefs(userId: string): Promise<Array<{
  id: string;
  caption_angle: string | null;
  handler_draft: string | null;
  draft_deadline: string | null;
  target_platforms: string[];
}>> {
  const { data } = await supabase
    .from('content_production_briefs')
    .select('id, caption_angle, handler_draft, draft_deadline, target_platforms')
    .eq('user_id', userId)
    .eq('brief_type', 'text_only')
    .eq('status', 'awaiting_upload')
    .not('handler_draft', 'is', null)
    .order('draft_deadline', { ascending: true, nullsFirst: false })
    .limit(5);

  return (data || []) as any;
}
