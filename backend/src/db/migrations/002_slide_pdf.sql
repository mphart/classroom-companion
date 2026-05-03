-- Slide deck PDF uploads: stored file path + source type
ALTER TABLE notes
  MODIFY COLUMN source_type ENUM(
    'recording',
    'generated_summary',
    'generated_practice_exam',
    'slide_pdf'
  ) NOT NULL DEFAULT 'recording';

ALTER TABLE notes
  ADD COLUMN pdf_file_path VARCHAR(600) NULL DEFAULT NULL AFTER generated_from_count;
