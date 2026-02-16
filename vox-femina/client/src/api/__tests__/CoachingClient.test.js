import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CoachingClient } from '../CoachingClient';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('CoachingClient', () => {
  let client;

  beforeEach(() => {
    client = new CoachingClient();
    mockFetch.mockReset();
  });

  describe('initial state', () => {
    it('should have empty history', () => {
      expect(client.getHistory()).toEqual([]);
    });

    it('should have null metrics', () => {
      expect(client.getMetrics()).toBeNull();
    });
  });

  describe('setMetrics', () => {
    it('should store metrics retrievable via getMetrics()', () => {
      const metrics = {
        averagePitch: 195,
        pitchRange: { min: 170, max: 220 },
        resonanceScore: 72,
        sessionDuration: 300,
      };
      client.setMetrics(metrics);
      expect(client.getMetrics()).toBe(metrics);
    });

    it('should overwrite previously set metrics', () => {
      client.setMetrics({ averagePitch: 180 });
      const updated = { averagePitch: 210, resonanceScore: 85 };
      client.setMetrics(updated);
      expect(client.getMetrics()).toBe(updated);
    });
  });

  describe('sendMessage — success', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ role: 'assistant', content: 'Great work!' }),
      });
    });

    it('should call fetch with correct URL, method, and body', async () => {
      await client.sendMessage('How is my pitch?');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/coach');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual({ 'Content-Type': 'application/json' });

      const body = JSON.parse(options.body);
      expect(body.message).toBe('How is my pitch?');
      expect(body.metrics).toBeNull();
      expect(body.history).toEqual([]);
    });

    it('should append user and assistant messages to history', async () => {
      await client.sendMessage('How is my pitch?');

      const history = client.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual({ role: 'user', content: 'How is my pitch?' });
      expect(history[1]).toEqual({ role: 'assistant', content: 'Great work!' });
    });

    it('should return the assistant response text', async () => {
      const result = await client.sendMessage('How is my pitch?');
      expect(result).toBe('Great work!');
    });
  });

  describe('sendMessage — includes metrics', () => {
    it('should include current metrics in the request body', async () => {
      const metrics = { averagePitch: 210, resonanceScore: 78 };
      client.setMetrics(metrics);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ role: 'assistant', content: 'Your pitch is improving!' }),
      });

      await client.sendMessage('Am I improving?');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.metrics).toEqual(metrics);
    });
  });

  describe('sendMessage — includes history', () => {
    it('should send existing history with the request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ role: 'assistant', content: 'Response 1' }),
      });
      await client.sendMessage('First message');

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ role: 'assistant', content: 'Response 2' }),
      });
      await client.sendMessage('Second message');

      const secondCallBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(secondCallBody.history).toEqual([
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'Response 1' },
      ]);
    });
  });

  describe('sendMessage — accumulates history', () => {
    it('should build up history across multiple messages', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ role: 'assistant', content: 'Reply 1' }),
      });
      await client.sendMessage('Message 1');

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ role: 'assistant', content: 'Reply 2' }),
      });
      await client.sendMessage('Message 2');

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ role: 'assistant', content: 'Reply 3' }),
      });
      await client.sendMessage('Message 3');

      const history = client.getHistory();
      expect(history).toHaveLength(6);
      expect(history[0]).toEqual({ role: 'user', content: 'Message 1' });
      expect(history[1]).toEqual({ role: 'assistant', content: 'Reply 1' });
      expect(history[2]).toEqual({ role: 'user', content: 'Message 2' });
      expect(history[3]).toEqual({ role: 'assistant', content: 'Reply 2' });
      expect(history[4]).toEqual({ role: 'user', content: 'Message 3' });
      expect(history[5]).toEqual({ role: 'assistant', content: 'Reply 3' });
    });
  });

  describe('sendMessage — network error', () => {
    it('should throw a friendly connection error when fetch rejects', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(client.sendMessage('Hello')).rejects.toThrow(
        'Unable to connect to coaching server. Please check that the server is running.'
      );
    });

    it('should not modify history on network error', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      try {
        await client.sendMessage('Hello');
      } catch (_e) {
        // expected
      }

      expect(client.getHistory()).toEqual([]);
    });
  });

  describe('sendMessage — API key error', () => {
    it('should throw a specific API key message when error contains "API key"', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'ANTHROPIC_API_KEY not configured' }),
      });

      await expect(client.sendMessage('Help me')).rejects.toThrow(
        'AI coaching is not configured. Please add your Anthropic API key to the server.'
      );
    });

    it('should not modify history on API key error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Missing API key' }),
      });

      try {
        await client.sendMessage('Help me');
      } catch (_e) {
        // expected
      }

      expect(client.getHistory()).toEqual([]);
    });
  });

  describe('sendMessage — rate limit', () => {
    it('should throw a rate limit message on 429 status', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: 'Too many requests' }),
      });

      await expect(client.sendMessage('Quick question')).rejects.toThrow(
        'Rate limit reached. Please wait a moment and try again.'
      );
    });

    it('should not modify history on rate limit error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: 'Too many requests' }),
      });

      try {
        await client.sendMessage('Quick question');
      } catch (_e) {
        // expected
      }

      expect(client.getHistory()).toEqual([]);
    });
  });

  describe('sendMessage — generic server error', () => {
    it('should pass through the server error message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
      });

      await expect(client.sendMessage('Hello')).rejects.toThrow(
        'Internal server error'
      );
    });

    it('should fall back to default message when error field is empty', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      await expect(client.sendMessage('Hello')).rejects.toThrow(
        'Failed to get coaching response'
      );
    });
  });

  describe('clearHistory', () => {
    it('should reset history to empty array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ role: 'assistant', content: 'Noted.' }),
      });
      await client.sendMessage('Some message');
      expect(client.getHistory()).toHaveLength(2);

      client.clearHistory();
      expect(client.getHistory()).toEqual([]);
    });

    it('should keep metrics intact after clearing history', async () => {
      const metrics = { averagePitch: 200 };
      client.setMetrics(metrics);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ role: 'assistant', content: 'Ok.' }),
      });
      await client.sendMessage('Test');

      client.clearHistory();
      expect(client.getHistory()).toEqual([]);
      expect(client.getMetrics()).toBe(metrics);
    });
  });

  describe('getHistory', () => {
    it('should return the current history array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ role: 'assistant', content: 'Hi!' }),
      });
      await client.sendMessage('Hello');

      const history = client.getHistory();
      expect(Array.isArray(history)).toBe(true);
      expect(history).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
      ]);
    });

    it('should return the same array reference as the internal history', () => {
      const history = client.getHistory();
      expect(history).toBe(client.history);
    });
  });
});
