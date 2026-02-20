/**
 * Micro-task system types — brief identity-reinforcing interrupts during work hours.
 */

export type MicroTaskType = 'posture' | 'scent' | 'voice' | 'awareness' | 'gait' | 'anchor';

export interface MicroTask {
  type: MicroTaskType;
  instruction: string;
  durationSeconds: number;
  points: number;
}

export interface MicroTaskConfig {
  id: string;
  userId: string;
  enabled: boolean;
  workStart: string;  // HH:MM
  workEnd: string;    // HH:MM
  tasksPerDay: number;
  minGapMinutes: number;
  maxGapMinutes: number;
  createdAt: string;
}

export type MicroTaskResult = 'completed' | 'skipped' | 'expired';

export interface MicroTaskCompletion {
  id: string;
  userId: string;
  microTaskType: string;
  instruction: string;
  result: MicroTaskResult;
  pointsAwarded: number;
  scheduledAt: string;
  respondedAt: string | null;
  createdAt: string;
}

export interface ScheduledMicro {
  task: MicroTask;
  scheduledAt: Date;
  status: 'pending' | 'active' | 'completed' | 'skipped' | 'expired';
}

export interface MicroTaskStats {
  completedToday: number;
  totalToday: number;
  completedThisWeek: number;
  totalThisWeek: number;
}
