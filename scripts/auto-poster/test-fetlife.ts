/**
 * Test FetLife engagement — runs just the FetLife module standalone.
 * Run: npx tsx test-fetlife.ts
 */

import 'dotenv/config';
import { chromium } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { supabase, PLATFORMS } from './config';

const USER_ID = process.env.USER_ID || '';

async function main() {
  const config = PLATFORMS.fetlife;
  if (!config.enabled) {
    console.log('FetLife not enabled');
    return;
  }

  console.log('=== FetLife Test ===\n');

  const ctx = await chromium.launchPersistentContext(config.profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const page = ctx.pages()[0] || await ctx.newPage();

  // Step 1: Check login
  console.log('1. Checking login...');
  await page.goto('https://fetlife.com/home', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);
  const url = page.url();
  console.log(`   URL: ${url}`);
  if (url.includes('/login') || url.includes('/users/sign_in')) {
    console.log('   ✗ NOT LOGGED IN');
    await ctx.close();
    return;
  }
  console.log('   ✓ Logged in\n');

  // Step 2: Search for a group
  console.log('2. Searching for group "sissy"...');
  await page.goto('https://fetlife.com/groups/search?q=sissy', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);

  const groupLinks = await page.locator('a[href*="/groups/"]').all();
  console.log(`   Found ${groupLinks.length} group links`);

  let groupUrl = '';
  for (const link of groupLinks.slice(0, 5)) {
    const href = await link.getAttribute('href').catch(() => '') || '';
    const text = await link.textContent().catch(() => '') || '';
    if (href.match(/\/groups\/\d+$/) && text.trim()) {
      groupUrl = href.startsWith('http') ? href : `https://fetlife.com${href}`;
      console.log(`   Using group: "${text.trim()}" → ${groupUrl}`);
      break;
    }
  }

  if (!groupUrl) {
    console.log('   ✗ No groups found');
    await ctx.close();
    return;
  }

  // Step 3: Navigate to group and find discussion posts
  console.log('\n3. Navigating to group...');
  await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);
  console.log(`   Page: ${page.url()} — "${await page.title()}"`);

  // Find discussion post links
  const postLinks = await page.locator('a[href*="/group_posts/"], a[href*="/posts/"]').all();
  console.log(`   Discussion links found: ${postLinks.length}`);

  // Show first 5 links for debugging
  for (const link of postLinks.slice(0, 5)) {
    const href = await link.getAttribute('href').catch(() => '') || '';
    const text = await link.textContent().catch(() => '') || '';
    const cleanText = text.replace(/\d+[mhd]\s*ago/gi, '').replace(/\d+\s*(minutes?|hours?|days?)\s*ago/gi, '').trim().substring(0, 60);
    console.log(`   → "${cleanText}" (${href})`);
  }

  // Pick the first real discussion link
  let postUrl = '';
  for (const link of postLinks.slice(0, 20)) {
    const href = await link.getAttribute('href').catch(() => '') || '';
    if (href.match(/\/(group_posts|posts)\/\d+/)) {
      postUrl = href.startsWith('http') ? href : `https://fetlife.com${href}`;
      break;
    }
  }

  if (!postUrl) {
    console.log('   ✗ No discussion post links found');
    await ctx.close();
    return;
  }

  // Step 4: Navigate to the post
  console.log(`\n4. Navigating to post: ${postUrl}`);
  await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);
  console.log(`   Page: ${page.url()} — "${await page.title()}"`);

  // Get post body
  const bodySelectors = [
    '.group_post_body', '.post-body', '[class*="post-content"]',
    'article [class*="body"]', '.markdown-content', '.content-body',
  ];
  for (const sel of bodySelectors) {
    const el = page.locator(sel).first();
    const visible = await el.isVisible().catch(() => false);
    const text = await el.textContent().catch(() => '') || '';
    if (text.trim()) {
      console.log(`   Body (${sel}): "${text.trim().substring(0, 100)}..."`);
      break;
    }
  }

  // Try paragraph fallback
  const paragraphs = await page.locator('article p, main p, .group-post p').allTextContents().catch(() => []);
  if (paragraphs.length > 0) {
    console.log(`   Paragraphs found: ${paragraphs.length}`);
    console.log(`   First: "${paragraphs[0].substring(0, 100)}..."`);
  }

  // Step 5: Check for comment textarea
  console.log('\n5. Looking for comment textarea...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);

  const textareaSelectors = [
    'textarea[placeholder="What say you?"]',
    'textarea[name*="body"]',
    'textarea[name*="comment"]',
    'textarea#comment_body',
    'textarea',
  ];

  for (const sel of textareaSelectors) {
    const count = await page.locator(sel).count();
    if (count > 0) {
      const el = page.locator(sel).last();
      const visible = await el.isVisible().catch(() => false);
      const placeholder = await el.getAttribute('placeholder').catch(() => '') || '';
      const className = await el.getAttribute('class').catch(() => '') || '';
      console.log(`   ${sel}: count=${count}, visible=${visible}, placeholder="${placeholder}", class="${className.substring(0, 60)}"`);
    }
  }

  // Take a screenshot
  await page.screenshot({ path: '.debug-fetlife-test.png', fullPage: true });
  console.log('\n   Screenshot saved: .debug-fetlife-test.png');

  // Step 6: Try to activate and type in the textarea
  console.log('\n6. Attempting to activate textarea...');
  const textarea = page.locator('textarea[placeholder="What say you?"]').first();
  const hasTextarea = await textarea.count() > 0;

  if (hasTextarea) {
    // Force visible
    await textarea.evaluate(el => {
      const t = el as HTMLElement;
      t.style.display = 'block';
      t.style.visibility = 'visible';
      t.style.overflow = 'visible';
      t.style.height = '100px';
      t.style.minHeight = '100px';
      t.style.opacity = '1';
      let parent = t.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        parent.style.display = 'block';
        parent.style.visibility = 'visible';
        parent.style.overflow = 'visible';
        parent = parent.parentElement;
      }
    });
    await page.waitForTimeout(500);

    const nowVisible = await textarea.isVisible().catch(() => false);
    console.log(`   After forcing visible: ${nowVisible}`);

    if (nowVisible) {
      await textarea.click({ force: true });
      await page.waitForTimeout(300);
      await textarea.fill('[TEST - DO NOT SUBMIT] This is a test from the auto-poster');
      console.log('   ✓ Successfully typed into textarea!');

      // Clear it — don't actually post
      await textarea.fill('');
      console.log('   Cleared test text (not posting)');
    } else {
      console.log('   ✗ Textarea still not visible after forcing');
      await page.screenshot({ path: '.debug-fetlife-textarea.png', fullPage: true });
      console.log('   Screenshot: .debug-fetlife-textarea.png');
    }
  } else {
    console.log('   ✗ No "What say you?" textarea found');

    // Check if we need to be a member
    const joinBtn = await page.locator('button:has-text("Join"), a:has-text("Join")').count();
    if (joinBtn > 0) {
      console.log('   ⚠ "Join" button found — may need to join this group first');
    }
  }

  console.log('\n=== Test Complete ===');
  await ctx.close();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
