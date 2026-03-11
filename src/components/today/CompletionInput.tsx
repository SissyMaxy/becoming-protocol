/**
 * CompletionInput — Router component
 * Reads completion_type from the task and renders the correct input UI.
 * Unknown types fall back to binary.
 */

import type { CompletionData, TaskCompletionType, CaptureFieldDef } from '../../types/task-bank';
import { BinaryInput, DurationInput, ScaleInput, CountInput, BatchCountInput, CheckInInput, ReflectInput, LogEntryInput, PhotoCaptureInput } from './inputs';
import { DEFAULT_LOG_FIELDS } from '../../lib/default-log-fields';

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
  /** Task domain (for photo evidence + default log fields) */
  taskDomain?: string;
  /** Task ID (for evidence linking) */
  taskId?: string;
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
  taskDomain,
  taskId,
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

    case 'batch_count':
      return (
        <BatchCountInput
          targetCount={targetCount}
          intensity={intensity}
          isCompleting={isCompleting}
          onComplete={onComplete}
          getGradient={getGradient}
        />
      );

    case 'check_in':
      return (
        <CheckInInput
          durationMinutes={durationMinutes}
          subtext={subtext}
          intensity={intensity}
          isCompleting={isCompleting}
          onComplete={onComplete}
          getGradient={getGradient}
        />
      );

    case 'reflect':
      return (
        <ReflectInput
          placeholder={subtext}
          domain={taskDomain}
          intensity={intensity}
          isCompleting={isCompleting}
          onComplete={onComplete}
          getGradient={getGradient}
        />
      );

    case 'log_entry': {
      // Use task-defined capture fields, or fall back to domain defaults
      const fields = (captureFields && captureFields.length > 0)
        ? captureFields
        : DEFAULT_LOG_FIELDS[taskDomain || ''] || DEFAULT_LOG_FIELDS['_default'];
      return (
        <LogEntryInput
          captureFields={fields}
          intensity={intensity}
          isCompleting={isCompleting}
          onComplete={onComplete}
          getGradient={getGradient}
        />
      );
    }

    case 'photo':
      return (
        <PhotoCaptureInput
          intensity={intensity}
          isCompleting={isCompleting}
          onComplete={onComplete}
          getGradient={getGradient}
          taskDomain={taskDomain}
          taskId={taskId}
        />
      );

    case 'tally':
      // Tally works like count but without a target
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

    case 'streak':
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
