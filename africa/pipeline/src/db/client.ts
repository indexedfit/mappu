import postgres from "postgres";

const url = process.env.DATABASE_URL || "postgresql://localhost:5432/pipeline";

export const db = postgres(url, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
});
