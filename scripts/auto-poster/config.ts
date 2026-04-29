import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import path from 'path';

export const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { db: { schema: 'public' }, global: { headers: {} } },
);

export const PROFILE_DIR = path.join(__dirname, '.browser-profiles');

// Twitter has granular sub-engine flags so a fresh account can be eased on
// gradually. Default-OFF for everything except calendar posts when enabled
// at the platform level. The previous @Soft_Maxy account was banned for
// "inauthentic activity" — running every engine at once is what caused that.
const twitterEnabled = process.env.ENABLE_TWITTER === 'true';
const tw = (key: string, def = false) => {
  const v = process.env[key];
  if (v === undefined || v === '') return def;
  return v === 'true';
};

export const PLATFORMS = {
  twitter: {
    enabled: twitterEnabled,
    url: 'https://x.com',
    profileDir: path.join(PROFILE_DIR, 'twitter'),
    // Per-engine flags. All default OFF except calendar posts.
    // Order of recommended ramp-up after a fresh-account 30-day warm-up:
    //   1. ENABLE_TWITTER_POSTS (calendar) — first
    //   2. ENABLE_TWITTER_VOICE_LEARN — anytime, read-only
    //   3. ENABLE_TWITTER_REPLIES — only after 60+ days clean
    //   4. ENABLE_TWITTER_QT, ENABLE_TWITTER_FOLLOWS — last, optional
    //   5. ENABLE_TWITTER_DM_OUTREACH — never re-enable; this is what burned @Soft_Maxy
    engines: {
      posts: twitterEnabled && tw('ENABLE_TWITTER_POSTS', true),
      voiceLearn: twitterEnabled && tw('ENABLE_TWITTER_VOICE_LEARN', true),
      replies: twitterEnabled && tw('ENABLE_TWITTER_REPLIES', false),
      quoteTweets: twitterEnabled && tw('ENABLE_TWITTER_QT', false),
      follows: twitterEnabled && tw('ENABLE_TWITTER_FOLLOWS', false),
      dmOutreach: twitterEnabled && tw('ENABLE_TWITTER_DM_OUTREACH', false),
      dmReader: twitterEnabled && tw('ENABLE_TWITTER_DM_READER', false),
    },
  },
  reddit: {
    enabled: process.env.ENABLE_REDDIT === 'true',
    url: 'https://www.reddit.com',
    profileDir: path.join(PROFILE_DIR, 'reddit'),
    subreddit: process.env.REDDIT_SUBREDDIT || '',
  },
  fansly: {
    enabled: process.env.ENABLE_FANSLY === 'true',
    url: 'https://fansly.com',
    profileDir: path.join(PROFILE_DIR, 'fansly'),
  },
  onlyfans: {
    enabled: process.env.ENABLE_ONLYFANS === 'true',
    url: 'https://onlyfans.com',
    profileDir: path.join(PROFILE_DIR, 'onlyfans'),
  },
  chaturbate: {
    enabled: process.env.ENABLE_CHATURBATE === 'true',
    url: 'https://chaturbate.com',
    profileDir: path.join(PROFILE_DIR, 'chaturbate'),
  },
  fetlife: {
    enabled: process.env.ENABLE_FETLIFE === 'true',
    url: 'https://fetlife.com',
    profileDir: path.join(PROFILE_DIR, 'fetlife'),
  },
  sniffies: {
    enabled: process.env.ENABLE_SNIFFIES === 'true',
    url: 'https://sniffies.com',
    profileDir: path.join(PROFILE_DIR, 'sniffies'),
    geolocation: {
      latitude: parseFloat(process.env.GEO_LAT || '43.0495'),
      longitude: parseFloat(process.env.GEO_LON || '-88.0076'),
    },
  },
};

export const POLL_INTERVAL_MS = (parseInt(process.env.POLL_INTERVAL_MINUTES || '15') || 15) * 60 * 1000;
