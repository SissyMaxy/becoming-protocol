/**
 * Voice Learner — scrapes your actual Twitter DM replies and saves them
 * as voice training examples. Runs periodically to capture manual replies
 * you typed directly in Twitter (not through the bot).
 *
 * Usage: node --import tsx voice-learn.ts
 */

import 'dotenv/config';
import { chromium } from 'playwright';
import { supabase, PLATFORMS } from './config';
import * as fs from 'fs';
import * as path from 'path';

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

function loadVoiceExamples(): VoiceExample[] {
  try {
    if (fs.existsSync(VOICE_FILE)) {
      return JSON.parse(fs.readFileSync(VOICE_FILE, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveVoiceExamples(examples: VoiceExample[]): void {
  fs.writeFileSync(VOICE_FILE, JSON.stringify(examples.slice(-200), null, 2));
}

function parseMessages(text: string, contactName: string): Array<{ from: 'them' | 'us'; text: string }> {
  const lines = text.split('\n');
  const TIMESTAMP = /^\d{1,2}:\d{2}\s*(AM|PM)$/i;
  const DATE_HEADER = /^(Today|Yesterday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;
  const messages: Array<{ from: 'them' | 'us'; text: string }> = [];
  const skipPatterns = new Set(['is typing …', 'View Profile', 'Edited', 'New', 'Show more', 'Failed to load']);

  let currentSender: 'them' | 'us' = 'them';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (TIMESTAMP.test(line)) continue;
    if (DATE_HEADER.test(line)) continue;
    if (line.startsWith('@') || line.startsWith('Joined')) continue;
    if (skipPatterns.has(line)) continue;
    if (/^You reacted/.test(line)) continue;

    if (line === 'Maxy' || line === 'Soft_Maxy') { currentSender = 'us'; continue; }
    if (line === contactName) { currentSender = 'them'; continue; }

    messages.push({ from: currentSender, text: line });
  }

  return messages;
}

async function main() {
  console.log('=== Voice Learner ===\n');

  const context = await chromium.launchPersistentContext(PLATFORMS.twitter.profileDir, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://x.com/messages', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  // Handle PIN
  if (page.url().includes('pin') || page.url().includes('chat')) {
    const pin = process.env.TWITTER_DM_PIN || '';
    for (const d of pin) { await page.keyboard.press(d); await page.waitForTimeout(200); }
    await page.waitForTimeout(5000);
  }

  // Get conversation list
  const sidebarText = await page.evaluate(() => {
    const containers = document.querySelectorAll('.scrollbar-thin-custom');
    return (containers[0] as HTMLElement)?.innerText || '';
  });

  const sidebarLines = sidebarText.split('\n').map(l => l.trim()).filter(l => l);
  const convNames: string[] = [];
  for (let i = 0; i < sidebarLines.length; i++) {
    const nextLine = sidebarLines[i + 1] || '';
    if (/^(Now|\d+[smhdw]|Just now)$/.test(nextLine)) {
      convNames.push(sidebarLines[i]);
    }
  }

  console.log(`Found ${convNames.length} conversations\n`);

  // Get existing voice examples to dedup
  const existing = loadVoiceExamples();
  const existingKeys = new Set(existing.map(e => `${e.contact}|${e.finalReply}`));

  // Get bot-sent messages from DB to identify which replies are manual
  const { data: botReplies } = await supabase
    .from('paid_conversations')
    .select('subscriber_id, handler_response')
    .eq('platform', 'twitter')
    .eq('message_direction', 'outbound')
    .not('handler_response', 'eq', '')
    .not('handler_response', 'is', null);

  const botReplySet = new Set(
    (botReplies || []).map((r: any) => `${r.subscriber_id}|${r.handler_response}`)
  );

  let learned = 0;

  // Read top 5 conversations
  for (const name of convNames.slice(0, 5)) {
    try {
      await page.locator(`text=${name}`).first().click();
      await page.waitForTimeout(3000);

      // Scroll to bottom
      await page.evaluate(() => {
        const containers = document.querySelectorAll('.scrollbar-thin-custom');
        const chat = containers[1] as HTMLElement;
        if (chat) chat.scrollTop = chat.scrollHeight;
      });
      await page.waitForTimeout(1000);

      const chatText = await page.evaluate(() => {
        const containers = document.querySelectorAll('.scrollbar-thin-custom');
        return (containers[1] as HTMLElement)?.innerText || '';
      });

      const messages = parseMessages(chatText, name);

      // Find our replies that aren't in the bot DB = manually typed
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.from !== 'us') continue;

        // Check if this was bot-sent
        const botKey = `${name}|${msg.text}`;
        if (botReplySet.has(botKey)) continue;

        // Skip very short messages (emojis, reactions)
        if (msg.text.length < 5) continue;

        // Find what they said before this (context)
        const theirMsg = messages.slice(0, i).reverse().find(m => m.from === 'them');
        if (!theirMsg) continue;

        // Dedup
        const voiceKey = `${name}|${msg.text}`;
        if (existingKeys.has(voiceKey)) continue;

        // This is a manual reply — save as voice training
        const contextLines = messages.slice(Math.max(0, i - 5), i).map(m =>
          m.from === 'us' ? `Maxy: ${m.text}` : `${name}: ${m.text}`
        );

        const example: VoiceExample = {
          timestamp: new Date().toISOString(),
          contact: name,
          theirMessage: theirMsg.text,
          context: contextLines,
          generatedReply: '', // no AI version — this was manual
          finalReply: msg.text,
          wasEdited: true, // treat manual typing as strongest signal
        };

        existing.push(example);
        existingKeys.add(voiceKey);
        learned++;
        console.log(`  [${name}] learned: "${msg.text.substring(0, 60)}..."`);
      }

      await page.goBack();
      await page.waitForTimeout(1500);
    } catch (err) {
      console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : err}`);
      await page.goBack().catch(() => {});
      await page.waitForTimeout(1500);
    }
  }

  saveVoiceExamples(existing);
  console.log(`\nLearned ${learned} new voice example(s). Total: ${existing.length}`);

  await context.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
