import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { sessionsRouter } from './routes/sessions.js';
import { coachRouter } from './routes/coach.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api/sessions', sessionsRouter);
app.use('/api/coach', coachRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Only listen when run directly (not when imported for testing)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Vox Femina server listening on port ${PORT}`);
  });
}

export { app };
