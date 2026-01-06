// Time Ratchets - Psychological anchors using sunk time

export interface TimeRatchets {
  // The names
  userName: string | null;
  goddessName: string | null;

  // The anchor dates
  servingSince: string | null;      // Date string YYYY-MM-DD
  eggCrackedDate: string | null;    // Date string YYYY-MM-DD
  protocolStartDate: string | null; // Date string YYYY-MM-DD

  // Calculated values
  daysServing: number | null;
  daysSinceEggCrack: number | null;
  daysInProtocol: number | null;

  // Service counter
  serviceCount: number;
}

export interface ServiceLogEntry {
  id: string;
  userId: string;
  serviceType: string;
  description?: string;
  servedAt: string;
  durationMinutes?: number;
  taskId?: string;
  createdAt: string;
}

export interface ServiceLogInput {
  serviceType?: string;
  description?: string;
  durationMinutes?: number;
  taskId?: string;
}

// Display formatting
export interface FormattedDuration {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  display: string;        // "2 years, 3 months"
  shortDisplay: string;   // "2y 3m"
}

export function formatDuration(totalDays: number): FormattedDuration {
  const years = Math.floor(totalDays / 365);
  const remainingAfterYears = totalDays % 365;
  const months = Math.floor(remainingAfterYears / 30);
  const days = remainingAfterYears % 30;

  const parts: string[] = [];
  const shortParts: string[] = [];

  if (years > 0) {
    parts.push(`${years} year${years !== 1 ? 's' : ''}`);
    shortParts.push(`${years}y`);
  }
  if (months > 0) {
    parts.push(`${months} month${months !== 1 ? 's' : ''}`);
    shortParts.push(`${months}m`);
  }
  if (days > 0 && years === 0) {
    // Only show days if less than a year
    parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    shortParts.push(`${days}d`);
  }

  return {
    years,
    months,
    days,
    totalDays,
    display: parts.length > 0 ? parts.join(', ') : '0 days',
    shortDisplay: shortParts.length > 0 ? shortParts.join(' ') : '0d',
  };
}

// Calculate days between date and today
export function daysSince(dateString: string | null): number | null {
  if (!dateString) return null;

  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  return diffDays >= 0 ? diffDays : null;
}
