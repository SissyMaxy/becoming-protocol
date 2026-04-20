import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { GeneratedSessionPlayer } from './GeneratedSessionPlayer';

interface HypnoSource {
  id: string;
  title: string | null;
  creator: string | null;
  source_url: string | null;
  ingest_status: 'pending' | 'downloading' | 'transcribing' | 'extracting' | 'ready' | 'failed';
  ingest_error: string | null;
  play_count: number;
  user_rating: number | null;
  created_at: string;
}

interface RankedFeature {
  value: string;
  play_count: number;
  avg_peak_arousal: number;
  avg_edges: number;
  lift_score: number;
}

interface PreferenceProfile {
  total_plays: number;
  total_sources: number;
  top_themes: RankedFeature[];
  top_phrases: RankedFeature[];
  top_trigger_words: RankedFeature[];
  top_pacing: RankedFeature[];
  top_voice_styles: RankedFeature[];
  top_framings: RankedFeature[];
  top_identity_axes: RankedFeature[];
  top_creators: RankedFeature[];
  top_visual_tags?: RankedFeature[];
  correlation_confidence: number;
  last_refreshed_at: string | null;
}

export function HypnoLearningView() {
  const { user } = useAuth();
  const [sources, setSources] = useState<HypnoSource[]>([]);
  const [profile, setProfile] = useState<PreferenceProfile | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [creator, setCreator] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<{ sourceId: string; audioUrl: string; scriptText: string } | null>(null);
  const [durationMin, setDurationMin] = useState(5);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [scanResult, setScanResult] = useState<{ newFiles: Array<{ storagePath: string; name: string }>; existing: number; total: number } | null>(null);

  const loadSources = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('hypno_sources')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setSources((data as HypnoSource[]) || []);
  }, [user?.id]);

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) return;
    const resp = await fetch('/api/hypno/profile', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (resp.ok) {
      const json = (await resp.json()) as { profile: PreferenceProfile | null; hint: string | null };
      setProfile(json.profile);
      setHint(json.hint);
    }
  }, [user?.id]);

  useEffect(() => {
    loadSources();
    loadProfile();
  }, [loadSources, loadProfile]);

  const handleIngest = async () => {
    if (!url.trim() || !user?.id) return;
    setBusy(true);
    setErr(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error('No session');
      const resp = await fetch('/api/hypno/ingest', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceUrl: url.trim(),
          title: title.trim() || null,
          creator: creator.trim() || null,
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text.slice(0, 300));
      }
      setUrl('');
      setTitle('');
      setCreator('');
      await loadSources();
      await loadProfile();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ingest failed');
    } finally {
      setBusy(false);
    }
  };

  const handleScanStorage = async () => {
    if (!user?.id) return;
    setErr(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error('No session');
      const resp = await fetch('/api/hypno/scan-storage', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = (await resp.json()) as typeof scanResult;
      setScanResult(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Scan failed');
    }
  };

  const handleIngestAll = async () => {
    if (!user?.id || !scanResult || scanResult.newFiles.length === 0) return;
    setErr(null);
    const files = scanResult.newFiles;
    setBatchProgress({ done: 0, total: files.length, current: '' });
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error('No session');
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setBatchProgress({ done: i, total: files.length, current: f.name });
        try {
          await fetch('/api/hypno/ingest', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              storagePath: f.storagePath,
              title: f.name.replace(/\.[^.]+$/, ''),
            }),
          });
        } catch (e) {
          console.warn('[batch] ingest failed for', f.name, e);
        }
      }
      setBatchProgress(null);
      setScanResult(null);
      await loadSources();
      await loadProfile();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Batch ingest failed');
      setBatchProgress(null);
    }
  };

  const handleGenerate = async () => {
    if (!user?.id) return;
    setGenerating(true);
    setErr(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error('No session');
      const resp = await fetch('/api/hypno/generate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ durationMin, prescribedBy: 'user' }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text.slice(0, 300));
      }
      const data = (await resp.json()) as { sourceId: string; audioUrl: string; scriptText: string };
      setGenerated(data);
      await loadSources();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const statusColor = (s: HypnoSource['ingest_status']) => {
    if (s === 'ready') return 'text-green-400';
    if (s === 'failed') return 'text-red-400';
    return 'text-amber-400';
  };

  return (
    <div className="p-4 space-y-6 text-gray-200">
      <div>
        <h2 className="text-lg font-semibold mb-1">Hypno Learning</h2>
        <p className="text-xs text-gray-500">
          Ingest hypno audio. The Handler learns features and correlates them with your biometrics
          to rank what actually moves you.
        </p>
      </div>

      {/* Ingest form */}
      <div className="bg-[#141414] rounded-xl p-4 space-y-2 border border-gray-800/50">
        <div className="text-xs font-medium text-gray-400">Add source (direct audio URL, &lt; 25MB)</div>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://.../audio.mp3"
          className="w-full bg-[#0a0a0a] border border-gray-800 rounded px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="flex-1 bg-[#0a0a0a] border border-gray-800 rounded px-3 py-2 text-sm"
          />
          <input
            value={creator}
            onChange={(e) => setCreator(e.target.value)}
            placeholder="Creator (optional)"
            className="flex-1 bg-[#0a0a0a] border border-gray-800 rounded px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={handleIngest}
          disabled={busy || !url.trim()}
          className="px-4 py-2 rounded bg-purple-600/30 text-purple-200 hover:bg-purple-600/50 disabled:opacity-40 text-sm"
        >
          {busy ? 'Ingesting…' : 'Ingest'}
        </button>
        {err && <div className="text-xs text-red-400">{err}</div>}
        <div className="text-xs text-gray-500">
          For files &gt; 25MB or YouTube/Twitter URLs: route through a Modal worker that writes audio
          to Supabase Storage bucket <code>hypno</code>, then call <code>/api/hypno/ingest</code> with{' '}
          <code>storagePath</code>.
        </div>
      </div>

      {/* Batch ingest from Storage */}
      <div className="bg-[#141414] rounded-xl p-4 space-y-2 border border-gray-800/50">
        <div className="text-xs font-medium text-gray-400">Batch ingest from Storage</div>
        <div className="text-xs text-gray-500">
          Drop MP3s into Supabase Storage bucket <code>hypno/&lt;your-user-id&gt;/</code>, then scan
          and ingest all new files in one click.
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleScanStorage}
            disabled={!!batchProgress}
            className="px-3 py-1.5 rounded bg-gray-700 text-gray-100 hover:bg-gray-600 disabled:opacity-40 text-sm"
          >
            Scan storage
          </button>
          {scanResult && (
            <>
              <span className="text-xs text-gray-400">
                {scanResult.newFiles.length} new · {scanResult.existing} already ingested · {scanResult.total} total
              </span>
              {scanResult.newFiles.length > 0 && (
                <button
                  onClick={handleIngestAll}
                  disabled={!!batchProgress}
                  className="px-3 py-1.5 rounded bg-purple-600/40 text-purple-100 hover:bg-purple-600/60 disabled:opacity-40 text-sm"
                >
                  Ingest all ({scanResult.newFiles.length})
                </button>
              )}
            </>
          )}
        </div>
        {batchProgress && (
          <div className="text-xs text-amber-400">
            Ingesting {batchProgress.done + 1}/{batchProgress.total}: {batchProgress.current}
          </div>
        )}
      </div>

      {/* Generate custom session */}
      <div className="bg-[#141414] rounded-xl p-4 space-y-2 border border-gray-800/50">
        <div className="text-xs font-medium text-gray-400">Generate custom session</div>
        <div className="text-xs text-gray-500">
          Composes a script from your preference profile, synthesizes voice, plays it. Every play
          feeds back into the rankings.
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">
            Duration
            <select
              value={durationMin}
              onChange={(e) => setDurationMin(parseInt(e.target.value, 10))}
              className="ml-2 bg-[#0a0a0a] border border-gray-800 rounded px-2 py-1 text-sm"
            >
              <option value={3}>3 min</option>
              <option value={5}>5 min</option>
              <option value={8}>8 min</option>
              <option value={12}>12 min</option>
            </select>
          </label>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 rounded bg-pink-600/30 text-pink-200 hover:bg-pink-600/50 disabled:opacity-40 text-sm"
          >
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>

      {generated && (
        <GeneratedSessionPlayer
          sourceId={generated.sourceId}
          audioUrl={generated.audioUrl}
          scriptPreview={generated.scriptText}
          onClose={() => setGenerated(null)}
        />
      )}

      {/* Sources list */}
      <div>
        <div className="text-xs font-medium text-gray-400 mb-2">
          Sources ({sources.length})
        </div>
        <div className="space-y-1">
          {sources.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded bg-[#141414] text-sm">
              <span className={`text-xs ${statusColor(s.ingest_status)}`}>
                {s.ingest_status}
              </span>
              <span className="flex-1 truncate">
                {s.title || s.source_url || 'Untitled'}
              </span>
              {s.creator && <span className="text-xs text-gray-500">{s.creator}</span>}
              <span className="text-xs text-gray-600">{s.play_count} plays</span>
            </div>
          ))}
          {sources.length === 0 && (
            <div className="text-xs text-gray-500 px-3 py-4">No sources yet.</div>
          )}
        </div>
      </div>

      {/* Profile */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-xs font-medium text-gray-400">Preference profile</div>
          {profile && (
            <div className="text-xs text-gray-600">
              {profile.total_plays} plays · confidence{' '}
              {Math.round((profile.correlation_confidence || 0) * 100)}%
            </div>
          )}
        </div>
        {hint && <div className="text-xs text-amber-400 mb-2">{hint}</div>}
        {profile && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureList title="Top themes" items={profile.top_themes} />
            <FeatureList title="Top phrases" items={profile.top_phrases} />
            <FeatureList title="Top trigger words" items={profile.top_trigger_words} />
            <FeatureList title="Top pacing" items={profile.top_pacing} />
            <FeatureList title="Top voice styles" items={profile.top_voice_styles} />
            <FeatureList title="Top framings" items={profile.top_framings} />
            <FeatureList title="Top identity axes" items={profile.top_identity_axes} />
            <FeatureList title="Top creators" items={profile.top_creators} />
            <FeatureList title="Top visual tags" items={profile.top_visual_tags || []} />
          </div>
        )}
      </div>
    </div>
  );
}

function FeatureList({ title, items }: { title: string; items: RankedFeature[] }) {
  return (
    <div className="bg-[#141414] rounded p-3 border border-gray-800/50">
      <div className="text-xs font-medium text-gray-300 mb-2">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs text-gray-600">—</div>
      ) : (
        <div className="space-y-1">
          {items.slice(0, 10).map((it, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-gray-300 truncate mr-2">{it.value}</span>
              <span className="text-gray-500 tabular-nums">
                ×{it.play_count} · lift {it.lift_score?.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
