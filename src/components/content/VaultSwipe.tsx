/**
 * Vault Swipe — David's ONLY content interaction.
 *
 * Tinder-style approve/reject. 30 seconds a day.
 * Handler does everything else.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Check, X, Settings, Image, Video, Mic, Loader2 } from 'lucide-react';
import { useContentPipeline } from '../../hooks/useContentPipeline';
import { useStandingPermission } from '../../hooks/useStandingPermission';
import { HandlerNotificationBanner } from '../handler/HandlerNotification';
import type { VaultItem } from '../../types/content-pipeline';

interface VaultSwipeProps {
  onBack: () => void;
  onManagePermissions?: () => void;
}

const SWIPE_THRESHOLD = 80;

const MEDIA_ICONS = {
  image: Image,
  video: Video,
  audio: Mic,
} as const;

function SwipeCard({
  item,
  onApprove,
  onReject,
}: {
  item: VaultItem;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const delta = e.touches[0].clientX - startX.current;
    setOffset(delta);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (offset > SWIPE_THRESHOLD) {
      onApprove();
    } else if (offset < -SWIPE_THRESHOLD) {
      onReject();
    }
    setOffset(0);
  };

  const MediaIcon = MEDIA_ICONS[item.media_type] || Image;
  const rotation = offset * 0.05;
  const opacity = 1 - Math.abs(offset) / 300;

  return (
    <div
      className="relative w-full max-w-sm mx-auto touch-pan-y"
      style={{
        transform: `translateX(${offset}px) rotate(${rotation}deg)`,
        opacity,
        transition: isDragging ? 'none' : 'all 0.3s ease-out',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Swipe indicators */}
      {offset > 30 && (
        <div className="absolute top-4 left-4 z-10 bg-green-500/80 text-white px-3 py-1 rounded-lg text-sm font-bold rotate-[-15deg]">
          APPROVE
        </div>
      )}
      {offset < -30 && (
        <div className="absolute top-4 right-4 z-10 bg-red-500/80 text-white px-3 py-1 rounded-lg text-sm font-bold rotate-[15deg]">
          REJECT
        </div>
      )}

      {/* Card */}
      <div className="bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden">
        {/* Media preview */}
        <div className="aspect-square bg-zinc-800 flex items-center justify-center relative">
          {item.media_url ? (
            item.media_type === 'image' ? (
              <img
                src={item.media_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : item.media_type === 'video' ? (
              <video
                src={item.media_url}
                className="w-full h-full object-cover"
                muted
                loop
                autoPlay
                playsInline
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-white/40">
                <Mic className="w-12 h-12" />
                <span className="text-sm">Audio clip</span>
              </div>
            )
          ) : (
            <MediaIcon className="w-16 h-16 text-white/20" />
          )}

          {/* Type badge */}
          {item.content_type && (
            <div className="absolute bottom-2 left-2 bg-black/60 text-white/80 text-xs px-2 py-0.5 rounded-full">
              {item.content_type}
            </div>
          )}

          {/* Explicitness badge */}
          {item.explicitness_level > 0 && (
            <div className="absolute bottom-2 right-2 bg-pink-500/60 text-white text-xs px-2 py-0.5 rounded-full">
              L{item.explicitness_level}
            </div>
          )}
        </div>

        {/* Handler's pitch */}
        <div className="p-4">
          {item.handler_notes ? (
            <p className="text-white/70 text-sm italic">{item.handler_notes}</p>
          ) : item.description ? (
            <p className="text-white/70 text-sm">{item.description}</p>
          ) : (
            <p className="text-white/40 text-sm italic">Handler classified this for distribution.</p>
          )}

          {/* Quality + risk */}
          <div className="flex items-center gap-3 mt-2">
            {item.quality_rating && (
              <span className="text-xs text-white/40">
                Quality: {'★'.repeat(item.quality_rating)}{'☆'.repeat(5 - item.quality_rating)}
              </span>
            )}
            {item.identification_risk !== 'none' && (
              <span className={`text-xs ${
                item.identification_risk === 'high' ? 'text-red-400' :
                item.identification_risk === 'medium' ? 'text-yellow-400' :
                'text-white/40'
              }`}>
                Risk: {item.identification_risk}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons (desktop fallback) */}
        <div className="flex border-t border-white/10">
          <button
            onClick={onReject}
            className="flex-1 py-3 flex items-center justify-center gap-2 text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <X className="w-5 h-5" />
            <span className="text-sm">Reject</span>
          </button>
          <div className="w-px bg-white/10" />
          <button
            onClick={onApprove}
            className="flex-1 py-3 flex items-center justify-center gap-2 text-green-400 hover:bg-green-500/10 transition-colors"
          >
            <Check className="w-5 h-5" />
            <span className="text-sm">Approve</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function VaultSwipe({ onBack, onManagePermissions }: VaultSwipeProps) {
  const { pendingItems, vaultStats, isLoading, approveItem, rejectItem } = useContentPipeline();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoApproveCount, setAutoApproveCount] = useState(0);

  // Check standing permissions for auto-approve
  const autoApprove = useStandingPermission('content_auto_approve');
  const fullAutonomy = useStandingPermission('content_full_autonomy');

  // Auto-approve items below explicitness threshold when permission granted
  useEffect(() => {
    if (fullAutonomy.loading || autoApprove.loading) return;

    // Full autonomy: approve everything automatically
    if (fullAutonomy.granted) {
      let count = 0;
      for (const item of pendingItems) {
        approveItem(item.id);
        count++;
      }
      if (count > 0) setAutoApproveCount(count);
      return;
    }

    // Auto-approve: approve items below threshold
    if (autoApprove.granted) {
      const maxLevel = (autoApprove.parameters.max_explicitness as number) || 5;
      let count = 0;
      const remaining: typeof pendingItems = [];
      for (const item of pendingItems) {
        if (item.explicitness_level <= maxLevel) {
          approveItem(item.id);
          count++;
        } else {
          remaining.push(item);
        }
      }
      if (count > 0) setAutoApproveCount(count);
    }
  }, [fullAutonomy.granted, fullAutonomy.loading, autoApprove.granted, autoApprove.loading, autoApprove.parameters]);

  const handleApprove = useCallback(async () => {
    const item = pendingItems[currentIndex];
    if (!item) return;
    await approveItem(item.id);
    setCurrentIndex(prev => prev + 1);
  }, [pendingItems, currentIndex, approveItem]);

  const handleReject = useCallback(async () => {
    const item = pendingItems[currentIndex];
    if (!item) return;
    await rejectItem(item.id);
    setCurrentIndex(prev => prev + 1);
  }, [pendingItems, currentIndex, rejectItem]);

  const currentItem = pendingItems[currentIndex];
  const remainingCount = Math.max(0, pendingItems.length - currentIndex);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="text-white/60 text-sm">
          &larr; Back
        </button>
        <h1 className="text-white font-medium">Content Vault</h1>
        <button
          onClick={onManagePermissions}
          className="text-purple-400 text-sm flex items-center gap-1"
        >
          <Settings className="w-4 h-4" />
          Manage
        </button>
      </div>

      {/* Stats bar */}
      {vaultStats && (
        <div className="flex justify-center gap-4 mb-6 text-xs text-white/40">
          <span>{vaultStats.total} total</span>
          <span className="text-yellow-400">{vaultStats.pending} pending</span>
          <span className="text-green-400">{vaultStats.approved + vaultStats.auto_approved} approved</span>
          <span className="text-blue-400">{vaultStats.distributed} posted</span>
        </div>
      )}

      {/* Auto-approved notification */}
      {autoApproveCount > 0 && (
        <div className="mb-4">
          <HandlerNotificationBanner
            message={`${autoApproveCount} item${autoApproveCount > 1 ? 's' : ''} auto-approved per standing permission.`}
            onDismiss={() => setAutoApproveCount(0)}
          />
        </div>
      )}

      {/* Main content */}
      {!currentItem ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
            <Check className="w-8 h-8 text-green-400" />
          </div>
          <p className="text-white/60 text-lg mb-1">All caught up.</p>
          <p className="text-white/30 text-sm">Handler has it from here.</p>
        </div>
      ) : (
        <>
          {/* Remaining count */}
          <p className="text-center text-white/30 text-xs mb-4">
            {remainingCount} item{remainingCount !== 1 ? 's' : ''} to review
          </p>

          {/* Swipe card */}
          <SwipeCard
            key={currentItem.id}
            item={currentItem}
            onApprove={handleApprove}
            onReject={handleReject}
          />

          {/* Swipe hint */}
          <p className="text-center text-white/20 text-xs mt-4">
            Swipe right to approve, left to reject
          </p>
        </>
      )}
    </div>
  );
}
