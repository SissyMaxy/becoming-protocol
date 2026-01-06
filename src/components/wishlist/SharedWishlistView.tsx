import { useState, useEffect } from 'react';
import { Gift, ExternalLink, Check, Loader2, AlertCircle } from 'lucide-react';
import { getSharedWishlist, claimSharedItem } from '../../lib/wishlist-sharing';
import { INVESTMENT_CATEGORIES, formatCurrency, getPriorityStars } from '../../data/investment-categories';
import type { SharedWishlistData, SharedWishlistItem } from '../../types/investments';

interface SharedWishlistViewProps {
  token: string;
  onBack: () => void;
}

export function SharedWishlistView({ token, onBack }: SharedWishlistViewProps) {
  const [data, setData] = useState<SharedWishlistData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimEmail, setClaimEmail] = useState('');
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadWishlist() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await getSharedWishlist(token);
        if (result) {
          setData(result);
        } else {
          setError('This wishlist link is invalid or has expired.');
        }
      } catch (err) {
        console.error('Failed to load shared wishlist:', err);
        setError('Failed to load wishlist. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }

    loadWishlist();
  }, [token]);

  const handleClaim = async (itemId: string) => {
    if (!claimEmail.trim()) {
      return;
    }

    try {
      const success = await claimSharedItem(token, itemId, claimEmail.trim());
      if (success) {
        setClaimSuccess(itemId);
        setClaimingId(null);
        setClaimEmail('');
        // Refresh data
        const result = await getSharedWishlist(token);
        if (result) {
          setData(result);
        }
      }
    } catch (err) {
      console.error('Failed to claim item:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-protocol-bg flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-protocol-accent animate-spin mx-auto mb-4" />
          <p className="text-protocol-text-muted">Loading wishlist...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-protocol-bg flex items-center justify-center p-4">
        <div className="card p-8 text-center max-w-sm w-full">
          <AlertCircle className="w-12 h-12 text-protocol-danger mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-protocol-text mb-2">
            Wishlist Not Found
          </h2>
          <p className="text-sm text-protocol-text-muted mb-6">
            {error || 'This wishlist link is invalid or has expired.'}
          </p>
          <button
            onClick={onBack}
            className="px-6 py-2 rounded-lg bg-protocol-surface border border-protocol-border
                       text-protocol-text hover:bg-protocol-surface-light transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Group items by priority
  const priorityGroups = [
    { priority: 1 as const, items: data.items.filter((i) => i.priority === 1) },
    { priority: 2 as const, items: data.items.filter((i) => i.priority === 2) },
    { priority: 3 as const, items: data.items.filter((i) => i.priority === 3) },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen bg-protocol-bg">
      {/* Header */}
      <div className="sticky top-0 bg-protocol-surface/95 backdrop-blur-lg border-b border-protocol-border z-10">
        <div className="max-w-sm mx-auto px-4 py-4">
          <div className="text-center">
            <h1 className="text-xl font-bold text-gradient">
              {data.ownerName ? `${data.ownerName}'s Wishlist` : 'Wishlist'}
            </h1>
            <p className="text-sm text-protocol-text-muted mt-1">
              Help her become who she's meant to be
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-sm mx-auto px-4 py-6 space-y-6">
        {data.items.length === 0 ? (
          <div className="card p-8 text-center">
            <Gift className="w-12 h-12 text-protocol-text-muted mx-auto mb-4" />
            <p className="text-protocol-text-muted">This wishlist is empty.</p>
          </div>
        ) : (
          priorityGroups.map((group) => (
            <div key={group.priority} className="space-y-2">
              <h3 className="text-sm font-semibold text-protocol-text-muted">
                {getPriorityStars(group.priority)}
              </h3>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <SharedItemCard
                    key={item.id}
                    item={item}
                    canSeePrices={data.canSeePrices}
                    canClaimItems={data.canClaimItems}
                    isClaiming={claimingId === item.id}
                    claimEmail={claimingId === item.id ? claimEmail : ''}
                    onStartClaim={() => setClaimingId(item.id)}
                    onCancelClaim={() => {
                      setClaimingId(null);
                      setClaimEmail('');
                    }}
                    onEmailChange={setClaimEmail}
                    onClaim={() => handleClaim(item.id)}
                    claimSuccess={claimSuccess === item.id}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        {/* Footer */}
        <div className="text-center pt-4">
          <p className="text-xs text-protocol-text-muted">
            Powered by{' '}
            <span className="text-gradient font-semibold">Becoming Protocol</span>
          </p>
        </div>
      </div>
    </div>
  );
}

interface SharedItemCardProps {
  item: SharedWishlistItem;
  canSeePrices: boolean;
  canClaimItems: boolean;
  isClaiming: boolean;
  claimEmail: string;
  onStartClaim: () => void;
  onCancelClaim: () => void;
  onEmailChange: (email: string) => void;
  onClaim: () => void;
  claimSuccess: boolean;
}

function SharedItemCard({
  item,
  canSeePrices,
  canClaimItems,
  isClaiming,
  claimEmail,
  onStartClaim,
  onCancelClaim,
  onEmailChange,
  onClaim,
  claimSuccess,
}: SharedItemCardProps) {
  const categoryInfo = INVESTMENT_CATEGORIES[item.category];
  const isClaimed = Boolean(item.claimedBy);

  return (
    <div className="card overflow-hidden">
      <div className="p-4 flex items-start gap-3">
        {/* Image or emoji */}
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-16 h-16 rounded-lg object-cover"
          />
        ) : (
          <div
            className="w-16 h-16 rounded-lg flex items-center justify-center text-2xl"
            style={{ backgroundColor: 'rgba(168, 85, 247, 0.1)' }}
          >
            {categoryInfo.emoji}
          </div>
        )}

        {/* Details */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-protocol-text">{item.name}</p>
          <p className="text-sm text-protocol-text-muted">{categoryInfo.label}</p>
          {canSeePrices && item.estimatedPrice && (
            <p className="text-sm font-semibold text-protocol-accent mt-1">
              {formatCurrency(item.estimatedPrice)}
            </p>
          )}
          {isClaimed && (
            <p className="text-xs text-protocol-success flex items-center gap-1 mt-2">
              <Gift className="w-3 h-3" />
              Claimed by someone
            </p>
          )}
          {claimSuccess && (
            <p className="text-xs text-protocol-success flex items-center gap-1 mt-2">
              <Check className="w-3 h-3" />
              Successfully claimed!
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      {!isClaimed && !claimSuccess && (
        <div className="px-4 pb-4 space-y-2">
          {isClaiming ? (
            <div className="space-y-2">
              <input
                type="email"
                value={claimEmail}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="Your email address"
                className="w-full px-4 py-2 rounded-lg bg-protocol-surface border border-protocol-border
                           text-protocol-text placeholder:text-protocol-text-muted/50 text-sm
                           focus:outline-none focus:ring-2 focus:ring-protocol-accent"
              />
              <div className="flex gap-2">
                <button
                  onClick={onCancelClaim}
                  className="flex-1 py-2 rounded-lg bg-protocol-surface border border-protocol-border
                             text-protocol-text-muted text-sm hover:bg-protocol-surface-light transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={onClaim}
                  disabled={!claimEmail.trim()}
                  className="flex-1 py-2 rounded-lg bg-protocol-accent text-white text-sm font-medium
                             hover:bg-protocol-accent-soft transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirm
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              {canClaimItems && (
                <button
                  onClick={onStartClaim}
                  className="flex-1 py-2 rounded-lg bg-protocol-accent text-white text-sm font-medium
                             hover:bg-protocol-accent-soft transition-colors flex items-center justify-center gap-2"
                >
                  <Gift className="w-4 h-4" />
                  I'll get this
                </button>
              )}
              {item.affiliateUrl && (
                <a
                  href={item.affiliateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 rounded-lg bg-protocol-surface border border-protocol-border
                             text-protocol-text text-sm hover:bg-protocol-surface-light transition-colors
                             flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Buy
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
