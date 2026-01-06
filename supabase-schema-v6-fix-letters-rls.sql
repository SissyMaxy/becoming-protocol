-- Fix personalized_letters RLS policy
-- Run this in Supabase SQL Editor

-- Add INSERT policy for personalized_letters
DROP POLICY IF EXISTS "Users can insert own letters" ON personalized_letters;
CREATE POLICY "Users can insert own letters" ON personalized_letters
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Add UPDATE policy for personalized_letters
DROP POLICY IF EXISTS "Users can update own letters" ON personalized_letters;
CREATE POLICY "Users can update own letters" ON personalized_letters
  FOR UPDATE USING (auth.uid() = user_id);
