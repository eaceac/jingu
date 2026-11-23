ALTER TABLE users ADD COLUMN garden_patch_name text CHECK (char_length(garden_patch_name) BETWEEN 1 AND 40);
