/**
 * BodyDirectiveChecklist — renders open body_feminization_directives in a
 * collapsible panel inside HandlerChat. Each directive can be completed with
 * an optional photo upload (required when photo_required = true). Completion
 * writes the directive row AND a task_completions + handler_directives entry
 * so the Handler's evidence locker picks it up on the next turn.
 */

import { useEffect, useState, useRef } from 'react';
import { Camera, Check, Loader2, Clock, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Directive {
  id: string;
  category: string;
  directive: string;
  target_body_part: string | null;
  difficulty: number;
  deadline_at: string | null;
  photo_required: boolean;
  status: string;
  consequence_if_missed: string | null;
  created_at: string;
}

function timeRemaining(deadline: string | null): { label: string; overdue: boolean; soon: boolean } {
  if (!deadline) return { label: 'no deadline', overdue: false, soon: false };
  const ms = new Date(deadline).getTime() - Date.now();
  const overdue = ms < 0;
  const hours = Math.abs(ms) / 3600000;
  const soon = !overdue && hours < 6;
  if (overdue) {
    if (hours < 24) return { label: `${Math.round(hours)}h overdue`, overdue: true, soon: false };
    return { label: `${Math.round(hours / 24)}d overdue`, overdue: true, soon: false };
  }
  if (hours < 1) return { label: `${Math.round(hours * 60)}min left`, overdue: false, soon: true };
  if (hours < 24) return { label: `${Math.round(hours)}h left`, overdue: false, soon };
  return { label: `${Math.round(hours / 24)}d left`, overdue: false, soon: false };
}

export function BodyDirectiveChecklist() {
  const { user } = useAuth();
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeDirectiveRef = useRef<Directive | null>(null);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('body_feminization_directives')
        .select('id, category, directive, target_body_part, difficulty, deadline_at, photo_required, status, consequence_if_missed, created_at')
        .eq('user_id', user.id)
        .in('status', ['assigned', 'in_progress'])
        .order('deadline_at', { ascending: true });
      setDirectives((data || []) as Directive[]);
    } catch (err) {
      console.error('[BodyDirectives] load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const markComplete = async (directive: Directive, photoUrl?: string) => {
    if (!user?.id) return;
    try {
      await supabase
        .from('body_feminization_directives')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          photo_submitted_url: photoUrl || null,
          photo_submitted_at: photoUrl ? new Date().toISOString() : null,
        })
        .eq('id', directive.id)
        .eq('user_id', user.id);

      // Fire a handler_directives row so the Handler sees the completion in
      // the evidence locker on the next turn.
      await supabase.from('handler_directives').insert({
        user_id: user.id,
        action: 'body_directive_completed_by_user',
        target: directive.id,
        value: { category: directive.category, photo_url: photoUrl || null },
        priority: 'normal',
        reasoning: `Maxy completed body directive "${directive.directive.slice(0, 80)}"`,
      });

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark complete');
    }
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user?.id || !activeDirectiveRef.current) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const directive = activeDirectiveRef.current;
    setUploadingId(directive.id);
    setError(null);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/body-directives/${directive.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('verification-photos')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('verification-photos').getPublicUrl(path);
      await markComplete(directive, data.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingId(null);
      activeDirectiveRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const startPhotoUpload = (directive: Directive) => {
    activeDirectiveRef.current = directive;
    fileInputRef.current?.click();
  };

  if (loading) {
    return (
      <div className="px-4 py-2 text-xs text-gray-500">
        <Loader2 className="w-3 h-3 inline mr-1 animate-spin" /> Loading directives…
      </div>
    );
  }

  if (directives.length === 0) return null;

  const overdue = directives.filter(d => d.deadline_at && new Date(d.deadline_at).getTime() < Date.now());

  return (
    <div className="border-t border-gray-800 bg-gray-950/50">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChosen}
      />
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-gray-900/50"
      >
        <div className="flex items-center gap-2 text-sm">
          <span className="text-pink-300 font-medium">Body Directives</span>
          <span className="text-xs text-gray-500">
            {directives.length} open
            {overdue.length > 0 && (
              <span className="text-red-400 ml-2">• {overdue.length} overdue</span>
            )}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2 max-h-64 overflow-y-auto">
          {error && (
            <div className="text-xs text-red-400 flex items-center gap-1 mb-2">
              <AlertTriangle className="w-3 h-3" /> {error}
            </div>
          )}
          {directives.map(d => {
            const time = timeRemaining(d.deadline_at);
            const isUploading = uploadingId === d.id;
            return (
              <div
                key={d.id}
                className={`rounded-lg p-3 text-xs border ${
                  time.overdue
                    ? 'border-red-500/40 bg-red-500/5'
                    : time.soon
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : 'border-gray-800 bg-gray-900/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">
                    {d.category}
                    {d.target_body_part && <span className="text-gray-600"> · {d.target_body_part}</span>}
                  </div>
                  <div className={`flex items-center gap-1 text-[10px] ${
                    time.overdue ? 'text-red-400' : time.soon ? 'text-amber-400' : 'text-gray-500'
                  }`}>
                    <Clock className="w-3 h-3" /> {time.label}
                  </div>
                </div>
                <div className="text-gray-200 mb-2">{d.directive}</div>
                {d.consequence_if_missed && time.overdue && (
                  <div className="text-[10px] text-red-300 mb-2">
                    Consequence if missed: {d.consequence_if_missed}
                  </div>
                )}
                <div className="flex gap-2">
                  {d.photo_required ? (
                    <button
                      onClick={() => startPhotoUpload(d)}
                      disabled={isUploading}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 disabled:opacity-50"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" /> Uploading…
                        </>
                      ) : (
                        <>
                          <Camera className="w-3 h-3" /> Upload proof
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => markComplete(d)}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-green-500/20 hover:bg-green-500/30 text-green-300"
                    >
                      <Check className="w-3 h-3" /> Mark complete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
