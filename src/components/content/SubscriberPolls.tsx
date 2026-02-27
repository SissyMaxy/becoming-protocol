/**
 * SubscriberPolls — Create, manage, and track subscriber polls.
 * Lifecycle: draft → approved → active → closed → applied.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, Loader2, Plus, Check, Play, Lock,
  BarChart2, X,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import {
  createPoll, approvePoll, activatePoll, closePoll, applyPollResult,
  getPolls,
} from '../../lib/content/subscriber-poll-engine';
import type { SubscriberPoll, PollOption } from '../../types/content-pipeline';

interface SubscriberPollsProps {
  onBack: () => void;
}

const STATUS_COLORS: Record<string, { bambi: string; dark: string }> = {
  draft: { bambi: 'bg-gray-100 text-gray-600', dark: 'bg-gray-700/30 text-gray-400' },
  approved: { bambi: 'bg-yellow-100 text-yellow-700', dark: 'bg-yellow-900/20 text-yellow-400' },
  active: { bambi: 'bg-green-100 text-green-700', dark: 'bg-emerald-900/20 text-emerald-400' },
  closed: { bambi: 'bg-blue-100 text-blue-700', dark: 'bg-blue-900/20 text-blue-400' },
  applied: { bambi: 'bg-purple-100 text-purple-700', dark: 'bg-purple-900/20 text-purple-400' },
};

export function SubscriberPolls({ onBack }: SubscriberPollsProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();

  const [polls, setPolls] = useState<SubscriberPoll[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [weighted, setWeighted] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const data = await getPolls(user.id);
    setPolls(data);
    setIsLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async () => {
    if (!user || !title.trim() || options.filter(o => o.trim()).length < 2) return;
    setIsCreating(true);

    await createPoll(user.id, {
      title: title.trim(),
      description: description.trim() || undefined,
      options: options.filter(o => o.trim()).map(label => ({ label: label.trim() })),
      weighted_voting: weighted,
    });

    setTitle('');
    setDescription('');
    setOptions(['', '']);
    setWeighted(false);
    setShowCreate(false);
    setIsCreating(false);
    refresh();
  };

  const handleAction = async (pollId: string, action: string) => {
    if (!user) return;
    switch (action) {
      case 'approve': await approvePoll(user.id, pollId); break;
      case 'activate': await activatePoll(user.id, pollId); break;
      case 'close': await closePoll(user.id, pollId); break;
      case 'apply': await applyPollResult(user.id, pollId, 'Applied by Handler'); break;
    }
    refresh();
  };

  const bg = isBambiMode ? 'bg-white' : 'bg-protocol-bg';
  const text = isBambiMode ? 'text-gray-800' : 'text-protocol-text';
  const muted = isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted';
  const card = isBambiMode ? 'bg-white border-gray-200' : 'bg-protocol-surface border-protocol-border';
  const accent = isBambiMode ? 'bg-pink-500 text-white' : 'bg-protocol-accent text-white';

  return (
    <div className={`min-h-screen ${bg} pb-20`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className={muted}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className={`text-lg font-bold ${text}`}>Subscriber Polls</h1>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg ${accent}`}
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className={`mx-4 mb-4 p-4 rounded-xl border ${card} space-y-3`}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Poll question..."
            className={`w-full px-3 py-2 rounded-lg border text-sm ${card} ${text}`}
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className={`w-full px-3 py-2 rounded-lg border text-sm ${card} ${text}`}
          />

          <div className="space-y-2">
            <label className={`text-xs ${muted}`}>Options</label>
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={opt}
                  onChange={e => {
                    const newOpts = [...options];
                    newOpts[i] = e.target.value;
                    setOptions(newOpts);
                  }}
                  placeholder={`Option ${i + 1}`}
                  className={`flex-1 px-3 py-1.5 rounded-lg border text-sm ${card} ${text}`}
                />
                {options.length > 2 && (
                  <button
                    onClick={() => setOptions(options.filter((_, j) => j !== i))}
                    className={muted}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {options.length < 6 && (
              <button
                onClick={() => setOptions([...options, ''])}
                className={`text-xs ${muted}`}
              >
                + Add option
              </button>
            )}
          </div>

          <label className={`flex items-center gap-2 text-xs ${text}`}>
            <input
              type="checkbox"
              checked={weighted}
              onChange={e => setWeighted(e.target.checked)}
            />
            Weighted voting (whale votes count more)
          </label>

          <button
            onClick={handleCreate}
            disabled={isCreating || !title.trim()}
            className={`w-full py-2 rounded-lg text-sm font-medium ${accent} disabled:opacity-50`}
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Poll'}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className={`w-6 h-6 animate-spin ${muted}`} />
        </div>
      ) : polls.length === 0 ? (
        <div className={`text-center py-20 ${muted}`}>
          <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No polls created yet.</p>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {polls.map(poll => {
            const statusColor = STATUS_COLORS[poll.status]?.[isBambiMode ? 'bambi' : 'dark'] || '';
            const pollOptions = (poll.options as PollOption[]) || [];
            const maxVotes = Math.max(...pollOptions.map(o => o.votes), 1);

            return (
              <div key={poll.id} className={`rounded-xl border p-4 ${card}`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className={`font-bold text-sm ${text}`}>{poll.title}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColor}`}>
                    {poll.status}
                  </span>
                </div>

                {poll.description && (
                  <p className={`text-xs mb-3 ${muted}`}>{poll.description}</p>
                )}

                {/* Options with vote bars */}
                <div className="space-y-1.5 mb-3">
                  {pollOptions.map(opt => (
                    <div key={opt.id}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className={text}>{opt.label}</span>
                        <span className={muted}>{opt.votes}</span>
                      </div>
                      <div className={`h-1.5 rounded-full ${
                        isBambiMode ? 'bg-gray-100' : 'bg-protocol-bg'
                      }`}>
                        <div
                          className={`h-full rounded-full ${
                            opt.id === poll.winning_option_id
                              ? isBambiMode ? 'bg-pink-500' : 'bg-protocol-accent'
                              : isBambiMode ? 'bg-gray-300' : 'bg-gray-600'
                          }`}
                          style={{ width: `${(opt.votes / maxVotes) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className={`flex items-center gap-3 text-[10px] mb-3 ${muted}`}>
                  <span>{poll.total_votes} votes</span>
                  {poll.weighted_voting && <span>weighted: {poll.total_vote_weight}</span>}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {poll.status === 'draft' && (
                    <button
                      onClick={() => handleAction(poll.id, 'approve')}
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium ${
                        isBambiMode ? 'bg-yellow-100 text-yellow-700' : 'bg-yellow-900/20 text-yellow-400'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                  )}
                  {poll.status === 'approved' && (
                    <button
                      onClick={() => handleAction(poll.id, 'activate')}
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium ${
                        isBambiMode ? 'bg-green-100 text-green-700' : 'bg-emerald-900/20 text-emerald-400'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5" /> Go Live
                    </button>
                  )}
                  {poll.status === 'active' && (
                    <button
                      onClick={() => handleAction(poll.id, 'close')}
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium ${
                        isBambiMode ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/20 text-blue-400'
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" /> Close Voting
                    </button>
                  )}
                  {poll.status === 'closed' && !poll.result_applied && (
                    <button
                      onClick={() => handleAction(poll.id, 'apply')}
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium ${
                        isBambiMode ? 'bg-purple-100 text-purple-700' : 'bg-purple-900/20 text-purple-400'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" /> Apply Result
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
