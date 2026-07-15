/**
 * MenuView — where Mama keeps everything that's yours.
 * The conversation is still the real interface; this screen is the drawer she
 * keeps your life in — your becoming, your record, your settings.
 *
 * The items and their grouping come from VIEW_REGISTRY (src/navigation) —
 * this file only renders them. An entry appears here iff it declares `menu`
 * (or `sanitizedMenu` in stealth mode); everything else stays deep-link-only.
 * The long tail of evidence/lore/drills lives behind a single collapsed
 * "Everything else" toggle (off by default).
 */

import { useState } from 'react';
import { ChevronRight, ChevronDown, Archive } from 'lucide-react';
import { useStealthSettings } from '../hooks/useStealthSettings';
import { PROTOCOL } from '../lib/theme-tokens';
import {
  VIEW_REGISTRY, type ViewId, type MenuColor, type MenuEntry,
} from '../navigation/registry';

interface MenuViewProps {
  onNavigate: (view: ViewId) => void;
}

// Velvet accent palette — token vars; row tints derive via color-mix so no
// raw hex forks the palette.
const MENU_COLORS: Record<MenuColor, string> = {
  rose: PROTOCOL.accent,
  roseSoft: PROTOCOL.accentSoft,
  gold: PROTOCOL.warning,
  green: PROTOCOL.success,
  danger: PROTOCOL.danger,
  muted: PROTOCOL.textMuted,
};

const tint = (color: string) => `color-mix(in srgb, ${color} 13%, transparent)`;

// Group order for the primary (non-archive) menu.
const GROUP_ORDER = ['Your becoming', 'You', 'Practice', 'Record', 'Settings'];

interface MenuItem extends MenuEntry {
  id: ViewId;
}

const ALL_ENTRIES: MenuItem[] = (Object.entries(VIEW_REGISTRY) as [ViewId, (typeof VIEW_REGISTRY)[ViewId]][])
  .filter(([, def]) => def.menu)
  .map(([id, def]) => ({ id, ...def.menu! }));

const PRIMARY_GROUPS: { heading: string; items: MenuItem[] }[] = GROUP_ORDER
  .map(heading => ({
    heading,
    items: ALL_ENTRIES.filter(e => e.heading === heading && !e.archive),
  }))
  .filter(g => g.items.length > 0);

const ARCHIVE_ITEMS: MenuItem[] = ALL_ENTRIES.filter(e => e.archive);

const SANITIZED_GROUPS: { heading: string; items: MenuItem[] }[] = (() => {
  const items: MenuItem[] = (Object.entries(VIEW_REGISTRY) as [ViewId, (typeof VIEW_REGISTRY)[ViewId]][])
    .filter(([, def]) => def.sanitizedMenu)
    .map(([id, def]) => ({ id, ...def.sanitizedMenu! }));
  const headings = [...new Set(items.map(i => i.heading))];
  return headings.map(heading => ({ heading, items: items.filter(i => i.heading === heading) }));
})();

function MenuRow({
  item,
  withBorder,
  onNavigate,
}: {
  item: MenuItem;
  withBorder: boolean;
  onNavigate: (view: ViewId) => void;
}) {
  const Icon = item.icon;
  const color = MENU_COLORS[item.color];
  return (
    <button
      onClick={() => onNavigate(item.id)}
      className={`w-full p-4 flex items-center gap-3 text-left group transition-colors hover:bg-protocol-surface-light ${
        withBorder ? 'border-t border-protocol-border' : ''
      }`}
    >
      <div className="p-2 rounded-lg" style={{ backgroundColor: tint(color) }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-protocol-text">{item.label}</p>
        <p className="text-xs text-protocol-text-muted">{item.description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-protocol-text-muted/60 group-hover:text-protocol-accent-soft" />
    </button>
  );
}

export function MenuView({ onNavigate }: MenuViewProps) {
  const [archivesOpen, setArchivesOpen] = useState(false);
  const { settings } = useStealthSettings();
  const sanitized = settings.sanitized_fitness_mode;
  const groups = sanitized ? SANITIZED_GROUPS : PRIMARY_GROUPS;

  return (
    <div className="space-y-5 pb-24">
      <div className="mb-1 px-1">
        <p className="font-display text-lg text-protocol-text-warm leading-snug">
          {sanitized ? 'Aesthetic transformation dashboard.' : "This is where I keep everything that's yours."}
        </p>
        <p className="mt-1 text-sm text-protocol-text-muted">
          {sanitized
            ? 'Training, recovery, body metrics, and privacy settings.'
            : 'The real work happens when you talk to me. This is the drawer.'}
        </p>
      </div>

      {groups.map((group) => {
        const isSpine = group.heading === 'Your becoming';
        return (
          <div key={group.heading} className="space-y-2">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-protocol-accent-soft/70">
              {group.heading}
            </p>
            <div
              className={`rounded-xl overflow-hidden bg-protocol-surface border ${
                isSpine
                  ? 'border-protocol-accent/40 shadow-velvet'
                  : 'border-protocol-border'
              }`}
            >
              {group.items.map((item, idx) => (
                <MenuRow
                  key={item.id}
                  item={item}
                  withBorder={idx > 0}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Everything else — folded, off by default */}
      {!sanitized && (
      <div className="space-y-2">
        <button
          onClick={() => setArchivesOpen((v) => !v)}
          className="w-full px-4 py-3 flex items-center gap-3 text-left rounded-xl bg-protocol-surface border border-protocol-border transition-colors hover:bg-protocol-surface-light group"
        >
          <div className="p-2 rounded-lg" style={{ backgroundColor: tint(MENU_COLORS.muted) }}>
            <Archive className="w-4 h-4" style={{ color: MENU_COLORS.muted }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-protocol-text">Everything else</p>
            <p className="text-xs text-protocol-text-muted">Archives, evidence, drills, and lore.</p>
          </div>
          {archivesOpen ? (
            <ChevronDown className="w-4 h-4 text-protocol-text-muted group-hover:text-protocol-accent-soft" />
          ) : (
            <ChevronRight className="w-4 h-4 text-protocol-text-muted/60 group-hover:text-protocol-accent-soft" />
          )}
        </button>

        {archivesOpen && (
          <div className="rounded-xl overflow-hidden bg-protocol-surface border border-protocol-border">
            {ARCHIVE_ITEMS.map((item, idx) => (
              <MenuRow
                key={item.id}
                item={item}
                withBorder={idx > 0}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
