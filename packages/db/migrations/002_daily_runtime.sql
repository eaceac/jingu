ALTER TABLE users ADD COLUMN practice_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN current_index integer NOT NULL DEFAULT 0;
ALTER TABLE review_opportunities ADD COLUMN prompt_text text;
ALTER TABLE review_opportunities ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE messages ADD COLUMN processing_status text NOT NULL DEFAULT 'pending';
ALTER TABLE messages ADD COLUMN processing_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN practice_timezone text;
ALTER TABLE messages ADD COLUMN goal_snapshot integer;
ALTER TABLE messages ADD COLUMN ai_result jsonb;
ALTER TABLE outbox ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE outbox ADD COLUMN last_error text;
CREATE UNIQUE INDEX one_active_session ON sessions(user_id) WHERE status='active';
CREATE INDEX session_card_opportunities ON review_opportunities(session_id,card_id);
CREATE TABLE ai_usage (
  user_id text NOT NULL REFERENCES users(id), local_date date NOT NULL,
  calls integer NOT NULL DEFAULT 0, PRIMARY KEY(user_id,local_date)
);
