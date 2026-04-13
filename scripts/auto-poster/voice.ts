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

// ── Public API ──────────────────────────────────────────────────────

/**
 * Returns a prompt block with learned voice examples.
 * Append this to any system prompt to get Maxy's real voice.
 */
export async function getVoiceBlock(): Promise<string> {
  const dbBlock = await loadDbVoice();

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

  return dbBlock + editBlock;
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
