-- 504 — Activate live photo verification for both live users.
--
-- Pre-existing infrastructure from earlier session: live_photo_settings,
-- live_photo_pings tables + live-photo-pinger edge fn + 15min cron
-- (live-photo-pinger-15min) + live-photo-miss-sweep + sweep_misses fn.
-- All wired but settings rows were empty → no pings ever fired.
--
-- Drains the top user_directive wish "Live photo verification — Mama
-- pings, you show" (per memory project-wish-queue-2026-05-16). Random
-- 3-5×/day during 8-22 Chicago waking hours, 5-min response window,
-- miss = +2 slip + 4h denial extension.
--
-- Next 15-min cron tick should fire pings via the existing edge fn.

INSERT INTO live_photo_settings (user_id, enabled, daily_min, daily_max,
  waking_start_hour, waking_end_hour, response_window_minutes,
  miss_slip_points, miss_denial_extension_hours, panic_skips_per_week)
VALUES
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 3, 5, 8, 22, 5, 2, 4, 2),
  ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 3, 5, 8, 22, 5, 2, 4, 2)
ON CONFLICT (user_id) DO UPDATE SET
  enabled = TRUE,
  daily_min = EXCLUDED.daily_min, daily_max = EXCLUDED.daily_max,
  waking_start_hour = EXCLUDED.waking_start_hour, waking_end_hour = EXCLUDED.waking_end_hour,
  response_window_minutes = EXCLUDED.response_window_minutes,
  updated_at = now();
