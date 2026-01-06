import { useState } from 'react';
import {
  Lock,
  Unlock,
  Play,
  Music,
  FileText,
  Video,
  Image,
  Sparkles,
  Clock,
  Star,
  Filter,
  Search,
  X,
  Package,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { RewardContent, ContentTier, ContentType, UserContentUnlock } from '../../types/rewards';

interface ContentLibraryProps {
  allContent: RewardContent[];
  userUnlocks: UserContentUnlock[];
  onPlayContent: (content: RewardContent) => void;
  onUnlockContent?: (contentId: string) => Promise<void>;
  className?: string;
}

const TIER_INFO: Record<ContentTier, { label: string; icon: React.ReactNode; color: string }> = {
  daily: { label: 'Daily', icon: <Sparkles className="w-4 h-4" />, color: 'green' },
  earned: { label: 'Earned', icon: <Star className="w-4 h-4" />, color: 'blue' },
  premium: { label: 'Premium', icon: <Unlock className="w-4 h-4" />, color: 'purple' },
  vault: { label: 'Vault', icon: <Package className="w-4 h-4" />, color: 'gold' },
};

const CONTENT_TYPE_ICONS: Record<ContentType, React.ReactNode> = {
  audio: <Music className="w-4 h-4" />,
  text: <FileText className="w-4 h-4" />,
  video: <Video className="w-4 h-4" />,
  image: <Image className="w-4 h-4" />,
  hypno: <Sparkles className="w-4 h-4" />,
};

export function ContentLibrary({
  allContent,
  userUnlocks,
  onPlayContent,
  onUnlockContent,
  className = '',
}: ContentLibraryProps) {
  const { isBambiMode } = useBambiMode();
  const [selectedTier, setSelectedTier] = useState<ContentTier | 'all'>('all');
  const [selectedType, setSelectedType] = useState<ContentType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Create a set of unlocked content IDs for quick lookup
  const unlockedIds = new Set(userUnlocks.map(u => u.contentId));

  // Check if content is accessible
  const isContentAccessible = (content: RewardContent): boolean => {
    if (content.tier === 'daily') return true;
    return unlockedIds.has(content.id);
  };

  // Filter content
  const filteredContent = allContent.filter(content => {
    // Tier filter
    if (selectedTier !== 'all' && content.tier !== selectedTier) return false;

    // Type filter
    if (selectedType !== 'all' && content.contentType !== selectedType) return false;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        content.title.toLowerCase().includes(query) ||
        content.description?.toLowerCase().includes(query) ||
        content.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    return true;
  });

  // Sort: accessible first, then by tier, then by date
  const sortedContent = [...filteredContent].sort((a, b) => {
    const aAccessible = isContentAccessible(a);
    const bAccessible = isContentAccessible(b);

    if (aAccessible && !bAccessible) return -1;
    if (!aAccessible && bAccessible) return 1;

    const tierOrder: Record<ContentTier, number> = { daily: 0, earned: 1, premium: 2, vault: 3 };
    if (tierOrder[a.tier] !== tierOrder[b.tier]) {
      return tierOrder[a.tier] - tierOrder[b.tier];
    }

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Stats
  const totalContent = allContent.length;
  const unlockedCount = allContent.filter(c => isContentAccessible(c)).length;

  const tiers: (ContentTier | 'all')[] = ['all', 'daily', 'earned', 'premium', 'vault'];
  const contentTypes: (ContentType | 'all')[] = ['all', 'audio', 'video', 'text', 'image', 'hypno'];

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2
            className={`text-xl font-bold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            Content Library
          </h2>
          <p
            className={`text-sm mt-1 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            {unlockedCount}/{totalContent} unlocked
          </p>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
            showFilters
              ? isBambiMode
                ? 'bg-pink-500 text-white'
                : 'bg-protocol-accent text-white'
              : isBambiMode
                ? 'bg-pink-100 text-pink-600'
                : 'bg-protocol-surface text-protocol-text'
          }`}
        >
          <Filter className="w-4 h-4" />
          <span className="text-sm">Filters</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search
          className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search content..."
          className={`w-full pl-10 pr-4 py-3 rounded-xl ${
            isBambiMode
              ? 'bg-pink-50 border-2 border-pink-200 focus:border-pink-400 text-pink-700 placeholder-pink-300'
              : 'bg-protocol-surface border border-protocol-border focus:border-protocol-accent text-protocol-text placeholder-protocol-text-muted'
          } outline-none transition-colors`}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tier Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {tiers.map((tier) => {
          const isSelected = selectedTier === tier;
          const tierInfo = tier === 'all' ? null : TIER_INFO[tier];
          const count = tier === 'all'
            ? allContent.length
            : allContent.filter(c => c.tier === tier).length;

          return (
            <button
              key={tier}
              onClick={() => setSelectedTier(tier)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                isSelected
                  ? isBambiMode
                    ? 'bg-pink-500 text-white'
                    : 'bg-protocol-accent text-white'
                  : isBambiMode
                    ? 'bg-pink-50 text-pink-600 hover:bg-pink-100'
                    : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
              }`}
            >
              {tierInfo?.icon}
              <span>{tier === 'all' ? 'All' : tierInfo?.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded text-xs ${
                  isSelected
                    ? 'bg-white/20'
                    : isBambiMode
                      ? 'bg-pink-200 text-pink-600'
                      : 'bg-protocol-surface-light'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content Type Filters (collapsible) */}
      {showFilters && (
        <div
          className={`mb-4 p-4 rounded-xl ${
            isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
          }`}
        >
          <p
            className={`text-sm font-medium mb-2 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}
          >
            Content Type
          </p>
          <div className="flex flex-wrap gap-2">
            {contentTypes.map((type) => {
              const isSelected = selectedType === type;
              return (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    isSelected
                      ? isBambiMode
                        ? 'bg-pink-500 text-white'
                        : 'bg-protocol-accent text-white'
                      : isBambiMode
                        ? 'bg-white text-pink-600 border border-pink-200'
                        : 'bg-protocol-bg text-protocol-text border border-protocol-border'
                  }`}
                >
                  {type !== 'all' && CONTENT_TYPE_ICONS[type]}
                  <span className="capitalize">{type}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Content Grid */}
      <div className="grid gap-4">
        {sortedContent.map((content) => (
          <ContentCard
            key={content.id}
            content={content}
            isAccessible={isContentAccessible(content)}
            unlock={userUnlocks.find(u => u.contentId === content.id)}
            isBambiMode={isBambiMode}
            onPlay={() => onPlayContent(content)}
            onUnlock={onUnlockContent ? () => onUnlockContent(content.id) : undefined}
          />
        ))}
      </div>

      {/* Empty State */}
      {sortedContent.length === 0 && (
        <div
          className={`text-center py-12 rounded-xl ${
            isBambiMode
              ? 'bg-pink-50 border-2 border-dashed border-pink-200'
              : 'bg-protocol-surface-light border-2 border-dashed border-protocol-border'
          }`}
        >
          <p
            className={`text-lg mb-2 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}
          >
            No content found
          </p>
          <p
            className={`text-sm ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          >
            Try adjusting your filters or search query
          </p>
        </div>
      )}
    </div>
  );
}

// Individual content card
function ContentCard({
  content,
  isAccessible,
  unlock,
  isBambiMode,
  onPlay,
  onUnlock,
}: {
  content: RewardContent;
  isAccessible: boolean;
  unlock?: UserContentUnlock;
  isBambiMode: boolean;
  onPlay: () => void;
  onUnlock?: () => void;
}) {
  const tierInfo = TIER_INFO[content.tier];
  const typeIcon = CONTENT_TYPE_ICONS[content.contentType];

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={`rounded-xl overflow-hidden transition-all ${
        isAccessible
          ? isBambiMode
            ? 'bg-white border-2 border-pink-200 hover:border-pink-300'
            : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent'
          : isBambiMode
            ? 'bg-pink-50/50 border-2 border-pink-100'
            : 'bg-protocol-surface-light border border-protocol-border opacity-75'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Thumbnail / Type Icon */}
          <div
            className={`w-16 h-16 rounded-lg flex items-center justify-center ${
              isAccessible
                ? isBambiMode
                  ? 'bg-pink-100'
                  : 'bg-protocol-accent/10'
                : isBambiMode
                  ? 'bg-pink-100/50'
                  : 'bg-protocol-surface'
            }`}
          >
            {content.thumbnailUrl ? (
              <img
                src={content.thumbnailUrl}
                alt={content.title}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <span
                className={`${
                  isAccessible
                    ? isBambiMode
                      ? 'text-pink-500'
                      : 'text-protocol-accent'
                    : isBambiMode
                      ? 'text-pink-300'
                      : 'text-protocol-text-muted'
                }`}
              >
                {typeIcon}
              </span>
            )}
          </div>

          {/* Content Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3
                  className={`font-medium truncate ${
                    isAccessible
                      ? isBambiMode
                        ? 'text-pink-700'
                        : 'text-protocol-text'
                      : isBambiMode
                        ? 'text-pink-400'
                        : 'text-protocol-text-muted'
                  }`}
                >
                  {isAccessible ? content.title : '???'}
                </h3>
                <div
                  className={`flex items-center gap-2 mt-1 text-xs ${
                    isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                  }`}
                >
                  <span className="capitalize">{content.contentType}</span>
                  {content.durationSeconds && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(content.durationSeconds)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Tier Badge */}
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
                  content.tier === 'daily'
                    ? 'bg-green-100 text-green-700'
                    : content.tier === 'earned'
                      ? 'bg-blue-100 text-blue-700'
                      : content.tier === 'premium'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-amber-100 text-amber-700'
                }`}
              >
                {tierInfo.label}
              </span>
            </div>

            {/* Description */}
            {isAccessible && content.description && (
              <p
                className={`text-sm mt-2 line-clamp-2 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                {content.description}
              </p>
            )}

            {/* Locked Message */}
            {!isAccessible && (
              <p
                className={`text-sm mt-2 ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                {content.unlockRequirement
                  ? `Unlock: ${content.unlockRequirement.type} ${content.unlockRequirement.value}`
                  : `${tierInfo.label} tier content`}
              </p>
            )}

            {/* Tags */}
            {isAccessible && content.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {content.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className={`px-2 py-0.5 rounded text-xs ${
                      isBambiMode
                        ? 'bg-pink-100 text-pink-500'
                        : 'bg-protocol-surface-light text-protocol-text-muted'
                    }`}
                  >
                    {tag}
                  </span>
                ))}
                {content.tags.length > 3 && (
                  <span
                    className={`px-2 py-0.5 text-xs ${
                      isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                    }`}
                  >
                    +{content.tags.length - 3}
                  </span>
                )}
              </div>
            )}

            {/* Play Stats */}
            {unlock && unlock.timesPlayed > 0 && (
              <p
                className={`text-xs mt-2 ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                Played {unlock.timesPlayed}x
                {unlock.lastPlayedAt && (
                  <> • Last: {new Date(unlock.lastPlayedAt).toLocaleDateString()}</>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-4">
          {isAccessible ? (
            <button
              onClick={onPlay}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-colors ${
                isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
              }`}
            >
              <Play className="w-4 h-4" />
              <span>Play</span>
            </button>
          ) : (
            <button
              onClick={onUnlock}
              disabled={!onUnlock}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium ${
                onUnlock
                  ? isBambiMode
                    ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                    : 'bg-protocol-surface-light text-protocol-text hover:bg-protocol-border'
                  : isBambiMode
                    ? 'bg-pink-50 text-pink-300 cursor-not-allowed'
                    : 'bg-protocol-surface text-protocol-text-muted cursor-not-allowed'
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>Locked</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Compact content picker for session flow
export function ContentPicker({
  content,
  selectedIds,
  onToggle,
  maxSelections = 5,
  className = '',
}: {
  content: RewardContent[];
  selectedIds: string[];
  onToggle: (contentId: string) => void;
  maxSelections?: number;
  className?: string;
}) {
  const { isBambiMode } = useBambiMode();

  return (
    <div className={`space-y-2 ${className}`}>
      {content.map((item) => {
        const isSelected = selectedIds.includes(item.id);
        const canSelect = isSelected || selectedIds.length < maxSelections;

        return (
          <button
            key={item.id}
            onClick={() => canSelect && onToggle(item.id)}
            disabled={!canSelect}
            className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
              isSelected
                ? isBambiMode
                  ? 'bg-pink-100 border-2 border-pink-400'
                  : 'bg-protocol-accent/10 border-2 border-protocol-accent'
                : canSelect
                  ? isBambiMode
                    ? 'bg-white border-2 border-pink-200 hover:border-pink-300'
                    : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent'
                  : isBambiMode
                    ? 'bg-pink-50 border border-pink-100 opacity-50 cursor-not-allowed'
                    : 'bg-protocol-surface-light border border-protocol-border opacity-50 cursor-not-allowed'
            }`}
          >
            <div
              className={`w-10 h-10 rounded flex items-center justify-center ${
                isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface-light'
              }`}
            >
              {CONTENT_TYPE_ICONS[item.contentType]}
            </div>
            <div className="flex-1 text-left">
              <p
                className={`font-medium text-sm ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                {item.title}
              </p>
              {item.durationSeconds && (
                <p
                  className={`text-xs ${
                    isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                  }`}
                >
                  {Math.floor(item.durationSeconds / 60)} min
                </p>
              )}
            </div>
            {isSelected && (
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  isBambiMode ? 'bg-pink-500' : 'bg-protocol-accent'
                }`}
              >
                <Sparkles className="w-4 h-4 text-white" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
