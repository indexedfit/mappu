import { db } from "./client";

async function migrate() {
  console.log("Running migrations...");

  await db`
    CREATE TABLE IF NOT EXISTS content (
      id            SERIAL PRIMARY KEY,
      url           TEXT NOT NULL,
      platform      TEXT NOT NULL,
      content_type  TEXT,

      title         TEXT,
      description   TEXT,
      author        TEXT,
      author_url    TEXT,

      likes         INTEGER,
      views         INTEGER,
      comments      INTEGER,

      hashtags      TEXT[],
      music_title   TEXT,
      music_author  TEXT,

      media_urls    TEXT[],
      thumbnail_url TEXT,

      transcript       TEXT,
      transcript_language TEXT,

      frames        JSONB,
      summary       TEXT,

      audio_path    TEXT,
      top_comments  JSONB,

      instruction   TEXT,
      raw_scrape    JSONB,

      -- orchestrator enrichments
      enrichments   JSONB,

      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS generations (
      id          SERIAL PRIMARY KEY,
      content_id  INTEGER REFERENCES content(id),

      prompt      TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',

      -- creative brief produced by orchestrator
      brief       JSONB,

      output_urls TEXT[],
      output_meta JSONB,

      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Indexes
  await db`CREATE INDEX IF NOT EXISTS idx_content_platform ON content(platform)`;
  await db`CREATE INDEX IF NOT EXISTS idx_content_created ON content(created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status)`;

  // NOTIFY triggers — the orchestrator listens on these channels
  await db`
    CREATE OR REPLACE FUNCTION notify_new_content() RETURNS trigger AS $$
    BEGIN
      PERFORM pg_notify('new_content', NEW.id::text);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;

  await db`
    DROP TRIGGER IF EXISTS trg_new_content ON content
  `;

  await db`
    CREATE TRIGGER trg_new_content
      AFTER INSERT ON content
      FOR EACH ROW EXECUTE FUNCTION notify_new_content()
  `;

  await db`
    CREATE OR REPLACE FUNCTION notify_new_generation() RETURNS trigger AS $$
    BEGIN
      IF NEW.status = 'pending' THEN
        PERFORM pg_notify('new_generation', NEW.id::text);
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;

  await db`
    DROP TRIGGER IF EXISTS trg_new_generation ON generations
  `;

  await db`
    CREATE TRIGGER trg_new_generation
      AFTER INSERT ON generations
      FOR EACH ROW EXECUTE FUNCTION notify_new_generation()
  `;

  // Add columns if they don't exist (idempotent for existing DBs)
  await db`ALTER TABLE content ADD COLUMN IF NOT EXISTS enrichments JSONB`;
  await db`ALTER TABLE generations ADD COLUMN IF NOT EXISTS brief JSONB`;

  console.log("Migrations complete.");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
