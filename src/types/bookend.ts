/**
 * Morning/Evening bookend system types.
 */

export interface BookendConfig {
  id: string;
  userId: string;
  wakeTime: string;  // HH:MM format
  bedTime: string;   // HH:MM format
  morningName: string;
  enabled: boolean;
  createdAt: string;
}

export interface BookendView {
  id: string;
  userId: string;
  type: 'morning' | 'evening';
  messageShown: string;
  viewedAt: string;
}

export interface DaySummary {
  tasksCompleted: number;
  domainsTouched: number;
  proteinCount: number;
}
