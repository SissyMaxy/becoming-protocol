import { useState } from 'react';
import { Plus, Share2, Gift, Lock, Trash2, Check, ExternalLink } from 'lucide-react';
import { useProtocol } from '../../context/ProtocolContext';
import { INVESTMENT_CATEGORIES, formatCurrency, getPriorityStars } from '../../data/investment-categories';
import { AddWishlistModal } from './AddWishlistModal';
import { MarkPurchasedModal } from './MarkPurchasedModal';
import { WishlistShareModal } from './WishlistShareModal';
import type { WishlistItem } from '../../types/investments';

export function WishlistView() {
  const { wishlist, wishlistSummary, removeFromWishlist, investmentsLoading } = useProtocol();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [purchasingItem, setPurchasingItem] = useState<WishlistItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (deletingId === id) {
      await removeFromWishlist(id);
      setDeletingId(null);
    } else {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 3000);
    }
  };

  if (investmentsLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-protocol-surface-light" />
              <div className="flex-1">
                <div className="h-4 bg-protocol-surface-light rounded w-2/3 mb-2" />
                <div className="h-3 bg-protocol-surface-light rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const priorityGroups = [
    { priority: 1 as const, label: 'High Priority', items: wishlistSummary?.byPriority.high || [] },
    { priority: 2 as const, label: 'Medium Priority', items: wishlistSummary?.byPriority.medium || [] },
    { priority: 3 as const, label: 'Low Priority', items: wishlistSummary?.byPriority.low || [] },
  ].filter(group => group.items.length > 0);

  return (
    <div className="space-y-4">
      {/* Header with total and share */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-protocol-text-muted">
            {wishlistSummary?.itemCount || 0} items
          </p>
          <p className="text-lg font-semibold text-protocol-text">
            {formatCurrency(wishlistSummary?.totalEstimated || 0)} total
          </p>
        </div>
        <button
          onClick={() => setShowShareModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-protocol-surface border border-protocol-border
                     text-protocol-text hover:bg-protocol-surface-light transition-colors"
        >
          <Share2 className="w-4 h-4" />
          <span className="text-sm">Share</span>
        </button>
      </div>

      {/* Empty State */}
      {wishlist.length === 0 ? (
        <div className="card p-8 text-center">
          <Gift className="w-12 h-12 text-protocol-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-protocol-text mb-2">
            Your wishlist is empty
          </h3>
          <p className="text-sm text-protocol-text-muted mb-4">
            Add items you want for your feminization journey.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-6 py-2 rounded-lg bg-protocol-accent text-white font-medium
                       hover:bg-protocol-accent-soft transition-colors"
          >
            Add First Item
          </button>
        </div>
      ) : (
        <>
          {/* Priority Groups */}
          {priorityGroups.map((group) => (
            <div key={group.priority} className="space-y-2">
              <h3 className="text-sm font-semibold text-protocol-text flex items-center gap-2">
                <span>{getPriorityStars(group.priority)}</span>
                {group.label}
              </h3>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <WishlistItemCard
                    key={item.id}
                    item={item}
                    onGotIt={() => setPurchasingItem(item)}
                    onDelete={() => handleDelete(item.id)}
                    isDeleting={deletingId === item.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Floating Add Button */}
      <button
        onClick={() => setShowAddModal(true)}
        className="fixed bottom-24 right-4 w-14 h-14 rounded-full bg-protocol-accent text-white
                   shadow-lg shadow-protocol-accent/30 flex items-center justify-center
                   hover:bg-protocol-accent-soft transition-colors z-30"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Modals */}
      {showAddModal && (
        <AddWishlistModal onClose={() => setShowAddModal(false)} />
      )}

      {purchasingItem && (
        <MarkPurchasedModal
          item={purchasingItem}
          onClose={() => setPurchasingItem(null)}
        />
      )}

      {showShareModal && (
        <WishlistShareModal onClose={() => setShowShareModal(false)} />
      )}
    </div>
  );
}

interface WishlistItemCardProps {
  item: WishlistItem;
  onGotIt: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

function WishlistItemCard({ item, onGotIt, onDelete, isDeleting }: WishlistItemCardProps) {
  const categoryInfo = INVESTMENT_CATEGORIES[item.category];
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className="card overflow-hidden"
      onClick={() => setShowActions(!showActions)}
    >
      <div className="p-4 flex items-center gap-3">
        {/* Image or emoji */}
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-12 h-12 rounded-lg object-cover"
          />
        ) : (
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center text-xl"
            style={{ backgroundColor: 'rgba(168, 85, 247, 0.1)' }}
          >
            {categoryInfo.emoji}
          </div>
        )}

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-protocol-text truncate">
              {item.name}
            </p>
            {item.private && (
              <Lock className="w-3 h-3 text-protocol-text-muted flex-shrink-0" />
            )}
          </div>
          <p className="text-xs text-protocol-text-muted">
            {categoryInfo.label}
            {item.retailer && ` · ${item.retailer}`}
          </p>
          {item.claimedBy && (
            <p className="text-xs text-protocol-success flex items-center gap-1 mt-1">
              <Gift className="w-3 h-3" />
              Claimed by someone
            </p>
          )}
        </div>

        {/* Price */}
        {item.estimatedPrice && (
          <p className="text-sm font-semibold text-protocol-accent">
            {formatCurrency(item.estimatedPrice)}
          </p>
        )}
      </div>

      {/* Actions */}
      {showActions && (
        <div className="px-4 pb-4 flex items-center gap-2 border-t border-protocol-border pt-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onGotIt();
            }}
            className="flex-1 py-2 rounded-lg bg-protocol-accent text-white text-sm font-medium
                       hover:bg-protocol-accent-soft transition-colors flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            Got it!
          </button>

          {item.originalUrl && (
            <a
              href={item.affiliateUrl || item.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-2 rounded-lg bg-protocol-surface-light text-protocol-text
                         hover:bg-protocol-border transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className={`p-2 rounded-lg transition-colors ${
              isDeleting
                ? 'bg-protocol-danger text-white'
                : 'bg-protocol-surface-light text-protocol-text-muted hover:text-protocol-danger'
            }`}
          >
            {isDeleting ? <Check className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
