-- Run once on existing MySQL volumes (new installs get this from schema.sql).
ALTER TABLE notes
  MODIFY COLUMN source_type ENUM('recording', 'generated_summary', 'generated_practice_exam')
  NOT NULL DEFAULT 'recording';
