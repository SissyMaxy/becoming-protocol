/**
 * Log Encounter Modal
 *
 * Modal for logging service encounters with full details.
 */

import { useState } from 'react';
import { X, Users } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  ENCOUNTER_TYPES,
  ENCOUNTER_TYPE_LABELS,
  ENCOUNTER_TYPE_COLORS,
  type EncounterType,
  type ServiceEncounter,
} from '../../types/escalation';

interface LogEncounterModalProps {
  onSubmit: (encounter: Omit<ServiceEncounter, 'id' | 'userId'>) => Promise<void>;
  onClose: () => void;
}

export function LogEncounterModal({ onSubmit, onClose }: LogEncounterModalProps) {
  const { isBambiMode } = useBambiMode();

  const [encounterType, setEncounterType] = useState<EncounterType>('online');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [ginaAware, setGinaAware] = useState(false);
  const [ginaDirected, setGinaDirected] = useState(false);
  const [activities, setActivities] = useState<string[]>([]);
  const [activityInput, setActivityInput] = useState('');
  const [psychologicalImpact, setPsychologicalImpact] = useState('');
  const [escalationEffect, setEscalationEffect] = useState('');
  const [arousalLevel, setArousalLevel] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddActivity = () => {
    if (activityInput.trim() && !activities.includes(activityInput.trim())) {
      setActivities([...activities, activityInput.trim()]);
      setActivityInput('');
    }
  };

  const handleRemoveActivity = (activity: string) => {
    setActivities(activities.filter(a => a !== activity));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        encounterType,
        date: new Date(date).toISOString(),
        description: description || undefined,
        ginaAware,
        ginaDirected,
        activities,
        psychologicalImpact: psychologicalImpact || undefined,
        escalationEffect: escalationEffect || undefined,
        arousalLevel,
      });
      onClose();
    } catch (err) {
      console.error('Failed to log encounter:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-md max-h-[90vh] overflow-hidden rounded-2xl ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
        }`}
      >
        {/* Header */}
        <div
          className={`p-4 border-b flex items-center justify-between ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          <div className="flex items-center gap-2">
            <Users className={isBambiMode ? 'text-pink-500' : 'text-purple-400'} />
            <h2
              className={`text-lg font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Log Encounter
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-surface'
            }`}
          >
            <X
              className={`w-5 h-5 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-140px)] space-y-4">
          {/* Encounter Type */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Encounter Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ENCOUNTER_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => setEncounterType(type)}
                  className={`p-3 rounded-lg text-sm font-medium transition-all ${
                    encounterType === type
                      ? 'ring-2'
                      : isBambiMode
                      ? 'bg-white hover:bg-pink-50'
                      : 'bg-protocol-surface hover:bg-protocol-surface-light'
                  }`}
                  style={{
                    backgroundColor:
                      encounterType === type
                        ? `${ENCOUNTER_TYPE_COLORS[type]}20`
                        : undefined,
                    borderColor:
                      encounterType === type ? ENCOUNTER_TYPE_COLORS[type] : undefined,
                    color:
                      encounterType === type
                        ? ENCOUNTER_TYPE_COLORS[type]
                        : isBambiMode
                        ? '#be185d'
                        : undefined,
                  }}
                >
                  {ENCOUNTER_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          {/* Date */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className={`w-full p-3 rounded-lg border text-sm ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text'
              } focus:outline-none focus:ring-2 focus:ring-purple-500/50`}
            />
          </div>

          {/* Description */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What happened..."
              rows={3}
              className={`w-full p-3 rounded-lg border text-sm resize-none ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              } focus:outline-none focus:ring-2 focus:ring-purple-500/50`}
            />
          </div>

          {/* Gina Toggles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span
                className={`text-sm ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Gina Aware?
              </span>
              <button
                onClick={() => {
                  setGinaAware(!ginaAware);
                  if (ginaAware) setGinaDirected(false);
                }}
                className={`w-12 h-6 rounded-full transition-colors ${
                  ginaAware ? 'bg-pink-500' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transform transition-transform ${
                    ginaAware ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {ginaAware && (
              <div className="flex items-center justify-between pl-4">
                <span
                  className={`text-sm ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}
                >
                  Gina Directed?
                </span>
                <button
                  onClick={() => setGinaDirected(!ginaDirected)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    ginaDirected ? 'bg-red-500' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transform transition-transform ${
                      ginaDirected ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            )}
          </div>

          {/* Arousal Level */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Arousal Level: {arousalLevel}/10
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={arousalLevel}
              onChange={e => setArousalLevel(parseInt(e.target.value))}
              className="w-full accent-pink-500"
            />
            <div className="flex justify-between text-xs text-protocol-text-muted">
              <span>Low</span>
              <span>High</span>
            </div>
          </div>

          {/* Activities */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Activities
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={activityInput}
                onChange={e => setActivityInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddActivity()}
                placeholder="Add activity..."
                className={`flex-1 p-2 rounded-lg border text-sm ${
                  isBambiMode
                    ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300'
                    : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
                } focus:outline-none`}
              />
              <button
                onClick={handleAddActivity}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  isBambiMode
                    ? 'bg-pink-500 text-white'
                    : 'bg-purple-500 text-white'
                }`}
              >
                Add
              </button>
            </div>
            {activities.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {activities.map(activity => (
                  <span
                    key={activity}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                      isBambiMode
                        ? 'bg-pink-100 text-pink-600'
                        : 'bg-protocol-surface-light text-protocol-text'
                    }`}
                  >
                    {activity}
                    <button
                      onClick={() => handleRemoveActivity(activity)}
                      className="hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Psychological Impact */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Psychological Impact
            </label>
            <textarea
              value={psychologicalImpact}
              onChange={e => setPsychologicalImpact(e.target.value)}
              placeholder="How did this affect you mentally/emotionally..."
              rows={2}
              className={`w-full p-3 rounded-lg border text-sm resize-none ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              } focus:outline-none`}
            />
          </div>

          {/* Escalation Effect */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Escalation Effect
            </label>
            <textarea
              value={escalationEffect}
              onChange={e => setEscalationEffect(e.target.value)}
              placeholder="What new baseline did this create..."
              rows={2}
              className={`w-full p-3 rounded-lg border text-sm resize-none ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              } focus:outline-none`}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className={`p-4 border-t ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`w-full py-3 rounded-lg font-medium transition-colors ${
              isSubmitting
                ? 'bg-gray-400 cursor-not-allowed'
                : isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-purple-500 text-white hover:bg-purple-600'
            }`}
          >
            {isSubmitting ? 'Saving...' : 'Log Encounter'}
          </button>
        </div>
      </div>
    </div>
  );
}
