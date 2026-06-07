/**
 * ObservationLogModal — quick-capture for "Gina did X" milestones.
 * Calls log_gina_observation() RPC. Button-launched from anywhere in Today.
 */

import { useState } from 'react';
import { supabase } from '../../lib/supabase';

const MILESTONE_KINDS = [
  { value: 'she_suggested_fem_item', label: 'She suggested a fem item' },
  { value: 'she_initiated_mm_question', label: 'She initiated an MM question' },
  { value: 'she_engaged_with_book', label: 'She engaged with a book/article' },
  { value: 'she_used_we_language', label: 'She used "we" language about my journey' },
  { value: 'she_picked_fem_lingerie', label: 'She picked fem lingerie for me' },
  { value: 'she_articulated_curiosity', label: 'She articulated curiosity' },
  { value: 'she_named_a_fantasy', label: 'She named a fantasy of her own' },
  { value: 'she_complimented_fem_aesthetic', label: 'She complimented fem aesthetic' },
  { value: 'she_proposed_exercise', label: 'She proposed a couples exercise' },
  { value: 'she_asked_about_HRT', label: 'She asked about HRT' },
  { value: 'she_offered_specific_support', label: 'She offered specific support' },
  { value: 'she_watched_mm_without_averting', label: 'She watched MM content without averting' },
  { value: 'she_engaged_compersion_exercise', label: 'She engaged with compersion exercise' },
  { value: 'she_rated_mm_scenario_positive', label: 'She rated an MM scenario positive' },
  { value: 'she_articulated_openness', label: 'She articulated relational openness' },
  { value: 'she_named_open_relationship_config', label: 'She named an ENM configuration' },
  { value: 'she_initiated_role_play', label: 'She initiated a scene' },
  { value: 'she_directed_outfit', label: 'She directed my outfit' },
  { value: 'she_attended_exercise', label: 'She attended a joint exercise' },
  { value: 'custom', label: 'Custom (use description)' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ObservationLogModal({ open, onClose }: Props) {
  const [milestoneKind, setMilestoneKind] = useState('she_complimented_fem_aesthetic');
  const [description, setDescription] = useState('');
  const [weight, setWeight] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const submit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    await supabase.rpc('log_gina_observation', {
      p_milestone_kind: milestoneKind,
      p_description: description.trim(),
      p_weight: weight,
    });
    setDescription('');
    setWeight(1);
    setSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg max-w-md w-full p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="text-sm font-medium text-zinc-100">Log Gina observation</div>

        <div className="space-y-2">
          <label className="text-xs text-zinc-400">What did she do?</label>
          <select
            className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-xs text-zinc-200"
            value={milestoneKind}
            onChange={e => setMilestoneKind(e.target.value)}
          >
            {MILESTONE_KINDS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-zinc-400">Quote / detail</label>
          <textarea
            className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-xs text-zinc-200"
            rows={4}
            placeholder='What she said or did. Specific. Quote her if you can.'
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-zinc-400">Weight (1 = small, 3 = major)</label>
          <input
            type="range" min="1" max="5" step="1"
            value={weight}
            onChange={e => setWeight(parseInt(e.target.value, 10))}
            className="w-full"
          />
          <div className="text-xs text-zinc-500">Weight: {weight}</div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={submit}
            disabled={!description.trim() || submitting}
            className="text-xs px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-emerald-50 rounded disabled:opacity-50"
          >
            Log it
          </button>
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function ObservationLogButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded border border-zinc-700"
      >
        + Log Gina observation
      </button>
      <ObservationLogModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
