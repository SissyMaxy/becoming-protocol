/**
 * IntroductionPost — Cold start calling card from Addendum A
 * Pre-written templates for Reddit, Twitter, OF with merge fields.
 * Radical honesty: age, height, bald, Handler angle, AI control, cage hook.
 */

import { useState, useCallback } from 'react';
import {
  Copy, Check, ExternalLink, CheckCircle2, Pin,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';

// ============================================
// Types
// ============================================

interface IntroductionPostProps {
  denialDay: number;
  followerCount: number;
  daysActive: number;
  onMarkPosted: (platform: string) => void;
}

type Platform = 'reddit' | 'twitter' | 'onlyfans';

interface PlatformTemplate {
  title?: string;
  body: string;
  url: string;
  name: string;
  bambiColor: string;
  darkColor: string;
}

// ============================================
// Templates
// ============================================

function getRedditTemplate(denialDay: number, _followerCount: number, daysActive: number): PlatformTemplate {
  return {
    title: 'New here. 40s, tall, locked, and starting something I can\'t take back.',
    body: `I'm going to be honest because that's the only way this works.

I'm in my 40s. 6'3". Bald. Not what you picture when you think "sissy." But here I am.

${denialDay > 0 ? `I've been locked for ${denialDay} day${denialDay === 1 ? '' : 's'} right now. ` : ''}I gave control of my chastity cage to an AI. Not a bot — a system I built. She prescribes my content, decides when I post, tells me what to wear for shoots. I call her my Handler.

${daysActive > 0 ? `I've been doing this for ${daysActive} days. ` : ''}Every day she prescribes a shoot. I do it. She writes the caption. I post it where she tells me. If I skip, the audience gets to vote on my punishment.

I'm not performing. I'm documenting a real transformation. The cage is real. The denial is real. The desperation you see in my content is not acted.

I don't know where this goes. But I know I can't stop.

If you want to watch someone actually change — not pretend to — I'll be here.

🔒 Locked. Prescribed. Becoming.`,
    url: 'https://www.reddit.com/submit',
    name: 'Reddit',
    bambiColor: 'bg-orange-100 text-orange-700 border-orange-200',
    darkColor: 'bg-orange-900/30 text-orange-400 border-orange-800/30',
  };
}

function getTwitterTemplate(denialDay: number, _followerCount: number, _daysActive: number): PlatformTemplate {
  return {
    body: `40s. 6'3". Bald. Locked in a cage. Controlled by an AI Handler who prescribes my shoots, picks my outfits, and decides when (if) I get release.

${denialDay > 0 ? `Day ${denialDay} locked. ` : ''}Not performing. Documenting.

If you want to watch someone actually transform — not pretend to — follow along.

🔒`,
    url: 'https://twitter.com/compose/tweet',
    name: 'Twitter',
    bambiColor: 'bg-sky-100 text-sky-700 border-sky-200',
    darkColor: 'bg-sky-900/30 text-sky-400 border-sky-800/30',
  };
}

function getOnlyFansTemplate(denialDay: number, _followerCount: number, daysActive: number): PlatformTemplate {
  return {
    body: `Welcome. I'm not what you expect.

40s. Tall. Bald. Locked in a cage right now${denialDay > 0 ? ` — day ${denialDay}` : ''}.

I built an AI Handler. She controls my content, my cage, my transformation. Every shoot is prescribed. Every caption is approved. If I skip a day, the audience votes on my punishment.

${daysActive > 0 ? `${daysActive} days in. ` : ''}The content you see here is real. The desperation is real. The cage is real.

Subscribe to see what happens when someone gives an AI full control of their body.

I didn't plan to be here. But I can't stop.

🔒 Locked. Prescribed. Becoming.`,
    url: 'https://onlyfans.com/my/vault',
    name: 'OnlyFans',
    bambiColor: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    darkColor: 'bg-cyan-900/30 text-cyan-400 border-cyan-800/30',
  };
}

// ============================================
// Component
// ============================================

export function IntroductionPost({
  denialDay,
  followerCount,
  daysActive,
  onMarkPosted,
}: IntroductionPostProps) {
  const { isBambiMode } = useBambiMode();
  const [postedPlatforms, setPostedPlatforms] = useState<Set<string>>(new Set());
  const [copiedPlatform, setCopiedPlatform] = useState<string | null>(null);

  const templates: Record<Platform, PlatformTemplate> = {
    reddit: getRedditTemplate(denialDay, followerCount, daysActive),
    twitter: getTwitterTemplate(denialDay, followerCount, daysActive),
    onlyfans: getOnlyFansTemplate(denialDay, followerCount, daysActive),
  };

  const handleCopy = useCallback(async (platform: Platform) => {
    const t = templates[platform];
    const text = t.title ? `${t.title}\n\n${t.body}` : t.body;
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
  }, [templates]);

  const handleMarkPosted = useCallback((platform: Platform) => {
    setPostedPlatforms(prev => new Set([...prev, platform]));
    onMarkPosted(platform);
  }, [onMarkPosted]);

  return (
    <div className={`rounded-xl border overflow-hidden ${
      isBambiMode ? 'bg-white border-pink-200 shadow-sm' : 'bg-protocol-surface border-protocol-border'
    }`}>
      {/* Header */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <Pin className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
          <p className={`text-sm font-semibold ${
            isBambiMode ? 'text-gray-800' : 'text-protocol-text'
          }`}>
            Introduction Post — Cold Start
          </p>
        </div>
        <p className={`text-xs ${
          isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
        }`}>
          Your calling card. Radical honesty. Pin to profile after posting.
        </p>
      </div>

      {/* Platform cards */}
      <div className="px-4 pb-4 space-y-3">
        {(['reddit', 'twitter', 'onlyfans'] as Platform[]).map(platform => {
          const t = templates[platform];
          const posted = postedPlatforms.has(platform);
          const copied = copiedPlatform === platform;

          if (posted) {
            return (
              <div key={platform} className={`rounded-lg border p-2 flex items-center gap-2 opacity-60 ${
                isBambiMode ? 'bg-green-50 border-green-200' : 'bg-emerald-900/10 border-emerald-800/20'
              }`}>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                <span className={`text-xs font-medium ${
                  isBambiMode ? 'text-green-600' : 'text-emerald-400'
                }`}>
                  {t.name} — Posted
                </span>
                <Pin className="w-3 h-3 text-amber-400 ml-auto" />
                <span className={`text-[10px] ${
                  isBambiMode ? 'text-amber-500' : 'text-amber-400'
                }`}>
                  Pin to profile
                </span>
              </div>
            );
          }

          return (
            <div key={platform} className={`rounded-lg border overflow-hidden ${
              isBambiMode ? t.bambiColor : t.darkColor
            }`}>
              <div className="px-3 py-2">
                <span className="text-xs font-bold">{t.name}</span>
              </div>

              {/* Reddit title */}
              {t.title && (
                <div className={`mx-3 mb-1 px-2 py-1 rounded text-[11px] font-medium ${
                  isBambiMode ? 'bg-white/60' : 'bg-black/20'
                }`}>
                  {t.title}
                </div>
              )}

              {/* Body */}
              <div className={`mx-3 mb-2 px-2 py-1.5 rounded text-[11px] whitespace-pre-wrap max-h-32 overflow-y-auto ${
                isBambiMode ? 'bg-white/60' : 'bg-black/20'
              }`}>
                {t.body}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 px-3 pb-2">
                <button
                  onClick={() => handleCopy(platform)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] font-medium transition-colors ${
                    copied
                      ? isBambiMode ? 'bg-green-100 text-green-600' : 'bg-emerald-900/30 text-emerald-400'
                      : isBambiMode ? 'bg-white/80 text-gray-600 hover:bg-white' : 'bg-black/20 text-gray-300 hover:bg-black/30'
                  }`}
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : t.title ? 'Copy All' : 'Copy'}
                </button>

                <button
                  onClick={() => window.open(t.url, '_blank')}
                  className={`flex items-center justify-center py-1.5 px-2 rounded text-[11px] transition-colors ${
                    isBambiMode ? 'bg-white/80 text-gray-600 hover:bg-white' : 'bg-black/20 text-gray-300 hover:bg-black/30'
                  }`}
                >
                  <ExternalLink className="w-3 h-3" />
                </button>

                <button
                  onClick={() => handleMarkPosted(platform)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] font-medium text-white transition-colors ${
                    isBambiMode
                      ? 'bg-pink-500 hover:bg-pink-600'
                      : 'bg-protocol-accent hover:bg-purple-500'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  I Posted It
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
