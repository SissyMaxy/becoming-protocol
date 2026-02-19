/**
 * PollCreator — Handler poll posting interface
 * Shows poll question/options, per-platform formatted text,
 * copy-to-clipboard, "I Posted It" per platform.
 */

import { useState, useCallback } from 'react';
import {
  Copy, Check, ExternalLink, CheckCircle2, Loader2,
  BarChart3, MessageSquare,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { AudiencePoll, PollOption } from '../../types/industry';
import type { PlatformPollFormat } from '../../lib/industry/poll-generator';

// ============================================
// Types
// ============================================

interface PollCreatorProps {
  poll: AudiencePoll;
  platformFormatting?: PlatformPollFormat;
  onPollUpdated: () => void;
  onClose?: () => void;
}

type Platform = 'reddit' | 'twitter' | 'onlyfans';

const POLL_TYPE_LABELS: Record<string, string> = {
  denial_release: 'Denial Release',
  outfit_choice: 'Outfit Choice',
  content_choice: 'Content Choice',
  challenge: 'Challenge',
  timer: 'Timer',
  prediction: 'Prediction',
  punishment: 'Punishment',
  general: 'General',
};

const POLL_TYPE_COLORS: Record<string, { bambi: string; dark: string }> = {
  denial_release: { bambi: 'bg-pink-100 text-pink-600', dark: 'bg-pink-900/30 text-pink-400' },
  punishment: { bambi: 'bg-red-100 text-red-600', dark: 'bg-red-900/30 text-red-400' },
  prediction: { bambi: 'bg-amber-100 text-amber-600', dark: 'bg-amber-900/30 text-amber-400' },
  outfit_choice: { bambi: 'bg-purple-100 text-purple-600', dark: 'bg-purple-900/30 text-purple-400' },
  content_choice: { bambi: 'bg-blue-100 text-blue-600', dark: 'bg-blue-900/30 text-blue-400' },
  challenge: { bambi: 'bg-orange-100 text-orange-600', dark: 'bg-orange-900/30 text-orange-400' },
  timer: { bambi: 'bg-cyan-100 text-cyan-600', dark: 'bg-cyan-900/30 text-cyan-400' },
  general: { bambi: 'bg-gray-100 text-gray-600', dark: 'bg-gray-800/30 text-gray-400' },
};

const PLATFORM_CONFIG: Record<Platform, {
  name: string;
  url: string;
  bambiColor: string;
  darkColor: string;
}> = {
  reddit: {
    name: 'Reddit',
    url: 'https://www.reddit.com/submit',
    bambiColor: 'bg-orange-100 text-orange-700 border-orange-200',
    darkColor: 'bg-orange-900/30 text-orange-400 border-orange-800/30',
  },
  twitter: {
    name: 'Twitter',
    url: 'https://twitter.com/compose/tweet',
    bambiColor: 'bg-sky-100 text-sky-700 border-sky-200',
    darkColor: 'bg-sky-900/30 text-sky-400 border-sky-800/30',
  },
  onlyfans: {
    name: 'OnlyFans',
    url: 'https://onlyfans.com/my/vault',
    bambiColor: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    darkColor: 'bg-cyan-900/30 text-cyan-400 border-cyan-800/30',
  },
};

// ============================================
// Component
// ============================================

export function PollCreator({
  poll,
  platformFormatting,
  onPollUpdated,
  onClose,
}: PollCreatorProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const [copiedPlatform, setCopiedPlatform] = useState<string | null>(null);
  const [postingPlatform, setPostingPlatform] = useState<string | null>(null);

  const isPosted = (platform: string) => poll.platformsPosted.includes(platform);
  const allPosted = (['reddit', 'twitter', 'onlyfans'] as Platform[]).every(p => isPosted(p));

  const typeColors = POLL_TYPE_COLORS[poll.pollType] ?? POLL_TYPE_COLORS.general;

  // Build default formatting from poll data if not provided
  const formatting = platformFormatting ?? buildDefaultFormatting(poll);

  const handleCopy = useCallback(async (platform: Platform) => {
    let text = '';
    if (platform === 'reddit') {
      text = `${formatting.reddit.title}\n\n${formatting.reddit.body}`;
    } else if (platform === 'twitter') {
      text = formatting.twitter;
    } else {
      text = formatting.onlyfans;
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedPlatform(platform);
    setTimeout(() => setCopiedPlatform(null), 2000);
  }, [formatting]);

  const handleMarkPosted = useCallback(async (platform: Platform) => {
    if (!user?.id) return;
    setPostingPlatform(platform);
    try {
      const updated = [...new Set([...poll.platformsPosted, platform])];
      await supabase
        .from('audience_polls')
        .update({
          platforms_posted: updated,
          status: 'active',
          posted_at: poll.postedAt ?? new Date().toISOString(),
        })
        .eq('id', poll.id)
        .eq('user_id', user.id);

      onPollUpdated();
    } finally {
      setPostingPlatform(null);
    }
  }, [user?.id, poll, onPollUpdated]);

  return (
    <div className={`rounded-xl border overflow-hidden ${
      isBambiMode ? 'bg-white border-gray-200' : 'bg-protocol-surface border-protocol-border'
    }`}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className={`w-5 h-5 ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
          }`} />
          <div>
            <p className={`text-sm font-semibold ${
              isBambiMode ? 'text-gray-800' : 'text-protocol-text'
            }`}>
              {poll.question}
            </p>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              isBambiMode ? typeColors.bambi : typeColors.dark
            }`}>
              {POLL_TYPE_LABELS[poll.pollType] ?? poll.pollType}
            </span>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">
            ✕
          </button>
        )}
      </div>

      {/* Options preview */}
      <div className={`mx-4 mb-3 rounded-lg p-3 ${
        isBambiMode ? 'bg-gray-50 border border-gray-100' : 'bg-protocol-bg border border-protocol-border'
      }`}>
        <p className={`text-[10px] uppercase tracking-wider font-semibold mb-2 ${
          isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
        }`}>
          Options
        </p>
        <div className="space-y-1">
          {poll.options.map((opt: PollOption, i: number) => (
            <div key={opt.id} className="flex items-center gap-2">
              <span className={`text-[11px] font-mono w-4 text-center ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-accent'
              }`}>
                {i + 1}
              </span>
              <span className={`text-xs ${
                isBambiMode ? 'text-gray-600' : 'text-protocol-text-secondary'
              }`}>
                {opt.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Handler Intent */}
      {poll.handlerIntent && (
        <div className={`mx-4 mb-3 rounded-lg p-3 text-xs italic ${
          isBambiMode
            ? 'bg-purple-50 text-purple-700 border border-purple-100'
            : 'bg-purple-900/20 text-purple-300 border border-purple-800/30'
        }`}>
          <span className="font-semibold not-italic">Handler:</span> {poll.handlerIntent}
        </div>
      )}

      {/* Platform cards */}
      <div className="px-4 pb-4 space-y-2">
        {(['reddit', 'twitter', 'onlyfans'] as Platform[]).map(platform => (
          <PlatformPollCard
            key={platform}
            platform={platform}
            formatting={formatting}
            isPosted={isPosted(platform)}
            isCopied={copiedPlatform === platform}
            isPosting={postingPlatform === platform}
            onCopy={() => handleCopy(platform)}
            onMarkPosted={() => handleMarkPosted(platform)}
            isBambiMode={isBambiMode}
          />
        ))}
      </div>

      {/* All posted indicator */}
      {allPosted && (
        <div className={`mx-4 mb-4 flex items-center justify-center gap-2 py-2 rounded-lg ${
          isBambiMode ? 'bg-green-50 text-green-600' : 'bg-emerald-900/20 text-emerald-400'
        }`}>
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-xs font-semibold">Poll posted on all platforms</span>
        </div>
      )}
    </div>
  );
}

// ============================================
// Platform Poll Card
// ============================================

function PlatformPollCard({
  platform,
  formatting,
  isPosted,
  isCopied,
  isPosting,
  onCopy,
  onMarkPosted,
  isBambiMode,
}: {
  platform: Platform;
  formatting: PlatformPollFormat;
  isPosted: boolean;
  isCopied: boolean;
  isPosting: boolean;
  onCopy: () => void;
  onMarkPosted: () => void;
  isBambiMode: boolean;
}) {
  const config = PLATFORM_CONFIG[platform];

  if (isPosted) {
    return (
      <div className={`rounded-lg border p-2 flex items-center gap-2 opacity-60 ${
        isBambiMode ? 'bg-green-50 border-green-200' : 'bg-emerald-900/10 border-emerald-800/20'
      }`}>
        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
        <span className={`text-xs font-medium ${
          isBambiMode ? 'text-green-600' : 'text-emerald-400'
        }`}>
          {config.name} — Posted
        </span>
      </div>
    );
  }

  // Get the text to preview
  let previewText = '';
  if (platform === 'reddit') {
    previewText = formatting.reddit.body;
  } else if (platform === 'twitter') {
    previewText = formatting.twitter;
  } else {
    previewText = formatting.onlyfans;
  }

  return (
    <div className={`rounded-lg border overflow-hidden ${
      isBambiMode ? config.bambiColor : config.darkColor
    }`}>
      {/* Platform header */}
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-xs font-bold">{config.name}</span>
        {platform === 'reddit' && (
          <span className={`text-[10px] ${isBambiMode ? 'text-orange-500' : 'text-orange-300'}`}>
            Title + Body
          </span>
        )}
      </div>

      {/* Reddit title */}
      {platform === 'reddit' && (
        <div className={`mx-3 mb-1 px-2 py-1 rounded text-[11px] font-medium ${
          isBambiMode ? 'bg-white/60' : 'bg-black/20'
        }`}>
          {formatting.reddit.title}
        </div>
      )}

      {/* Caption preview */}
      <div className={`mx-3 mb-2 px-2 py-1.5 rounded text-[11px] whitespace-pre-wrap max-h-24 overflow-y-auto ${
        isBambiMode ? 'bg-white/60' : 'bg-black/20'
      }`}>
        {previewText}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 px-3 pb-2">
        <button
          onClick={onCopy}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] font-medium transition-colors ${
            isCopied
              ? isBambiMode ? 'bg-green-100 text-green-600' : 'bg-emerald-900/30 text-emerald-400'
              : isBambiMode ? 'bg-white/80 text-gray-600 hover:bg-white' : 'bg-black/20 text-gray-300 hover:bg-black/30'
          }`}
        >
          {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {isCopied ? 'Copied' : 'Copy'}
        </button>

        <button
          onClick={() => window.open(config.url, '_blank')}
          className={`flex items-center justify-center py-1.5 px-2 rounded text-[11px] transition-colors ${
            isBambiMode ? 'bg-white/80 text-gray-600 hover:bg-white' : 'bg-black/20 text-gray-300 hover:bg-black/30'
          }`}
        >
          <ExternalLink className="w-3 h-3" />
        </button>

        <button
          onClick={onMarkPosted}
          disabled={isPosting}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] font-medium text-white transition-colors ${
            isBambiMode
              ? 'bg-pink-500 hover:bg-pink-600 disabled:bg-pink-300'
              : 'bg-protocol-accent hover:bg-purple-500 disabled:bg-gray-600'
          }`}
        >
          {isPosting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <MessageSquare className="w-3 h-3" />
          )}
          I Posted It
        </button>
      </div>
    </div>
  );
}

// ============================================
// Default formatting builder
// ============================================

function buildDefaultFormatting(poll: AudiencePoll): PlatformPollFormat {
  const optionsList = poll.options.map((o, i) => `${i + 1}. ${o.label}`).join('\n');

  return {
    reddit: {
      title: poll.question,
      body: `${poll.question}\n\n${optionsList}\n\nVote below. I'll honor whatever you decide.`,
    },
    twitter: `${poll.question}\n\n${optionsList}`,
    onlyfans: `${poll.question}\n\nPoll in my story. Vote now 🥺`,
  };
}
