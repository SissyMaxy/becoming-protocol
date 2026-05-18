/**
 * Sniffies DM sync — periodically scrapes the Sniffies inbox via Playwright
 * and writes new inbound messages into hookup_prospect_messages. Creates
 * hookup_prospects rows for new contacts.
 *
 * Trigger downstream:
 *   - Inserting into hookup_prospect_messages fires trg_score_on_inbound,
 *     which auto-recomputes prospect composite_score.
 *   - mommy-hookup-dm-drafter (edge fn) picks up inbound messages without
 *     a recent outbound and drafts replies into mommy_drafts.
 *   - mommy-draft-executor then sends them via this same Sniffies session.
 *
 * Run via:
 *   tsx scripts/auto-poster/sniffies-dm-sync.ts
 */

import { createClient } from '@supabase/supabase-js';
import { getSniffiesPage } from './sniffies-session';

const supabaseUrl = process.env.SUPABASE_URL ?? '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const userId = process.env.USER_ID ?? '';
if (!supabaseUrl || !supabaseKey || !userId) {
  console.error('[sniffies-dm-sync] missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / USER_ID');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

interface InboxMessage {
  handle: string;
  display_name?: string;
  content: string;
  external_id?: string;
}

async function readInbox(): Promise<InboxMessage[]> {
  const page = await getSniffiesPage();
  if (!page) return [];
  try {
    await page.goto('https://sniffies.com/messages', { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(3000);
    // The actual Sniffies DOM is dynamic — these selectors are placeholders
    // that need to match the live DOM. Update once UI is inspected.
    return await page.evaluate(() => {
      const items: Array<{ handle: string; display_name?: string; content: string; external_id?: string }> = [];
      const threads = document.querySelectorAll('[data-thread], .chat-thread, .message-thread');
      threads.forEach((t) => {
        const handle = t.getAttribute('data-handle') || t.querySelector('.handle, .user-handle')?.textContent?.trim() || '';
        const displayName = t.querySelector('.display-name, .user-name')?.textContent?.trim();
        const lastMsg = t.querySelector('.last-message, .message-preview')?.textContent?.trim() || '';
        if (handle && lastMsg) {
          items.push({ handle, display_name: displayName, content: lastMsg, external_id: t.getAttribute('data-message-id') || undefined });
        }
      });
      return items;
    });
  } catch (e) {
    console.error('[sniffies-dm-sync] readInbox error:', e);
    return [];
  }
}

async function upsertProspect(msg: InboxMessage): Promise<string | null> {
  const { data: existing } = await supabase
    .from('hookup_prospects')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', 'sniffies')
    .eq('prospect_handle', msg.handle)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await supabase
    .from('hookup_prospects')
    .insert({
      user_id: userId,
      platform: 'sniffies',
      prospect_handle: msg.handle,
      prospect_display_name: msg.display_name,
      prospect_profile_data: { source: 'sniffies-dm-sync', detected_at: new Date().toISOString() },
    })
    .select('id').single();
  return created?.id ?? null;
}

async function syncMessages(messages: InboxMessage[]) {
  let synced = 0;
  for (const msg of messages) {
    const prospectId = await upsertProspect(msg);
    if (!prospectId) continue;

    // Dedup by external_id if available, otherwise by content+last-inbound-at
    if (msg.external_id) {
      const { data: existing } = await supabase
        .from('hookup_prospect_messages')
        .select('id').eq('prospect_id', prospectId)
        .eq('platform_message_id', msg.external_id)
        .maybeSingle();
      if (existing) continue;
    } else {
      const { data: recent } = await supabase
        .from('hookup_prospect_messages')
        .select('id, content, sent_at')
        .eq('prospect_id', prospectId)
        .eq('direction', 'inbound')
        .order('sent_at', { ascending: false }).limit(1).maybeSingle();
      if (recent && recent.content === msg.content) continue;
    }

    await supabase.from('hookup_prospect_messages').insert({
      prospect_id: prospectId,
      user_id: userId,
      direction: 'inbound',
      content: msg.content,
      platform_message_id: msg.external_id,
    });
    synced++;
  }
  return synced;
}

async function tick() {
  const messages = await readInbox();
  if (messages.length === 0) return 0;
  return await syncMessages(messages);
}

async function main() {
  console.log('[sniffies-dm-sync] starting');
  while (true) {
    try {
      const synced = await tick();
      if (synced > 0) console.log(`[sniffies-dm-sync] synced ${synced} new inbound messages`);
    } catch (e) {
      console.error('[sniffies-dm-sync] tick error:', e);
    }
    await new Promise(r => setTimeout(r, 5 * 60_000)); // every 5 min
  }
}

main().catch(e => {
  console.error('[sniffies-dm-sync] fatal:', e);
  process.exit(1);
});
