/**
 * ProgressPhotoGallery — month-over-month transition documentation.
 * Pulls photos from verification-photos bucket tied to progress-photo
 * directives + body_feminization_directives completions. Grid view +
 * side-by-side compare picker.
 */

import { useEffect, useState } from 'react';
import { Camera, ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface PhotoRow {
  id: string;
  url: string;
  taken_at: string;
  category: string | null;
  directive_snippet: string | null;
}

export function ProgressPhotoGallery() {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [compareLeft, setCompareLeft] = useState<string | null>(null);
  const [compareRight, setCompareRight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // Pull completed body_feminization_directives with photo_submitted_url
      const { data: bfdPhotos } = await supabase
        .from('body_feminization_directives')
        .select('id, category, directive, photo_submitted_url, photo_submitted_at')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .not('photo_submitted_url', 'is', null)
        .order('photo_submitted_at', { ascending: false })
        .limit(60);

      const rows: PhotoRow[] = ((bfdPhotos || []) as Array<Record<string, unknown>>)
        .filter(r => r.photo_submitted_url)
        .map(r => ({
          id: r.id as string,
          url: r.photo_submitted_url as string,
          taken_at: (r.photo_submitted_at as string) || '',
          category: (r.category as string) || null,
          directive_snippet: ((r.directive as string) || '').slice(0, 80),
        }));

      setPhotos(rows);
    } catch (err) {
      console.error('[ProgressGallery] load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.id]);

  if (loading || photos.length === 0) return null;

  const byMonth: Record<string, PhotoRow[]> = {};
  for (const p of photos) {
    const key = p.taken_at ? p.taken_at.slice(0, 7) : 'unknown';
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(p);
  }
  const months = Object.keys(byMonth).sort().reverse();
  const leftPhoto = photos.find(p => p.id === compareLeft);
  const rightPhoto = photos.find(p => p.id === compareRight);

  return (
    <div className="bg-gray-900/60 border border-purple-500/30 rounded-lg p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Camera className="w-3 h-3 text-purple-400" />
          <span className="uppercase tracking-wider text-[10px] text-gray-500">Progress Photos</span>
          <span className="text-purple-300 font-medium">{photos.length}</span>
          <span className="text-gray-500 text-[10px]">across {months.length} month{months.length === 1 ? '' : 's'}</span>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Compare view */}
          {(leftPhoto || rightPhoto) && (
            <div className="bg-gray-950 rounded p-2">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <div className="text-[10px] text-gray-500 mb-1">BEFORE {leftPhoto ? leftPhoto.taken_at.slice(0, 10) : ''}</div>
                  {leftPhoto ? (
                    <img src={leftPhoto.url} alt="before" className="w-full rounded" />
                  ) : (
                    <div className="aspect-square bg-gray-900 rounded flex items-center justify-center text-gray-600 text-[11px]">pick one →</div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 mb-1 flex items-center gap-1">
                    <ArrowRight className="w-3 h-3" />
                    AFTER {rightPhoto ? rightPhoto.taken_at.slice(0, 10) : ''}
                  </div>
                  {rightPhoto ? (
                    <img src={rightPhoto.url} alt="after" className="w-full rounded" />
                  ) : (
                    <div className="aspect-square bg-gray-900 rounded flex items-center justify-center text-gray-600 text-[11px]">pick one →</div>
                  )}
                </div>
              </div>
              <button
                onClick={() => { setCompareLeft(null); setCompareRight(null); }}
                className="text-[10px] text-gray-500 hover:text-gray-300"
              >
                clear comparison
              </button>
            </div>
          )}

          {/* Grid by month */}
          {months.map(m => (
            <div key={m}>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{m}</div>
              <div className="grid grid-cols-4 gap-1">
                {byMonth[m].map(p => {
                  const isLeft = compareLeft === p.id;
                  const isRight = compareRight === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (isLeft) setCompareLeft(null);
                        else if (isRight) setCompareRight(null);
                        else if (!compareLeft) setCompareLeft(p.id);
                        else if (!compareRight) setCompareRight(p.id);
                        else setCompareRight(p.id);
                      }}
                      className={`relative aspect-square rounded overflow-hidden border-2 ${
                        isLeft ? 'border-purple-400' : isRight ? 'border-pink-400' : 'border-gray-800 hover:border-gray-600'
                      }`}
                      title={p.directive_snippet || p.category || ''}
                    >
                      <img src={p.url} alt="" className="w-full h-full object-cover" />
                      {(isLeft || isRight) && (
                        <div className={`absolute bottom-0 left-0 right-0 text-[9px] text-center py-0.5 ${
                          isLeft ? 'bg-purple-500/80 text-white' : 'bg-pink-500/80 text-white'
                        }`}>
                          {isLeft ? 'BEFORE' : 'AFTER'}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <p className="text-[10px] text-gray-600">Tap two photos to compare. First tap = before, second = after.</p>
        </div>
      )}
    </div>
  );
}
