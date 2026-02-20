/**
 * Shoot-Poll Bridge — Sprint 6 Item 30
 * Wire audience poll results into shoot prescriptions.
 * When a poll closes, the winning option influences the next shoot.
 */

import { supabase } from '../supabase';
import type {
  AudiencePoll,
  ShootPrescription,
  ShootType,
  DbAudiencePoll,
  DbShootPrescription,
} from '../../types/industry';
import { mapAudiencePoll, mapShootPrescription } from '../../types/industry';

// ============================================
// Poll Result → Shoot Mapping
// ============================================

interface PollShootMapping {
  shootType: ShootType;
  outfit?: string;
  mood?: string;
  handlerNote: string;
}

/**
 * Map a poll's winning option to shoot parameters.
 * Different poll types influence different shoot aspects.
 */
export function mapPollResultToShoot(
  poll: AudiencePoll,
): PollShootMapping | null {
  if (!poll.winningOptionId) return null;

  const winner = poll.options.find(o => o.id === poll.winningOptionId);
  if (!winner) return null;

  const label = winner.label.toLowerCase();

  switch (poll.pollType) {
    case 'outfit_choice':
      return mapOutfitChoice(label, poll);

    case 'content_choice':
      return mapContentChoice(label, poll);

    case 'denial_release':
      return mapDenialRelease(label, poll);

    case 'challenge':
      return mapChallenge(label);

    case 'timer':
      return {
        shootType: 'edge_capture',
        mood: `Timer set by audience: ${label}`,
        handlerNote: `Audience chose timer: ${label}. ${poll.options.length} options, ${winner.votes} votes for winner.`,
      };

    case 'prediction':
      return {
        shootType: 'edge_capture',
        mood: 'prediction_validation',
        handlerNote: `Audience predicted: ${label}. Shoot must validate or invalidate the prediction.`,
      };

    case 'punishment':
      return {
        shootType: 'cage_check',
        mood: 'accountability',
        handlerNote: `Punishment poll result: ${label}. Audience has spoken. Execute.`,
      };

    default:
      return null;
  }
}

function mapOutfitChoice(label: string, poll: AudiencePoll): PollShootMapping {
  // Map common outfit poll options to shoot types
  if (label.includes('cage') || label.includes('just cage')) {
    return {
      shootType: 'cage_check',
      outfit: 'cage only',
      handlerNote: `Audience chose: cage only. ${poll.options.find(o => o.id === poll.winningOptionId)?.votes ?? 0} votes.`,
    };
  }
  if (label.includes('skirt') || label.includes('highs')) {
    return {
      shootType: 'photo_set',
      outfit: label,
      handlerNote: `Audience chose outfit: ${label}. Full photo set.`,
    };
  }
  return {
    shootType: 'outfit_of_day',
    outfit: label,
    handlerNote: `Audience chose outfit: ${label}.`,
  };
}

function mapContentChoice(label: string, _poll: AudiencePoll): PollShootMapping {
  if (label.includes('close-up') || label.includes('cage')) {
    return {
      shootType: 'cage_check',
      handlerNote: `Content choice: ${label}. Audience wants cage content.`,
    };
  }
  if (label.includes('tease') || label.includes('video')) {
    return {
      shootType: 'tease_video',
      handlerNote: `Content choice: ${label}. Audience wants video content.`,
    };
  }
  if (label.includes('full set') || label.includes('photo')) {
    return {
      shootType: 'photo_set',
      handlerNote: `Content choice: ${label}. Full photo set requested.`,
    };
  }
  return {
    shootType: 'photo_set',
    handlerNote: `Content choice: ${label}. Audience-directed.`,
  };
}

function mapDenialRelease(label: string, _poll: AudiencePoll): PollShootMapping {
  // "Handler decides" is the spicy option
  if (label.includes('handler')) {
    return {
      shootType: 'edge_capture',
      mood: 'handler_controlled',
      handlerNote: 'Audience chose "Handler decides." Full Handler authority over the session.',
    };
  }
  // Extension options mean more denial content
  if (label.includes('extend') || label.includes('add') || label.includes('more')) {
    return {
      shootType: 'tease_video',
      mood: 'extended_denial',
      handlerNote: `Audience chose to extend denial: ${label}. Capture the frustration.`,
    };
  }
  // Release means edge capture of the event
  if (label.includes('release') || label.includes('allow') || label.includes('mercy')) {
    return {
      shootType: 'edge_capture',
      mood: 'release_capture',
      handlerNote: `Audience allowed release: ${label}. CAPTURE EVERYTHING.`,
    };
  }
  return {
    shootType: 'edge_capture',
    handlerNote: `Denial poll result: ${label}.`,
  };
}

function mapChallenge(label: string): PollShootMapping {
  if (label.includes('edge')) {
    return {
      shootType: 'edge_capture',
      mood: 'challenge',
      handlerNote: `Challenge accepted: ${label}. Document the attempt.`,
    };
  }
  if (label.includes('wear') || label.includes('gym')) {
    return {
      shootType: 'progress_photo',
      mood: 'challenge',
      handlerNote: `Challenge accepted: ${label}. Photo evidence required.`,
    };
  }
  if (label.includes('face') || label.includes('reveal')) {
    return {
      shootType: 'photo_set',
      mood: 'reveal',
      handlerNote: `Challenge: ${label}. This is a significant escalation.`,
    };
  }
  return {
    shootType: 'photo_set',
    mood: 'challenge',
    handlerNote: `Challenge: ${label}. Audience-directed content.`,
  };
}

// ============================================
// Poll → Prescription Pipeline
// ============================================

/**
 * When a poll closes, create a shoot prescription from the result.
 * Returns the prescription ID if created.
 */
export async function createPrescriptionFromPoll(
  userId: string,
  pollId: string,
): Promise<string | null> {
  // Fetch the closed poll
  const { data: pollRow, error: pollErr } = await supabase
    .from('audience_polls')
    .select('*')
    .eq('user_id', userId)
    .eq('id', pollId)
    .single();

  if (pollErr || !pollRow) return null;

  const poll = mapAudiencePoll(pollRow as DbAudiencePoll);
  if (poll.status !== 'closed' || !poll.winningOptionId) return null;

  const mapping = mapPollResultToShoot(poll);
  if (!mapping) return null;

  // Create prescription
  const { data, error } = await supabase
    .from('shoot_prescriptions')
    .insert({
      user_id: userId,
      title: `Audience-directed: ${poll.question.slice(0, 50)}`,
      shoot_type: mapping.shootType,
      outfit: mapping.outfit ?? 'audience choice',
      mood: mapping.mood ?? null,
      handler_note: mapping.handlerNote,
      estimated_minutes: getEstimatedMinutes(mapping.shootType),
      poll_id: pollId,
      primary_platform: poll.platformsPosted[0] ?? 'reddit',
      secondary_platforms: poll.platformsPosted.slice(1),
      status: 'prescribed',
    })
    .select('id')
    .single();

  if (error || !data) return null;

  // Mark poll result as honored
  await supabase
    .from('audience_polls')
    .update({ result_honored: true })
    .eq('id', pollId);

  return data.id;
}

/**
 * Get recent polls that closed but haven't generated prescriptions.
 */
export async function getUnprocessedPolls(
  userId: string,
): Promise<AudiencePoll[]> {
  const { data, error } = await supabase
    .from('audience_polls')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'closed')
    .is('result_honored', null)
    .not('winning_option_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !data) return [];
  return data.map((r: DbAudiencePoll) => mapAudiencePoll(r));
}

/**
 * Get the active shoot prescription linked to a poll.
 */
export async function getShootForPoll(
  userId: string,
  pollId: string,
): Promise<ShootPrescription | null> {
  const { data, error } = await supabase
    .from('shoot_prescriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('poll_id', pollId)
    .single();

  if (error || !data) return null;
  return mapShootPrescription(data as DbShootPrescription);
}

/**
 * Build context string showing poll→shoot pipeline state.
 */
export async function buildPollBridgeContext(userId: string): Promise<string> {
  try {
    const unprocessed = await getUnprocessedPolls(userId);
    if (unprocessed.length === 0) return '';

    const lines = [`POLL→SHOOT: ${unprocessed.length} closed polls awaiting prescription`];
    for (const poll of unprocessed.slice(0, 3)) {
      const winner = poll.options.find(o => o.id === poll.winningOptionId);
      if (winner) {
        lines.push(`  "${poll.question.slice(0, 40)}" → winner: "${winner.label}" (${winner.votes} votes)`);
      }
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// Helpers
// ============================================

function getEstimatedMinutes(shootType: ShootType): number {
  const estimates: Record<ShootType, number> = {
    photo_set: 15,
    short_video: 10,
    cage_check: 5,
    outfit_of_day: 10,
    toy_showcase: 10,
    tease_video: 15,
    progress_photo: 5,
    edge_capture: 20,
  };
  return estimates[shootType] ?? 10;
}
