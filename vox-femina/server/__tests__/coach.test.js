import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// --- Mock @anthropic-ai/sdk BEFORE importing the app ---
const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor() {
      this.messages = { create: mockCreate };
    }
  },
}));

// Set up temp data dir and test env before importing the app.
const tempDir = await mkdtemp(join(tmpdir(), 'vox-coach-test-'));
process.env.DATA_DIR = tempDir;
process.env.NODE_ENV = 'test';

const { app } = await import('../index.js');

let server;
let baseUrl;

beforeAll(async () => {
  await new Promise((resolve, reject) => {
    server = app.listen(0, () => {
      const { port } = server.address();
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
    server.on('error', reject);
  });
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await rm(tempDir, { recursive: true, force: true });
});

beforeEach(() => {
  mockCreate.mockReset();
  // Ensure API key is set by default; tests that need it unset will clear it.
  process.env.ANTHROPIC_API_KEY = 'test-key-12345';
});

/** Helper: build a standard mock Anthropic response. */
function makeMockResponse(text) {
  return {
    content: [{ type: 'text', text }],
    role: 'assistant',
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'end_turn',
  };
}

describe('POST /api/coach', () => {
  it('returns coaching response with valid input', async () => {
    mockCreate.mockResolvedValueOnce(makeMockResponse('Great job on your pitch control!'));

    const res = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'How did I do?' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('assistant');
    expect(body.content).toBe('Great job on your pitch control!');
  });

  it('returns 400 if message is missing', async () => {
    const res = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metrics: {} }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/message/i);
  });

  it('returns 500 if ANTHROPIC_API_KEY is not set', async () => {
    const savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      const res = await fetch(`${baseUrl}/api/coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello' }),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toMatch(/ANTHROPIC_API_KEY/i);
    } finally {
      // Restore key for subsequent tests
      process.env.ANTHROPIC_API_KEY = savedKey;
    }
  });

  it('includes metrics context in the API call', async () => {
    mockCreate.mockResolvedValueOnce(makeMockResponse('Your resonance is improving.'));

    const metrics = {
      compositeScore: 78,
      pillarScores: {
        lightness: { avg: 65, min: 50, max: 80 },
        resonance: { avg: 72, min: 60, max: 85 },
      },
      pillarTrends: {
        lightness: 'improving',
      },
      extras: {
        h1h2Avg: 3.2,
        f2Avg: 1800,
        timeInTargetPct: 62,
      },
      durationSeconds: 185,
    };

    const res = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Give me feedback', metrics }),
    });

    expect(res.status).toBe(200);

    // Verify the mock was called and the user content includes metrics info
    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0];
    const lastMessage = callArgs.messages[callArgs.messages.length - 1];
    expect(lastMessage.role).toBe('user');

    // The user content should include the formatted metrics
    expect(lastMessage.content).toContain('[Session Data]');
    expect(lastMessage.content).toContain('Composite Score: 78/100');
    expect(lastMessage.content).toContain('Lightness: avg 65, range 50-80 (trend: improving)');
    expect(lastMessage.content).toContain('Resonance: avg 72, range 60-85');
    expect(lastMessage.content).toContain('H1-H2 Average: 3.2 dB');
    expect(lastMessage.content).toContain('F2 Average: 1800 Hz');
    expect(lastMessage.content).toContain('Time in Target Pitch Range (180-250 Hz): 62%');
    expect(lastMessage.content).toContain('Session Duration: 3m 5s');
    // The original message should also be appended
    expect(lastMessage.content).toContain('Give me feedback');
  });

  it('passes conversation history to the API', async () => {
    mockCreate.mockResolvedValueOnce(makeMockResponse('Building on our last exchange...'));

    const history = [
      { role: 'user', content: 'My first question' },
      { role: 'assistant', content: 'My first answer' },
    ];

    const res = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Follow-up question', history }),
    });

    expect(res.status).toBe(200);

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0];
    const messages = callArgs.messages;

    // History messages + the new user message
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: 'user', content: 'My first question' });
    expect(messages[1]).toEqual({ role: 'assistant', content: 'My first answer' });
    expect(messages[2].role).toBe('user');
    expect(messages[2].content).toContain('Follow-up question');
  });

  it('sends system prompt and correct model to the API', async () => {
    mockCreate.mockResolvedValueOnce(makeMockResponse('Noted.'));

    await fetch(`${baseUrl}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Check params' }),
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0];

    expect(callArgs.model).toBe('claude-sonnet-4-20250514');
    expect(callArgs.max_tokens).toBe(1024);
    // system prompt should be a non-empty string loaded from the prompts file
    expect(typeof callArgs.system).toBe('string');
    expect(callArgs.system.length).toBeGreaterThan(0);
  });

  it('handles Anthropic API errors gracefully (generic error)', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Internal server error'));

    const res = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'This will fail' }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('handles Anthropic 401 auth error', async () => {
    const authError = new Error('Unauthorized');
    authError.status = 401;
    mockCreate.mockRejectedValueOnce(authError);

    const res = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Bad key' }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/invalid/i);
  });

  it('handles Anthropic 429 rate limit error', async () => {
    const rateLimitError = new Error('Rate limited');
    rateLimitError.status = 429;
    mockCreate.mockRejectedValueOnce(rateLimitError);

    const res = await fetch(`${baseUrl}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Too fast' }),
    });

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/rate limit/i);
  });

  it('sends message without metrics prefix when no metrics provided', async () => {
    mockCreate.mockResolvedValueOnce(makeMockResponse('Hello!'));

    await fetch(`${baseUrl}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Just chatting' }),
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0];
    const lastMessage = callArgs.messages[callArgs.messages.length - 1];

    // When no metrics are provided, the content should be the raw message
    // without the [Session Data] prefix
    expect(lastMessage.content).toBe('Just chatting');
    expect(lastMessage.content).not.toContain('[Session Data]');
  });
});
