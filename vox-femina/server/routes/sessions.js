import { Router } from 'express';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data');
const DATA_FILE = join(DATA_DIR, 'sessions.json');

export const sessionsRouter = Router();

async function readSessions() {
  try {
    if (!existsSync(DATA_FILE)) return [];
    const raw = await readFile(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeSessions(sessions) {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
  await writeFile(DATA_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
}

// GET /api/sessions — return all sessions, newest first
sessionsRouter.get('/', async (_req, res) => {
  const sessions = await readSessions();
  sessions.sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt));
  res.json(sessions);
});

// GET /api/sessions/:id — return single session
sessionsRouter.get('/:id', async (req, res) => {
  const sessions = await readSessions();
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(session);
});

// POST /api/sessions — save a new session
sessionsRouter.post('/', async (req, res) => {
  const session = req.body;
  if (!session || !session.id) {
    return res.status(400).json({ error: 'Session must have an id' });
  }
  const sessions = await readSessions();
  sessions.push(session);
  await writeSessions(sessions);
  res.status(201).json(session);
});

// DELETE /api/sessions — clear all history
sessionsRouter.delete('/', async (_req, res) => {
  await writeSessions([]);
  res.json({ cleared: true });
});
