import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import path from 'path';

export const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

export const PROFILE_DIR = path.join(__dirname, '.browser-profiles');

export const PLATFORMS = {
  twitter: {
    enabled: process.env.ENABLE_TWITTER === 'true',
    url: 'https://x.com',
    profileDir: path.join(PROFILE_DIR, 'twitter'),
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
};

export const POLL_INTERVAL_MS = (parseInt(process.env.POLL_INTERVAL_MINUTES || '15') || 15) * 60 * 1000;
