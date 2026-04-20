/**
 * Outfit Submit Card
 *
 * When Gina has daily_outfit_approval, Maxy can submit today's outfit here.
 * Photo URL (assumed pasted or pre-uploaded) + description. Pending until Gina
 * decides via her token URL.
 */

import { useEffect, useState } from 'react';
import { Shirt, Loader2, Check, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  userId: string;
}

export function OutfitSubmit({ userId }: Props) {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [todaySubmission, setTodaySubmission] = useState<Record<string, unknown> | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const [capRes, todayRes] = await Promise.all([
      supabase
        .from('gina_capability_grants')
        .select('id')
        .eq('user_id', userId)
        .eq('capability', 'daily_outfit_approval')
        .eq('active', true)
        .maybeSingle(),
      supabase
        .from('outfit_submissions')
        .select('id, photo_url, description, gina_decision, gina_note, submitted_at')
        .eq('user_id', userId)
        .gte('submitted_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setGranted(Boolean(capRes.data));
    setTodaySubmission(todayRes.data as Record<string, unknown> | null);
  };

  useEffect(() => { void load(); }, [userId]);

  if (granted === null) return null;
  if (!granted) return null;

  const submit = async () => {
    if (!photoUrl.trim() && !description.trim()) return;
    setBusy(true);
    try {
      await supabase.from('outfit_submissions').insert({
        user_id: userId,
        photo_url: photoUrl.trim() || null,
        description: description.trim() || null,
        gina_decision: 'pending',
      });
      setPhotoUrl('');
      setDescription('');
      setOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (todaySubmission) {
    const decision = todaySubmission.gina_decision as string;
    const note = todaySubmission.gina_note as string | null;
    const color =
      decision === 'approved' ? 'border-green-500/30 bg-green-950/10 text-green-300'
      : decision === 'rejected' ? 'border-red-500/30 bg-red-950/10 text-red-300'
      : decision === 'change_required' ? 'border-amber-500/30 bg-amber-950/10 text-amber-300'
      : 'border-pink-500/30 bg-pink-950/10 text-pink-300';
    return (
      <div className={`p-3 rounded-lg border ${color}`}>
        <div className="flex items-center gap-2 mb-1">
          <Shirt className="w-4 h-4" />
          <span className="text-sm font-medium">Today's outfit · {decision.replace('_', ' ')}</span>
        </div>
        {(todaySubmission.description as string | null) && (
          <div className="text-xs opacity-80">{todaySubmission.description as string}</div>
        )}
        {note && <div className="text-xs mt-1 italic">Gina: "{note}"</div>}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full p-3 rounded-lg border border-dashed border-pink-500/40 bg-pink-950/10 text-pink-300 text-sm flex items-center justify-center gap-2 hover:bg-pink-950/20"
      >
        <Shirt className="w-4 h-4" />
        Submit today's outfit to Gina
      </button>
    );
  }

  return (
    <div className="p-3 rounded-lg border border-pink-500/30 bg-pink-950/10 space-y-3">
      <div className="flex items-center gap-2">
        <Shirt className="w-4 h-4 text-pink-400" />
        <span className="text-sm font-semibold">Submit outfit</span>
        <button onClick={() => setOpen(false)} className="ml-auto text-xs text-gray-500">cancel</button>
      </div>
      <input
        value={photoUrl}
        onChange={e => setPhotoUrl(e.target.value)}
        placeholder="Photo URL (paste link or upload to vault first)"
        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm"
      />
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Describe: what you're wearing, where you're going..."
        rows={3}
        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm"
      />
      <div className="text-xs text-amber-300/80 flex items-start gap-1">
        <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
        <span>Not sending a photo-or-description today counts as a slip. She's expecting one.</span>
      </div>
      <button
        onClick={submit}
        disabled={busy || (!photoUrl.trim() && !description.trim())}
        className="w-full py-2 rounded-lg bg-pink-600 text-white text-sm font-semibold disabled:bg-gray-700"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : <><Check className="w-4 h-4 inline mr-1" /> Send to Gina</>}
      </button>
    </div>
  );
}
