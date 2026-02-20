/**
 * VaultSwipe — Swipe-based content approval interface.
 * Stack of pending vault items. Swipe right = approve, left = reject.
 * Handler recommendation text on each card. Position dots for stack awareness.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Check, Image, Video, Mic, Camera, ChevronLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface VaultItem {
  id: string;
  media_url: string;
  media_type: 'image' | 'video' | 'audio';
  thumbnail_url?: string;
  description?: string;
  source_type: string;
  handler_recommendation?: string;
  quality_rating?: number;
  content_category?: string;
  submitted_at: string;
  status: string;
}

interface VaultSwipeProps {
  onClose: () => void;
}

const TYPE_ICONS = {
  image: Image,
  video: Video,
  audio: Mic,
} as const;

const SOURCE_LABELS: Record<string, string> = {
  task: 'Task capture',
  session: 'Edge session',
  cam: 'Cam session',
  spontaneous: 'Manual upload',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { weekday: 'long' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} ${time}`;
}

export function VaultSwipe({ onClose }: VaultSwipeProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<VaultItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);

  // Touch tracking
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);

  const SWIPE_THRESHOLD = 100;

  // Load pending vault items
  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);

    supabase
      .from('content_vault')
      .select('id, media_url, media_type, thumbnail_url, description, source_type, handler_recommendation, quality_rating, content_category, submitted_at, status')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('submitted_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error('[Vault] Load failed:', error);
        }
        setItems((data as VaultItem[]) || []);
        setLoading(false);
      });
  }, [user?.id]);

  const currentItem = items[currentIndex] ?? null;

  // Approve or reject
  const handleDecision = useCallback(async (decision: 'approved' | 'rejected') => {
    if (!currentItem || !user?.id) return;

    const now = new Date().toISOString();
    const updateFields = decision === 'approved'
      ? { status: 'approved', approved_at: now }
      : { status: 'rejected', rejected_at: now };

    // Animate card off-screen
    setSwipeDirection(decision === 'approved' ? 'right' : 'left');

    // Persist to DB (fire-and-forget)
    supabase
      .from('content_vault')
      .update(updateFields)
      .eq('id', currentItem.id)
      .then(({ error }) => {
        if (error) console.error('[Vault] Update failed:', error);
      });

    // Advance after animation
    setTimeout(() => {
      setSwipeDirection(null);
      setDragOffset(0);
      setCurrentIndex(prev => prev + 1);
    }, 300);
  }, [currentItem, user?.id]);

  // Touch handlers
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
    isDragging.current = true;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    touchCurrentX.current = e.touches[0].clientX;
    const offset = touchCurrentX.current - touchStartX.current;
    setDragOffset(offset);
  }, []);

  const onTouchEnd = useCallback(() => {
    isDragging.current = false;
    const offset = touchCurrentX.current - touchStartX.current;

    if (Math.abs(offset) >= SWIPE_THRESHOLD) {
      handleDecision(offset > 0 ? 'approved' : 'rejected');
    } else {
      setDragOffset(0);
    }
  }, [handleDecision]);

  // Loading state
  if (loading) {
    return (
      <div className="fixed inset-0 z-[60] bg-protocol-bg flex items-center justify-center">
        <div className="animate-pulse text-protocol-text-muted">Loading vault...</div>
      </div>
    );
  }

  // Empty state
  if (items.length === 0 || currentIndex >= items.length) {
    return (
      <div className="fixed inset-0 z-[60] bg-protocol-bg flex flex-col">
        <div className="flex items-center px-4 pt-4 pb-2">
          <button onClick={onClose} className="p-2 -ml-2 text-protocol-text-muted hover:text-protocol-text">
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <div className="w-16 h-16 rounded-full bg-protocol-surface flex items-center justify-center mb-4">
            <Camera className="w-7 h-7 text-protocol-text-muted" />
          </div>
          <p className="text-protocol-text font-medium mb-2">All caught up.</p>
          <p className="text-sm text-protocol-text-muted leading-relaxed">
            {items.length === 0
              ? 'No content pending. As you complete sessions and practice, captures will appear here for your approval.'
              : 'Handler has everything she needs.'}
          </p>
        </div>
      </div>
    );
  }

  const remaining = items.length - currentIndex;
  const TypeIcon = TYPE_ICONS[currentItem.media_type] || Image;

  // Card transform based on drag/swipe
  const cardTransform = swipeDirection
    ? `translateX(${swipeDirection === 'right' ? '120%' : '-120%'}) rotate(${swipeDirection === 'right' ? '15' : '-15'}deg)`
    : `translateX(${dragOffset}px) rotate(${dragOffset * 0.05}deg)`;

  const cardTransition = swipeDirection || !isDragging.current
    ? 'transform 0.3s ease-out, opacity 0.3s ease-out'
    : 'none';

  // Color tint based on drag direction
  const tintOpacity = Math.min(Math.abs(dragOffset) / SWIPE_THRESHOLD, 1) * 0.15;
  const tintColor = dragOffset > 0
    ? `rgba(34, 197, 94, ${tintOpacity})`
    : dragOffset < 0
      ? `rgba(239, 68, 68, ${tintOpacity})`
      : 'transparent';

  return (
    <div className="fixed inset-0 z-[60] bg-protocol-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <button onClick={onClose} className="p-2 -ml-2 text-protocol-text-muted hover:text-protocol-text">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <p className="text-sm handler-voice text-protocol-text-muted">
          {remaining} item{remaining !== 1 ? 's' : ''} pending
        </p>
        <div className="w-9" /> {/* Spacer */}
      </div>

      {/* Card area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 relative overflow-hidden">
        {/* Tint overlay */}
        <div
          className="absolute inset-0 pointer-events-none transition-colors duration-150"
          style={{ backgroundColor: tintColor }}
        />

        {/* Swipeable card */}
        <div
          className="w-full max-w-sm relative"
          style={{
            transform: cardTransform,
            transition: cardTransition,
            opacity: swipeDirection ? 0.5 : 1,
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Content preview */}
          <div className="rounded-2xl overflow-hidden border border-protocol-border/50 bg-protocol-surface">
            {/* Thumbnail / preview */}
            <div className="aspect-[4/5] bg-protocol-surface-light flex items-center justify-center relative">
              {currentItem.thumbnail_url || currentItem.media_url ? (
                currentItem.media_type === 'image' ? (
                  <img
                    src={currentItem.thumbnail_url || currentItem.media_url}
                    alt="Vault content"
                    className="w-full h-full object-cover"
                  />
                ) : currentItem.media_type === 'video' ? (
                  <video
                    src={currentItem.media_url}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    loop
                    autoPlay
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Mic className="w-12 h-12 text-protocol-text-muted" />
                    <p className="text-sm text-protocol-text-muted">Voice clip</p>
                  </div>
                )
              ) : (
                <TypeIcon className="w-16 h-16 text-protocol-border" />
              )}

              {/* Quality badge */}
              {currentItem.quality_rating && (
                <div className="absolute top-3 right-3 bg-black/60 rounded-full px-2.5 py-1 text-xs text-white font-medium">
                  {currentItem.quality_rating}/5
                </div>
              )}
            </div>

            {/* Info area */}
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs text-protocol-text-muted">
                <TypeIcon className="w-3.5 h-3.5" />
                <span>{SOURCE_LABELS[currentItem.source_type] || currentItem.source_type}</span>
                <span className="text-protocol-border">—</span>
                <span>{formatDate(currentItem.submitted_at)}</span>
              </div>

              {/* Handler recommendation */}
              {currentItem.handler_recommendation && (
                <p className="text-sm handler-voice text-protocol-text/80 leading-relaxed italic">
                  "{currentItem.handler_recommendation}"
                </p>
              )}

              {currentItem.description && !currentItem.handler_recommendation && (
                <p className="text-sm text-protocol-text-muted">{currentItem.description}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop button fallback + position dots */}
      <div className="px-6 pb-8 space-y-4">
        {/* Swipe buttons */}
        <div className="flex items-center justify-center gap-8">
          <button
            onClick={() => handleDecision('rejected')}
            className="w-14 h-14 rounded-full border-2 border-red-500/40 bg-red-500/10 flex items-center justify-center
                       hover:bg-red-500/20 hover:border-red-500/60 transition-all active:scale-90"
          >
            <X className="w-6 h-6 text-red-400" />
          </button>

          <button
            onClick={() => handleDecision('approved')}
            className="w-14 h-14 rounded-full border-2 border-emerald-500/40 bg-emerald-500/10 flex items-center justify-center
                       hover:bg-emerald-500/20 hover:border-emerald-500/60 transition-all active:scale-90"
          >
            <Check className="w-6 h-6 text-emerald-400" />
          </button>
        </div>

        {/* Position dots */}
        <div className="flex items-center justify-center gap-1.5">
          {items.slice(0, Math.min(items.length, 10)).map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === currentIndex
                  ? 'bg-protocol-accent'
                  : i < currentIndex
                    ? 'bg-protocol-text-muted/30'
                    : 'bg-protocol-border'
              }`}
            />
          ))}
          {items.length > 10 && (
            <span className="text-[10px] text-protocol-text-muted ml-1">+{items.length - 10}</span>
          )}
        </div>
      </div>
    </div>
  );
}
