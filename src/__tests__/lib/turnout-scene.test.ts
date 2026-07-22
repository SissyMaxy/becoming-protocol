import { describe, it, expect } from 'vitest';
import { buildSceneOverlayBlock } from '../../../api/handler/_lib/turnout-scene';

describe('turnout-scene overlay (WS6)', () => {
  it('is empty when there is no brief', () => {
    expect(buildSceneOverlayBlock('', 1)).toBe('');
    expect(buildSceneOverlayBlock('   ', 2)).toBe('');
  });

  it('frames the scene as explicit fantasy roleplay with visible markers', () => {
    const block = buildSceneOverlayBlock('a man at the bar keeps catching her eye', 1);
    expect(block).toContain('OPEN SCENE');
    expect(block).toContain('scene ends');
    expect(block.toLowerCase()).toContain('fantasy');
    expect(block).toContain('a man at the bar keeps catching her eye');
  });

  it('always preserves the safeword exit and the veto', () => {
    const block = buildSceneOverlayBlock('scene brief', 4);
    expect(block.toLowerCase()).toContain('safeword');
    expect(block.toLowerCase()).toContain('veto is always intact');
  });

  it('forbids claims about her real surroundings', () => {
    const block = buildSceneOverlayBlock('scene brief', 2);
    expect(block.toLowerCase()).toContain('never claim anything about her actual');
  });

  it('labels the arc stage and falls back for unknown stages', () => {
    expect(buildSceneOverlayBlock('b', 1)).toContain('looking / wanting');
    expect(buildSceneOverlayBlock('b', 3)).toContain('sucking');
    expect(buildSceneOverlayBlock('b', 99)).toContain('looking / wanting'); // fallback
  });
});
