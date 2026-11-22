CREATE TABLE users (
  id text PRIMARY KEY,
  timezone text NOT NULL DEFAULT 'UTC',
  instruction_language text NOT NULL DEFAULT 'en',
  daily_goal integer NOT NULL DEFAULT 5 CHECK (daily_goal BETWEEN 1 AND 50),
  reminders_enabled boolean NOT NULL DEFAULT false,
  reminder_local_time time,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE learning_profiles (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  source_language text NOT NULL,
  target_language text NOT NULL,
  words_per_session integer NOT NULL DEFAULT 5 CHECK (words_per_session BETWEEN 1 AND 50),
  max_new_senses_per_day integer NOT NULL DEFAULT 5 CHECK (max_new_senses_per_day BETWEEN 0 AND 50),
  direction_mode text NOT NULL DEFAULT 'source_to_target' CHECK (direction_mode IN ('source_to_target','target_to_source','mixed')),
  allow_transliteration boolean NOT NULL DEFAULT true,
  settings_version integer NOT NULL DEFAULT 1 CHECK (settings_version > 0),
  UNIQUE (user_id, source_language, target_language),
  UNIQUE (id, user_id),
  CHECK (source_language <> target_language)
);
CREATE TABLE vocab_senses (
  id text PRIMARY KEY,
  language text NOT NULL,
  canonical_form text NOT NULL,
  gloss text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE vocab_variants (
  sense_id text NOT NULL REFERENCES vocab_senses(id),
  form text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (sense_id, form)
);
CREATE TABLE review_cards (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  profile_id text NOT NULL,
  sense_id text NOT NULL REFERENCES vocab_senses(id),
  direction text NOT NULL CHECK (direction IN ('source_to_target','target_to_source')),
  stage integer NOT NULL DEFAULT -1 CHECK (stage BETWEEN -1 AND 7),
  due_at timestamptz NOT NULL,
  last_reviewed_at timestamptz,
  review_count integer NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  successful_reviews integer NOT NULL DEFAULT 0 CHECK (successful_reviews BETWEEN 0 AND review_count),
  lapses integer NOT NULL DEFAULT 0 CHECK (lapses >= 0),
  policy_version text NOT NULL DEFAULT 'ladder-v1',
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  UNIQUE (profile_id, sense_id, direction),
  UNIQUE (id, user_id),
  FOREIGN KEY (profile_id, user_id) REFERENCES learning_profiles(id, user_id)
);
CREATE INDEX review_cards_due ON review_cards(user_id, due_at, id);
CREATE TABLE sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  profile_id text NOT NULL,
  settings_snapshot jsonb NOT NULL,
  ordered_card_ids jsonb NOT NULL CHECK (jsonb_typeof(ordered_card_ids) = 'array'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','complete','ended')),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  UNIQUE (id, user_id),
  FOREIGN KEY (profile_id, user_id) REFERENCES learning_profiles(id, user_id)
);
CREATE TABLE messages (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  session_id text,
  provider text NOT NULL,
  external_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  body text NOT NULL,
  received_at timestamptz NOT NULL,
  delivery_status text,
  UNIQUE (provider, external_id),
  UNIQUE (id, user_id),
  FOREIGN KEY (session_id, user_id) REFERENCES sessions(id, user_id)
);
CREATE TABLE review_opportunities (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  card_id text NOT NULL,
  session_id text NOT NULL,
  expected_card_version integer NOT NULL CHECK (expected_card_version >= 0),
  grading_policy jsonb NOT NULL,
  hint_used boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','assessed','cancelled')),
  UNIQUE (id, user_id),
  FOREIGN KEY (card_id, user_id) REFERENCES review_cards(id, user_id),
  FOREIGN KEY (session_id, user_id) REFERENCES sessions(id, user_id)
);
CREATE TABLE assessments (
  id text PRIMARY KEY,
  opportunity_id text NOT NULL UNIQUE,
  user_id text NOT NULL REFERENCES users(id),
  message_id text NOT NULL,
  rating text NOT NULL CHECK (rating IN ('again','hard','good','easy')),
  evidence text NOT NULL CHECK (length(evidence) > 0),
  semantic_outcome text NOT NULL CHECK (semantic_outcome IN ('correct','incorrect')),
  answer_form text NOT NULL CHECK (answer_form IN ('native_script','transliteration','mixed')),
  evaluator_version text NOT NULL,
  assessed_at timestamptz NOT NULL,
  next_state jsonb NOT NULL,
  UNIQUE (id, user_id),
  FOREIGN KEY (opportunity_id, user_id) REFERENCES review_opportunities(id, user_id),
  FOREIGN KEY (message_id, user_id) REFERENCES messages(id, user_id)
);
CREATE TABLE practice_events (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  sense_id text NOT NULL REFERENCES vocab_senses(id),
  message_id text NOT NULL,
  assessment_id text,
  event_type text NOT NULL CHECK (event_type IN ('exposure','learner_use','recall_attempt')),
  occurred_at timestamptz NOT NULL,
  local_date date NOT NULL,
  timezone text NOT NULL,
  UNIQUE (message_id, sense_id, event_type),
  FOREIGN KEY (message_id, user_id) REFERENCES messages(id, user_id),
  FOREIGN KEY (assessment_id, user_id) REFERENCES assessments(id, user_id)
);
CREATE UNIQUE INDEX practice_recall_once ON practice_events(assessment_id) WHERE event_type = 'recall_attempt';
CREATE TABLE daily_progress (
  user_id text NOT NULL REFERENCES users(id),
  local_date date NOT NULL,
  timezone text NOT NULL,
  goal_snapshot integer NOT NULL CHECK (goal_snapshot BETWEEN 1 AND 50),
  sense_ids text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (user_id, local_date)
);
-- Streak status and garden rewards are derived from these daily facts, not incremented here.
CREATE TABLE jobs (
  id text PRIMARY KEY,
  operation_key text NOT NULL UNIQUE,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','complete','dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz
);
CREATE TABLE outbox (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  operation_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','ambiguous','failed','cancelled')),
  provider_message_id text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);
CREATE TABLE channel_accounts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  provider text NOT NULL,
  encrypted_address text NOT NULL,
  lookup_hash text NOT NULL,
  verified_at timestamptz,
  consent_state text NOT NULL DEFAULT 'pending' CHECK (consent_state IN ('pending','opted_in','opted_out')),
  UNIQUE (provider, lookup_hash)
);
