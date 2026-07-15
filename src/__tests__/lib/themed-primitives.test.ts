/**
 * themed primitives — guards the B1 reconciliation: ui/themed Button/Card
 * compose the single index.css definitions (.btn-velvet / .card) instead of
 * carrying their own drifted variants, and Modal renders the standard scrim.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';

vi.mock('../../context/BambiModeContext', () => ({
  useBambiMode: () => ({
    isBambiMode: false,
    triggerHearts: () => {},
    getCelebration: () => '',
  }),
}));

import { Card, Button, Modal } from '../../components/ui/themed';

afterEach(cleanup);

describe('ui/themed composes the single index.css definitions', () => {
  it('Button primary composes .btn-velvet (the gradient CTA, not flat accent)', () => {
    const { container } = render(
      React.createElement(Button, { variant: 'primary' }, 'Go')
    );
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('btn-velvet');
    expect(btn.className).not.toContain('bg-protocol-accent ');
  });

  it('Button secondary composes .btn-velvet-secondary', () => {
    const { container } = render(
      React.createElement(Button, { variant: 'secondary' }, 'Go')
    );
    expect(container.querySelector('button')!.className).toContain('btn-velvet-secondary');
  });

  it('Card composes .card (rounded-2xl definition lives in index.css only)', () => {
    const { container } = render(
      React.createElement(Card, null, 'body')
    );
    const card = container.firstElementChild!;
    expect(card.className).toMatch(/(^| )card( |$)/);
    expect(card.className).not.toContain('rounded-lg');
  });

  it('Modal renders the standard scrim + a .card panel in a portal', () => {
    render(
      React.createElement(Modal, { open: true, onClose: () => {}, title: 'T' }, 'body')
    );
    const scrim = document.querySelector('[role="dialog"]')!;
    expect(scrim).toBeTruthy();
    expect(scrim.className).toContain('bg-black/60');
    expect(scrim.className).toContain('backdrop-blur-sm');
    expect(document.querySelector('.card')).toBeTruthy();
  });

  it('Modal renders nothing when closed', () => {
    render(
      React.createElement(Modal, { open: false, onClose: () => {} }, 'body')
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
