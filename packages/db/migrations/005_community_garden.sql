ALTER TABLE users ADD COLUMN garden_name text;
ALTER TABLE users ADD COLUMN garden_public_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX users_garden_public_id ON users(garden_public_id);
