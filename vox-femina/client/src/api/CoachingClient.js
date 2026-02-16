/**
 * CoachingClient — communicates with the server's /api/coach endpoint
 * to provide AI-powered voice coaching feedback.
 */
export class CoachingClient {
  constructor() {
    /** @type {Array<{role: 'user'|'assistant', content: string}>} */
    this.history = [];
    /** @type {object|null} */
    this._currentMetrics = null;
  }

  /**
   * Store the current session metrics (SessionSummary object) for context.
   * @param {object} metrics
   */
  setMetrics(metrics) {
    this._currentMetrics = metrics;
  }

  /**
   * Send a message to the AI coach and receive a response.
   * @param {string} message
   * @returns {Promise<string>} The assistant's response text.
   */
  async sendMessage(message) {
    let response;
    try {
      response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metrics: this._currentMetrics,
          message,
          history: this.history,
        }),
      });
    } catch (_err) {
      throw new Error(
        'Unable to connect to coaching server. Please check that the server is running.'
      );
    }

    if (!response.ok) {
      const errorData = await response.json();
      if (errorData.error && /api[_ ]key/i.test(errorData.error)) {
        throw new Error(
          'AI coaching is not configured. Please add your Anthropic API key to the server.'
        );
      }
      if (response.status === 429) {
        throw new Error(
          'Rate limit reached. Please wait a moment and try again.'
        );
      }
      throw new Error(errorData.error || 'Failed to get coaching response');
    }

    const data = await response.json();
    this.history.push({ role: 'user', content: message });
    this.history.push({ role: 'assistant', content: data.content });
    return data.content;
  }

  /**
   * Reset conversation history to empty. Keeps _currentMetrics intact.
   */
  clearHistory() {
    this.history = [];
  }

  /**
   * Return the conversation history array.
   * @returns {Array<{role: 'user'|'assistant', content: string}>}
   */
  getHistory() {
    return this.history;
  }

  /**
   * Return the current session metrics.
   * @returns {object|null}
   */
  getMetrics() {
    return this._currentMetrics;
  }
}
