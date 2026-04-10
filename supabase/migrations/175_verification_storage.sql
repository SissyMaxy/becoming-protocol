-- Create storage bucket for verification photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-photos',
  'verification-photos',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for the bucket
CREATE POLICY "Users can upload their own verification photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'verification-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view their own verification photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'verification-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own verification photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'verification-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
