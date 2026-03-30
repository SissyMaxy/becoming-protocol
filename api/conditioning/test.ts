import type { VercelRequest, VercelResponse } from '@vercel/node';

// Temporary test endpoint — DELETE after verifying ElevenLabs works
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
    return res.status(200).json({
      elevenlabs: false,
      hasKey: !!process.env.ELEVENLABS_API_KEY,
      hasVoice: !!process.env.ELEVENLABS_VOICE_ID,
    });
  }

  // Quick TTS test — just one sentence
  try {
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: 'Good girl. You are exactly where you need to be.',
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.75, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
        }),
      }
    );

    if (!ttsRes.ok) {
      const err = await ttsRes.text();
      return res.status(200).json({ elevenlabs: false, status: ttsRes.status, error: err });
    }

    const audioBytes = (await ttsRes.arrayBuffer()).byteLength;
    return res.status(200).json({
      elevenlabs: true,
      voiceId: process.env.ELEVENLABS_VOICE_ID,
      audioBytes,
      message: 'ElevenLabs TTS working. Audio generated successfully.',
    });
  } catch (err: any) {
    return res.status(200).json({ elevenlabs: false, error: err.message });
  }
}
