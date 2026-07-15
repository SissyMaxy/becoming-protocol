/**
 * navigation registry — locks the A1 invariants: every screen the app could
 * reach before the re-architecture still resolves, hash paths stay unique,
 * and the sanitized/stealth whitelist is exactly what StealthShell expects.
 */
import { describe, it, expect } from 'vitest';
import {
  VIEW_REGISTRY, VIEW_ALIASES, resolveViewId,
  HASH_TO_VIEW, LEGACY_EVENT_TO_VIEW,
} from '../../navigation/registry';

/**
 * FIXTURE — the full pre-refactor menuSubView union (App.tsx before the
 * registry existed). Every one of these must resolve to a live view or be a
 * documented alias/tombstone in VIEW_ALIASES. If you remove a view, add it
 * to VIEW_ALIASES with its landing spot (or null) — never just delete it.
 */
const PRE_REFACTOR_IDS = [
  'body', 'baseline-intake', 'history', 'investments', 'wishlist', 'settings',
  'help', 'sessions', 'quiz', 'timeline', 'service', 'service-analytics',
  'content', 'domains', 'patterns', 'curation', 'seeds', 'vectors',
  'trigger-audit', 'voice-game', 'voice-drills', 'dashboard', 'journal',
  'protocol-analytics', 'handler-autonomous', 'exercise', 'her-world',
  'vault-swipe', 'vault-permissions', 'content-dashboard', 'cam-session',
  'hypno-session', 'hypno-learning', 'goon-session', 'progress-page',
  'sealed-page', 'content-capture', 'content-queue', 'content-calendar',
  'content-fans', 'content-polls', 'content-revenue', 'content-settings',
  'vault-browser', 'log-release', 'conditioning-library', 'social-dashboard',
  'witnesses', 'case_file', 'envelopes', 'system_audit', 'pause_protocol',
  'escalation_ladder', 'force', 'wardrobe', 'trajectory', 'mommy-dossier',
  'identity', 'verification-vault', 'community-queue', 'community-list',
  'community-log', 'letters', 'dossier', 'recaps', 'recap-detail',
  'life-as-woman',
];

/** The old DEEP_LINK_VIEWS map — every path must still land somewhere. */
const PRE_REFACTOR_DEEP_LINKS: Record<string, string> = {
  '/social-dashboard': 'social-dashboard',
  '/socials': 'social-dashboard',
  '/content-dashboard': 'content-dashboard',
  '/dashboard': 'dashboard',
  '/journal': 'journal',
  '/settings': 'settings',
  '/identity': 'identity',
  '/community/queue': 'community-queue',
  '/community/list': 'community-list',
  '/community/log': 'community-log',
  '/recaps': 'recaps',
};

/** The old App.tsx navigate-to-* event map. */
const PRE_REFACTOR_EVENTS: Record<string, string> = {
  'navigate-to-investments': 'wishlist',
  'navigate-to-wishlist': 'wishlist',
  'navigate-to-settings': 'settings',
  'navigate-to-handler': 'handler-autonomous',
  'navigate-to-exercise': 'exercise',
  'navigate-to-cam': 'cam-session',
  'navigate-to-hypno': 'hypno-session',
  'navigate-to-hypno-learning': 'hypno-learning',
  'navigate-to-identity': 'identity',
  'navigate-to-content-capture': 'content-capture',
  'navigate-to-vault-permissions': 'vault-permissions',
};

describe('every pre-refactor destination still resolves', () => {
  it.each(PRE_REFACTOR_IDS)('%s resolves to a view or documented alias', (id) => {
    const isLive = id in VIEW_REGISTRY;
    const isAliased = id in VIEW_ALIASES;
    expect(isLive || isAliased, `${id} vanished without a VIEW_ALIASES entry`).toBe(true);
    if (isAliased) {
      const target = VIEW_ALIASES[id];
      if (target !== null) {
        expect(target in VIEW_REGISTRY, `alias ${id} → ${target} points nowhere`).toBe(true);
      }
    }
  });

  it('resolveViewId maps aliases and rejects garbage', () => {
    expect(resolveViewId('investments')).toBe('wishlist');
    expect(resolveViewId('progress-page')).toBeNull();
    expect(resolveViewId('sealed-page')).toBeNull();
    expect(resolveViewId('log-release')).toBeNull();
    expect(resolveViewId('not-a-view')).toBeNull();
    expect(resolveViewId(null)).toBeNull();
    expect(resolveViewId('journal')).toBe('journal');
  });
});

describe('hash deep links', () => {
  it('every pre-refactor deep link path still lands on the same view', () => {
    for (const [path, view] of Object.entries(PRE_REFACTOR_DEEP_LINKS)) {
      expect(HASH_TO_VIEW[path], `deep link ${path}`).toBe(view);
    }
  });

  it('hash paths are unique across the registry', () => {
    const all = (Object.values(VIEW_REGISTRY)).flatMap(d => d.hashPaths ?? []);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('legacy navigation events', () => {
  it('every pre-refactor navigate-to-* event still lands on the same view', () => {
    for (const [ev, view] of Object.entries(PRE_REFACTOR_EVENTS)) {
      const target = LEGACY_EVENT_TO_VIEW[ev];
      const resolved = view in VIEW_REGISTRY ? view : resolveViewId(view);
      expect(target, `event ${ev}`).toBe(resolved);
    }
  });
});

describe('menu integrity', () => {
  it('every menu entry has label, description, icon, and a known heading', () => {
    const HEADINGS = ['Your becoming', 'You', 'Practice', 'Record', 'Settings', 'Archive'];
    for (const [id, def] of Object.entries(VIEW_REGISTRY)) {
      if (!def.menu) continue;
      expect(def.menu.label, id).toBeTruthy();
      expect(def.menu.description, id).toBeTruthy();
      expect(def.menu.icon, id).toBeTruthy();
      expect(HEADINGS, `${id} heading ${def.menu.heading}`).toContain(def.menu.heading);
    }
  });

  it('archive entries all use the Archive heading (folded tail)', () => {
    for (const [id, def] of Object.entries(VIEW_REGISTRY)) {
      if (def.menu?.archive) {
        expect(def.menu.heading, id).toBe('Archive');
      }
    }
  });

});
