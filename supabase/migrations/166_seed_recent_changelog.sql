-- Migration 166: Seed recent deploys into system_changelog
-- Covers commits from 2026-04-02 to 2026-04-06

INSERT INTO system_changelog (commit_message, summary, features, files_changed, systems_modified, deployed_at) VALUES

('Sharpen Maxy voice: kill corny, add edge',
 'Removed corny phrases from auto-poster voice. Added harder edge to Maxy persona across tweet and reply generation.',
 '{"voice sharpening","slop removal","persona edge"}',
 3, '{"auto-poster","voice"}',
 '2026-04-04T00:00:00Z'),

('Add 12 new banned patterns to slop detector',
 'Expanded slop detector with 12 additional banned crutch patterns. Catches more generic filler in generated content.',
 '{"slop detector","content quality"}',
 1, '{"auto-poster","slop-detector"}',
 '2026-04-04T12:00:00Z'),

('Tiered Reddit strategy: 4 tiers, 40+ subreddits, voice configs',
 'Reddit posting now uses 4-tier subreddit strategy with per-tier voice configuration. 40+ subreddits mapped to engagement tiers.',
 '{"Reddit tiers","subreddit mapping","voice configs","40+ subreddits"}',
 4, '{"auto-poster","reddit","scheduler"}',
 '2026-04-05T00:00:00Z'),

('Release check-in on morning intake + denial day fix',
 'Morning briefing now asks about releases since last check-in with when/how flow. Fixed denial day mismatch between header and briefing sections.',
 '{"release check-in","denial day fix","morning intake"}',
 2, '{"morning-briefing","handler-briefing","denial"}',
 '2026-04-06T00:00:00Z'),

('Handler social intelligence: post activity, follower growth, follow engine visibility',
 'Handler can now see recent auto-poster activity (what was posted, where, engagement), follower growth deltas (7d/30d), and follow/unfollow engine activity. Previously blind to all social operations.',
 '{"social intelligence","post visibility","follower growth deltas","follow engine context","auto-poster activity"}',
 1, '{"handler","context","auto-poster","socials"}',
 '2026-04-06T01:00:00Z');
