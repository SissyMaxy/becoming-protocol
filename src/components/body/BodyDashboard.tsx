/**
 * BodyDashboard — unified Body domain card for Today View.
 *
 * Collapsed: protein progress + workout status + streak.
 * Expanded: Fuel section (protein) + Build section (workout).
 */

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Flame,
  Utensils,
  Dumbbell,
  ChevronRight,
  Timer,
  Ruler,
} from 'lucide-react';
import { useProtein } from '../../hooks/useProtein';
import { useExercise } from '../../hooks/useExercise';
import { getDomainHandlerMessage } from '../../types/exercise';
import type { ExerciseDomainLevel } from '../../types/exercise';
import { shouldPromptMeasurement } from '../../types/measurement';
import { ProteinSection } from './ProteinSection';
import { MeasurementForm } from './MeasurementForm';

export function BodyDashboard() {
  const protein = useProtein();
  const exercise = useExercise();
  const [isExpanded, setIsExpanded] = useState(false);

  const [showMeasurementForm, setShowMeasurementForm] = useState(false);

  if (protein.isLoading || exercise.isLoading) return null;

  const streak = exercise.streakData;
  const template = exercise.recommendedTemplate;

  // Protein progress
  const progressColor = protein.gramsRating.barColor;

  // Measurement state
  const latestMeasurement = exercise.latestMeasurement;
  const showMeasurePrompt = shouldPromptMeasurement(latestMeasurement);

  const handleStartWorkout = () => {
    window.dispatchEvent(new CustomEvent('navigate-to-exercise'));
  };

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center gap-3"
      >
        {/* Domain label */}
        <span className="text-base">&#127351;</span>
        <span className="text-sm font-medium text-white/80">Body</span>

        <div className="flex-1 flex items-center gap-3 justify-end">
          {/* Protein mini-status */}
          <div className="flex items-center gap-2">
            <Utensils className="w-3.5 h-3.5 text-green-400" />
            <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${progressColor}`}
                style={{ width: `${protein.progressPct}%` }}
              />
            </div>
            <span className="text-xs text-white/50">{protein.grams}/{protein.targetGrams}g</span>
          </div>

          {/* Workout status */}
          {streak && (
            <div className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-xs text-white/50">
                Wk{streak.currentStreakWeeks}
              </span>
              <span className="text-xs text-white/30">{streak.sessionsThisWeek}/3</span>
              {streak.sessionsThisWeek >= 3 && (
                <span className="text-green-400 text-xs">&#10003;</span>
              )}
            </div>
          )}

          {/* Expand chevron */}
          {isExpanded
            ? <ChevronUp className="w-4 h-4 text-white/30" />
            : <ChevronDown className="w-4 h-4 text-white/30" />
          }
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* ── FUEL SECTION ── */}
          <div>
            <p className="text-xs text-white/30 uppercase tracking-wider mb-3">
              Fuel
            </p>
            <ProteinSection
              today={protein.today}
              count={protein.count}
              grams={protein.grams}
              progressPct={protein.progressPct}
              gramsRating={protein.gramsRating}
              rating={protein.rating}
              visibleSources={protein.visibleSources}
              history={protein.history}
              supplements={protein.supplements}
              groceryNudge={protein.groceryNudge}
              handlerMessage={protein.handlerMessage}
              toggle={protein.toggle}
              toggleSupp={protein.toggleSupp}
              adjustGrams={protein.adjustGrams}
            />
          </div>

          {/* Divider */}
          <div className="border-t border-white/10" />

          {/* ── BUILD SECTION ── */}
          <div>
            <p className="text-xs text-white/30 uppercase tracking-wider mb-3">
              Build
            </p>

            {/* Streak info */}
            {streak && (
              <div className="flex items-center gap-3 mb-3">
                <Flame className="w-5 h-5 text-orange-400" />
                <div>
                  <p className="text-white text-sm font-medium">
                    Week {streak.currentStreakWeeks}
                  </p>
                  <p className="text-white/50 text-xs">
                    {streak.sessionsThisWeek}/3 sessions this week
                    {streak.sessionsThisWeek >= 3 && ' — maintained'}
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-white/40 text-xs">{streak.totalSessions} total</p>
                </div>
              </div>
            )}

            {/* Handler message */}
            {exercise.domainConfig && (
              <p className="text-xs text-white/40 italic mb-3">
                "{getDomainHandlerMessage(exercise.domainConfig.domainLevel as ExerciseDomainLevel)}"
              </p>
            )}

            {/* Recommended workout button */}
            {template && (
              <button
                onClick={handleStartWorkout}
                className="w-full flex items-center justify-between bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg px-3 py-2.5 mb-3 hover:from-purple-500/20 hover:to-pink-500/20 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Dumbbell className="w-4 h-4 text-purple-400" />
                  <span className="text-white text-sm">{template.name}</span>
                  <span className="text-white/30 text-xs flex items-center gap-1">
                    <Timer className="w-3 h-3" />
                    ~{template.estimatedMinutes}m
                  </span>
                </div>
                <div className="flex items-center gap-1 text-purple-400 text-xs font-medium">
                  Start
                  <ChevronRight className="w-3 h-3" />
                </div>
              </button>
            )}

            {/* Measurement mini-line */}
            {latestMeasurement && (
              latestMeasurement.hipsInches || latestMeasurement.waistInches
            ) && (
              <div className="flex gap-3 text-xs text-white/40">
                {latestMeasurement.hipsInches && (
                  <span>Hips: <span className="text-white/60">{latestMeasurement.hipsInches}"</span></span>
                )}
                {latestMeasurement.waistInches && (
                  <span>Waist: <span className="text-white/60">{latestMeasurement.waistInches}"</span></span>
                )}
                {latestMeasurement.hipWaistRatio && (
                  <span>Ratio: <span className="text-purple-400">{latestMeasurement.hipWaistRatio}</span></span>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-white/10" />

          {/* ── MEASURE SECTION ── */}
          <div>
            <p className="text-xs text-white/30 uppercase tracking-wider mb-3">
              Measure
            </p>

            {/* Monthly check-in prompt or latest values */}
            {showMeasurePrompt && !showMeasurementForm ? (
              <button
                onClick={() => setShowMeasurementForm(true)}
                className="w-full py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-xs font-medium hover:bg-yellow-500/20 transition-colors flex items-center justify-center gap-1.5"
              >
                <Ruler className="w-3.5 h-3.5" />
                Monthly check-in due — tap to measure
              </button>
            ) : !showMeasurementForm && latestMeasurement ? (
              <div className="space-y-2">
                <div className="flex gap-3 text-xs text-white/50">
                  {latestMeasurement.hipsInches && (
                    <span>Hips: <span className="text-white/70">{latestMeasurement.hipsInches}"</span></span>
                  )}
                  {latestMeasurement.waistInches && (
                    <span>Waist: <span className="text-white/70">{latestMeasurement.waistInches}"</span></span>
                  )}
                  {latestMeasurement.hipWaistRatio && (
                    <span>Ratio: <span className="text-purple-400">{latestMeasurement.hipWaistRatio}</span></span>
                  )}
                </div>
                <button
                  onClick={() => setShowMeasurementForm(true)}
                  className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                >
                  + New measurement
                </button>
              </div>
            ) : !showMeasurementForm ? (
              <button
                onClick={() => setShowMeasurementForm(true)}
                className="text-xs text-white/30 hover:text-white/50 transition-colors"
              >
                No measurements yet — tap to add
              </button>
            ) : null}

            {/* Inline measurement form */}
            {showMeasurementForm && (
              <div className="mt-2">
                <MeasurementForm
                  previous={latestMeasurement}
                  onSaved={exercise.refresh}
                  onClose={() => setShowMeasurementForm(false)}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
