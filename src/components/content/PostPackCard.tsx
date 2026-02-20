/**
 * PostPackCard — Manual posting card for post-pack platforms
 * Handler prepares content, David copies caption and pastes on Reddit/Fansly
 */

import { useState } from 'react';
import { Copy, Check, ExternalLink, CheckCircle2, Loader2, Download } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { Distribution } from '../../types/content-pipeline';

interface PostPackCardProps {
  distribution: Distribution;
  onMarkPosted: (distributionId: string) => Promise<boolean>;
}

const PLATFORM_URLS: Record<string, string> = {
  reddit: 'https://www.reddit.com/submit',
  fansly: 'https://fansly.com/manage/posts',
};

const PLATFORM_DISPLAY: Record<string, string> = {
  reddit: 'Reddit',
  fansly: 'Fansly',
};

const PLATFORM_COLORS: Record<string, { bambi: string; dark: string }> = {
  reddit: {
    bambi: 'bg-orange-100 text-orange-700 border-orange-300',
    dark: 'bg-orange-900/30 text-orange-400 border-orange-600/40',
  },
  fansly: {
    bambi: 'bg-blue-100 text-blue-700 border-blue-300',
    dark: 'bg-blue-900/30 text-blue-400 border-blue-600/40',
  },
};

export function PostPackCard({ distribution, onMarkPosted }: PostPackCardProps) {
  const { isBambiMode } = useBambiMode();
  const [copied, setCopied] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  const platform = distribution.platform;
  const displayName = PLATFORM_DISPLAY[platform] || platform;
  const platformUrl = PLATFORM_URLS[platform];
  const colors = PLATFORM_COLORS[platform] || PLATFORM_COLORS.fansly;

  const handleCopy = async () => {
    if (!distribution.caption) return;
    try {
      await navigator.clipboard.writeText(distribution.caption);
    } catch {
      // Fallback: create temp textarea for older browsers
      const ta = document.createElement('textarea');
      ta.value = distribution.caption;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenPlatform = () => {
    if (platformUrl) window.open(platformUrl, '_blank');
  };

  const handleMarkPosted = async () => {
    setIsPosting(true);
    try {
      await onMarkPosted(distribution.id);
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className={`rounded-xl border overflow-hidden ${
      isBambiMode
        ? 'bg-white border-gray-200'
        : 'bg-protocol-surface border-protocol-border'
    }`}>
      {/* Header: platform badge + strategy */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
          isBambiMode ? colors.bambi : colors.dark
        }`}>
          {displayName}
        </span>
        {distribution.handler_strategy && (
          <span className={`text-[10px] ${
            isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
          }`}>
            {distribution.handler_strategy}
          </span>
        )}
      </div>

      {/* Caption */}
      {distribution.caption && (
        <div className={`mx-3 mb-3 p-3 rounded-lg text-sm whitespace-pre-wrap ${
          isBambiMode
            ? 'bg-gray-50 text-gray-700 border border-gray-100'
            : 'bg-protocol-bg text-protocol-text border border-protocol-border'
        }`}>
          {distribution.caption}
        </div>
      )}

      {/* Hashtags */}
      {distribution.hashtags && distribution.hashtags.length > 0 && (
        <div className="px-3 mb-2 flex flex-wrap gap-1">
          {distribution.hashtags.map((tag, i) => (
            <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${
              isBambiMode
                ? 'bg-blue-50 text-blue-500'
                : 'bg-blue-900/20 text-blue-400'
            }`}>
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className={`flex items-center gap-1.5 px-3 pb-3`}>
        {/* Copy Caption */}
        <button
          onClick={handleCopy}
          disabled={!distribution.caption}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
            copied
              ? isBambiMode
                ? 'bg-green-100 text-green-600'
                : 'bg-emerald-900/30 text-emerald-400'
              : isBambiMode
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-protocol-bg text-protocol-text-muted hover:bg-protocol-border'
          }`}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>

        {/* Save Image (only if vault item linked) */}
        {distribution.vault_id && (
          <button
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
              isBambiMode
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-protocol-bg text-protocol-text-muted hover:bg-protocol-border'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            Image
          </button>
        )}

        {/* Open Platform */}
        {platformUrl && (
          <button
            onClick={handleOpenPlatform}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
              isBambiMode
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-protocol-bg text-protocol-text-muted hover:bg-protocol-border'
            }`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open {displayName}
          </button>
        )}

        {/* Mark as Posted */}
        <button
          onClick={handleMarkPosted}
          disabled={isPosting}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-white transition-colors ${
            isBambiMode
              ? 'bg-pink-500 hover:bg-pink-600 disabled:bg-pink-300'
              : 'bg-protocol-accent hover:bg-protocol-accent-soft disabled:bg-gray-600'
          }`}
        >
          {isPosting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5" />
          )}
          Posted
        </button>
      </div>
    </div>
  );
}
