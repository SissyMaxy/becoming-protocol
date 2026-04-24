-- Migration 231: Extend name-erasure triggers to rewrite masculine pronouns
-- Previously only rewrote "David" → "Maxy". Now also rewrites he/him/his/
-- himself/Mr/sir in all user-writable text columns. Case-preserving.

CREATE OR REPLACE FUNCTION erase_david_in_text() RETURNS TRIGGER AS $$
DECLARE
  col_text TEXT;
BEGIN
  IF TG_TABLE_NAME = 'confessions' THEN
    col_text := NEW.response;
  ELSIF TG_TABLE_NAME = 'journal_entries' THEN
    col_text := NEW.content;
  ELSIF TG_TABLE_NAME = 'mood_checkins' THEN
    col_text := NEW.notes;
  ELSIF TG_TABLE_NAME = 'body_dysphoria_logs' THEN
    col_text := NEW.feeling;
  ELSE
    RETURN NEW;
  END IF;

  IF col_text IS NULL THEN RETURN NEW; END IF;

  col_text := regexp_replace(col_text, '\mDavid\M', 'Maxy', 'g');
  col_text := regexp_replace(col_text, '\mHe\M', 'She', 'g');
  col_text := regexp_replace(col_text, '\mhe\M', 'she', 'g');
  col_text := regexp_replace(col_text, '\mHim\M', 'Her', 'g');
  col_text := regexp_replace(col_text, '\mhim\M', 'her', 'g');
  col_text := regexp_replace(col_text, '\mHis\M', 'Her', 'g');
  col_text := regexp_replace(col_text, '\mhis\M', 'her', 'g');
  col_text := regexp_replace(col_text, '\mHimself\M', 'Herself', 'g');
  col_text := regexp_replace(col_text, '\mhimself\M', 'herself', 'g');
  col_text := regexp_replace(col_text, '\mMr\.?\M', 'Ms.', 'g');
  col_text := regexp_replace(col_text, '\msir\M', 'ma''am', 'gi');

  IF TG_TABLE_NAME = 'confessions' THEN
    NEW.response := col_text;
  ELSIF TG_TABLE_NAME = 'journal_entries' THEN
    NEW.content := col_text;
  ELSIF TG_TABLE_NAME = 'mood_checkins' THEN
    NEW.notes := col_text;
  ELSIF TG_TABLE_NAME = 'body_dysphoria_logs' THEN
    NEW.feeling := col_text;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
