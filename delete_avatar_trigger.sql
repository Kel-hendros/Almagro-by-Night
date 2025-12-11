-- Function to delete avatar from storage
CREATE OR REPLACE FUNCTION delete_character_avatar()
RETURNS TRIGGER AS $$
DECLARE
  avatar_path text;
BEGIN
  -- Only proceed if there is an avatar_url
  IF OLD.avatar_url IS NOT NULL THEN
    -- Extract path after 'character-avatars/'
    -- Standard URL: .../character-avatars/some/file.png
    -- We use a regex to be safe, grabbing everything after the bucket name and a slash
    avatar_path := substring(OLD.avatar_url from 'character-avatars/(.*)$');

    IF avatar_path IS NOT NULL THEN
      -- Delete from storage.objects
      -- referencing the bucket 'character-avatars'
      DELETE FROM storage.objects
      WHERE bucket_id = 'character-avatars'
      AND name = avatar_path;
    END IF;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger
DROP TRIGGER IF EXISTS on_character_delete ON character_sheets;
CREATE TRIGGER on_character_delete
AFTER DELETE ON character_sheets
FOR EACH ROW
EXECUTE FUNCTION delete_character_avatar();
