-- Upgrade existing installations while keeping learning and garden history.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='users' AND column_name='sms_opted_in') THEN
    ALTER TABLE users RENAME COLUMN sms_opted_in TO practice_enabled;
  END IF;
END $$;
DROP TABLE IF EXISTS bluebubbles_cursors;
DROP TABLE IF EXISTS sms_poll_cursors;
