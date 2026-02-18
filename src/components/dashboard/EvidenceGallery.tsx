/**
 * Evidence Gallery
 *
 * Grid/timeline of captured evidence (photos, recordings, milestones).
 * Visual proof of progress.
 */

import { useState } from 'react';
import { Image, Mic, FileText } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { EvidenceEntry } from '../../lib/dashboard-analytics';

interface EvidenceGalleryProps {
  evidence: EvidenceEntry[];
  compact?: boolean;
}

const TYPE_ICONS: Record<string, typeof Image> = {
  photo: Image,
  voice_recording: Mic,
  journal_entry: FileText,
  milestone: FileText,
  purchase: FileText,
};

const TYPE_COLORS: Record<string, string> = {
  photo: '#ec4899',
  voice_recording: '#8b5cf6',
  journal_entry: '#22c55e',
  milestone: '#f59e0b',
  purchase: '#3b82f6',
};

export function EvidenceGallery({ evidence, compact = false }: EvidenceGalleryProps) {
  const { isBambiMode } = useBambiMode();
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);

  const filtered = selectedFilter
    ? evidence.filter(e => e.type === selectedFilter)
    : evidence;

  const displayItems = compact ? filtered.slice(0, 6) : filtered;

  const types = [...new Set(evidence.map(e => e.type))];

  return (
    <div className={`rounded-lg p-4 ${
      isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-sm font-medium ${
          isBambiMode ? 'text-pink-800' : 'text-protocol-text'
        }`}>
          Evidence Gallery ({evidence.length})
        </h3>
      </div>

      {/* Filter chips */}
      {!compact && types.length > 1 && (
        <div className="flex flex-wrap gap-1 mb-3">
          <button
            onClick={() => setSelectedFilter(null)}
            className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
              !selectedFilter
                ? isBambiMode ? 'bg-pink-500 text-white' : 'bg-purple-600 text-white'
                : isBambiMode ? 'bg-pink-100 text-pink-600' : 'bg-white/10 text-gray-400'
            }`}
          >
            All
          </button>
          {types.map(type => (
            <button
              key={type}
              onClick={() => setSelectedFilter(type === selectedFilter ? null : type)}
              className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                type === selectedFilter
                  ? isBambiMode ? 'bg-pink-500 text-white' : 'bg-purple-600 text-white'
                  : isBambiMode ? 'bg-pink-100 text-pink-600' : 'bg-white/10 text-gray-400'
              }`}
            >
              {type.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      {displayItems.length === 0 ? (
        <p className={`text-sm text-center py-4 ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
          No evidence captured yet
        </p>
      ) : (
        <div className={`grid ${compact ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
          {displayItems.map(item => {
            const Icon = TYPE_ICONS[item.type] || FileText;
            const color = TYPE_COLORS[item.type] || '#6b7280';

            return (
              <div
                key={item.id}
                className={`rounded-lg p-3 ${
                  isBambiMode ? 'bg-pink-50' : 'bg-white/5'
                }`}
              >
                {item.contentUrl && item.type === 'photo' ? (
                  <div className="aspect-square rounded bg-black/10 mb-2 overflow-hidden">
                    <img
                      src={item.contentUrl}
                      alt={item.description || 'Evidence'}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div
                    className="aspect-square rounded flex items-center justify-center mb-2"
                    style={{ backgroundColor: `${color}15` }}
                  >
                    <Icon className="w-8 h-8" style={{ color }} />
                  </div>
                )}

                <div className={`text-xs truncate ${isBambiMode ? 'text-pink-700' : 'text-gray-300'}`}>
                  {item.description || item.type.replace(/_/g, ' ')}
                </div>
                <div className={`text-[10px] ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
                  {item.createdAt.toLocaleDateString()}
                  {item.domain && ` · ${item.domain}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
