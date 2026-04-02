-- Migration 164: Seed hypno content curriculum entries
-- User-provided content for conditioning sessions

INSERT INTO content_curriculum (
  user_id, title, creator, media_type, source_url, category, intensity, tier,
  fantasy_level, duration_minutes, best_denial_range, best_time, session_contexts,
  trigger_phrases
) VALUES
-- 1. Sissy Hookup Hypno
('93327332-7d0d-4888-889a-1607a5776216', 'Sissy Hookup Hypno', 'jyrez3', 'video',
 'https://hypnotube.com/video/sissy-hookup-hypno-4450.html',
 'desire_installation', 5, 3, 4, 20, '{5,14}', '{evening}',
 '{goon,edge,combined}', '{}'),

-- 2. This Is Real - Hypno Tantra Qballs Brainwashing Mashup 4
('93327332-7d0d-4888-889a-1607a5776216', 'This Is Real - Hypno Tantra Qballs Brainwashing Mashup 4', NULL, 'video',
 'https://hypnotube.com/video/this-is-real-hypno-tantra-qballs-brainwashing-mashup-4-3011.html',
 'identity', 5, 4, 3, 44, NULL, NULL,
 '{goon,trance,combined}', '{}'),

-- 3. Sissy Hypno Addiction HD End
('93327332-7d0d-4888-889a-1607a5776216', 'Sissy Hypno Addiction HD End', NULL, 'video',
 'https://hypnotube.com/video/sissy-hypno-addiction-hd-end-2252.html',
 'identity', 4, 3, 2, 11, NULL, NULL,
 '{goon,edge}', '{}'),

-- 4. Cockhypnotrix
('93327332-7d0d-4888-889a-1607a5776216', 'Cockhypnotrix', NULL, 'video',
 'https://hypnotube.com/video/cockhypnotrix-2577.html',
 'desire_installation', 5, 3, 3, 16, NULL, NULL,
 '{goon,edge}', '{}'),

-- 5. Surrender
('93327332-7d0d-4888-889a-1607a5776216', 'Surrender', NULL, 'video',
 'https://hypnotube.com/video/surrender-2583.html',
 'surrender', 4, 2, 2, 9, NULL, NULL,
 '{goon,edge,trance}', '{}'),

-- 6. Girlcock Mindfuck
('93327332-7d0d-4888-889a-1607a5776216', 'Girlcock Mindfuck', NULL, 'video',
 'https://hypnotube.com/video/girlcock-mindfuck-2042.html',
 'desire_installation', 5, 3, 3, 18, NULL, NULL,
 '{goon,edge}', '{}'),

-- 7. Infinite Sissy
('93327332-7d0d-4888-889a-1607a5776216', 'Infinite Sissy', NULL, 'video',
 'https://hypnotube.com/video/infinite-sissy-2592.html',
 'identity', 4, 3, 2, 8, NULL, NULL,
 '{goon,edge}', '{}'),

-- 8. Addiction Sissyhypno REMIX
('93327332-7d0d-4888-889a-1607a5776216', 'Addiction Sissyhypno REMIX', NULL, 'video',
 'https://hypnotube.com/video/addiction-sissyhypno-remix-2339.html',
 'identity', 4, 2, 2, 7, NULL, NULL,
 '{goon,edge,background}', '{}');
