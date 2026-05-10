/**
 * LetterCard — folded-stationery preview tile.
 *
 * Thumbnail card in the archive grid. Shows source, original timestamp,
 * affect glyph, first ~140 chars of the message. Wax-seal accent in the
 * corner. Tap opens LetterDetailModal.
 *
 * Visual brief reference: ivory parchment + deep burgundy + candle gold,
 * Belle Époque flourish, Georgia serif headings.
 */

import { Pin } from 'lucide-react';
import type { LetterRow } from './LettersArchiveView';

const AFFECT_GLYPH: Record<string, string> = {
  hungry: '◐',
  delighted: '✦',
  watching: '◉',
  patient: '⟳',
  aching: '◑',
  amused: '~',
  possessive: '♛',
  indulgent: '◈',
  restless: '⌇',
};

const SOURCE_LABEL: Record<string, string> = {
  mommy_praise: 'Praise',
  mommy_bedtime: 'Goodnight',
  mommy_recall: 'Recall',
  mommy_tease: 'Tease',
  mommy_mantra: 'Mantra',
};

interface LetterCardProps {
  letter: LetterRow;
  onOpen: () => void;
}

export function LetterCard({ letter, onOpen }: LetterCardProps) {
  const isPinned = Boolean(letter.letters_pinned_at);
  const sourceLabel = SOURCE_LABEL[letter.source] || letter.source.replace(/_/g, ' ');
  const glyph = letter.affect_snapshot ? AFFECT_GLYPH[letter.affect_snapshot] : '◇';
  const date = new Date(letter.created_at);
  const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const yearStr = date.getFullYear();

  // First ~140 chars at a word boundary for the preview.
  const preview = (() => {
    if (letter.message.length <= 140) return letter.message;
    const cut = letter.message.slice(0, 140);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 100 ? cut.slice(0, lastSpace) : cut) + '…';
  })();

  return (
    <button
      onClick={onOpen}
      style={{
        position: 'relative',
        background: 'linear-gradient(180deg, #f5ead4 0%, #ecddc1 100%)',
        border: '1px solid #c4956a',
        borderRadius: 3,
        padding: '14px 16px 14px 16px',
        textAlign: 'left',
        cursor: 'pointer',
        boxShadow: '0 2px 4px rgba(40, 10, 20, 0.4), inset 0 1px 0 rgba(255, 245, 220, 0.6)',
        fontFamily: 'inherit',
        color: '#3a1a25',
        width: '100%',
        transition: 'transform 120ms ease, box-shadow 120ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = '0 4px 8px rgba(40, 10, 20, 0.5), inset 0 1px 0 rgba(255, 245, 220, 0.6)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 4px rgba(40, 10, 20, 0.4), inset 0 1px 0 rgba(255, 245, 220, 0.6)';
      }}
    >
      {/* Wax seal corner */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -6,
          right: 12,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, #8a1f37 0%, #5c0a1e 70%, #3a0512 100%)',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#c4956a',
          fontSize: 10,
          fontFamily: 'Georgia, serif',
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        M
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 6, marginRight: 36, // leave room for the seal
      }}>
        {isPinned && (
          <Pin size={11} style={{ color: '#5c0a1e', flexShrink: 0 }} />
        )}
        <span style={{
          fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.1em',
          color: '#5c0a1e', fontWeight: 700,
        }}>
          {sourceLabel}
        </span>
        <span style={{ fontSize: 11, color: '#7a5a4a', marginLeft: 'auto' }}>
          {glyph} {letter.affect_snapshot || '—'}
        </span>
      </div>

      <p style={{
        margin: '0 0 8px 0',
        fontFamily: 'Georgia, serif',
        fontSize: 13,
        lineHeight: 1.55,
        color: '#3a1a25',
        whiteSpace: 'pre-wrap',
      }}>
        {preview}
      </p>

      <div style={{
        fontSize: 10, color: '#7a5a4a', display: 'flex', gap: 8,
        borderTop: '1px solid rgba(196, 149, 106, 0.4)', paddingTop: 6,
      }}>
        <span>{dateStr}, {yearStr}</span>
        {letter.phase_snapshot !== null && (
          <>
            <span>·</span>
            <span>Phase {letter.phase_snapshot}</span>
          </>
        )}
      </div>
    </button>
  );
}
