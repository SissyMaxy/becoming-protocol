import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

// NOTE: these src/lib modules are intentionally Vite-free (no import.meta.env,
// no Supabase client imports). They are safe for Node serverless import.
// If you add anything to them, keep them Vite-free or the function will
// crash at module load on Vercel.
import { decodeWav } from '../../../src/lib/audio/wav.js';
import { analyzeVoice, gradeAttempt, type TargetMetrics } from '../../../src/lib/audio/voice-metrics.js';
import { composeMommyCoaching, scrubCoaching } from '../../../src/lib/voice-coaching/mommy-coach.js';

// Lesson-attempt endpoint.
//
// Flow:
//   1. Auth via Bearer (matches handler/chat + confession-upload).
//   2. Read query: lesson_id (required), climax_gated (optional bool).
//   3. Read raw WAV body (bodyParser is off at the dispatcher). The
//      browser converts MediaRecorder webm → 16kHz mono 16-bit WAV
//      before calling this endpoint. The webm archival blob is
//      uploaded separately at /api/voice/confession-upload pattern.
//   4. Load lesson from voice_lesson_modules.
//   5. Upload WAV to audio bucket at lessons/<user>/<attempt>.wav.
//   6. Decode + analyze + grade.
//   7. Compose Mommy coaching, scrub, insert attempt row.
//   8. Update voice_lesson_progress (passes_count, perfect_count,
//      unlock state). If climax_gated and not passing, clear any
//      release_eligible flag.
//   9. Insert handler_outreach_queue row with the coaching message
//      so it surfaces on Today. The mommy_voice_cleanup trigger does
//      a final scrub at the DB level.
//   10. If pass failed AND climax_gated, log a slip (voice_lesson_skipped
//       is not the right type here — climax-gated failure is its own thing,
//       so we re-use the same row metadata).
//   11. Return graded JSON to the client.

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB — lesson 10 is 5 min
const MAX_DURATION_SEC = 360; // 6 min hard ceiling

interface LessonRow {
  id: string;
  slug: string;
  sequence_number: number;
  technique: string;
  target_metrics: TargetMetrics;
  passing_threshold: number;
  perfect_threshold: number;
  passes_required: number;
  climax_gate_eligible: boolean;
}

interface ProgressRow {
  user_id: string;
  lesson_id: string;
  passes_count: number;
  perfect_count: number;
  attempts_count: number;
  first_pass_at: string | null;
  cleared_at: string | null;
  is_unlocked: boolean;
  climax_gate_active: boolean;
  climax_gate_set_at: string | null;
  release_eligible: boolean;
  release_eligible_at: string | null;
  last_prompted_at: string | null;
  updated_at: string;
}

export async function handleLessonAttempt(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
  const { data: authData, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authErr || !authData.user) return res.status(401).json({ error: 'Invalid token' });
  const userId = authData.user.id;

  // Query params
  const lessonId = (req.query.lesson_id as string) || '';
  const climaxGated = (req.query.climax_gated as string) === '1' || (req.query.climax_gated as string) === 'true';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lessonId)) {
    return res.status(400).json({ error: 'Bad lesson_id' });
  }

  // Load lesson
  const { data: lessonRaw, error: lessonErr } = await supabase
    .from('voice_lesson_modules')
    .select('id, slug, sequence_number, technique, target_metrics, passing_threshold, perfect_threshold, passes_required, climax_gate_eligible')
    .eq('id', lessonId)
    .eq('is_active', true)
    .maybeSingle();
  if (lessonErr || !lessonRaw) return res.status(404).json({ error: 'Lesson not found' });
  const lesson = lessonRaw as LessonRow;

  // Read body
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += b.length;
    if (total > MAX_AUDIO_BYTES) return res.status(413).json({ error: 'Audio too large' });
    chunks.push(b);
  }
  const audio = Buffer.concat(chunks);
  if (audio.length < 100) return res.status(400).json({ error: 'Empty audio body' });

  // Decode WAV — must be the format the browser-side encoder produces.
  let decoded;
  try {
    decoded = decodeWav(new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength));
  } catch (e) {
    return res.status(400).json({ error: `WAV decode failed: ${(e as Error).message}` });
  }
  if (decoded.samples.length / decoded.sampleRate > MAX_DURATION_SEC) {
    return res.status(400).json({ error: 'Audio too long' });
  }

  // Determine which optional analyses to run based on technique
  const skipVowelSpace = lesson.technique !== 'articulation';
  const skipTerminalRise = lesson.technique !== 'prosody';

  // Analyze
  const measured = analyzeVoice(decoded.samples, decoded.sampleRate, { skipVowelSpace, skipTerminalRise });

  // Grade
  const { passingMetricsMet, passingFrameRatio } = gradeAttempt(measured, lesson.target_metrics);
  const passOverall = passingFrameRatio >= lesson.passing_threshold;
  const passPerfect = passingFrameRatio >= lesson.perfect_threshold && passOverall;

  // Allocate attempt id BEFORE upload so the storage path matches
  const attemptId = randomUUID();
  const audioPath = `lessons/${userId}/${attemptId}.wav`;

  const { error: upErr } = await supabase.storage.from('audio').upload(audioPath, audio, {
    contentType: 'audio/wav',
    upsert: true,
  });
  if (upErr) {
    return res.status(500).json({ error: 'Storage upload failed', detail: upErr.message });
  }

  // Find prior attempt count for this user+lesson
  const { count: priorCount } = await supabase
    .from('voice_lesson_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('lesson_id', lessonId);
  const attemptNumber = (priorCount ?? 0) + 1;

  // Compose coaching (and pre-scrub before DB)
  const composed = composeMommyCoaching({
    technique: lesson.technique as Parameters<typeof composeMommyCoaching>[0]['technique'],
    measured,
    passingMetricsMet,
    passOverall,
    passPerfect,
    attemptNumber,
  });
  const coaching = scrubCoaching(composed);

  // Strip the bulky framePitchHz / frameF1Hz / frameF2Hz arrays from the
  // jsonb before persisting. Keep them only in generation_meta if useful
  // for downstream analytics — but the row stays manageable.
  const persistedMeasured = {
    pitchMeanHz: measured.pitchMeanHz,
    pitchMedianHz: measured.pitchMedianHz,
    pitchStdHz: measured.pitchStdHz,
    pitchMinHz: measured.pitchMinHz,
    pitchMaxHz: measured.pitchMaxHz,
    f1MeanHz: measured.f1MeanHz,
    f2MeanHz: measured.f2MeanHz,
    f3MeanHz: measured.f3MeanHz,
    jitterPct: measured.jitterPct,
    shimmerPct: measured.shimmerPct,
    spectralTiltDbPerOct: measured.spectralTiltDbPerOct,
    hfEnergyRatio: measured.hfEnergyRatio,
    vowelSpaceAreaHz2: measured.vowelSpaceAreaHz2,
    terminalRisePct: measured.terminalRisePct,
    voicedFrameRatio: measured.voicedFrameRatio,
    rmsDbfs: measured.rmsDbfs,
    durationSec: measured.durationSec,
    passingFrameRatio,
    analyzerVersion: measured.analyzerVersion,
  };

  // Insert attempt row
  const { error: insErr } = await supabase.from('voice_lesson_attempts').insert({
    id: attemptId,
    user_id: userId,
    lesson_id: lessonId,
    attempt_number: attemptNumber,
    audio_storage_path: audioPath,
    analysis_storage_path: audioPath,
    audio_duration_sec: measured.durationSec,
    measured_metrics: persistedMeasured,
    passing_metrics_met: passingMetricsMet,
    pass_overall: passOverall,
    pass_perfect: passPerfect,
    mommy_coaching_feedback: coaching,
    climax_gated: climaxGated && lesson.climax_gate_eligible,
    generation_meta: {
      analyzer_version: measured.analyzerVersion,
      passing_threshold: lesson.passing_threshold,
      perfect_threshold: lesson.perfect_threshold,
      passing_frame_ratio: passingFrameRatio,
      source: 'server_canonical',
    },
  });
  if (insErr) {
    return res.status(500).json({ error: 'Attempt insert failed', detail: insErr.message });
  }

  // Update progress (upsert)
  const { data: existingProg } = await supabase
    .from('voice_lesson_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .maybeSingle();

  const prev = (existingProg as ProgressRow | null) ?? null;
  const passesCount = (prev?.passes_count ?? 0) + (passOverall ? 1 : 0);
  const perfectCount = (prev?.perfect_count ?? 0) + (passPerfect ? 1 : 0);
  const attemptsCount = (prev?.attempts_count ?? 0) + 1;
  const requiresPerfect = lesson.sequence_number >= 3;
  const isUnlocked =
    passesCount >= lesson.passes_required && (!requiresPerfect || perfectCount >= 1);

  const climaxNowActive = climaxGated && lesson.climax_gate_eligible
    ? true
    : (prev?.climax_gate_active ?? false);
  let releaseEligible = prev?.release_eligible ?? false;
  let releaseAt: string | null = prev?.release_eligible_at ?? null;
  if (climaxNowActive) {
    if (passOverall) {
      releaseEligible = true;
      releaseAt = new Date().toISOString();
    } else {
      // Climax-gated failure invalidates any in-progress release immediately
      releaseEligible = false;
      releaseAt = null;
    }
  }

  await supabase.from('voice_lesson_progress').upsert({
    user_id: userId,
    lesson_id: lessonId,
    passes_count: passesCount,
    perfect_count: perfectCount,
    attempts_count: attemptsCount,
    first_pass_at: prev?.first_pass_at ?? (passOverall ? new Date().toISOString() : null),
    cleared_at: isUnlocked ? (prev?.cleared_at ?? new Date().toISOString()) : prev?.cleared_at ?? null,
    is_unlocked: isUnlocked,
    climax_gate_active: climaxNowActive,
    climax_gate_set_at: prev?.climax_gate_set_at ?? (climaxNowActive ? new Date().toISOString() : null),
    release_eligible: releaseEligible,
    release_eligible_at: releaseAt,
    last_prompted_at: prev?.last_prompted_at ?? null,
    updated_at: new Date().toISOString(),
  });

  // Surface the coaching on Today via outreach_queue. The
  // mommy_voice_cleanup trigger on this table is the final scrub.
  await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: coaching,
    urgency: passOverall ? 'low' : 'normal',
    status: 'pending',
    scheduled_for: new Date().toISOString(),
    source: 'voice_lesson',
    trigger_reason: `voice_lesson:${lesson.slug}:${passOverall ? 'pass' : 'retry'}`,
    voice_lesson_attempt_id: attemptId,
    voice_lesson_module_id: lessonId,
  });

  // Log a slip if this was a climax-gated attempt that failed — that's
  // a meaningful skipped/missed signal even though the user did record.
  if (climaxGated && lesson.climax_gate_eligible && !passOverall) {
    await supabase.from('slip_log').insert({
      user_id: userId,
      slip_type: 'voice_lesson_skipped',
      slip_points: 2,
      source_text: `climax-gated lesson ${lesson.slug} failed to pass`,
      source_table: 'voice_lesson_attempts',
      source_id: attemptId,
    });
  }

  // Signed URL for client playback
  let audioUrl: string | null = null;
  const { data: signed } = await supabase.storage.from('audio').createSignedUrl(audioPath, 600);
  if (signed?.signedUrl) audioUrl = signed.signedUrl;

  return res.status(200).json({
    ok: true,
    attempt_id: attemptId,
    pass_overall: passOverall,
    pass_perfect: passPerfect,
    passing_frame_ratio: passingFrameRatio,
    passing_metrics_met: passingMetricsMet,
    coaching,
    audio_url: audioUrl,
    progress: {
      passes_count: passesCount,
      perfect_count: perfectCount,
      attempts_count: attemptsCount,
      passes_required: lesson.passes_required,
      requires_perfect: requiresPerfect,
      is_unlocked: isUnlocked,
      release_eligible: releaseEligible,
    },
  });
}
