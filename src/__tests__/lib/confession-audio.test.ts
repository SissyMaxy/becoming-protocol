// Audio confession contract tests.
//
// These cover the bits we can exercise without spinning up Whisper or
// Supabase: the storage-path layout (must match the audio-bucket RLS
// policy from migration 301), the signed-URL helper's path detection,
// and the push-payload sanitizer's audio-link rules.
//
// Recall-pipeline behavior is integration-tested separately when we
// touch the edge-fn harness; the rules baked in here are:
//   1. Audio confessions live at audio/confessions/<user_id>/<id>.<ext>
//   2. The audio bucket SELECT policy requires foldername[2] = uid()
//   3. Push payloads never carry signed URLs to private storage
//   4. Distortion never touches the audio quote text in the recall fn

import { describe, it, expect } from 'vitest';
import { stripPublicUrlPrefix } from '../../lib/storage/signed-url';
import { neutralizePayload } from '../../lib/stealth/notifications';

const SAMPLE_USER = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f';
const SAMPLE_CONFESSION = 'd5b9f1a2-5c3a-4e98-9abc-1234567890ab';

describe('audio storage path contract', () => {
  it('matches the audio bucket RLS policy (foldername[2] = uid)', () => {
    // The confession-upload action writes to this exact path. Mig 301
    // policy:  (foldername(name))[2] = auth.uid()::text  for `audio` bucket.
    // foldername('confessions/<uid>/<id>.webm') = ['confessions', '<uid>']
    const path = `confessions/${SAMPLE_USER}/${SAMPLE_CONFESSION}.webm`;
    const parts = path.split('/');
    expect(parts.length).toBeGreaterThanOrEqual(3);
    expect(parts[1]).toBe(SAMPLE_USER); // foldername[2] in 1-indexed pg semantics = parts[1] here
  });

  it('signed-url helper strips legacy public-URL prefix to a bucket-relative path', () => {
    const legacy = `https://atevwvexapiykchvqvhm.supabase.co/storage/v1/object/public/audio/confessions/${SAMPLE_USER}/${SAMPLE_CONFESSION}.webm`;
    const stripped = stripPublicUrlPrefix('audio', legacy);
    expect(stripped).toBe(`confessions/${SAMPLE_USER}/${SAMPLE_CONFESSION}.webm`);
  });

  it('signed-url helper passes a bucket-relative path through unchanged', () => {
    const path = `confessions/${SAMPLE_USER}/${SAMPLE_CONFESSION}.webm`;
    expect(stripPublicUrlPrefix('audio', path)).toBe(path);
  });
});

describe('audio recall push hardening', () => {
  it('signed-URL leak in the body is stripped in plain mode', () => {
    const body = `listen to yourself say it baby https://atevwvexapiykchvqvhm.supabase.co/storage/v1/object/sign/audio/confessions/${SAMPLE_USER}/${SAMPLE_CONFESSION}.webm?token=abc — press play`;
    const out = neutralizePayload({ title: 'Mama', body, data: {} }, false);
    expect(out.body).not.toMatch(/storage\/v1\/object/);
    expect(out.body).not.toMatch(/\.webm/);
    expect(out.body).toContain('listen to yourself say it');
  });

  it('audio_url in data is dropped in plain mode but the recall_confession_id UUID survives', () => {
    const out = neutralizePayload({
      title: 'Mama', body: 'listen to yourself',
      data: {
        notification_id: 'n1',
        audio_url: `https://x/storage/v1/object/sign/audio/confessions/${SAMPLE_USER}/${SAMPLE_CONFESSION}.webm`,
        recall_confession_id: SAMPLE_CONFESSION,
      },
    }, false);
    expect(out.data.audio_url).toBeUndefined();
    expect(out.data.recall_confession_id).toBe(SAMPLE_CONFESSION);
    expect(out.data.notification_id).toBe('n1');
  });

  it('stealth still wins — title+body neutralized, audio_url stripped from data even with stealth on', () => {
    const out = neutralizePayload({
      title: 'Listen to yourself say it baby',
      body: `audio/confessions/${SAMPLE_USER}/${SAMPLE_CONFESSION}.webm`,
      data: {
        notification_id: 'n1',
        audio_url: `https://x/storage/v1/object/sign/audio/confessions/${SAMPLE_USER}/${SAMPLE_CONFESSION}.webm`,
      },
    }, true);
    const wire = JSON.stringify(out);
    expect(wire).not.toMatch(/listen|webm|confessions|storage/i);
    expect(out.data.notification_id).toBe('n1');
  });
});
