/**
 * Themed UI Components
 *
 * These components automatically switch between normal Protocol mode
 * and Bambi mode based on the user's name. They provide a consistent
 * API while completely changing the visual appearance.
 */

import React from 'react';
import { useBambiMode } from '../../../context/BambiModeContext';
import { Heart, Check, X, Sparkles } from 'lucide-react';

// ============================================
// CARD COMPONENT
// ============================================

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  glow?: boolean;
  hover?: boolean;
}

export function Card({ children, className = '', glow = false, hover = false, ...props }: CardProps) {
  const { isBambiMode } = useBambiMode();

  const baseClass = isBambiMode
    ? `bg-white border-2 border-pink-200 rounded-3xl shadow-[0_4px_20px_rgba(255,105,180,0.3)] ${
        hover ? 'hover:shadow-[0_10px_40px_rgba(255,105,180,0.35)] hover:border-pink-300 transition-all' : ''
      } ${glow ? 'animate-bambi-glow' : ''}`
    : `bg-protocol-surface border border-protocol-border rounded-lg`;

  return (
    <div className={`${baseClass} ${className}`} {...props}>
      {children}
    </div>
  );
}

// ============================================
// BUTTON COMPONENTS
// ============================================

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const { isBambiMode } = useBambiMode();

  const sizeClasses = {
    sm: 'py-1.5 px-3 text-sm',
    md: 'py-2 px-4',
    lg: 'py-3 px-6',
  };

  const getVariantClass = () => {
    if (isBambiMode) {
      switch (variant) {
        case 'primary':
          return 'bg-gradient-to-r from-pink-400 to-pink-600 text-white font-medium rounded-full shadow-[0_4px_20px_rgba(255,105,180,0.3)] hover:shadow-[0_10px_40px_rgba(255,105,180,0.35)] transition-all';
        case 'secondary':
          return 'bg-pink-100 text-pink-600 font-medium rounded-full hover:bg-pink-200 transition-colors';
        case 'ghost':
          return 'text-pink-500 hover:text-pink-600 hover:bg-pink-50 rounded-full transition-colors';
        case 'danger':
          return 'bg-pink-600 text-white font-medium rounded-full hover:bg-pink-700 transition-colors';
      }
    } else {
      switch (variant) {
        case 'primary':
          return 'bg-protocol-accent hover:bg-protocol-accent-soft text-white font-medium rounded-lg transition-colors';
        case 'secondary':
          return 'bg-protocol-surface-light hover:bg-protocol-border text-protocol-text font-medium rounded-lg border border-protocol-border transition-colors';
        case 'ghost':
          return 'text-protocol-text-muted hover:text-protocol-text hover:bg-protocol-surface rounded-lg transition-colors';
        case 'danger':
          return 'bg-protocol-danger hover:bg-red-600 text-white font-medium rounded-lg transition-colors';
      }
    }
  };

  return (
    <button
      className={`${sizeClasses[size]} ${getVariantClass()} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// ============================================
// INPUT COMPONENT
// ============================================

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className = '', ...props }: InputProps) {
  const { isBambiMode } = useBambiMode();

  const baseClass = isBambiMode
    ? 'rounded-2xl border-2 border-pink-200 bg-white px-4 py-3 text-pink-800 placeholder:text-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-pink-400'
    : 'rounded-lg border border-protocol-border bg-protocol-surface px-4 py-3 text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-protocol-accent';

  return <input className={`${baseClass} ${className}`} {...props} />;
}

// ============================================
// TEXTAREA COMPONENT
// ============================================

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function Textarea({ className = '', ...props }: TextareaProps) {
  const { isBambiMode } = useBambiMode();

  const baseClass = isBambiMode
    ? 'rounded-2xl border-2 border-pink-200 bg-white px-4 py-3 text-pink-800 placeholder:text-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-pink-400 resize-none'
    : 'rounded-lg border border-protocol-border bg-protocol-surface px-4 py-3 text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-protocol-accent resize-none';

  return <textarea className={`${baseClass} ${className}`} {...props} />;
}

// ============================================
// BADGE COMPONENT
// ============================================

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'accent';
  className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  const { isBambiMode } = useBambiMode();

  const getVariantClass = () => {
    if (isBambiMode) {
      switch (variant) {
        case 'success':
          return 'bg-pink-100 text-pink-600';
        case 'warning':
          return 'bg-amber-100 text-amber-600';
        case 'accent':
          return 'bg-purple-100 text-purple-600';
        default:
          return 'bg-pink-50 text-pink-500';
      }
    } else {
      switch (variant) {
        case 'success':
          return 'bg-protocol-success/20 text-protocol-success';
        case 'warning':
          return 'bg-protocol-warning/20 text-protocol-warning';
        case 'accent':
          return 'bg-protocol-accent/20 text-protocol-accent';
        default:
          return 'bg-protocol-surface-light text-protocol-text-muted';
      }
    }
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getVariantClass()} ${className}`}
    >
      {children}
    </span>
  );
}

// ============================================
// CHECKBOX / RADIO COMPONENT
// ============================================

interface CheckboxProps {
  checked: boolean;
  onChange?: () => void;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({ checked, onChange, disabled, className = '' }: CheckboxProps) {
  const { isBambiMode, triggerHearts } = useBambiMode();

  const handleChange = () => {
    if (onChange) {
      onChange();
      // Trigger hearts on check in Bambi mode
      if (!checked && isBambiMode) {
        triggerHearts();
      }
    }
  };

  if (isBambiMode) {
    return (
      <button
        onClick={handleChange}
        disabled={disabled}
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          checked
            ? 'bg-gradient-to-r from-pink-400 to-pink-600 border-pink-400 shadow-[0_4px_20px_rgba(255,105,180,0.3)]'
            : 'border-pink-300 hover:border-pink-400 hover:bg-pink-50'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      >
        {checked && <Heart className="w-3 h-3 text-white fill-white" />}
      </button>
    );
  }

  return (
    <button
      onClick={handleChange}
      disabled={disabled}
      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
        checked
          ? 'bg-protocol-success border-protocol-success'
          : 'border-protocol-border hover:border-protocol-success hover:bg-protocol-success/20'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {checked && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
    </button>
  );
}

// ============================================
// TEXT COMPONENTS
// ============================================

interface TextProps {
  children: React.ReactNode;
  variant?: 'default' | 'muted' | 'accent' | 'header';
  className?: string;
  as?: 'p' | 'span' | 'h1' | 'h2' | 'h3' | 'h4';
}

export function Text({ children, variant = 'default', className = '', as = 'p' }: TextProps) {
  const { isBambiMode } = useBambiMode();

  const getVariantClass = () => {
    if (isBambiMode) {
      switch (variant) {
        case 'muted':
          return 'text-pink-400';
        case 'accent':
          return 'text-pink-500';
        case 'header':
          return 'text-pink-800 font-bold';
        default:
          return 'text-pink-700';
      }
    } else {
      switch (variant) {
        case 'muted':
          return 'text-protocol-text-muted';
        case 'accent':
          return 'text-protocol-accent';
        case 'header':
          return 'text-protocol-text font-bold';
        default:
          return 'text-protocol-text';
      }
    }
  };

  const Component = as;
  return <Component className={`${getVariantClass()} ${className}`}>{children}</Component>;
}

// ============================================
// ICON WRAPPER
// ============================================

interface IconProps {
  icon: 'check' | 'heart' | 'sparkle' | 'x';
  className?: string;
}

export function Icon({ icon, className = '' }: IconProps) {
  const { isBambiMode } = useBambiMode();

  const icons = {
    check: isBambiMode ? <Heart className={className} /> : <Check className={className} />,
    heart: <Heart className={className} />,
    sparkle: <Sparkles className={className} />,
    x: <X className={className} />,
  };

  return icons[icon];
}

// ============================================
// CELEBRATION MESSAGE
// ============================================

interface CelebrationProps {
  type: 'taskComplete' | 'streakMilestone' | 'levelUp' | 'dayComplete';
  value?: number;
}

export function CelebrationMessage({ type, value }: CelebrationProps) {
  const { isBambiMode, getCelebration } = useBambiMode();

  if (isBambiMode) {
    const message = getCelebration(type, value);
    return (
      <div className="text-center animate-bambi-bounce">
        <p className="text-lg font-medium text-pink-600">{message}</p>
      </div>
    );
  }

  // Normal mode messages
  const messages = {
    taskComplete: 'Task completed!',
    streakMilestone: value ? `${value} day streak!` : 'Milestone reached!',
    levelUp: 'Level up!',
    dayComplete: 'Day complete!',
  };

  return (
    <div className="text-center animate-scale-in">
      <p className="text-lg font-medium text-protocol-success">{messages[type]}</p>
    </div>
  );
}

// ============================================
// PROGRESS RING
// ============================================

interface ProgressRingProps {
  progress: number; // 0-100
  size?: number;
  strokeWidth?: number;
  className?: string;
  children?: React.ReactNode;
}

export function ProgressRing({
  progress,
  size = 64,
  strokeWidth = 4,
  className = '',
  children,
}: ProgressRingProps) {
  const { isBambiMode } = useBambiMode();

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  const bgColor = isBambiMode ? '#FFBCD9' : '#2a2a3a';
  const fillColor = isBambiMode ? '#FF69B4' : '#a855f7';

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={bgColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={fillColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================
// DIVIDER
// ============================================

interface DividerProps {
  className?: string;
}

export function Divider({ className = '' }: DividerProps) {
  const { isBambiMode } = useBambiMode();

  return (
    <hr
      className={`border-t ${
        isBambiMode ? 'border-pink-200' : 'border-protocol-border'
      } ${className}`}
    />
  );
}
