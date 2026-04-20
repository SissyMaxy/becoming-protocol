/**
 * Shared voice module — provides Maxy's learned voice to all generators.
 * Sources:
 *   1. Manual replies scraped from Twitter (strongest signal)
 *   2. Edit corrections from dm-approve
 *   3. DB conversation history
 *
 * Usage: import { getVoiceBlock } from './voice';
 *        const system = BASE_PROMPT + await getVoiceBlock();
 */

import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './config';

interface VoiceExample {
  timestamp: string;
  contact: string;
  theirMessage: string;
  context: string[];
  generatedReply: string;
  finalReply: string;
  wasEdited: boolean;
}

const VOICE_FILE = path.join(__dirname, '.voice-training.json');

/**
 * Voice corpus user_ids — the Handler API auth user and the auto-poster env user
 * can differ (verified 2026-04-20). VOICE_USER_IDS is a comma-separated list;
 * falls back to MAXY_USER_ID, then USER_ID. Both Handler-chat and platform-DM
 * samples live under these IDs and must be read together.
 */
function getVoiceUserIds(): string[] {
  const list = process.env.VOICE_USER_IDS;
  if (list) return list.split(',').map(s => s.trim()).filter(Boolean);
  const single = process.env.MAXY_USER_ID || process.env.USER_ID;
  return single ? [single] : [];
}
const VOICE_USER_IDS = getVoiceUserIds();

export function loadVoiceExamples(): VoiceExample[] {
  try {
    if (fs.existsSync(VOICE_FILE)) {
      return JSON.parse(fs.readFileSync(VOICE_FILE, 'utf-8'));
    }
  } catch {}
  return [];
}

export function saveVoiceExample(example: VoiceExample): void {
  const examples = loadVoiceExamples();
  examples.push(example);
  fs.writeFileSync(VOICE_FILE, JSON.stringify(examples.slice(-200), null, 2));

  // Mirror into the unified DB corpus so the Handler learns from platform edits too.
  // Fire-and-forget — don't block the caller.
  const isCorrection = example.wasEdited && !!example.generatedReply && example.generatedReply !== example.finalReply;
  const text = (example.finalReply || '').trim();
  const writeUserId = VOICE_USER_IDS[0];
  if (text.length >= 4 && writeUserId) {
    supabase.from('user_voice_corpus').insert({
      user_id: writeUserId,
      text: text.slice(0, 2000),
      source: isCorrection ? 'ai_edit_correction' : 'platform_dm',
      source_context: {
        contact: example.contact,
        their_message: (example.theirMessage || '').slice(0, 500),
        ai_wrong: isCorrection ? (example.generatedReply || '').slice(0, 500) : null,
        origin: 'auto-poster',
      },
      length: text.length,
      signal_score: isCorrection ? 15 : 3,
    }).then(() => {}, () => {});
  }
}

// ── DB voice cache ──────────────────────────────────────────────────

let dbCache: string = '';
let dbCacheTime = 0;

async function loadDbVoice(): Promise<string> {
  if (dbCache && Date.now() - dbCacheTime < 600_000) return dbCache;

  try {
    const { data: outbound } = await supabase
      .from('paid_conversations')
      .select('subscriber_id, handler_response, created_at')
      .eq('platform', 'twitter')
      .eq('message_direction', 'outbound')
      .not('handler_response', 'eq', '')
      .not('handler_response', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!outbound || outbound.length === 0) return '';

    const { data: inbound } = await supabase
      .from('paid_conversations')
      .select('subscriber_id, incoming_message, created_at')
      .eq('platform', 'twitter')
      .eq('message_direction', 'inbound')
      .not('incoming_message', 'eq', '')
      .not('incoming_message', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);

    const pairs: Array<{ contact: string; them: string; you: string }> = [];
    for (const out of outbound) {
      if (!out.handler_response || out.handler_response.length < 3) continue;
      // Filter AI-sounding replies
      if (/sweetie 💕|baby steps|mommy will be here|I appreciate.*but|I understand you're|let's slow down/i.test(out.handler_response)) continue;

      const closest = (inbound || []).find(
        (i: any) => i.subscriber_id === out.subscriber_id && i.created_at < out.created_at
      );
      if (closest?.incoming_message) {
        pairs.push({
          contact: out.subscriber_id,
          them: closest.incoming_message,
          you: out.handler_response,
        });
      }
    }

    if (pairs.length === 0) return '';

    let block = '\n\nYOUR ACTUAL PAST REPLIES:\n';
    for (const p of pairs.slice(0, 15)) {
      block += `them (${p.contact}): "${p.them}" → you: "${p.you}"\n`;
    }

    dbCache = block;
    dbCacheTime = Date.now();
    return block;
  } catch {
    return '';
  }
}

// ── Unified voice corpus (shared with Handler) ─────────────────────

let corpusCache: string = '';
let corpusCacheTime = 0;

async function loadCorpusBlock(): Promise<string> {
  if (corpusCache && Date.now() - corpusCacheTime < 600_000) return corpusCache;

  try {
    if (VOICE_USER_IDS.length === 0) return '';
    const { data } = await supabase
      .from('user_voice_corpus')
      .select('text, source, signal_score')
      .in('user_id', VOICE_USER_IDS)
      .gte('created_at', new Date(Date.now() - 60 * 86400_000).toISOString())
      .order('signal_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(40);

    if (!data || data.length === 0) return '';

    // Prefer a profile with the highest sample_count across configured users
    const { data: profs } = await supabase
      .from('user_voice_profile')
      .select('sample_count, avg_length, exclamation_rate, all_lower_rate, signature_bigrams')
      .in('user_id', VOICE_USER_IDS)
      .order('sample_count', { ascending: false })
      .limit(1);
    const prof = profs && profs.length > 0 ? profs[0] : null;

    const seen = new Set<string>();
    const lines: string[] = [];
    for (const row of data) {
      const t = (row.text || '').trim();
      const key = t.slice(0, 60).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`- "${t.replace(/\s+/g, ' ').slice(0, 220)}"`);
      if (lines.length >= 15) break;
    }

    let stats = '';
    if (prof && (prof.sample_count ?? 0) >= 20) {
      const bg = ((prof.signature_bigrams as Array<{ phrase: string }>) || [])
        .slice(0, 6)
        .map(b => `"${b.phrase}"`)
        .join(', ');
      stats = `\nCadence: avg ${Math.round(prof.avg_length ?? 0)} chars, exclamations ${Math.round((prof.exclamation_rate ?? 0) * 100)}%, all-lower ${Math.round((prof.all_lower_rate ?? 0) * 100)}%.${bg ? ` Signature phrases: ${bg}.` : ''}`;
    }

    const block = `\n\nMAXY VOICE CORPUS (her actual writing, cross-platform — match this):\n${lines.join('\n')}${stats}`;
    corpusCache = block;
    corpusCacheTime = Date.now();
    return block;
  } catch {
    return '';
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Returns a prompt block with learned voice examples.
 * Append this to any system prompt to get Maxy's real voice.
 */
export async function getVoiceBlock(): Promise<string> {
  const [dbBlock, corpusBlock] = await Promise.all([loadDbVoice(), loadCorpusBlock()]);

  const examples = loadVoiceExamples();
  let editBlock = '';

  // Edits where you corrected the AI (strongest signal)
  const edits = examples.filter(e => e.wasEdited && e.generatedReply && e.generatedReply !== e.finalReply).slice(-10);
  if (edits.length > 0) {
    editBlock = '\n\nVOICE CORRECTIONS (AI was wrong, you fixed it — match the RIGHT version):\n';
    for (const ex of edits) {
      editBlock += `them: "${ex.theirMessage}" → AI said (WRONG): "${ex.generatedReply}" → you said (RIGHT): "${ex.finalReply}"\n`;
    }
  }

  // Manual replies (you typed them yourself)
  const manual = examples.filter(e => e.wasEdited && !e.generatedReply).slice(-10);
  if (manual.length > 0) {
    editBlock += '\n\nYOUR MANUAL REPLIES (you typed these yourself — this IS your voice):\n';
    for (const ex of manual) {
      editBlock += `them (${ex.contact}): "${ex.theirMessage}" → you: "${ex.finalReply}"\n`;
    }
  }

  return corpusBlock + dbBlock + editBlock;
}

/**
 * Short voice reminder for tweet replies (less context needed).
 * Returns just the key voice rules without full conversation examples.
 */
export function getVoiceRules(): string {
  const examples = loadVoiceExamples();
  const manual = examples.filter(e => e.wasEdited).slice(-5);

  if (manual.length === 0) return '';

  let block = '\n\nYour actual voice (match this):\n';
  for (const ex of manual) {
    block += `- "${ex.finalReply}"\n`;
  }
  return block;
}
