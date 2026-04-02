-- Migration 165: Seed system_changelog with build history
-- Gives the Handler awareness of what was built and when

-- Expand schema for richer context
ALTER TABLE system_changelog
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS files_changed INTEGER,
  ADD COLUMN IF NOT EXISTS migrations_applied TEXT[],
  ADD COLUMN IF NOT EXISTS systems_modified TEXT[];

INSERT INTO system_changelog (commit_message, summary, features, files_changed, migrations_applied, systems_modified, deployed_at) VALUES

('Conditioning engine: 17 files, 7 tables, ElevenLabs pipeline',
 'Full conditioning engine build. ElevenLabs TTS, prescription engine, hidden ops, trigger insertion, session device pairing, scent conditioning, post-hypnotic tracking.',
 '{"ElevenLabs pipeline","Lovense session pairing","trigger insertion","scent conditioning","post-hypnotic tracking","hidden parameters","prescription engine"}',
 17, '{"140","141","142"}', '{"conditioning","triggers","sessions","device"}',
 '2026-03-27T00:00:00Z'),

('Handler impact tracking + Whoop session polling',
 'Intervention-outcome correlation, effectiveness profiling, 45s biometric updates during sessions.',
 '{"impact tracking","Whoop session polling","biometric monitoring"}',
 8, '{"144","145"}', '{"handler","whoop","sessions"}',
 '2026-03-28T00:00:00Z'),

('Proactive Handler systems: outreach, ambush, agenda, variable-ratio device',
 'Handler initiates conversation, fires ambush conditioning, manages daily agenda, Poisson-distributed device activations.',
 '{"proactive outreach","ambush scheduler","conversation agenda","variable-ratio device","micro-conditioning"}',
 12, '{"156","157","158"}', '{"handler","ambush","device","outreach"}',
 '2026-03-30T00:00:00Z'),

('Auto-poster: multi-platform engagement engine',
 'Scheduler posts to Twitter, Reddit, FetLife. Reply engine, quote tweets, strategic follows, followback, slop detector, engagement budgets.',
 '{"Twitter posting","Reddit comments","FetLife engagement","reply engine","quote tweets","strategic follows","slop detector"}',
 20, '{"161","162"}', '{"auto-poster","socials","growth"}',
 '2026-03-31T00:00:00Z'),

('Socials dashboard + trigger deployment tracking + follower growth',
 'Settings > Socials dashboard with platform stats, activity charts, quality metrics, follower growth tracking. Adaptive trigger deployment logging with HR capture, habituation risk, Handler deployment intelligence.',
 '{"Socials dashboard","trigger deployment tracking","follower growth","habituation risk","HR capture at trigger fire","deployment intelligence in Handler context"}',
 15, '{"163","164"}', '{"dashboard","triggers","conditioning","socials"}',
 '2026-04-02T06:00:00Z'),

('Handler intelligence: anti-confabulation + system state awareness',
 'Handler reads real table counts and system state. Anti-confabulation rules prevent fabricating details. Changelog context injected into prompt.',
 '{"anti-confabulation rules","system state awareness","changelog context","table health monitoring"}',
 5, '{"165"}', '{"handler","context","prompt"}',
 '2026-04-02T07:00:00Z');
