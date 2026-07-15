/**
 * Navigation store — THE single owner of screen state.
 *
 * Replaces the old App.tsx tangle: ~12 independent useState flags, FIVE
 * separate hashchange listeners each reinterpreting the hash, a popstate
 * handler with its own marker shape, and 14 CustomEvent listeners. All four
 * routing inputs now funnel here:
 *   1. hash deep links        → one hashchange listener → route()
 *   2. history back/forward   → one popstate listener → restore marker
 *   3. legacy CustomEvents    → adapters from VIEW_REGISTRY.legacyEvents
 *   4. in-app calls           → navigate()/goHome()/goChat()/back()
 *
 * Deliberately a plain module store (useSyncExternalStore), not a router:
 * the IA is state-first and stealth mode suppresses URL traces, which fights
 * URL-as-truth routers — and a plain TS module is unit-testable in the
 * lib-only vitest suite.
 *
 * Not owned here (unchanged contracts):
 *   - `#/wishlist/<token>` + `type=recovery` — pre-auth, handled in AppInner
 *   - `?complete_outreach=<id>` push deep link — useNotificationActionRouter
 */

import { useSyncExternalStore } from 'react';
import {
  HASH_TO_VIEW, LEGACY_EVENT_TO_VIEW, resolveViewId,
  type ViewId,
} from './registry';

export type Surface = 'home' | 'chat' | 'view';
export type Overlay = 'whisper' | 'welcome' | null;

export interface NavState {
  surface: Surface;
  /** Meaningful when surface === 'view'; null renders the MenuView drawer. */
  viewId: ViewId | null;
  /** For the 'recap-detail' view. */
  recapId: string | null;
  /** Overlays render on top of the current surface. */
  overlay: Overlay;
}

const HOME: NavState = { surface: 'home', viewId: null, recapId: null, overlay: null };

// ── module state ────────────────────────────────────────────────────────────

// Lazily seeded from the URL on first read so a deep-linked boot paints the
// target view on the FIRST render (init effects run after first paint).
let state: NavState | null = null;
const listeners = new Set<() => void>();

function getState(): NavState {
  if (state === null) state = initialNavState();
  return state;
}

function emit() {
  for (const l of listeners) l();
}

function setState(next: NavState, opts: { push?: boolean } = {}) {
  state = next;
  if (opts.push) {
    window.history.pushState({ nav: next }, '');
  }
  emit();
}

// ── URL parsing ─────────────────────────────────────────────────────────────

function cleanHash(): string {
  return window.location.hash.replace('#', '').replace(/\/$/, '');
}

/** `/recaps/<recap_id>` (hash or pathname) → id, or null. */
export function parseRecapDetailId(): string | null {
  const m = window.location.hash.match(/^#\/recaps\/([0-9a-f-]+)\/?$/i);
  if (m) return m[1];
  const m2 = window.location.pathname.match(/^\/recaps\/([0-9a-f-]+)\/?$/i);
  return m2 ? m2[1] : null;
}

/** Deep-link view from hash (primary) or pathname (non-hash deploys). */
export function parseDeepLinkView(): ViewId | null {
  const h = cleanHash();
  if (h && HASH_TO_VIEW[h]) return HASH_TO_VIEW[h];
  return HASH_TO_VIEW[window.location.pathname] ?? null;
}

/** Compute the boot state from the current URL. */
export function initialNavState(): NavState {
  const h = cleanHash();
  if (h === '/whisper') return { ...HOME, overlay: 'whisper' };
  if (h === '/welcome') return { ...HOME, overlay: 'welcome' };
  const recapId = parseRecapDetailId();
  if (recapId) return { surface: 'view', viewId: 'recap-detail', recapId, overlay: null };
  const deepLink = parseDeepLinkView();
  if (deepLink) {
    return { surface: 'view', viewId: deepLink, recapId: null, overlay: null };
  }
  return HOME;
}

// ── actions ─────────────────────────────────────────────────────────────────

/** Open a view (null = the MenuView drawer). */
export function navigate(view: ViewId | null, opts: { recapId?: string | null } = {}) {
  setState(
    { surface: 'view', viewId: view, recapId: opts.recapId ?? null, overlay: null },
    { push: true }
  );
}

/** Accepts historical/aliased id strings (legacy events, old deep links). */
export function navigateLoose(view: string | null | undefined) {
  navigate(resolveViewId(view));
}

export function openMenu() {
  navigate(null);
}

/** Home = the Focus surface. Clears any deep-link hash (old onExit idiom). */
export function goHome() {
  clearHash();
  setState(HOME, { push: true });
}

/** The Handler conversation. */
export function goChat() {
  clearHash();
  setState({ surface: 'chat', viewId: null, recapId: null, overlay: null }, { push: true });
}

/**
 * The one back affordance. Deep-linked pathname entries (no in-app history)
 * reset the URL and land on chat — same contract as the old
 * handleBackFromSubView; everything else is real history.back().
 */
export function back() {
  if (window.location.pathname !== '/') {
    window.history.replaceState({}, '', '/');
    setState({ surface: 'chat', viewId: null, recapId: null, overlay: null });
    return;
  }
  window.history.back();
}

/** Open a specific recap with its canonical shareable hash. */
export function openRecap(id: string) {
  window.location.hash = `#/recaps/${id}`;
  // the hashchange listener routes it; nothing else to do
}

function clearHash() {
  if (window.location.hash) {
    // replaceState (not `hash = ''`) so clearing doesn't add a history entry
    // or re-trigger our own hashchange routing.
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  }
}

// ── routing inputs ──────────────────────────────────────────────────────────

function onHashChange() {
  const h = cleanHash();

  // Pre-auth routes owned by AppInner — never touch.
  if (h.startsWith('/wishlist/') || h.includes('type=recovery')) return;

  if (h === '' || h === '/today') {
    setState(HOME);
    return;
  }
  if (h === '/whisper') {
    setState({ ...getState(), overlay: 'whisper' });
    return;
  }
  if (h === '/welcome') {
    setState({ ...getState(), overlay: 'welcome' });
    return;
  }
  const recapId = parseRecapDetailId();
  if (recapId) {
    setState({ surface: 'view', viewId: 'recap-detail', recapId, overlay: null });
    return;
  }
  if (h === '/recaps') {
    setState({ surface: 'view', viewId: 'recaps', recapId: null, overlay: null });
    return;
  }
  const view = HASH_TO_VIEW[h];
  if (view) {
    setState(
      { surface: 'view', viewId: view, recapId: null, overlay: null },
      { push: true }
    );
  }
  // Unknown hashes are ignored (other systems may own them).
}

function onPopState(e: PopStateEvent) {
  const marker = (e.state as { nav?: NavState } | null)?.nav;
  if (marker) {
    state = marker;
    emit();
  } else {
    state = HOME;
    emit();
  }
}

function onLegacyEvent(e: Event) {
  const type = e.type;
  // A3 (2026-07-15) migrated all in-repo emitters to direct store calls.
  // This adapter stays one release as a safety net for anything missed;
  // a firing here means an emitter escaped the migration — fix it.
  console.warn(`[nav] deprecated CustomEvent '${type}' — call navigation/store directly`);
  if (type === 'open-menu-subview') {
    const view = (e as CustomEvent).detail?.view as string | undefined;
    if (view !== undefined) navigateLoose(view);
    return;
  }
  const view = LEGACY_EVENT_TO_VIEW[type];
  if (view) navigate(view);
}

let initialized = false;

/** Idempotent — App calls this once on mount. Returns a cleanup fn. */
export function initNavigation(): () => void {
  if (initialized) return () => {};
  initialized = true;

  // Anchor the history stack so the first Back restores a marker instead of
  // exiting the PWA. getState() seeds from the URL if not yet read.
  window.history.replaceState({ nav: getState() }, '');

  window.addEventListener('hashchange', onHashChange);
  window.addEventListener('popstate', onPopState);
  const legacyEvents = [...Object.keys(LEGACY_EVENT_TO_VIEW), 'open-menu-subview'];
  for (const ev of legacyEvents) window.addEventListener(ev, onLegacyEvent);

  return () => {
    initialized = false;
    window.removeEventListener('hashchange', onHashChange);
    window.removeEventListener('popstate', onPopState);
    for (const ev of legacyEvents) window.removeEventListener(ev, onLegacyEvent);
  };
}

// ── React binding ───────────────────────────────────────────────────────────

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): NavState {
  return getState();
}

export function useNav(): NavState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// Test-only: reset module state between cases.
export function __resetForTests() {
  state = null;
  initialized = false;
  listeners.clear();
}

// Test-only: read current state without the React binding.
export function __getStateForTests(): NavState {
  return getState();
}
