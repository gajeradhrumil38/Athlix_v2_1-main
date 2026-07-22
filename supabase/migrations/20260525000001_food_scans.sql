-- ─── Food Scans Table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS food_scans (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url       TEXT,
  thumbnail_url   TEXT,
  scan_date       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  foods_detected  JSONB         NOT NULL DEFAULT '[]',
  total_calories  INTEGER       NOT NULL DEFAULT 0,
  total_protein   DECIMAL(8,2)  NOT NULL DEFAULT 0,
  total_carbs     DECIMAL(8,2)  NOT NULL DEFAULT 0,
  total_fat       DECIMAL(8,2)  NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS food_scans_user_id_idx   ON food_scans(user_id);
CREATE INDEX IF NOT EXISTS food_scans_scan_date_idx ON food_scans(user_id, scan_date DESC);

-- ─── Row Level Security ────────────────────────────────────────────────────

ALTER TABLE food_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "food_scans_select" ON food_scans
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "food_scans_insert" ON food_scans
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "food_scans_update" ON food_scans
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "food_scans_delete" ON food_scans
  FOR DELETE USING (auth.uid() = user_id);

-- ─── Storage Bucket ────────────────────────────────────────────────────────
-- Public bucket so FatSecret API can fetch image URLs for recognition.
-- Security is enforced by user-namespaced paths (userId/filename).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'food-scans',
  'food-scans',
  true,
  10485760,  -- 10 MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public            = true,
  file_size_limit   = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

-- Storage RLS: first folder segment must be the authenticated user's id
CREATE POLICY "food_scans_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'food-scans'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "food_scans_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'food-scans');

CREATE POLICY "food_scans_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'food-scans'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
