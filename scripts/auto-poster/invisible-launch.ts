// Invisible browser launcher.
//
// All scheduler-triggered browsers go through this helper. It guarantees no
// window ever appears on the user's screen, which matters because this
// machine is also the user's personal computer. Three defenses, layered:
//
//   1. Prefer headless: true. Chromium "new" headless passes most bot checks.
//   2. If non-headless is required (Sniffies/Cloudflare), launch offscreen
//      at (-32000,-32000) with a tiny viewport.
//   3. On Windows, after launch, fire a PowerShell probe that finds the
//      matching window by process-owned HWND and calls ShowWindow(SW_HIDE).
//      This runs fire-and-forget so launch isn't blocked on it.
//
// The Windows hide handles the transient flash-of-window that can occur
// before the offscreen position takes effect.

import { chromium, firefox, type BrowserContext, type LaunchOptions } from 'playwright';
import { armStealthWindowHider } from './window-hider';

type Engine = 'chromium' | 'firefox';

interface InvisibleOptions {
  engine?: Engine;
  profileDir: string;
  viewport?: { width: number; height: number };
  geolocation?: { latitude: number; longitude: number };
  permissions?: string[];
  userAgent?: string;
  /**
   * Set true only for sites that detect headless (Sniffies, some Fansly flows).
   * Default false — headless is always preferred.
   */
  requireHeaded?: boolean;
  extraArgs?: string[];
}

// Chromium-only. Firefox rejects these flags (and any Chromium-style flag
// starting with '--'). For Firefox, invisibility relies entirely on the
// post-launch PowerShell hider in window-hider.ts.
const CHROMIUM_OFFSCREEN_ARGS = [
  '--window-position=-32000,-32000',
  '--window-size=1,1',
  '--disable-blink-features=AutomationControlled',
];

export async function launchInvisible(opts: InvisibleOptions): Promise<BrowserContext> {
  const engine: Engine = opts.engine || 'chromium';
  const browser = engine === 'firefox' ? firefox : chromium;

  armStealthWindowHider();

  const isFirefox = engine === 'firefox';
  const args = isFirefox
    ? (opts.extraArgs || [])
    : [...CHROMIUM_OFFSCREEN_ARGS, ...(opts.extraArgs || [])];

  const launchOpts: LaunchOptions & {
    viewport?: { width: number; height: number };
    geolocation?: { latitude: number; longitude: number };
    permissions?: string[];
    userAgent?: string;
  } = {
    headless: !opts.requireHeaded,
    viewport: opts.viewport || { width: 1280, height: 800 },
    args,
  };

  if (opts.geolocation) launchOpts.geolocation = opts.geolocation;
  if (opts.permissions) launchOpts.permissions = opts.permissions;
  if (opts.userAgent) launchOpts.userAgent = opts.userAgent;

  const ctx = await browser.launchPersistentContext(opts.profileDir, launchOpts as LaunchOptions);
  return ctx;
}
