CREATE TABLE sms_poll_cursors (
  user_id text PRIMARY KEY REFERENCES users(id),
  account_sid text NOT NULL,
  sender_number text NOT NULL,
  learner_number text NOT NULL,
  started_at timestamptz NOT NULL
);

ALTER TABLE outbox ADD COLUMN provider_status text;
