/**
 * Tests for the punishment template library.
 */

import { describe, it, expect } from 'vitest';
import { TEMPLATES } from '../../lib/force/punishment-queue';

describe('punishment templates — structure', () => {
  it('has at least 10 templates', () => {
    expect(Object.keys(TEMPLATES).length).toBeGreaterThanOrEqual(10);
  });

  it('every template has the required fields', () => {
    for (const [key, tpl] of Object.entries(TEMPLATES)) {
      expect(tpl.punishment_type, `${key} punishment_type`).toBeTruthy();
      expect(tpl.title, `${key} title`).toBeTruthy();
      expect(tpl.description, `${key} description`).toBeTruthy();
      expect(tpl.severity, `${key} severity`).toBeGreaterThanOrEqual(1);
      expect(tpl.severity, `${key} severity`).toBeLessThanOrEqual(5);
      expect(tpl.due_hours, `${key} due_hours`).toBeGreaterThanOrEqual(0);
    }
  });

  it('denial extensions have a days parameter', () => {
    for (const key of ['denial_3_days', 'denial_7_days']) {
      const t = TEMPLATES[key];
      expect(t).toBeDefined();
      expect(t.parameters?.days).toBeGreaterThan(0);
    }
  });

  it('mantra templates have repetitions count', () => {
    expect(TEMPLATES.mantra_50?.parameters?.repetitions).toBe(50);
    expect(TEMPLATES.mantra_200?.parameters?.repetitions).toBe(200);
  });

  it('severity escalates with stakes', () => {
    expect(TEMPLATES.denial_7_days.severity).toBeGreaterThan(TEMPLATES.denial_3_days.severity);
    expect(TEMPLATES.mantra_200.severity).toBeGreaterThan(TEMPLATES.mantra_50.severity);
  });

  it('public_slip_post is high severity with review window', () => {
    const t = TEMPLATES.public_slip_post;
    expect(t.severity).toBeGreaterThanOrEqual(3);
    expect(t.parameters?.review_minutes).toBeGreaterThan(0);
  });

  it('edge_no_release mandates no release', () => {
    const t = TEMPLATES.edge_no_release_90;
    expect(t.parameters?.release).toBe(false);
    expect(t.parameters?.edges_minimum).toBeGreaterThan(0);
  });

  it('denial extension templates have 0 due_hours (immediate effect)', () => {
    // These apply immediately at enqueue time, no deadline
    expect(TEMPLATES.denial_3_days.due_hours).toBe(0);
    expect(TEMPLATES.denial_7_days.due_hours).toBe(0);
  });

  it('mantra templates have tight deadlines (same-day)', () => {
    expect(TEMPLATES.mantra_50.due_hours).toBeLessThanOrEqual(24);
    expect(TEMPLATES.mantra_200.due_hours).toBeLessThanOrEqual(24);
  });
});
