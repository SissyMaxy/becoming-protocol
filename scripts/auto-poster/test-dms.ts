import { chromium } from 'playwright';
import { PLATFORMS } from './config';
import 'dotenv/config';

interface ChatMessage {
  from: 'them' | 'us';
  text: string;
  time: string;
}

function parseChatBlocks(allText: string, contactName: string): ChatMessage[] {
  const lines = allText.split('\n');
  const TIMESTAMP = /^\d{1,2}:\d{2}\s*(AM|PM)$/i;

  // Step 1: Split into blocks. A "block" is: content lines followed by a timestamp pair.
  // Format: [content lines...] [timestamp] [same timestamp]
  const blocks: Array<{ lines: string[]; time: string }> = [];
  let currentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check for timestamp pair: line matches timestamp AND next line is the same
    if (TIMESTAMP.test(line) && i + 1 < lines.length && lines[i + 1].trim() === line) {
      if (currentLines.length > 0) {
        blocks.push({ lines: [...currentLines], time: line });
      }
      currentLines = [];
      i++; // skip the duplicate timestamp
      continue;
    }

    currentLines.push(line);
  }

  // Step 2: Dedup blocks by (time, content_hash)
  const seen = new Set<string>();
  const uniqueBlocks: typeof blocks = [];

  for (const block of blocks) {
    const key = block.time + '|' + block.lines.join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueBlocks.push(block);
  }

  // Step 3: Parse each block into messages
  const messages: ChatMessage[] = [];

  for (const block of uniqueBlocks) {
    const { lines: bLines, time } = block;

    // Skip profile header blocks
    if (bLines.some(l => l.startsWith('@') || l.startsWith('Joined') || l === 'View Profile')) continue;
    // Skip date headers
    if (bLines.length === 1 && /^(Today|Yesterday)$/.test(bLines[0])) continue;

    // Parse the block's lines
    let i = 0;
    while (i < bLines.length) {
      const line = bLines[i];

      // Skip date headers within blocks
      if (/^(Today|Yesterday)$/.test(line)) { i++; continue; }
      // Skip the contact name when it appears as reply context header
      if (line === contactName) { i++; continue; }

      // "Maxy" label: next line is either our message or a quote being replied to
      if (line === 'Maxy') {
        i++;
        if (i < bLines.length) {
          const nextLine = bLines[i];
          // Check if there's ANOTHER line after this (their reply to our quoted message)
          if (i + 1 < bLines.length && bLines[i + 1] !== 'Maxy' && bLines[i + 1] !== contactName) {
            // "Maxy\nquoted\ntheir_reply" — the quoted text is context, their reply is the message
            // Don't add the quote, just add their reply
            i++; // skip the quoted text
            messages.push({ from: 'them', text: bLines[i], time });
          } else {
            // Standalone "Maxy\ntext" — this is our message
            messages.push({ from: 'us', text: nextLine, time });
          }
          i++;
        }
        continue;
      }

      // Everything else is their message
      messages.push({ from: 'them', text: line, time });
      i++;
    }
  }

  return messages;
}

(async () => {
  const c = await chromium.launchPersistentContext(PLATFORMS.twitter.profileDir, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const p = c.pages()[0] || await c.newPage();
  await p.goto('https://x.com/messages', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForTimeout(5000);

  if (p.url().includes('pin') || p.url().includes('chat')) {
    const pin = process.env.TWITTER_DM_PIN || '4242';
    for (const d of pin) { await p.keyboard.press(d); await p.waitForTimeout(200); }
    await p.waitForTimeout(5000);
  }

  await p.locator('text=suna').first().click();
  await p.waitForTimeout(5000);

  // Scroll chat container to top
  for (let i = 0; i < 15; i++) {
    await p.evaluate(() => {
      const containers = document.querySelectorAll('.scrollbar-thin-custom');
      const chat = containers[1] as HTMLElement;
      if (chat) chat.scrollTop = 0;
    });
    await p.waitForTimeout(2000);
  }

  // Scroll down, collecting raw text from the chat container at each position
  const allRawChunks: string[] = [];

  for (let step = 0; step < 60; step++) {
    const result = await p.evaluate(() => {
      const containers = document.querySelectorAll('.scrollbar-thin-custom');
      const chat = containers[1] as HTMLElement;
      if (!chat) return { text: '', atBottom: true };
      return {
        text: chat.innerText || '',
        atBottom: chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 20,
      };
    });

    allRawChunks.push(result.text);

    if (result.atBottom) {
      console.log(`Captured ${step + 1} viewports, reached bottom`);
      break;
    }

    // Scroll down by 70% viewport (less overlap = less duplication)
    await p.evaluate(() => {
      const containers = document.querySelectorAll('.scrollbar-thin-custom');
      const chat = containers[1] as HTMLElement;
      if (chat) chat.scrollTop += chat.clientHeight * 0.7;
    });
    await p.waitForTimeout(1000);
  }

  // Concatenate all chunks
  const megaText = allRawChunks.join('\n');
  console.log(`Total raw text: ${megaText.length} chars`);

  // Parse and dedup
  const messages = parseChatBlocks(megaText, 'suna');
  console.log(`\n=== ${messages.length} UNIQUE MESSAGES ===`);
  for (const msg of messages) {
    const label = msg.from === 'us' ? 'MAXY' : 'SUNA';
    console.log(`[${msg.time}] [${label}] ${msg.text}`);
  }

  await c.close();
  process.exit(0);
})();
