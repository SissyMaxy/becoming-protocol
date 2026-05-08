// Voice API dispatcher.
//
// Consolidates two formerly-separate Vercel functions into a single
// dynamic-route function so the project stays under the Hobby plan's
// 12-function cap.
//
//   POST /api/voice/transcribe        — Whisper transcription (raw audio body)
//   POST /api/voice/refresh-profile   — daily cron, refreshes voice profiles
//
// bodyParser: false because /transcribe needs the raw audio stream.
// /refresh-profile reads no body so it's unaffected.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleTranscribe } from './_lib/transcribe-action.js';
import { handleRefreshProfile } from './_lib/refresh-profile-action.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = (req.query.action as string) || '';
  switch (action) {
    case 'transcribe':
      return handleTranscribe(req, res);
    case 'refresh-profile':
      return handleRefreshProfile(req, res);
    default:
      return res.status(404).json({ error: `Unknown action: ${action}` });
  }
}
