ALTER TABLE runs ADD COLUMN input_tokens INTEGER;
ALTER TABLE runs ADD COLUMN output_tokens INTEGER;
ALTER TABLE runs ADD COLUMN cache_creation_tokens INTEGER;
ALTER TABLE runs ADD COLUMN cache_read_tokens INTEGER;
