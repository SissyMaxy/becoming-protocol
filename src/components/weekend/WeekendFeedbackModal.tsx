/**
 * Weekend Feedback Modal
 *
 * Collects feedback after completing a weekend activity.
 * Tracks Gina's participation, engagement, and your experience.
 */

import { useState } from 'react';
import { X, Heart, Star, Camera, Check } from 'lucide-react';
import type { WeekendActivity, ActivityFeedback } from '../../types/weekend';
import { WEEKEND_CATEGORY_CONFIG } from '../../types/weekend';

interface WeekendFeedbackModalProps {
  activity: WeekendActivity;
  onSubmit: (feedback: ActivityFeedback) => void;
  onCancel: () => void;
}

export function WeekendFeedbackModal({
  activity,
  onSubmit,
  onCancel
}: WeekendFeedbackModalProps) {
  const categoryConfig = WEEKEND_CATEGORY_CONFIG[activity.category];

  // Form state
  const [ginaParticipated, setGinaParticipated] = useState(true);
  const [ginaInitiated, setGinaInitiated] = useState(false);
  const [ginaEngagement, setGinaEngagement] = useState(3);
  const [feminizationRating, setFeminizationRating] = useState(3);
  const [connectionRating, setConnectionRating] = useState(3);
  const [photosCaptured, setPhotosCaptured] = useState(0);
  const [notes, setNotes] = useState('');
  const [wouldRepeat, setWouldRepeat] = useState(true);

  const handleSubmit = () => {
    const feedback: ActivityFeedback = {
      completed: true,
      ginaParticipated,
      ginaInitiated,
      ginaEngagementRating: ginaParticipated ? ginaEngagement : undefined,
      feminizationRating,
      connectionRating: ginaParticipated ? connectionRating : undefined,
      photosCaptured,
      notes: notes.trim() || undefined,
      wouldRepeat
    };

    onSubmit(feedback);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-protocol-bg border border-protocol-accent/20 rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div
          className="p-4 border-b border-protocol-accent/10"
          style={{ backgroundColor: `${categoryConfig.color}15` }}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${categoryConfig.color}30` }}
              >
                <Check className="w-5 h-5" style={{ color: categoryConfig.color }} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-protocol-text">
                  Activity Complete!
                </h2>
                <p className="text-sm text-protocol-text-muted">
                  {activity.name}
                </p>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="p-2 rounded-full hover:bg-protocol-surface-light transition-colors"
            >
              <X className="w-5 h-5 text-protocol-text-muted" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-5 overflow-y-auto max-h-[60vh]">
          {/* Gina Participation */}
          <div className="space-y-3">
            <h3 className="font-medium text-protocol-text flex items-center gap-2">
              <Heart className="w-4 h-4 text-pink-400" />
              Gina's Involvement
            </h3>

            {/* Did she participate? */}
            <div className="flex gap-2">
              <button
                onClick={() => setGinaParticipated(true)}
                className={`flex-1 py-2 px-4 rounded-lg border transition-all ${
                  ginaParticipated
                    ? 'border-pink-500 bg-pink-500/20 text-pink-400'
                    : 'border-protocol-accent/20 text-protocol-text-muted hover:border-protocol-accent/40'
                }`}
              >
                She participated
              </button>
              <button
                onClick={() => setGinaParticipated(false)}
                className={`flex-1 py-2 px-4 rounded-lg border transition-all ${
                  !ginaParticipated
                    ? 'border-gray-500 bg-gray-500/20 text-gray-400'
                    : 'border-protocol-accent/20 text-protocol-text-muted hover:border-protocol-accent/40'
                }`}
              >
                Did solo
              </button>
            </div>

            {/* Did she initiate? */}
            {ginaParticipated && (
              <label className="flex items-center gap-3 text-sm text-protocol-text-muted">
                <input
                  type="checkbox"
                  checked={ginaInitiated}
                  onChange={(e) => setGinaInitiated(e.target.checked)}
                  className="w-4 h-4 rounded border-protocol-accent/30"
                />
                She suggested or initiated this activity
              </label>
            )}

            {/* Gina engagement rating */}
            {ginaParticipated && (
              <div className="space-y-2">
                <label className="text-sm text-protocol-text-muted">
                  Her engagement level
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      onClick={() => setGinaEngagement(rating)}
                      className={`flex-1 py-2 rounded-lg border transition-all ${
                        ginaEngagement >= rating
                          ? 'border-pink-500 bg-pink-500/20'
                          : 'border-protocol-accent/20 hover:border-protocol-accent/40'
                      }`}
                    >
                      <Star
                        className={`w-5 h-5 mx-auto ${
                          ginaEngagement >= rating ? 'text-pink-400 fill-pink-400' : 'text-protocol-text-muted'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <p className="text-xs text-protocol-text-muted text-center">
                  {ginaEngagement === 1 && 'Reluctant'}
                  {ginaEngagement === 2 && 'Went along with it'}
                  {ginaEngagement === 3 && 'Neutral'}
                  {ginaEngagement === 4 && 'Enjoyed it'}
                  {ginaEngagement === 5 && 'Really into it!'}
                </p>
              </div>
            )}
          </div>

          {/* Your Experience */}
          <div className="space-y-3">
            <h3 className="font-medium text-protocol-text">Your Experience</h3>

            {/* Feminization rating */}
            <div className="space-y-2">
              <label className="text-sm text-protocol-text-muted">
                How feminizing did this feel?
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    onClick={() => setFeminizationRating(rating)}
                    className={`flex-1 py-2 rounded-lg border transition-all ${
                      feminizationRating >= rating
                        ? 'border-protocol-accent bg-protocol-accent/20'
                        : 'border-protocol-accent/20 hover:border-protocol-accent/40'
                    }`}
                  >
                    <span className="text-lg">
                      {rating === 1 && '😐'}
                      {rating === 2 && '🙂'}
                      {rating === 3 && '😊'}
                      {rating === 4 && '💕'}
                      {rating === 5 && '✨'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Connection rating (if Gina participated) */}
            {ginaParticipated && (
              <div className="space-y-2">
                <label className="text-sm text-protocol-text-muted">
                  How connected did you feel to Gina?
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      onClick={() => setConnectionRating(rating)}
                      className={`flex-1 py-2 rounded-lg border transition-all ${
                        connectionRating >= rating
                          ? 'border-rose-500 bg-rose-500/20'
                          : 'border-protocol-accent/20 hover:border-protocol-accent/40'
                      }`}
                    >
                      <Heart
                        className={`w-5 h-5 mx-auto ${
                          connectionRating >= rating ? 'text-rose-400 fill-rose-400' : 'text-protocol-text-muted'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Photos */}
          {activity.photoOpportunity && (
            <div className="space-y-2">
              <label className="text-sm text-protocol-text-muted flex items-center gap-2">
                <Camera className="w-4 h-4" />
                Photos captured
              </label>
              <div className="flex gap-2">
                {[0, 1, 2, 3, 5].map((count) => (
                  <button
                    key={count}
                    onClick={() => setPhotosCaptured(count)}
                    className={`flex-1 py-2 rounded-lg border text-sm transition-all ${
                      photosCaptured === count
                        ? 'border-protocol-accent bg-protocol-accent/20 text-protocol-accent'
                        : 'border-protocol-accent/20 text-protocol-text-muted hover:border-protocol-accent/40'
                    }`}
                  >
                    {count === 0 ? 'None' : count === 5 ? '5+' : count}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Would repeat */}
          <label className="flex items-center gap-3 text-sm text-protocol-text">
            <input
              type="checkbox"
              checked={wouldRepeat}
              onChange={(e) => setWouldRepeat(e.target.checked)}
              className="w-4 h-4 rounded border-protocol-accent/30"
            />
            Would do this again
          </label>

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-sm text-protocol-text-muted">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did it go? Her reactions? What worked?"
              className="w-full p-3 rounded-lg bg-protocol-surface border border-protocol-accent/20 text-protocol-text placeholder:text-protocol-text-muted/50 resize-none"
              rows={3}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-protocol-accent/10 bg-protocol-surface flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl font-medium text-protocol-text-muted border border-protocol-accent/20 hover:bg-protocol-surface-light transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-3 rounded-xl font-medium text-white transition-all"
            style={{ backgroundColor: categoryConfig.color }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
