-- The original food-scans storage policies (20260525000001_food_scans.sql)
-- scoped INSERT and DELETE to the authenticated user's own folder
-- (auth.uid()::text = first path segment), but SELECT was left broad
-- (bucket_id = 'food-scans' only) -- an inconsistency with the other two
-- policies' own stated intent ("Security is enforced by user-namespaced
-- paths"). Flagged by Supabase's advisor as allowing any authenticated
-- user to list every file in the bucket, not just their own. The bucket
-- stays public (object fetch by known URL still works via the public CDN
-- path, which doesn't consult this policy at all) -- this only closes the
-- ability to browse/list other users' files.
DROP POLICY IF EXISTS "food_scans_storage_select" ON storage.objects;

CREATE POLICY "food_scans_storage_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'food-scans'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
