CREATE TABLE global_ai_usage (
  utc_date date PRIMARY KEY,
  calls integer NOT NULL CHECK (calls > 0)
);
