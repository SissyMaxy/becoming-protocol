import { useState } from 'react';
import { X, Link2, Copy, Check, Trash2, Gift, Loader2 } from 'lucide-react';
import { useProtocol } from '../../context/ProtocolContext';
import { buildShareUrl } from '../../lib/wishlist-sharing';
import type { WishlistShareInput } from '../../types/investments';

interface WishlistShareModalProps {
  onClose: () => void;
}

export function WishlistShareModal({ onClose }: WishlistShareModalProps) {
  const { wishlistShares, createWishlistShare, revokeWishlistShare } = useProtocol();
  const [isCreating, setIsCreating] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Share options
  const [canSeePrices, setCanSeePrices] = useState(true);
  const [canSeePrivate, setCanSeePrivate] = useState(false);
  const [canClaimItems, setCanClaimItems] = useState(true);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null);

  const handleCreateShare = async () => {
    setIsCreating(true);
    try {
      const input: WishlistShareInput = {
        shareType: 'link',
        canSeePrices,
        canSeePrivate,
        canClaimItems,
        expiresInDays: expiresInDays || undefined,
      };
      await createWishlistShare(input);
    } catch (error) {
      console.error('Failed to create share:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyLink = async (token: string) => {
    const url = buildShareUrl(token);
    await navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleRevoke = async (shareId: string) => {
    if (revokingId === shareId) {
      await revokeWishlistShare(shareId);
      setRevokingId(null);
    } else {
      setRevokingId(shareId);
      setTimeout(() => setRevokingId(null), 3000);
    }
  };

  const activeShares = wishlistShares.filter((s) => s.active);

  return (
    <div className="fixed inset-0 z-50 bg-protocol-bg/95 flex items-start justify-center overflow-y-auto">
      <div className="w-full max-w-sm my-4 mx-4">
        <div className="card">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-protocol-border">
            <h2 className="text-lg font-semibold text-protocol-text">
              Share Your Wishlist
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-protocol-text-muted hover:text-protocol-text
                         hover:bg-protocol-surface-light transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Create New Share */}
          <div className="p-4 space-y-4 border-b border-protocol-border">
            <h3 className="text-sm font-semibold text-protocol-text">Create New Link</h3>

            {/* Permissions */}
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={canSeePrices}
                  onChange={(e) => setCanSeePrices(e.target.checked)}
                  className="sr-only peer"
                />
                <div
                  className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                    canSeePrices
                      ? 'bg-protocol-accent border-protocol-accent'
                      : 'bg-protocol-surface border-protocol-border'
                  }`}
                >
                  {canSeePrices && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="text-sm text-protocol-text">Show prices</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={canSeePrivate}
                  onChange={(e) => setCanSeePrivate(e.target.checked)}
                  className="sr-only peer"
                />
                <div
                  className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                    canSeePrivate
                      ? 'bg-protocol-accent border-protocol-accent'
                      : 'bg-protocol-surface border-protocol-border'
                  }`}
                >
                  {canSeePrivate && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="text-sm text-protocol-text">Show private items</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={canClaimItems}
                  onChange={(e) => setCanClaimItems(e.target.checked)}
                  className="sr-only peer"
                />
                <div
                  className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                    canClaimItems
                      ? 'bg-protocol-accent border-protocol-accent'
                      : 'bg-protocol-surface border-protocol-border'
                  }`}
                >
                  {canClaimItems && <Check className="w-3 h-3 text-white" />}
                </div>
                <div>
                  <span className="text-sm text-protocol-text">Allow claiming items</span>
                  <p className="text-xs text-protocol-text-muted">Gift registry mode</p>
                </div>
              </label>
            </div>

            {/* Expiration */}
            <div>
              <label className="block text-sm font-medium text-protocol-text mb-2">
                Expires
              </label>
              <div className="flex gap-2">
                {[
                  { value: null, label: 'Never' },
                  { value: 7, label: '7 days' },
                  { value: 30, label: '30 days' },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setExpiresInDays(option.value)}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                      expiresInDays === option.value
                        ? 'bg-protocol-accent/20 border-protocol-accent text-protocol-text'
                        : 'bg-protocol-surface border-protocol-border text-protocol-text-muted hover:border-protocol-accent/50'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Create Button */}
            <button
              onClick={handleCreateShare}
              disabled={isCreating}
              className="w-full py-3 rounded-lg bg-protocol-accent text-white font-medium
                         hover:bg-protocol-accent-soft transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed
                         flex items-center justify-center gap-2"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Link2 className="w-5 h-5" />
                  Create Link
                </>
              )}
            </button>
          </div>

          {/* Active Shares */}
          <div className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-protocol-text">
              Active Shares ({activeShares.length})
            </h3>

            {activeShares.length === 0 ? (
              <p className="text-sm text-protocol-text-muted text-center py-4">
                No active shares yet
              </p>
            ) : (
              <div className="space-y-2">
                {activeShares.map((share) => (
                  <div
                    key={share.id}
                    className="p-3 rounded-lg bg-protocol-surface-light space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-protocol-text">
                        <Link2 className="w-4 h-4 text-protocol-accent" />
                        <span className="font-mono text-xs">
                          ...{share.shareToken.slice(-6)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-protocol-text-muted">
                        {share.accessCount > 0 && (
                          <span>{share.accessCount} views</span>
                        )}
                      </div>
                    </div>

                    {/* Permissions display */}
                    <div className="flex items-center gap-2">
                      {share.canSeePrices ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-protocol-surface text-protocol-text-muted">
                          Prices
                        </span>
                      ) : null}
                      {share.canSeePrivate ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-protocol-surface text-protocol-text-muted">
                          Private
                        </span>
                      ) : null}
                      {share.canClaimItems ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-protocol-success/20 text-protocol-success">
                          <Gift className="w-3 h-3 inline mr-1" />
                          Registry
                        </span>
                      ) : null}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopyLink(share.shareToken)}
                        className="flex-1 py-1.5 rounded-lg bg-protocol-surface text-protocol-text text-sm
                                   hover:bg-protocol-border transition-colors flex items-center justify-center gap-2"
                      >
                        {copiedToken === share.shareToken ? (
                          <>
                            <Check className="w-4 h-4 text-protocol-success" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Copy Link
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleRevoke(share.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          revokingId === share.id
                            ? 'bg-protocol-danger text-white'
                            : 'bg-protocol-surface text-protocol-text-muted hover:text-protocol-danger'
                        }`}
                      >
                        {revokingId === share.id ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {revokingId === share.id && (
                      <p className="text-xs text-protocol-danger text-center">
                        Click again to revoke
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
