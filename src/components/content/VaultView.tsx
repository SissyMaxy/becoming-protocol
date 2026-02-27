/**
 * VaultView — Wraps VaultSwipe (approval mode) + vault browser (grid view).
 * Auto-switches: swipe mode if pending items, browser otherwise.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, Grid, Layers, Loader2, Filter, Image, Video, Mic,
  Eye, RotateCcw,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import { VaultSwipe } from './VaultSwipe';
import { browseVaultItems, getPendingVaultItems } from '../../lib/content-pipeline';
import type { VaultItem } from '../../types/content-pipeline';

interface VaultViewProps {
  onBack: () => void;
}

type ViewMode = 'swipe' | 'browse';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'distributed', label: 'Distributed' },
  { value: 'rejected', label: 'Rejected' },
];

const MEDIA_ICONS = { image: Image, video: Video, audio: Mic } as const;

export function VaultView({ onBack }: VaultViewProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();

  const [mode, setMode] = useState<ViewMode>('browse');
  const [items, setItems] = useState<VaultItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Selected item detail
  const [selectedItem, setSelectedItem] = useState<VaultItem | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    const [pending, browsed] = await Promise.allSettled([
      getPendingVaultItems(user.id),
      browseVaultItems(user.id, {
        status: statusFilter || undefined,
        domain: domainFilter || undefined,
      }),
    ]);

    const pendingItems = pending.status === 'fulfilled' ? pending.value : [];
    setPendingCount(pendingItems.length);

    // Auto-switch to swipe if pending items and no filter active
    if (pendingItems.length > 0 && !statusFilter && !domainFilter) {
      setMode('swipe');
    }

    const browseItems = browsed.status === 'fulfilled' ? browsed.value : [];
    setItems(browseItems);
    setIsLoading(false);
  }, [user, statusFilter, domainFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const bg = isBambiMode ? 'bg-white' : 'bg-protocol-bg';
  const text = isBambiMode ? 'text-gray-800' : 'text-protocol-text';
  const muted = isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted';
  const card = isBambiMode ? 'bg-white border-gray-200' : 'bg-protocol-surface border-protocol-border';

  if (mode === 'swipe') {
    return (
      <div>
        <div className="flex items-center justify-between px-4 pt-4">
          <button
            onClick={() => setMode('browse')}
            className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg ${
              isBambiMode ? 'bg-gray-100 text-gray-600' : 'bg-protocol-surface text-protocol-text-muted'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            Browse
          </button>
        </div>
        <VaultSwipe
          onBack={onBack}
          onManagePermissions={() => {
            window.dispatchEvent(new CustomEvent('navigate-to-vault-permissions'));
          }}
        />
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${bg} pb-20`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className={muted}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className={`text-lg font-bold ${text}`}>Vault</h1>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <button
              onClick={() => setMode('swipe')}
              className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg ${
                isBambiMode ? 'bg-pink-100 text-pink-600' : 'bg-protocol-accent/20 text-protocol-accent'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              {pendingCount} to review
            </button>
          )}
          <button onClick={() => setShowFilters(!showFilters)} className={muted}>
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className={`mx-4 mb-4 p-3 rounded-xl border ${card} space-y-3`}>
          <div>
            <label className={`text-xs ${muted} mb-1 block`}>Status</label>
            <div className="flex gap-1 flex-wrap">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStatusFilter(opt.value)}
                  className={`px-2 py-1 rounded-lg text-xs ${
                    statusFilter === opt.value
                      ? isBambiMode ? 'bg-pink-100 text-pink-600' : 'bg-protocol-accent/20 text-protocol-accent'
                      : muted
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <input
              value={domainFilter}
              onChange={e => setDomainFilter(e.target.value)}
              placeholder="Filter by domain..."
              className={`flex-1 px-3 py-1.5 rounded-lg border text-xs ${card} ${text}`}
            />
            <button onClick={() => { setStatusFilter(''); setDomainFilter(''); }} className={muted}>
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className={`w-6 h-6 animate-spin ${muted}`} />
        </div>
      ) : items.length === 0 ? (
        <div className={`text-center py-20 ${muted}`}>
          <Image className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No vault items match your filters.</p>
        </div>
      ) : (
        <>
          {/* Grid */}
          <div className="px-4 grid grid-cols-3 gap-2">
            {items.map(item => {
              const Icon = MEDIA_ICONS[item.media_type as keyof typeof MEDIA_ICONS] || Image;
              const statusColor =
                item.approval_status === 'approved' ? 'bg-green-500' :
                item.approval_status === 'pending' ? 'bg-yellow-500' :
                item.approval_status === 'distributed' ? 'bg-blue-500' :
                item.approval_status === 'rejected' ? 'bg-red-500' : 'bg-gray-500';

              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`relative aspect-square rounded-xl border overflow-hidden ${card}`}
                >
                  {item.media_url ? (
                    <img src={item.media_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Icon className={`w-8 h-8 ${muted}`} />
                    </div>
                  )}
                  {/* Status dot */}
                  <div className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ${statusColor}`} />
                  {/* Face indicator */}
                  {item.face_visible && (
                    <div className="absolute top-1.5 left-1.5">
                      <Eye className="w-3 h-3 text-red-400" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Detail modal */}
          {selectedItem && (
            <div className="fixed inset-0 z-50 bg-black/70 flex items-end">
              <div className={`w-full max-h-[80vh] rounded-t-2xl ${bg} overflow-y-auto`}>
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className={`font-bold ${text}`}>Item Detail</h3>
                    <button onClick={() => setSelectedItem(null)} className={muted}>
                      &times;
                    </button>
                  </div>

                  {selectedItem.media_url && (
                    <img src={selectedItem.media_url} alt="" className="w-full rounded-lg max-h-48 object-cover" />
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className={muted}>Status</div>
                    <div className={text}>{selectedItem.approval_status}</div>
                    <div className={muted}>Type</div>
                    <div className={text}>{selectedItem.content_type || '—'}</div>
                    <div className={muted}>Explicitness</div>
                    <div className={text}>{selectedItem.explicitness_level}/5</div>
                    <div className={muted}>Face Visible</div>
                    <div className={text}>{selectedItem.face_visible ? 'Yes' : 'No'}</div>
                    <div className={muted}>Domain</div>
                    <div className={text}>{selectedItem.domain || '—'}</div>
                    <div className={muted}>Tags</div>
                    <div className={text}>{selectedItem.tags?.join(', ') || '—'}</div>
                  </div>

                  {selectedItem.caption_draft && (
                    <div>
                      <label className={`text-xs ${muted}`}>Caption Draft</label>
                      <p className={`text-sm ${text}`}>{selectedItem.caption_draft}</p>
                    </div>
                  )}

                  {selectedItem.handler_notes && (
                    <div>
                      <label className={`text-xs ${muted}`}>Handler Notes</label>
                      <p className={`text-sm ${text}`}>{selectedItem.handler_notes}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
