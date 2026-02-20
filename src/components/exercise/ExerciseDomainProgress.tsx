/**
 * Exercise Domain Progress — compact card showing domain level,
 * progress to next level, description, and equipment unlocked.
 */

import { Dumbbell, Star, Lock } from 'lucide-react';
import {
  DOMAIN_LEVEL_NAMES,
  DOMAIN_LEVEL_DESCRIPTIONS,
  DOMAIN_LEVEL_THRESHOLDS,
  EQUIPMENT_BY_LEVEL,
} from '../../types/exercise';
import type { ExerciseDomainConfig } from '../../types/exercise';

const EQUIPMENT_LABELS: Record<string, string> = {
  bodyweight: 'Bodyweight',
  bands: 'Bands',
  dumbbells: 'Dumbbells',
  barbell: 'Barbell',
  gym: 'Gym',
};

interface ExerciseDomainProgressProps {
  config: ExerciseDomainConfig;
  domainProgress: number;
}

export function ExerciseDomainProgress({ config, domainProgress }: ExerciseDomainProgressProps) {
  const level = config.domainLevel;
  const name = DOMAIN_LEVEL_NAMES[level];
  const description = DOMAIN_LEVEL_DESCRIPTIONS[level];
  const threshold = DOMAIN_LEVEL_THRESHOLDS[level];
  const equipment = EQUIPMENT_BY_LEVEL[level];
  const isMaxLevel = level === 5;

  return (
    <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-4">
      {/* Level badge + name */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <span className="text-purple-400 font-bold text-sm">L{level}</span>
          </div>
          <div>
            <p className="text-white font-medium text-sm">{name}</p>
            <p className="text-white/40 text-xs">{description}</p>
          </div>
        </div>
        {isMaxLevel && (
          <Star className="w-5 h-5 text-yellow-400" />
        )}
      </div>

      {/* Progress bar */}
      {!isMaxLevel && (
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-white/50">Progress to Level {level + 1}</span>
            <span className="text-white/70">
              {config.tasksCompletedThisLevel}/{threshold}
            </span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
              style={{ width: `${domainProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Equipment unlocked */}
      <div className="flex items-center gap-2">
        <Dumbbell className="w-3 h-3 text-white/30" />
        <div className="flex gap-1.5">
          {(['bodyweight', 'bands', 'dumbbells', 'barbell', 'gym'] as const).map(tier => {
            const unlocked = equipment.includes(tier);
            return (
              <span
                key={tier}
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  unlocked
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'bg-white/5 text-white/20'
                }`}
              >
                {unlocked ? EQUIPMENT_LABELS[tier] : (
                  <span className="flex items-center gap-0.5">
                    <Lock className="w-2 h-2" />
                    {EQUIPMENT_LABELS[tier]}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
