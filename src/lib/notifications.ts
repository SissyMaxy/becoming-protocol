/**
 * Unified Notification System
 *
 * Central system for managing in-app notifications from various sources:
 * - Streak warnings
 * - Pattern catch alerts
 * - Handler interventions
 * - Trigger events
 * - Achievement unlocks
 * - System messages
 */

// ============================================
// TYPES
// ============================================

export type NotificationType =
  | 'streak_warning'
  | 'pattern_catch'
  | 'handler_intervention'
  | 'trigger_event'
  | 'achievement'
  | 'system'
  | 'opportunity'
  | 'reminder';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  details?: string;
  action?: {
    label: string;
    callback: () => void;
  };
  secondaryAction?: {
    label: string;
    callback: () => void;
  };
  icon?: string;
  color?: string;
  createdAt: number;
  expiresAt?: number;
  acknowledged: boolean;
  dismissed: boolean;
  source?: string;
  data?: Record<string, unknown>;
}

export interface NotificationConfig {
  maxVisible: number;
  defaultDurationMs: number;
  persistCritical: boolean;
  soundEnabled: boolean;
  hapticEnabled: boolean;
}

type NotificationListener = (notifications: Notification[]) => void;

// ============================================
// DEFAULT CONFIG
// ============================================

const DEFAULT_CONFIG: NotificationConfig = {
  maxVisible: 5,
  defaultDurationMs: 10000, // 10 seconds
  persistCritical: true,
  soundEnabled: false,
  hapticEnabled: true,
};

// ============================================
// NOTIFICATION MANAGER
// ============================================

class NotificationManager {
  private notifications: Map<string, Notification> = new Map();
  private listeners: Set<NotificationListener> = new Set();
  private config: NotificationConfig = DEFAULT_CONFIG;

  /**
   * Configure the notification manager
   */
  configure(config: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Add a new notification
   */
  push(notification: Omit<Notification, 'id' | 'createdAt' | 'acknowledged' | 'dismissed'>): string {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const fullNotification: Notification = {
      ...notification,
      id,
      createdAt: now,
      expiresAt: notification.expiresAt || (
        notification.priority === 'critical' && this.config.persistCritical
          ? undefined
          : now + this.config.defaultDurationMs
      ),
      acknowledged: false,
      dismissed: false,
    };

    this.notifications.set(id, fullNotification);
    this.notifyListeners();

    // Haptic feedback for high priority
    if (this.config.hapticEnabled && (notification.priority === 'high' || notification.priority === 'critical')) {
      this.triggerHaptic(notification.priority);
    }

    return id;
  }

  /**
   * Get all active notifications
   */
  getActive(): Notification[] {
    const now = Date.now();
    return Array.from(this.notifications.values())
      .filter(n => !n.dismissed && (!n.expiresAt || n.expiresAt > now))
      .sort((a, b) => {
        // Sort by priority first, then by time
        const priorityOrder: NotificationPriority[] = ['critical', 'high', 'medium', 'low'];
        const priorityDiff = priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
        if (priorityDiff !== 0) return priorityDiff;
        return b.createdAt - a.createdAt;
      })
      .slice(0, this.config.maxVisible);
  }

  /**
   * Get all notifications (including expired/dismissed)
   */
  getAll(): Notification[] {
    return Array.from(this.notifications.values())
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Acknowledge a notification (user has seen it)
   */
  acknowledge(id: string): void {
    const notification = this.notifications.get(id);
    if (notification) {
      notification.acknowledged = true;
      this.notifications.set(id, notification);
      this.notifyListeners();
    }
  }

  /**
   * Dismiss a notification
   */
  dismiss(id: string): void {
    const notification = this.notifications.get(id);
    if (notification) {
      notification.dismissed = true;
      this.notifications.set(id, notification);
      this.notifyListeners();
    }
  }

  /**
   * Dismiss all notifications
   */
  dismissAll(): void {
    this.notifications.forEach(n => {
      n.dismissed = true;
    });
    this.notifyListeners();
  }

  /**
   * Clear expired notifications
   */
  cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    this.notifications.forEach((n, id) => {
      if (n.dismissed || (n.expiresAt && n.expiresAt < now - 60000)) {
        toDelete.push(id);
      }
    });

    toDelete.forEach(id => this.notifications.delete(id));
  }

  /**
   * Subscribe to notification changes
   */
  subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get count by type
   */
  getCountByType(type: NotificationType): number {
    return this.getActive().filter(n => n.type === type).length;
  }

  /**
   * Get highest priority active notification
   */
  getHighestPriority(): Notification | null {
    const active = this.getActive();
    return active.length > 0 ? active[0] : null;
  }

  private notifyListeners(): void {
    const active = this.getActive();
    this.listeners.forEach(listener => listener(active));
  }

  private triggerHaptic(priority: NotificationPriority): void {
    if ('vibrate' in navigator) {
      if (priority === 'critical') {
        navigator.vibrate([100, 50, 100, 50, 100]);
      } else {
        navigator.vibrate([50, 30, 50]);
      }
    }
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let instance: NotificationManager | null = null;

export function getNotificationManager(): NotificationManager {
  if (!instance) {
    instance = new NotificationManager();
    // Cleanup every minute
    setInterval(() => instance?.cleanup(), 60000);
  }
  return instance;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Quick push for streak warnings
 */
export function pushStreakWarning(
  title: string,
  message: string,
  priority: NotificationPriority = 'medium',
  action?: Notification['action']
): string {
  return getNotificationManager().push({
    type: 'streak_warning',
    priority,
    title,
    message,
    action,
    icon: 'AlertTriangle',
    color: priority === 'critical' ? '#ef4444' : '#f59e0b',
  });
}

/**
 * Quick push for pattern catch
 */
export function pushPatternCatch(
  patternName: string,
  suggestion: string,
  onCatch: () => void
): string {
  return getNotificationManager().push({
    type: 'pattern_catch',
    priority: 'medium',
    title: 'Pattern Detected',
    message: `"${patternName}" - catch this pattern?`,
    details: suggestion,
    action: {
      label: 'Log Catch',
      callback: onCatch,
    },
    icon: 'Eye',
    color: '#ef4444',
  });
}

/**
 * Quick push for opportunity
 */
export function pushOpportunity(
  title: string,
  message: string,
  action?: Notification['action']
): string {
  return getNotificationManager().push({
    type: 'opportunity',
    priority: 'low',
    title,
    message,
    action,
    icon: 'Star',
    color: '#22c55e',
  });
}

/**
 * Quick push for achievement
 */
export function pushAchievement(
  achievementName: string,
  points: number
): string {
  return getNotificationManager().push({
    type: 'achievement',
    priority: 'medium',
    title: 'Achievement Unlocked!',
    message: achievementName,
    details: `+${points} points`,
    icon: 'Trophy',
    color: '#f59e0b',
  });
}

/**
 * Quick push for system message
 */
export function pushSystemMessage(
  title: string,
  message: string,
  priority: NotificationPriority = 'low'
): string {
  return getNotificationManager().push({
    type: 'system',
    priority,
    title,
    message,
    icon: 'Info',
    color: '#3b82f6',
  });
}

// ============================================
// NOTIFICATION COLORS BY TYPE
// ============================================

export const NOTIFICATION_COLORS: Record<NotificationType, { bg: string; text: string; icon: string }> = {
  streak_warning: { bg: 'bg-red-500/10', text: 'text-red-400', icon: 'AlertTriangle' },
  pattern_catch: { bg: 'bg-orange-500/10', text: 'text-orange-400', icon: 'Eye' },
  handler_intervention: { bg: 'bg-purple-500/10', text: 'text-purple-400', icon: 'Sparkles' },
  trigger_event: { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: 'Zap' },
  achievement: { bg: 'bg-amber-500/10', text: 'text-amber-400', icon: 'Trophy' },
  system: { bg: 'bg-gray-500/10', text: 'text-gray-400', icon: 'Info' },
  opportunity: { bg: 'bg-green-500/10', text: 'text-green-400', icon: 'Star' },
  reminder: { bg: 'bg-pink-500/10', text: 'text-pink-400', icon: 'Bell' },
};

export const NOTIFICATION_PRIORITY_COLORS: Record<NotificationPriority, string> = {
  low: 'border-gray-500/20',
  medium: 'border-blue-500/30',
  high: 'border-orange-500/40',
  critical: 'border-red-500/50',
};
