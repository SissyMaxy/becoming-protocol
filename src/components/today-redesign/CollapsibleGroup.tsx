/**
 * CollapsibleGroup — wraps a set of cards under one expandable section
 * header. Default-open per group; remembers state in localStorage.
 *
 * The Today page used to render 30 cards as a flat scroll. This groups
 * them so secondary systems collapse out of the way until needed.
 */

import { useState, useEffect, type ReactNode } from 'react';

interface CollapsibleGroupProps {
  id: string;
  label: string;
  hint?: string;
  defaultOpen?: boolean;
  tone?: string;
  children: ReactNode;
}

export function CollapsibleGroup({
  id, label, hint, defaultOpen = false, tone = 'var(--protocol-accent-soft)', children,
}: CollapsibleGroupProps) {
  const storageKey = `td_group_${id}`;
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return defaultOpen;
    const stored = localStorage.getItem(storageKey);
    if (stored === null) return defaultOpen;
    return stored === '1';
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, open ? '1' : '0'); } catch {}
  }, [open, storageKey]);

  return (
    <section style={{ marginBottom: 16 }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          width: '100%',
          padding: '10px 14px',
          background: 'var(--protocol-bg-deep)',
          // color-mix so tone works as hex OR var(--protocol-*)
          border: `1px solid ${open ? `color-mix(in srgb, ${tone} 34%, transparent)` : 'rgb(var(--protocol-border-rgb) / 0.6)'}`,
          borderLeft: `3px solid ${tone}`,
          borderRadius: 6,
          color: 'var(--protocol-text)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          textAlign: 'left',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <span style={{
          fontSize: 11, color: tone, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.08em',
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s', fontSize: 11,
          }}>▸</span>
          {label}
        </span>
        {hint && (
          <span style={{ fontSize: 10.5, color: 'var(--protocol-text-muted)', marginLeft: 'auto', fontStyle: 'italic' }}>
            {hint}
          </span>
        )}
      </button>
      {open && (
        <div style={{ paddingTop: 12 }}>
          {children}
        </div>
      )}
    </section>
  );
}
