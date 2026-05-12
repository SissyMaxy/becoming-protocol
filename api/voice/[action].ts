// Voice API dispatcher.
//
// Consolidates voice-related serverless functions into a single
// dynamic-route function so the project stays under the Hobby plan's
// 12-function cap. URLs are preserved exactly via the [action] segment:
//
//   POST /api/voice/transcribe         — Whisper transcription (raw audio body)
//   POST /api/voice/refresh-profile    — daily cron, refreshes voice profiles
//   POST /api/voice/confession-upload  — record + transcribe a confession
//                                        (raw audio body, ?confession_id=)
//   POST /api/voice/lesson-attempt     — graded voice lesson attempt
//                                        (raw 16kHz mono WAV body, ?lesson_id=, ?climax_gated=)
//
// bodyParser: false because /transcribe, /confession-upload, and
// /lesson-attempt need raw audio streams. /refresh-profile reads no body
// so it's unaffected.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleTranscribe } from './_lib/transcribe-action.js';
import { handleRefreshProfile } from './_lib/refresh-profile-action.js';
import { handleConfessionUpload } from './_lib/confession-upload-action.js';
import { handleLessonAttempt } from './_lib/lesson-attempt-action.js';

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
    case 'confession-upload':
      return handleConfessionUpload(req, res);
    case 'lesson-attempt':
      return handleLessonAttempt(req, res);
    default:
      return res.status(404).json({ error: `Unknown action: ${action}` });
  }
}
