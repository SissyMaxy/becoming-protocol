/**
 * navigation store — locks the A1 behavior: URL → boot state for every
 * deep-link alias, the sanitized rewrite, legacy CustomEvent adapters, and
 * hash-driven routing through the ONE hashchange listener.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initialNavState, initNavigation, navigate, navigateLoose, goHome, goChat,
  openMenu, setSanitizedMode, __resetForTests, __getStateForTests as getState,
} from '../../navigation/store';
import { HASH_TO_VIEW } from '../../navigation/registry';

let cleanup: (() => void) | null = null;

beforeEach(() => {
  __resetForTests();
  window.history.replaceState(null, '', '/');
  window.location.hash = '';
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  __resetForTests();
});

describe('initialNavState — URL → boot state', () => {
  it('empty hash boots home (Focus)', () => {
    expect(initialNavState()).toEqual({ surface: 'home', viewId: null, recapId: null, overlay: null });
  });

  it('#/today boots home', () => {
    window.location.hash = '#/today';
    expect(initialNavState().surface).toBe('home');
  });

  it.each(Object.entries(HASH_TO_VIEW))('%s boots its view', (path, view) => {
    window.location.hash = `#${path}`;
    const s = initialNavState();
    expect(s.surface).toBe('view');
    expect(s.viewId).toBe(view);
  });

  it('#/recaps/<id> boots recap-detail with the id', () => {
    window.location.hash = '#/recaps/0b0e8f7a-1111-2222-3333-444455556666';
    const s = initialNavState();
    expect(s.viewId).toBe('recap-detail');
    expect(s.recapId).toBe('0b0e8f7a-1111-2222-3333-444455556666');
  });

  it('#/whisper and #/welcome boot home with the overlay', () => {
    window.location.hash = '#/whisper';
    expect(initialNavState().overlay).toBe('whisper');
    window.location.hash = '#/welcome';
    expect(initialNavState().overlay).toBe('welcome');
  });

  it('trailing slashes are tolerated', () => {
    window.location.hash = '#/journal/';
    expect(initialNavState().viewId).toBe('journal');
  });
});

describe('actions push complete history markers', () => {
  beforeEach(() => {
    cleanup = initNavigation();
  });

  it('navigate() records surface view + viewId', () => {
    navigate('journal');
    expect(getState()).toMatchObject({ surface: 'view', viewId: 'journal' });
  });

  it('openMenu() records the null view (drawer)', () => {
    openMenu();
    expect(getState()).toMatchObject({ surface: 'view', viewId: null });
  });

  it('goChat() and goHome() record their surfaces', () => {
    goChat();
    expect(getState()).toMatchObject({ surface: 'chat' });
    goHome();
    expect(getState()).toMatchObject({ surface: 'home' });
  });

  it('goHome() clears a lingering deep-link hash', () => {
    window.location.hash = '#/journal';
    goHome();
    expect(window.location.hash).toBe('');
  });

  it('navigateLoose() maps legacy alias ids', () => {
    navigateLoose('investments');
    expect(getState()).toMatchObject({ viewId: 'wishlist' });
    navigateLoose('progress-page'); // tombstone → menu drawer
    expect(getState()).toMatchObject({ surface: 'view', viewId: null });
  });
});

describe('sanitized/stealth rewrite', () => {
  beforeEach(() => {
    cleanup = initNavigation();
  });

  it('navigate() to a disallowed view lands on the menu drawer', () => {
    setSanitizedMode(true);
    navigate('journal');
    expect(getState()).toMatchObject({ surface: 'view', viewId: null });
  });

  it('navigate() to an allowed view passes through', () => {
    setSanitizedMode(true);
    navigate('body');
    expect(getState()).toMatchObject({ viewId: 'body' });
  });

  it('flipping sanitized ON rewrites a live disallowed view', () => {
    navigate('journal');
    setSanitizedMode(true);
    expect(getState()).toMatchObject({ surface: 'view', viewId: null });
  });

  it('boot state applies the rewrite for deep links', () => {
    setSanitizedMode(true);
    window.location.hash = '#/journal';
    expect(initialNavState()).toMatchObject({ surface: 'view', viewId: null });
  });
});

describe('legacy CustomEvent adapters', () => {
  beforeEach(() => {
    cleanup = initNavigation();
  });

  it('navigate-to-* events route to their views', () => {
    window.dispatchEvent(new Event('navigate-to-exercise'));
    expect(getState()).toMatchObject({ viewId: 'exercise' });
    window.dispatchEvent(new Event('navigate-to-investments'));
    expect(getState()).toMatchObject({ viewId: 'wishlist' });
  });

  it('open-menu-subview routes its detail.view', () => {
    window.dispatchEvent(new CustomEvent('open-menu-subview', { detail: { view: 'mommy-dossier' } }));
    expect(getState()).toMatchObject({ viewId: 'mommy-dossier' });
  });
});

describe('single hashchange listener routes at runtime', () => {
  beforeEach(() => {
    cleanup = initNavigation();
  });

  function fireHash(hash: string) {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  it('runtime hash → view', () => {
    fireHash('#/identity');
    expect(getState()).toMatchObject({ surface: 'view', viewId: 'identity' });
  });

  it('clearing the hash returns home', () => {
    navigate('journal');
    fireHash('');
    // '' hash routes home without pushing — assert via a fresh marker push
    goHome();
    expect(getState()).toMatchObject({ surface: 'home' });
  });

  it('pre-auth hashes are ignored (wishlist share / recovery)', () => {
    navigate('journal');
    const before = getState();
    fireHash('#/wishlist/abc123');
    expect(getState()).toEqual(before);
  });
});
