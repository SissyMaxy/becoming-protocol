// Handler API dispatcher.
//
// Consolidates three formerly-separate Vercel functions into a single
// dynamic-route function so the project stays under the Hobby plan's
// 12-function cap. URLs are preserved exactly via the [action] segment:
//
//   POST /api/handler/chat                — conversational reply
//   POST /api/handler/analyze-photo       — vision pass on uploaded photo
//   POST /api/handler/meta-frame-reveal   — safety surface (truth diff)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleChat } from './_lib/chat-action.js';
import { handleAnalyzePhoto } from './_lib/analyze-photo-action.js';
import { handleMetaFrameReveal } from './_lib/meta-frame-reveal-action.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = (req.query.action as string) || '';
  switch (action) {
    case 'chat':
      return handleChat(req, res);
    case 'analyze-photo':
      return handleAnalyzePhoto(req, res);
    case 'meta-frame-reveal':
      return handleMetaFrameReveal(req, res);
    default:
      return res.status(404).json({ error: `Unknown action: ${action}` });
  }
}
