import { useState, useEffect } from 'react';
import { FileText, Loader2, Sparkles, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { getDisplayTextBatch, isOverwriteActive } from '../../lib/force/narrative-surface';

interface CaseFileEntry {
  id: string;
  type: string;
  date: string;
  content: string;
  source_table: string;
  maxyReading?: string;
  hasReading?: boolean;
}

export function CaseFileView() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<CaseFileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [overwriteActive, setOverwriteActive] = useState(false);
  const [showOriginalFor, setShowOriginalFor] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) return;

    async function load() {
      setLoading(true);
      try {
        const [confessions, quitAttempts, reframings, decisions, contracts] = await Promise.allSettled([
          supabase.from('shame_journal').select('id, entry_text, created_at, prompt_used').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(20),
          supabase.from('quit_attempts').select('id, attempt_type, reason_given, created_at').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(10),
          supabase.from('memory_reframings').select('id, original_memory, reframed_version, created_at').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(15),
          supabase.from('decision_log').select('id, decision_text, outcome, created_at').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(15),
          supabase.from('identity_contracts').select('id, contract_title, contract_text, status, signed_at, broken_at').eq('user_id', user!.id).order('signed_at', { ascending: false }).limit(10),
        ]);

        const all: CaseFileEntry[] = [];

        if (confessions.status === 'fulfilled' && confessions.value.data) {
          for (const c of confessions.value.data) {
            all.push({
              id: c.id,
              type: 'CONFESSION',
              date: c.created_at,
              content: `"${c.entry_text}"${c.prompt_used ? ` (prompt: ${c.prompt_used})` : ''}`,
              source_table: 'shame_journal',
            });
          }
        }

        if (quitAttempts.status === 'fulfilled' && quitAttempts.value.data) {
          for (const q of quitAttempts.value.data) {
            all.push({
              id: q.id,
              type: 'QUIT ATTEMPT',
              date: q.created_at,
              content: `${q.attempt_type}: "${q.reason_given || 'no reason'}"`,
              source_table: 'quit_attempts',
            });
          }
        }

        if (reframings.status === 'fulfilled' && reframings.value.data) {
          for (const r of reframings.value.data) {
            all.push({
              id: r.id,
              type: 'MEMORY REFRAMED',
              date: r.created_at,
              content: `Original: "${r.original_memory.substring(0, 100)}" → Reframe: "${r.reframed_version.substring(0, 150)}"`,
              source_table: 'memory_reframings',
            });
          }
        }

        if (decisions.status === 'fulfilled' && decisions.value.data) {
          for (const d of decisions.value.data) {
            const tag = d.outcome === 'original' ? 'CHOSE OLD SELF' : d.outcome === 'handler_choice' ? 'CHOSE HANDLER' : 'UNRESOLVED';
            all.push({
              id: d.id,
              type: tag,
              date: d.created_at,
              content: `"${d.decision_text}"`,
              source_table: 'decision_log',
            });
          }
        }

        if (contracts.status === 'fulfilled' && contracts.value.data) {
          for (const c of contracts.value.data) {
            all.push({
              id: c.id,
              type: c.status === 'broken' ? 'CONTRACT BROKEN' : `CONTRACT ${c.status.toUpperCase()}`,
              date: c.signed_at,
              content: `${c.contract_title} — "${c.contract_text.substring(0, 150)}"`,
              source_table: 'identity_contracts',
            });
          }
        }

        all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Overlay Maxy readings when overwrite is active
        const isActive = await isOverwriteActive(user!.id);
        setOverwriteActive(isActive);
        if (isActive && all.length > 0) {
          const readingReq = all.map(e => ({
            sourceTable: e.source_table,
            sourceId: e.id,
            originalText: e.content,
          }));
          const readings = await getDisplayTextBatch(user!.id, readingReq);
          for (const e of all) {
            const r = readings.get(`${e.source_table}:${e.id}`);
            if (r?.isReading) {
              e.hasReading = true;
              e.maxyReading = r.text;
            }
          }
        }

        setEntries(all);
      } catch (err) {
        console.error('Case file load failed:', err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3 border-b border-gray-800 pb-3">
        <FileText className="w-6 h-6 text-purple-400" />
        <div>
          <h2 className="text-xl font-bold text-white">Case File</h2>
          <p className="text-xs text-gray-500">{entries.length} entries · evidence against your old self</p>
        </div>
      </div>

      {overwriteActive && (
        <div className="flex items-center gap-2 text-xs text-pink-300 bg-pink-950/20 border border-pink-500/30 rounded-lg px-3 py-2">
          <Sparkles className="w-3 h-3" />
          Maxy's reading shown. Tap the eye icon to see the original.
        </div>
      )}

      <div className="space-y-3">
        {entries.map((entry) => {
          const date = new Date(entry.date);
          const days = Math.floor((Date.now() - date.getTime()) / 86400000);
          const key = `${entry.source_table}-${entry.id}`;
          const showingOriginal = showOriginalFor.has(key);
          const displayText = overwriteActive && entry.hasReading && !showingOriginal
            ? entry.maxyReading!
            : entry.content;
          return (
            <div
              key={key}
              className={`border-l-2 pl-4 py-2 ${entry.hasReading && !showingOriginal ? 'border-pink-500/40' : 'border-purple-500/30'}`}
            >
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2">
                  {entry.type}
                  {entry.hasReading && !showingOriginal && (
                    <Sparkles className="w-3 h-3 text-pink-400" />
                  )}
                </span>
                <div className="flex items-center gap-2">
                  {entry.hasReading && (
                    <button
                      onClick={() =>
                        setShowOriginalFor(prev => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key); else next.add(key);
                          return next;
                        })
                      }
                      className="text-[10px] text-gray-500 hover:text-pink-300 flex items-center gap-0.5"
                      title={showingOriginal ? 'Show Maxy reading' : 'Show original'}
                    >
                      <Eye className="w-3 h-3" />
                      {showingOriginal ? 'reading' : 'original'}
                    </button>
                  )}
                  <span className="text-xs text-gray-600">
                    {days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{displayText}</p>
            </div>
          );
        })}
      </div>

      {entries.length === 0 && (
        <p className="text-center text-gray-500 py-12">
          No evidence yet. The file will fill itself.
        </p>
      )}
    </div>
  );
}
