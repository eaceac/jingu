CREATE TABLE bluebubbles_cursors (
  user_id text PRIMARY KEY REFERENCES users(id),
  chat_guid text NOT NULL,
  after_ms bigint NOT NULL
);
CREATE TABLE global_ai_usage (
  utc_date date PRIMARY KEY,
  calls integer NOT NULL CHECK (calls > 0)
);
