/**
 * CompletionInput — Router component
 * Reads completion_type from the task and renders the correct input UI.
 * Unknown types fall back to binary.
 */

import type { CompletionData, TaskCompletionType, CaptureFieldDef } from '../../types/task-bank';
import { BinaryInput, DurationInput, ScaleInput, CountInput, ReflectInput, LogEntryInput } from './inputs';

interface CompletionInputProps {
  completionType: TaskCompletionType | string;
  targetCount?: number;
  currentProgress: number;
  durationMinutes?: number;
  subtext?: string;
  intensity: number;
  isCompleting: boolean;
  onComplete: (data: CompletionData) => void;
  onIncrement?: () => void;
  /** Returns tailwind gradient classes for the given intensity */
  getGradient: (intensity: number, bambi: boolean) => string;
  /** Field definitions for log_entry completion type */
  captureFields?: CaptureFieldDef[];
}

export function CompletionInput({
  completionType,
  targetCount,
  currentProgress,
  durationMinutes,
  subtext,
  intensity,
  isCompleting,
  onComplete,
  onIncrement,
  getGradient,
  captureFields,
}: CompletionInputProps) {
  switch (completionType) {
    case 'duration':
      return (
        <DurationInput
          targetMinutes={durationMinutes}
          intensity={intensity}
          isCompleting={isCompleting}
          onComplete={onComplete}
          getGradient={getGradient}
        />
      );

    case 'scale':
      return (
        <ScaleInput
          intensity={intensity}
          isCompleting={isCompleting}
          onComplete={onComplete}
          getGradient={getGradient}
        />
      );

    case 'count':
      return (
        <CountInput
          targetCount={targetCount}
          currentProgress={currentProgress}
          intensity={intensity}
          isCompleting={isCompleting}
          onComplete={onComplete}
          onIncrement={onIncrement}
          getGradient={getGradient}
        />
      );

    case 'reflect':
      return (
        <ReflectInput
          placeholder={subtext}
          intensity={intensity}
          isCompleting={isCompleting}
          onComplete={onComplete}
          getGradient={getGradient}
        />
      );

    case 'log_entry':
      return (
        <LogEntryInput
          captureFields={captureFields || []}
          intensity={intensity}
          isCompleting={isCompleting}
          onComplete={onComplete}
          getGradient={getGradient}
        />
      );

    case 'binary':
    case 'confirm':
    default:
      // Binary / confirm / unknown all get Done/Skip buttons
      return (
        <BinaryInput
          intensity={intensity}
          isCompleting={isCompleting}
          onComplete={onComplete}
          getGradient={getGradient}
        />
      );
  }
}
