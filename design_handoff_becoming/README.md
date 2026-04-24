# Handoff: becoming · protocol tracker redesign

## Overview
A redesign of an existing protocol/directive tracking app. The original UI was a tall stack of visually similar dark-themed cards with weak hierarchy. This handoff contains **three tonal directions** explored on the same information architecture plus a **mobile adaptation of the chosen direction (A)**.

The user selected **Direction A — Refined Dark** as the winner. B and C are included for reference only.

## About the design files
The files in this bundle are **design references created in HTML** — interactive prototypes showing intended look, layout, copy, and behavior. They are not production code to copy directly.

Your task is to **recreate these designs in the target codebase's existing environment** (React / Vue / SwiftUI / native, etc.) using its established component library, design tokens, and patterns. If the project has no frontend yet, pick the framework most appropriate for it and implement there.

Keep the HTML files open side-by-side while you work — they are the source of truth for visual details, copy, spacing, and interactions.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and core interactions are all final. Reproduce pixel-perfectly within the constraints of your component library.

## Scope (implement in this order)

### 1. Direction A — Desktop `Today` screen
File: `DirectionA.jsx` (React component, inline styles + a CSS-in-string block)
Layout: fixed 180px left rail + flexible content area. Content is a vertical stack:
  1. Notification-enable banner
  2. Page header (date + phase/day/directive count)
  3. 4-column stat grid (Mag charge / Orgasm debt / Protein / Weight)
  4. 2-column row: Body Directives (1.5fr) + Protocol Progress (1fr)
  5. 2-column row: Handler Queue + Arousal
  6. 2-column row: Future Self + Meal Log
  7. Full-width Aesthetic Target

### 2. Direction A — Mobile `Today` screen
File: `DirectionAMobile.jsx`
Single-column scrollable stack with bottom tab bar (5 tabs: Today / Protocol / Queue / Body / Me). Queue tab has a red badge. iOS status bar + home indicator are rendered by the prototype's bezel only — your native/web app should use the platform's real status bar and safe-area insets.

## Design tokens

### Colors
```
--bg              #0a0a0d   app background
--surface-1       #111116   cards
--surface-2       #13131a   hover
--border          #1a1a20   default border
--border-strong   #22222a   input border
--border-sep      #15151b   row separator inside cards

--text            #e8e6e3   body
--text-strong     #ffffff   headlines, values
--text-muted      #c8c4cc   secondary body
--text-dim        #8a8690   labels, captions
--text-faint      #6a656e   metadata
--text-ghost      #5a5560   placeholder-ish

--accent          #7c3aed   primary (purple)
--accent-soft     #c4b5fd   tinted text (directive kind, nav active)
--accent-bg       #1a1226   tinted background chip
--accent-deep     #2d1a4d   banner border
--accent-grad     linear-gradient(92deg, #1a0f2e 0%, #150a24 100%)

--ok              #5fc88f
--warn            #f4c272
--danger          #f47272
--danger-bg       #c4272d  (used for the "edging" state only)
```

### Arousal scale ramp (cell backgrounds, indices 0→5)
`#2d2a35 / #3d2a55 / #4d2a75 / #6a2a9a / #7c3aed / #c4272d`

### Typography
- **Family**: Inter (fallbacks: "SF Pro Text", system-ui, sans-serif)
- **Letter-spacing**: -0.005em body, -0.02em headlines, +0.06–0.08em on uppercase labels
- **Scale (desktop):**
  - Page h1: 22px / 650 weight / -0.02em
  - Card title: 12.5px / 600
  - Section eyebrow (uppercase): 10.5px / 600 / +0.06em
  - Body: 13px / 1.55 line-height
  - Stat value: 20px / 650 / -0.02em
  - Arousal number (big): 38px / 650 / -0.03em
  - Caption / meta: 11–11.5px / tabular-nums for any number

### Spacing
- Card radius: 10px (desktop) / 12px (mobile)
- Card padding header: 13px 16px
- Card padding body: 14–16px
- Stat card padding: 12px 14px
- Grid gap: 10px (stat row), 16px (card grid)
- Page padding: 24px 32px (desktop), 18px gutter (mobile)

### Component patterns used across all modules
- **Card header**: 14px icon in accent-soft + 12.5px title + optional uppercase chip + right-aligned meta
- **Checkbox**: 16×16 square (desktop) / 18×18 (mobile), 1.5px border `#3a3540`, fills with `--accent` and shows white check on complete
- **Chip (uppercase pill)**: 10px text, `#c4b5fd` on `#1a1226`, 2px 7px padding, 10px radius
- **Primary button**: `--accent` bg, white text, 5–8px/10–14px padding, 5–6px radius
- **Secondary button**: `#1a1a20` bg, `#c8c4cc` text, same dimensions
- **Left-border priority**: priority messages get a 2px `--accent` left border + `--accent-grad` fade
- **Scrollbars**: hidden (`scrollbar-width: 0` / webkit display: none)

## Modules in detail

### Body directives
One row per directive. Row = checkbox + kind/target eyebrow + due-in chip (right) + body paragraph + 3 action buttons (Complete/Undo · Proof · Discuss). Completed body text is struck through in `#6a656e`.

### Protocol progress
4-segment phase bar at top (filled / half-filled-active / empty). Large tabular "03" number + "of 90 days" label. Uppercase current-step chip. KV table beneath with dotted row dividers.

### Handler queue
Each message: uppercase kind label (Directive / Correction / Invitation / Reward) + timestamp (right) + body. Kind label color: directive=accent-soft, correction=warn, reward=ok, priority/crit=danger. Most recent on top.

### Arousal
Big tabular current number (38px) + scale text "/5" + state label (locked / simmering / attentive / wanting / desperate / edging). 6-cell row (0–5) below. Each cell fills with the corresponding ramp color. `l5` (edging) uses `--danger-bg`, visually hot. Footer caption explains the conditioning policy.

### Meal log
4-tab header (Breakfast / Lunch / Dinner / Snack), each tab shows protein grams beneath. Inputs: meal description, protein (g), calories. Two checkboxes (Permission asked, Photo before/after). Full-width primary Log meal button.

### Future self prompts
2-column on desktop, stacked on mobile. Each prompt: uppercase eyebrow + question + textarea placeholder "Write it true..."

### Aesthetic target
Full-width card. 4 cells in a row: Waist / Hips / Chest / Weight. Each cell: uppercase part label + big current value + "−N to target" in warn color (or "on track" in ok).

## Interactions & behavior
- All checkboxes toggle via local state; in production, persist to the protocol's day-log model.
- Arousal scale click sets a new level and should POST to the arousal log table.
- Tab switches (meals, mobile bottom bar) are client-only; only the meal-tab view matters.
- No page transitions defined — scroll-only layout.
- Prefers dark scheme; light mode was explicitly out of scope.

## State management needs
- `directives: { id, kind, target, body, done, due }[]`
- `arousal: 0..5`
- `activeMealTab: 'breakfast' | 'lunch' | 'dinner' | 'snack'`
- `tab` (mobile only): 'today' | 'proto' | 'queue' | 'body' | 'me'
- Queue messages, protocol phase, target measurements — read-only for this scope; treat as fetched data.

## Assets
No external images, icons, or fonts required beyond Inter.
All icons are inline SVG strokes (1.8 stroke-width, `currentColor`). Use your codebase's icon library as a drop-in replacement where semantics match; otherwise port the inline SVGs.

## Files in this bundle
- `becoming-redesign.html` — entry point (DesignCanvas host — you don't need to port this)
- `design-canvas.jsx` — canvas shell (don't port)
- `directions/DirectionA.jsx` — **primary reference (desktop)**
- `directions/DirectionAMobile.jsx` — **primary reference (mobile)**
- `directions/DirectionB.jsx` — alternative direction (skip)
- `directions/DirectionC.jsx` — alternative direction (skip)

## Notes for the implementer
- The copy in these files is final; don't rewrite it.
- Color ramp for the arousal cells is non-obvious — reproduce the exact hex values, not an auto-generated ramp.
- The "edging" state intentionally breaks the purple scale into red. That's not a bug.
- Hidden scrollbars across all card internals are an intentional aesthetic choice.
- Tabular-nums on all numeric values (stats, streak days, measurements, arousal) is essential; without it, the dashboard feels jumpy.
