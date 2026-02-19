/**
 * ReadyToPost — Per-platform posting cards after shoot completion
 * Each card: platform-specific caption, copy, download, "I Posted It"
 */

import { useState, useCallback } from 'react';
import {
  Copy, Check, Download, ExternalLink, CheckCircle2,
  Lock, Loader2, DollarSign,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';

interface PlatformPost {
  id: string;
  platform: string;
  subreddit?: string;       // for Reddit posts
  title?: string;           // Reddit title
  caption: string;
  mediaUrls: string[];
  ppvPrice?: number;        // OF PPV price suggestion
  denialDay: number;
  posted: boolean;
}

interface ReadyToPostProps {
  posts: PlatformPost[];
  shootTitle: string;
  totalPhotos: number;
  selectedCount: number;
  onMarkPosted: (postId: string) => Promise<void>;
  onDone: () => void;
}

const PLATFORM_CONFIG: Record<string, {
  name: string;
  url?: string;
  bambiColor: string;
  darkColor: string;
  icon: string;
}> = {
  onlyfans: {
    name: 'OnlyFans',
    url: 'https://onlyfans.com/my/vault',
    bambiColor: 'bg-cyan-100 text-cyan-700 border-cyan-300',
    darkColor: 'bg-cyan-900/30 text-cyan-400 border-cyan-600/40',
    icon: 'OF',
  },
  reddit: {
    name: 'Reddit',
    url: 'https://www.reddit.com/submit',
    bambiColor: 'bg-orange-100 text-orange-700 border-orange-300',
    darkColor: 'bg-orange-900/30 text-orange-400 border-orange-600/40',
    icon: 'R',
  },
  twitter: {
    name: 'Twitter',
    url: 'https://twitter.com/compose/tweet',
    bambiColor: 'bg-sky-100 text-sky-700 border-sky-300',
    darkColor: 'bg-sky-900/30 text-sky-400 border-sky-600/40',
    icon: 'X',
  },
  fansly: {
    name: 'Fansly',
    url: 'https://fansly.com/manage/posts',
    bambiColor: 'bg-blue-100 text-blue-700 border-blue-300',
    darkColor: 'bg-blue-900/30 text-blue-400 border-blue-600/40',
    icon: 'F',
  },
  moltbook: {
    name: 'Moltbook',
    bambiColor: 'bg-purple-100 text-purple-700 border-purple-300',
    darkColor: 'bg-purple-900/30 text-purple-400 border-purple-600/40',
    icon: 'M',
  },
};

function getDenialBadgeClasses(day: number, isBambiMode: boolean): string {
  if (day <= 2) return isBambiMode ? 'bg-blue-100 text-blue-600' : 'bg-blue-900/30 text-blue-400';
  if (day <= 4) return isBambiMode ? 'bg-amber-100 text-amber-600' : 'bg-amber-900/30 text-amber-400';
  if (day <= 6) return isBambiMode ? 'bg-pink-100 text-pink-600' : 'bg-pink-900/30 text-pink-400';
  return isBambiMode ? 'bg-purple-100 text-purple-600' : 'bg-purple-900/30 text-purple-400';
}

export function ReadyToPost({
  posts,
  shootTitle,
  totalPhotos,
  selectedCount,
  onMarkPosted,
  onDone,
}: ReadyToPostProps) {
  const { isBambiMode } = useBambiMode();
  const postedCount = posts.filter(p => p.posted).length;
  const allPosted = postedCount === posts.length;

  return (
    <div className={`space-y-4 ${
      isBambiMode ? '' : ''
    }`}>
      {/* Summary header */}
      <div className={`rounded-xl p-4 ${
        isBambiMode
          ? 'bg-green-50 border border-green-200'
          : 'bg-emerald-900/20 border border-emerald-800/30'
      }`}>
        <div className="flex items-center gap-2 mb-1">
          <CheckCircle2 className={`w-5 h-5 ${
            isBambiMode ? 'text-green-500' : 'text-emerald-400'
          }`} />
          <p className={`text-sm font-semibold ${
            isBambiMode ? 'text-green-700' : 'text-emerald-300'
          }`}>
            {shootTitle} — {totalPhotos} photos captured
          </p>
        </div>
        <p className={`text-xs ${
          isBambiMode ? 'text-green-600' : 'text-emerald-400'
        }`}>
          Handler selected: {selectedCount} best shots — {posts.length} posts ready
        </p>
      </div>

      {/* Platform cards */}
      {posts.map(post => (
        <PlatformPostCard
          key={post.id}
          post={post}
          onMarkPosted={onMarkPosted}
          isBambiMode={isBambiMode}
        />
      ))}

      {/* Done button */}
      {allPosted && (
        <button
          onClick={onDone}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold text-white transition-colors ${
            isBambiMode
              ? 'bg-green-500 hover:bg-green-600'
              : 'bg-emerald-600 hover:bg-emerald-500'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          All Posted — Done
        </button>
      )}
    </div>
  );
}

function PlatformPostCard({
  post,
  onMarkPosted,
  isBambiMode,
}: {
  post: PlatformPost;
  onMarkPosted: (id: string) => Promise<void>;
  isBambiMode: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const config = PLATFORM_CONFIG[post.platform] || PLATFORM_CONFIG.fansly;

  const handleCopy = useCallback(async () => {
    const text = post.title ? `${post.title}\n\n${post.caption}` : post.caption;
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [post.caption, post.title]);

  const handleDownload = useCallback(async () => {
    for (const url of post.mediaUrls) {
      const a = document.createElement('a');
      a.href = url;
      a.download = '';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }, [post.mediaUrls]);

  const handleMarkPosted = useCallback(async () => {
    setIsPosting(true);
    try {
      await onMarkPosted(post.id);
    } finally {
      setIsPosting(false);
    }
  }, [onMarkPosted, post.id]);

  if (post.posted) {
    return (
      <div className={`rounded-xl border p-3 flex items-center gap-2 opacity-60 ${
        isBambiMode ? 'bg-green-50 border-green-200' : 'bg-emerald-900/10 border-emerald-800/20'
      }`}>
        <CheckCircle2 className="w-4 h-4 text-green-500" />
        <span className={`text-xs font-medium ${
          isBambiMode ? 'text-green-600' : 'text-emerald-400'
        }`}>
          {config.name}{post.subreddit ? ` — ${post.subreddit}` : ''} — Posted
        </span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border overflow-hidden ${
      isBambiMode ? 'bg-white border-gray-200' : 'bg-protocol-surface border-protocol-border'
    }`}>
      {/* Header: platform + denial badge */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
            isBambiMode ? config.bambiColor : config.darkColor
          }`}>
            {config.name}
          </span>
          {post.subreddit && (
            <span className={`text-[10px] ${
              isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
            }`}>
              {post.subreddit}
            </span>
          )}
        </div>
        {post.denialDay > 0 && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            getDenialBadgeClasses(post.denialDay, isBambiMode)
          }`}>
            <Lock className="w-2.5 h-2.5 inline mr-0.5" style={{ marginTop: -1 }} />
            Day {post.denialDay}
          </span>
        )}
      </div>

      {/* PPV price suggestion */}
      {post.ppvPrice && (
        <div className={`mx-3 mb-2 flex items-center gap-1.5 px-2 py-1 rounded ${
          isBambiMode ? 'bg-green-50 text-green-600' : 'bg-green-900/20 text-green-400'
        }`}>
          <DollarSign className="w-3 h-3" />
          <span className="text-[10px] font-medium">
            PPV: ${post.ppvPrice.toFixed(2)}
          </span>
        </div>
      )}

      {/* Title (Reddit) */}
      {post.title && (
        <div className={`mx-3 mb-1 px-3 py-1.5 rounded text-xs font-medium ${
          isBambiMode ? 'bg-orange-50 text-orange-700' : 'bg-orange-900/20 text-orange-300'
        }`}>
          {post.title}
        </div>
      )}

      {/* Caption */}
      <div className={`mx-3 mb-3 p-3 rounded-lg text-sm whitespace-pre-wrap ${
        isBambiMode
          ? 'bg-gray-50 text-gray-700 border border-gray-100'
          : 'bg-protocol-bg text-protocol-text border border-protocol-border'
      }`}>
        {post.caption}
      </div>

      {/* Media preview */}
      {post.mediaUrls.length > 0 && (
        <div className="px-3 mb-3 flex gap-1.5 overflow-x-auto">
          {post.mediaUrls.slice(0, 4).map((url, i) => (
            <img
              key={i}
              src={url}
              alt=""
              className="w-14 h-14 object-cover rounded-lg flex-shrink-0"
            />
          ))}
          {post.mediaUrls.length > 4 && (
            <div className={`w-14 h-14 flex items-center justify-center rounded-lg flex-shrink-0 ${
              isBambiMode ? 'bg-gray-100' : 'bg-protocol-bg'
            }`}>
              <span className={`text-xs font-medium ${
                isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
              }`}>
                +{post.mediaUrls.length - 4}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 px-3 pb-3">
        <button
          onClick={handleCopy}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
            copied
              ? isBambiMode ? 'bg-green-100 text-green-600' : 'bg-emerald-900/30 text-emerald-400'
              : isBambiMode ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-protocol-bg text-protocol-text-muted hover:bg-protocol-border'
          }`}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : post.title ? 'Copy All' : 'Copy'}
        </button>

        {post.mediaUrls.length > 0 && (
          <button
            onClick={handleDownload}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
              isBambiMode
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-protocol-bg text-protocol-text-muted hover:bg-protocol-border'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            Photos
          </button>
        )}

        {config.url && (
          <button
            onClick={() => window.open(config.url, '_blank')}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
              isBambiMode
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-protocol-bg text-protocol-text-muted hover:bg-protocol-border'
            }`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={handleMarkPosted}
          disabled={isPosting}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-white transition-colors ${
            isBambiMode
              ? 'bg-pink-500 hover:bg-pink-600 disabled:bg-pink-300'
              : 'bg-protocol-accent hover:bg-purple-500 disabled:bg-gray-600'
          }`}
        >
          {isPosting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5" />
          )}
          I Posted It
        </button>
      </div>
    </div>
  );
}
