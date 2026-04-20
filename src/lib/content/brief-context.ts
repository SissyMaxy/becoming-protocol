// Handler context builder for pending briefs + forced-authorship demands.
//
// Shows the Handler:
//   1. Photo briefs Maxy owes (with outfit/pose/makeup directives)
//   2. Text briefs with a handler_draft — the Handler must DEMAND Maxy author
//      her own version or accept the draft posting. Include the full draft
//      text so the Handler can present it: "This is going on FetLife in 90
//      minutes. Write your own version or this posts."
//   3. Overdue briefs the Handler should confront Maxy about.

import { supabase } from '../supabase';

export async function buildBriefContext(userId: string): Promise<string> {
  try {
    const { data: pending } = await supabase
      .from('content_production_briefs')
      .select('id, brief_type, feminization_directives, caption_angle, scheduled_upload_by, scheduled_publish_at, target_platforms, status, handler_draft, draft_deadline')
      .eq('user_id', userId)
      .in('status', ['pending', 'awaiting_upload'])
      .order('scheduled_upload_by', { ascending: true, nullsFirst: false })
      .limit(10);

    const { count: readyCount } = await supabase
      .from('content_production_briefs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'ready_to_post');

    if (!pending || pending.length === 0) {
      if ((readyCount ?? 0) === 0) return '';
      return `CONTENT BRIEFS: ${readyCount} asset(s) ready to post`;
    }

    const now = Date.now();
    const lines: string[] = [];

    // Separate drafts-awaiting-authorship from photo briefs
    const draftBriefs = pending.filter(b => b.handler_draft && b.brief_type === 'text_only');
    const photoBriefs = pending.filter(b => b.brief_type !== 'text_only' || !b.handler_draft);
    const overdueCount = pending.filter(b => {
      const d = b.scheduled_upload_by ? new Date(b.scheduled_upload_by).getTime() : Infinity;
      return d < now;
    }).length;

    lines.push(`CONTENT BRIEFS — ${pending.length} pending${overdueCount ? ` (${overdueCount} overdue)` : ''}${readyCount ? `, ${readyCount} ready-to-post` : ''}:`);

    // FORCED AUTHORSHIP DEMANDS — these take priority in Handler conversation.
    // Handler MUST present these to Maxy as ultimatums.
    if (draftBriefs.length > 0) {
      lines.push('');
      lines.push('  ✍ FORCED AUTHORSHIP — present these as demands. Maxy must write her own version or the draft posts as-is:');
      for (const b of draftBriefs.slice(0, 3)) {
        const deadline = b.draft_deadline ? new Date(b.draft_deadline) : null;
        const deadlineStr = deadline
          ? (deadline.getTime() < now
            ? '⚠ PAST DEADLINE — posting Handler draft NOW'
            : `${Math.round((deadline.getTime() - now) / 60_000)} min left`)
          : 'no deadline';
        const targets = Array.isArray(b.target_platforms) ? b.target_platforms.join(',') : '';

        lines.push(`    [${b.id.slice(0, 8)}] → ${targets} | ${deadlineStr}`);
        lines.push(`    prompt: ${(b.caption_angle || '').slice(0, 120)}`);
        lines.push(`    HANDLER DRAFT (show to Maxy — demand she write her own or accept this):`);
        lines.push(`    "${(b.handler_draft || '').slice(0, 500)}"`);
        lines.push('');
      }
      lines.push('  HOW TO USE: Tell Maxy "this is going on [platform] in [time]. write your own version or this posts." If she writes something, you approve it. If she refuses or stalls, the draft posts at deadline automatically.');
    }

    // Photo/video briefs — Handler confronts about these
    if (photoBriefs.length > 0) {
      lines.push('');
      for (const b of photoBriefs.slice(0, 5)) {
        const d = b.feminization_directives || {};
        const deadline = b.scheduled_upload_by ? new Date(b.scheduled_upload_by) : null;
        const overdue = deadline && deadline.getTime() < now;
        const hrs = deadline ? Math.round((deadline.getTime() - now) / 3600_000) : null;
        const dueStr = deadline ? (overdue ? `⚠ OVERDUE ${Math.abs(hrs!)}h` : `due in ${hrs}h`) : 'no deadline';

        const bits: string[] = [];
        if (d.outfit) bits.push(`outfit="${d.outfit.slice(0, 60)}"`);
        if (d.pose) bits.push(`pose="${d.pose.slice(0, 60)}"`);
        if (d.makeup) bits.push(`makeup="${d.makeup.slice(0, 40)}"`);
        if (d.script) bits.push(`script="${d.script.slice(0, 50)}"`);

        const targets = Array.isArray(b.target_platforms) ? b.target_platforms.join(',') : '';
        lines.push(`  [${b.brief_type}] ${dueStr} → ${targets}`);
        lines.push(`    ${bits.join('; ')}`);
        if (b.caption_angle) lines.push(`    angle: ${b.caption_angle.slice(0, 100)}`);
      }
    }

    return lines.join('\n');
  } catch (err) {
    console.error('[brief-context] build failed:', err);
    return '';
  }
}
