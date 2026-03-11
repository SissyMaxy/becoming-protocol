/**
 * PerformanceLogInput — Manual performance entry for content posts.
 * Shows unlogged posts one at a time. Quick tap: views, likes, comments, tips.
 * 60 seconds of input → intelligence for the entire week.
 */

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, ChevronRight, Check, Loader2 } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  getNextUnloggedPost,
  getUnloggedPostCount,
  updatePerformanceFromQueue,
  snapshotContentPerformance,
  analyzeContentPerformance,
} from '../../lib/content-intelligence';
import { useAuth } from '../../context/AuthContext';

interface UnloggedPost {
  id: string;
  platform: string;
  contentType: string;
  caption: string | null;
  postedAt: string | null;
}

export function PerformanceLogInput() {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const [currentPost, setCurrentPost] = useState<UnloggedPost | null>(null);
  const [totalUnlogged, setTotalUnlogged] = useState(0);
  const [logged, setLogged] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDone, setIsDone] = useState(false);

  // Metric inputs
  const [views, setViews] = useState('');
  const [likes, setLikes] = useState('');
  const [comments, setComments] = useState('');
  const [tips, setTips] = useState('');
  const [newFollowers, setNewFollowers] = useState('');

  const loadNext = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    const [post, count] = await Promise.all([
      getNextUnloggedPost(user.id),
      getUnloggedPostCount(user.id),
    ]);

    if (!post) {
      setIsDone(true);
      // Trigger analysis when all logged
      if (logged > 0) {
        await snapshotContentPerformance(user.id).catch(() => {});
        await analyzeContentPerformance(user.id).catch(() => {});
      }
    } else {
      setCurrentPost(post);
      setTotalUnlogged(count);
    }
    setIsLoading(false);
  }, [user?.id, logged]);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  const handleLog = async () => {
    if (!user?.id || !currentPost || isSaving) return;
    setIsSaving(true);

    await updatePerformanceFromQueue(user.id, currentPost.id, {
      views: parseInt(views) || 0,
      likes: parseInt(likes) || 0,
      comments: parseInt(comments) || 0,
      tips: parseFloat(tips) || 0,
      newFollowers: parseInt(newFollowers) || 0,
    });

    // Reset fields
    setViews('');
    setLikes('');
    setComments('');
    setTips('');
    setNewFollowers('');
    setLogged(prev => prev + 1);
    setIsSaving(false);

    // Load next
    await loadNext();
  };

  const accent = isBambiMode ? 'pink' : 'indigo';

  if (isLoading && !currentPost) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-white/30" />
      </div>
    );
  }

  if (isDone) {
    return (
      <div className="text-center py-6 space-y-2">
        <Check className={`w-8 h-8 mx-auto text-${accent}-400`} />
        <p className="text-white/70 text-sm">
          {logged > 0 ? `${logged} posts logged. Intelligence updated.` : 'All caught up.'}
        </p>
      </div>
    );
  }

  if (!currentPost) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className={`w-4 h-4 text-${accent}-400`} />
          <span className="text-white/60 text-xs uppercase tracking-wider">Quick Numbers</span>
        </div>
        <span className="text-white/30 text-xs">
          {logged + 1} of {totalUnlogged + logged}
        </span>
      </div>

      {/* Post info */}
      <div className={`rounded-lg px-3 py-2 bg-${accent}-500/10 border border-${accent}-500/20`}>
        <p className={`text-${accent}-300/80 text-sm font-medium`}>
          {currentPost.platform} &middot; {currentPost.contentType.replace(/_/g, ' ')}
        </p>
        {currentPost.caption && (
          <p className="text-white/40 text-xs mt-1 line-clamp-2">
            {currentPost.caption.slice(0, 100)}
          </p>
        )}
        {currentPost.postedAt && (
          <p className="text-white/20 text-xs mt-1">
            Posted {new Date(currentPost.postedAt).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Metric inputs — compact grid */}
      <div className="grid grid-cols-2 gap-2">
        <MetricField label="Views" value={views} onChange={setViews} accent={accent} />
        <MetricField label="Likes" value={likes} onChange={setLikes} accent={accent} />
        <MetricField label="Comments" value={comments} onChange={setComments} accent={accent} />
        <MetricField label="Tips ($)" value={tips} onChange={setTips} accent={accent} />
      </div>

      <MetricField
        label="New followers today"
        value={newFollowers}
        onChange={setNewFollowers}
        accent={accent}
        full
      />

      {/* Submit */}
      <button
        onClick={handleLog}
        disabled={isSaving}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-white transition-all active:scale-[0.98] bg-${accent}-500/20 border border-${accent}-500/30 hover:bg-${accent}-500/30`}
      >
        {isSaving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <span>Log & Next</span>
            <ChevronRight className="w-4 h-4" />
          </>
        )}
      </button>
    </div>
  );
}

// ============================================
// Metric Field Component
// ============================================

function MetricField({
  label,
  value,
  onChange,
  accent,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  accent: string;
  full?: boolean;
}) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="text-white/40 text-xs mb-1 block">{label}</label>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className={`w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white/80 placeholder:text-white/20 focus:border-${accent}-500/40 focus:outline-none`}
      />
    </div>
  );
}
