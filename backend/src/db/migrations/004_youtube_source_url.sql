-- Persist canonical YouTube URL for notes created via /youtube/parse
ALTER TABLE notes
  ADD COLUMN youtube_source_url VARCHAR(500) NULL DEFAULT NULL AFTER pdf_file_path;
