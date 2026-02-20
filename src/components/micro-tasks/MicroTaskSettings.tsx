/**
 * MicroTaskSettings — settings panel for micro-task configuration.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getOrCreateMicroTaskConfig, updateMicroTaskConfig } from '../../lib/micro-tasks';
import type { MicroTaskConfig } from '../../types/micro-tasks';

export function MicroTaskSettings() {
  const { user } = useAuth();
  const [config, setConfig] = useState<MicroTaskConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const cfg = await getOrCreateMicroTaskConfig(user.id);
    setConfig(cfg);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (fields: Partial<MicroTaskConfig>) => {
    if (!user?.id) return;
    setSaving(true);
    await updateMicroTaskConfig(user.id, fields).catch(() => {});
    setConfig(prev => prev ? { ...prev, ...fields } : prev);
    setSaving(false);
  }, [user?.id]);

  if (!config) return <div className="text-white/40 text-sm p-4">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white font-medium text-sm">Enabled</p>
          <p className="text-white/40 text-xs">Receive micro-task interrupts during work hours</p>
        </div>
        <button
          onClick={() => save({ enabled: !config.enabled })}
          disabled={saving}
          className={`relative w-14 h-8 rounded-full transition-colors ${
            config.enabled ? 'bg-purple-500' : 'bg-white/20'
          }`}
        >
          <div
            className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
              config.enabled ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {config.enabled && (
        <>
          {/* Work hours */}
          <div>
            <p className="text-white font-medium text-sm mb-3">Work Hours</p>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-white/40 text-xs mb-1 block">Start</label>
                <input
                  type="time"
                  value={config.workStart}
                  onChange={(e) => save({ workStart: e.target.value })}
                  className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500/50 outline-none"
                />
              </div>
              <span className="text-white/30 mt-5">to</span>
              <div className="flex-1">
                <label className="text-white/40 text-xs mb-1 block">End</label>
                <input
                  type="time"
                  value={config.workEnd}
                  onChange={(e) => save({ workEnd: e.target.value })}
                  className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500/50 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Tasks per day slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-white font-medium text-sm">Tasks per Day</p>
              <span className="text-purple-400 font-mono text-sm">{config.tasksPerDay}</span>
            </div>
            <input
              type="range"
              min={4}
              max={12}
              value={config.tasksPerDay}
              onChange={(e) => save({ tasksPerDay: parseInt(e.target.value) })}
              className="w-full cursor-pointer accent-purple-500"
            />
            <div className="flex justify-between text-xs text-white/20 mt-1">
              <span>4 (gentle)</span>
              <span>12 (intense)</span>
            </div>
          </div>

          {/* Gap range */}
          <div>
            <p className="text-white font-medium text-sm mb-2">Gap Between Tasks</p>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-white/40 text-xs mb-1 block">Min (minutes)</label>
                <input
                  type="number"
                  min={15}
                  max={120}
                  value={config.minGapMinutes}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (v >= 15 && v <= 120) save({ minGapMinutes: v });
                  }}
                  className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500/50 outline-none"
                />
              </div>
              <span className="text-white/30 mt-5">-</span>
              <div className="flex-1">
                <label className="text-white/40 text-xs mb-1 block">Max (minutes)</label>
                <input
                  type="number"
                  min={30}
                  max={180}
                  value={config.maxGapMinutes}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (v >= 30 && v <= 180) save({ maxGapMinutes: v });
                  }}
                  className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500/50 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <p className="text-white/40 text-xs leading-relaxed">
              Micro-tasks are brief identity reinforcement prompts (posture, scent, voice, awareness, gait, anchor)
              delivered during your work hours. Each takes 5-60 seconds. Points are awarded on completion.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
