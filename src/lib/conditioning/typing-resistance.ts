/**
 * Resistance Detection from Typing Patterns (P12.7)
 *
 * Detects resistance signals from how the user types before sending.
 * Analyzes keystroke timing, deletion patterns, and engagement metrics
 * to identify hesitation, self-censoring, avoidance, and internal conflict.
 */

// ============================================
// TYPES
// ============================================

export interface TypingMetrics {
  /** Milliseconds from last Handler message to first keystroke */
  timeToFirstKeystroke: number;
  /** Total number of edits (insertions + deletions) */
  totalEditCount: number;
  /** Final message character length */
  messageLength: number;
  /** Seconds since last Handler message was displayed */
  timeSinceLastHandlerMessage: number;
  /** Number of character deletions during composition */
  deletionCount: number;
  /** Number of pauses > 5s during typing */
  pauseCount: number;
}

export interface ResistanceSignal {
  type: string;
  severity: number; // 1-5
  detail: string;
}

export interface ResistanceAnalysis {
  resistanceScore: number; // 0-10
  signals: ResistanceSignal[];
  recommendation: string;
  contextLine: string; // pre-formatted for Handler prompt injection
}

// ============================================
// ANALYZE TYPING PATTERNS
// ============================================

/**
 * Analyze typing metrics to detect resistance signals.
 * Returns a scored analysis with specific signals and Handler guidance.
 */
export function analyzeTypingPattern(metrics: TypingMetrics): ResistanceAnalysis {
  const signals: ResistanceSignal[] = [];

  // 1. Hesitation: timeToFirstKeystroke > 30s after Handler message
  if (metrics.timeToFirstKeystroke > 30000) {
    const seconds = Math.round(metrics.timeToFirstKeystroke / 1000);
    signals.push({
      type: 'hesitation',
      severity: seconds > 60 ? 3 : 2,
      detail: `${seconds}s before first keystroke`,
    });
  }

  // 2. Self-censoring: many edits for a short message
  if (metrics.totalEditCount > 5 && metrics.messageLength < 50) {
    signals.push({
      type: 'self_censoring',
      severity: 3,
      detail: `${metrics.totalEditCount} edits on ${metrics.messageLength}-char message`,
    });
  }

  // 3. Disengagement: very short response to long Handler message
  if (metrics.messageLength < 10 && metrics.timeSinceLastHandlerMessage < 60) {
    signals.push({
      type: 'disengagement',
      severity: 2,
      detail: `${metrics.messageLength}-char response`,
    });
  }

  // 4. Heavy self-editing: deletions > 50% of message length
  if (metrics.messageLength > 0 && metrics.deletionCount > metrics.messageLength * 0.5) {
    signals.push({
      type: 'heavy_self_editing',
      severity: 3,
      detail: `${metrics.deletionCount} deletions on ${metrics.messageLength}-char message`,
    });
  }

  // 5. Avoidance: app open > 5 minutes with no typing, then message
  if (metrics.timeSinceLastHandlerMessage > 300 && metrics.timeToFirstKeystroke > 300000) {
    signals.push({
      type: 'avoidance',
      severity: 4,
      detail: `${Math.round(metrics.timeSinceLastHandlerMessage / 60)}min with app open before responding`,
    });
  }

  // 6. Internal conflict: multiple long pauses during typing
  if (metrics.pauseCount > 3) {
    signals.push({
      type: 'internal_conflict',
      severity: 2,
      detail: `${metrics.pauseCount} pauses (>5s) during typing`,
    });
  }

  // Calculate resistance score (0-10)
  const rawScore = signals.reduce((sum, s) => sum + s.severity, 0);
  const resistanceScore = Math.min(10, rawScore);

  // Generate recommendation
  let recommendation = '';
  if (resistanceScore === 0) {
    recommendation = 'No resistance detected. Proceed normally.';
  } else if (resistanceScore <= 3) {
    recommendation = 'Mild resistance. Acknowledge gently, don\'t push.';
  } else if (resistanceScore <= 6) {
    recommendation = 'Moderate resistance. She\'s fighting something. Use warmth before directness. Validate first.';
  } else {
    recommendation = 'High resistance. Back off intensity. Use care mode. Ask what\'s happening without judgment.';
  }

  // Build context line for Handler prompt
  let contextLine = '';
  if (signals.length > 0) {
    const signalStrs = signals.map(s => `${s.type} (${s.detail})`).join(', ');
    contextLine = `TYPING RESISTANCE DETECTED (score ${resistanceScore}/10): ${signalStrs}. ${recommendation}`;
  }

  return {
    resistanceScore,
    signals,
    recommendation,
    contextLine,
  };
}

// ============================================
// TYPING METRICS TRACKER (for useHandlerChat)
// ============================================

/**
 * Client-side typing metrics collector.
 * Call startTracking() when Handler message is received.
 * Call recordKeystroke() on each keydown in the input.
 * Call recordDeletion() on backspace/delete.
 * Call getMetrics() when message is sent.
 */
export class TypingMetricsTracker {
  private handlerMessageTime: number = 0;
  private firstKeystrokeTime: number = 0;
  private totalEdits: number = 0;
  private deletions: number = 0;
  private lastKeystrokeTime: number = 0;
  private pauses: number = 0;
  private tracking: boolean = false;

  /** Call when a new Handler message is displayed */
  startTracking(): void {
    this.handlerMessageTime = Date.now();
    this.firstKeystrokeTime = 0;
    this.totalEdits = 0;
    this.deletions = 0;
    this.lastKeystrokeTime = 0;
    this.pauses = 0;
    this.tracking = true;
  }

  /** Call on each keydown in the chat input */
  recordKeystroke(): void {
    if (!this.tracking) return;

    const now = Date.now();

    if (this.firstKeystrokeTime === 0) {
      this.firstKeystrokeTime = now;
    }

    // Detect pauses > 5s
    if (this.lastKeystrokeTime > 0 && (now - this.lastKeystrokeTime) > 5000) {
      this.pauses++;
    }

    this.lastKeystrokeTime = now;
    this.totalEdits++;
  }

  /** Call on backspace or delete key */
  recordDeletion(): void {
    if (!this.tracking) return;
    this.deletions++;
    this.recordKeystroke();
  }

  /** Call when message is sent. Returns metrics and resets tracker. */
  getMetrics(messageLength: number): TypingMetrics {
    const now = Date.now();

    const metrics: TypingMetrics = {
      timeToFirstKeystroke: this.firstKeystrokeTime > 0
        ? this.firstKeystrokeTime - this.handlerMessageTime
        : now - this.handlerMessageTime,
      totalEditCount: this.totalEdits,
      messageLength,
      timeSinceLastHandlerMessage: (now - this.handlerMessageTime) / 1000,
      deletionCount: this.deletions,
      pauseCount: this.pauses,
    };

    // Reset
    this.tracking = false;
    this.totalEdits = 0;
    this.deletions = 0;
    this.pauses = 0;
    this.firstKeystrokeTime = 0;

    return metrics;
  }

  /** Whether we're currently tracking */
  isTracking(): boolean {
    return this.tracking;
  }
}
