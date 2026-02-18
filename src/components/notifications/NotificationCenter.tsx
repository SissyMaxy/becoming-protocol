/**
 * Notification Center
 *
 * Displays unified notifications from all sources.
 * Can show as a toast stack or as a notification panel.
 */

import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  Eye,
  Sparkles,
  Zap,
  Trophy,
  Info,
  Star,
  Bell,
  X,
  ChevronRight,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  getNotificationManager,
  type Notification,
  NOTIFICATION_COLORS,
  NOTIFICATION_PRIORITY_COLORS,
} from '../../lib/notifications';

// ============================================
// ICON MAP
// ============================================

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  AlertTriangle,
  AlertCircle,
  Eye,
  Sparkles,
  Zap,
  Trophy,
  Info,
  Star,
  Bell,
};

// ============================================
// TOAST STACK
// ============================================

interface NotificationToastStackProps {
  position?: 'top' | 'bottom';
  maxVisible?: number;
}

export function NotificationToastStack({
  position = 'top',
  maxVisible = 3,
}: NotificationToastStackProps) {
  const { isBambiMode } = useBambiMode();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const manager = getNotificationManager();
    const unsubscribe = manager.subscribe(active => {
      setNotifications(active.slice(0, maxVisible));
    });

    // Initial load
    setNotifications(manager.getActive().slice(0, maxVisible));

    return unsubscribe;
  }, [maxVisible]);

  if (notifications.length === 0) return null;

  return (
    <div
      className={`fixed left-4 right-4 z-50 space-y-2 ${
        position === 'top' ? 'top-20' : 'bottom-24'
      }`}
    >
      {notifications.map((notification, idx) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          isBambiMode={isBambiMode}
          index={idx}
        />
      ))}
    </div>
  );
}

function NotificationToast({
  notification,
  isBambiMode,
  index,
}: {
  notification: Notification;
  isBambiMode: boolean;
  index: number;
}) {
  const manager = getNotificationManager();
  const colors = NOTIFICATION_COLORS[notification.type];
  const priorityBorder = NOTIFICATION_PRIORITY_COLORS[notification.priority];
  const IconComponent = ICON_MAP[notification.icon || colors.icon] || Info;

  const handleDismiss = () => {
    manager.dismiss(notification.id);
  };

  const handleAction = () => {
    notification.action?.callback();
    manager.dismiss(notification.id);
  };

  return (
    <div
      className={`rounded-xl p-4 shadow-lg border backdrop-blur-sm animate-slide-up ${
        isBambiMode
          ? 'bg-white/95 border-pink-200'
          : `bg-protocol-surface/95 ${priorityBorder}`
      }`}
      style={{
        animationDelay: `${index * 50}ms`,
        transform: `scale(${1 - index * 0.02})`,
        opacity: 1 - index * 0.1,
      }}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isBambiMode ? 'bg-pink-100' : colors.bg}`}>
          <IconComponent className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : colors.text}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
              {notification.title}
            </p>
            <button
              onClick={handleDismiss}
              className="p-1 rounded hover:bg-black/5 -mr-1 -mt-1"
            >
              <X className="w-4 h-4 opacity-50" />
            </button>
          </div>
          <p className={`text-xs mt-0.5 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            {notification.message}
          </p>

          {notification.action && (
            <button
              onClick={handleAction}
              className={`mt-2 text-xs font-medium flex items-center gap-1 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
              }`}
            >
              {notification.action.label}
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// NOTIFICATION BELL
// ============================================

interface NotificationBellProps {
  onClick?: () => void;
}

export function NotificationBell({ onClick }: NotificationBellProps) {
  const { isBambiMode } = useBambiMode();
  const [count, setCount] = useState(0);
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    const manager = getNotificationManager();
    const unsubscribe = manager.subscribe(active => {
      const unacknowledged = active.filter(n => !n.acknowledged);
      setCount(active.length);
      setHasNew(unacknowledged.length > 0);
    });

    const active = manager.getActive();
    setCount(active.length);
    setHasNew(active.some(n => !n.acknowledged));

    return unsubscribe;
  }, []);

  return (
    <button
      onClick={onClick}
      className={`relative p-2 rounded-lg transition-colors ${
        isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-surface'
      }`}
    >
      <Bell className={`w-5 h-5 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`} />
      {count > 0 && (
        <span
          className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white rounded-full ${
            hasNew
              ? 'bg-red-500 animate-pulse'
              : isBambiMode
              ? 'bg-pink-500'
              : 'bg-protocol-accent'
          }`}
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}

// ============================================
// NOTIFICATION PANEL
// ============================================

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const { isBambiMode } = useBambiMode();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const manager = getNotificationManager();
    const unsubscribe = manager.subscribe(active => {
      setNotifications(active);
    });

    setNotifications(manager.getActive());

    return unsubscribe;
  }, []);

  // Acknowledge all when panel opens
  useEffect(() => {
    if (isOpen) {
      const manager = getNotificationManager();
      notifications.forEach(n => {
        if (!n.acknowledged) {
          manager.acknowledge(n.id);
        }
      });
    }
  }, [isOpen, notifications]);

  if (!isOpen) return null;

  const handleDismissAll = () => {
    getNotificationManager().dismissAll();
  };

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={`absolute right-0 top-0 bottom-0 w-full max-w-sm overflow-hidden ${
          isBambiMode ? 'bg-white' : 'bg-protocol-bg'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`p-4 border-b ${isBambiMode ? 'border-pink-200' : 'border-protocol-border'}`}>
          <div className="flex items-center justify-between">
            <h2 className={`font-semibold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
              Notifications
            </h2>
            <div className="flex items-center gap-2">
              {notifications.length > 0 && (
                <button
                  onClick={handleDismissAll}
                  className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}
                >
                  Clear All
                </button>
              )}
              <button onClick={onClose} className="p-1 rounded hover:bg-black/5">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Notification List */}
        <div className="p-4 space-y-3 overflow-y-auto max-h-[calc(100vh-80px)]">
          {notifications.length === 0 ? (
            <div className="text-center py-8">
              <Bell className={`w-10 h-10 mx-auto mb-3 ${isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'}`} />
              <p className={isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}>
                No notifications
              </p>
            </div>
          ) : (
            notifications.map(notification => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                isBambiMode={isBambiMode}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function NotificationCard({
  notification,
  isBambiMode,
}: {
  notification: Notification;
  isBambiMode: boolean;
}) {
  const manager = getNotificationManager();
  const colors = NOTIFICATION_COLORS[notification.type];
  const IconComponent = ICON_MAP[notification.icon || colors.icon] || Info;

  const handleDismiss = () => {
    manager.dismiss(notification.id);
  };

  const handleAction = () => {
    notification.action?.callback();
    manager.dismiss(notification.id);
  };

  const timeAgo = getTimeAgo(notification.createdAt);

  return (
    <div
      className={`p-4 rounded-xl border ${
        isBambiMode
          ? 'bg-pink-50 border-pink-200'
          : `bg-protocol-surface border-protocol-border`
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isBambiMode ? 'bg-pink-100' : colors.bg}`}>
          <IconComponent className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : colors.text}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className={`text-sm font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                {notification.title}
              </p>
              <p className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>
                {timeAgo}
              </p>
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 rounded hover:bg-black/5"
            >
              <X className="w-4 h-4 opacity-50" />
            </button>
          </div>

          <p className={`text-sm mt-2 ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
            {notification.message}
          </p>

          {notification.details && (
            <p className={`text-xs mt-1 ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>
              {notification.details}
            </p>
          )}

          {(notification.action || notification.secondaryAction) && (
            <div className="flex items-center gap-3 mt-3">
              {notification.action && (
                <button
                  onClick={handleAction}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg ${
                    isBambiMode
                      ? 'bg-pink-200 text-pink-700'
                      : 'bg-protocol-accent/20 text-protocol-accent'
                  }`}
                >
                  {notification.action.label}
                </button>
              )}
              {notification.secondaryAction && (
                <button
                  onClick={() => {
                    notification.secondaryAction?.callback();
                    manager.dismiss(notification.id);
                  }}
                  className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}
                >
                  {notification.secondaryAction.label}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// HELPERS
// ============================================

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ============================================
// EXPORTS
// ============================================

export { NotificationToast };
