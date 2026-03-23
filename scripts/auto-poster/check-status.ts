/**
 * Status check — verify content calendar and platform sessions.
 * Run: npx tsx check-status.ts
 */

import 'dotenv/config';
import { supabase } from './config';
import { chromium } from 'playwright';
import { PLATFORMS } from './config';

async function checkContentCalendar() {
  console.log('\n=== CONTENT CALENDAR STATUS ===\n');

  // Check scheduled posts ready to go
  const now = new Date().toISOString();
  const { data: ready, count: readyCount } = await supabase
    .from('ai_generated_content')
    .select('id, platform, content, status, scheduled_at, content_type', { count: 'exact' })
    .in('status', ['scheduled', 'pending_review'])
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true });

  console.log(`Posts ready to post NOW: ${readyCount || 0}`);
  if (ready && ready.length > 0) {
    for (const post of ready) {
      console.log(`  [${post.status}] ${post.platform} (${post.content_type}): "${(post.content || '').substring(0, 60)}..."`);
      console.log(`    scheduled_at: ${post.scheduled_at}`);
    }
  }

  // Check future scheduled posts
  const { data: future, count: futureCount } = await supabase
    .from('ai_generated_content')
    .select('id, platform, status, scheduled_at, content_type', { count: 'exact' })
    .in('status', ['scheduled', 'pending_review'])
    .gt('scheduled_at', now)
    .order('scheduled_at', { ascending: true });

  console.log(`\nPosts scheduled for later: ${futureCount || 0}`);
  if (future && future.length > 0) {
    for (const post of future.slice(0, 5)) {
      console.log(`  [${post.status}] ${post.platform} (${post.content_type}) at ${post.scheduled_at}`);
    }
    if (future.length > 5) console.log(`  ... and ${future.length - 5} more`);
  }

  // Check recent posts
  const { data: recent, count: recentCount } = await supabase
    .from('ai_generated_content')
    .select('id, platform, status, posted_at, content_type', { count: 'exact' })
    .eq('status', 'posted')
    .order('posted_at', { ascending: false })
    .limit(5);

  console.log(`\nRecently posted: ${recentCount || 0} total`);
  if (recent && recent.length > 0) {
    for (const post of recent) {
      console.log(`  [posted] ${post.platform} (${post.content_type}) at ${post.posted_at}`);
    }
  }

  // Check all statuses
  const { data: allStatuses } = await supabase
    .from('ai_generated_content')
    .select('status')
    .order('created_at', { ascending: false });

  if (allStatuses) {
    const counts: Record<string, number> = {};
    for (const row of allStatuses) {
      counts[row.status] = (counts[row.status] || 0) + 1;
    }
    console.log('\nAll content by status:', counts);
  }

  return (readyCount || 0) > 0;
}

async function checkPlatformSessions() {
  console.log('\n=== PLATFORM SESSION STATUS ===\n');

  const platforms = [
    { name: 'twitter', url: 'https://x.com/home', loginIndicator: '[data-testid="SideNav_AccountSwitcher_Button"]' },
    { name: 'reddit', url: 'https://www.reddit.com', loginIndicator: '#email-collection-tooltip-id, button[id*="USER_DROPDOWN"]' },
    { name: 'fansly', url: 'https://fansly.com', loginIndicator: '[class*="avatar"], [class*="profile"]' },
  ] as const;

  for (const platform of platforms) {
    const config = PLATFORMS[platform.name as keyof typeof PLATFORMS];
    if (!config?.enabled) {
      console.log(`  ${platform.name}: DISABLED in .env`);
      continue;
    }

    let context = null;
    try {
      context = await chromium.launchPersistentContext(config.profileDir, {
        headless: true,
        viewport: { width: 1280, height: 800 },
        args: ['--disable-blink-features=AutomationControlled'],
      });

      const page = context.pages()[0] || await context.newPage();
      await page.goto(platform.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(3000);

      // Check for login indicator
      const loggedIn = await page.locator(platform.loginIndicator).count();
      if (loggedIn > 0) {
        console.log(`  ${platform.name}: ✓ LOGGED IN`);
      } else {
        // Check for login buttons (indicates NOT logged in)
        const loginBtn = await page.locator('button:has-text("Log In"), a:has-text("Log In"), button:has-text("Sign In"), a:has-text("Sign in")').count();
        if (loginBtn > 0) {
          console.log(`  ${platform.name}: ✗ NOT LOGGED IN — run: npm run login`);
        } else {
          console.log(`  ${platform.name}: ? UNCLEAR — check manually`);
        }
      }
    } catch (err) {
      console.log(`  ${platform.name}: ✗ ERROR — ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      if (context) await context.close();
    }
  }
}

async function main() {
  const hasContent = await checkContentCalendar();
  await checkPlatformSessions();

  console.log('\n=== RECOMMENDATION ===\n');
  if (!hasContent) {
    console.log('No content ready to post. Run: npx tsx generate-now.ts');
  } else {
    console.log('Content is ready. Run: npm run post');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
