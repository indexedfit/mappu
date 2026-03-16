import "../env";
import postgres from "postgres";
import { enrichContent } from "./enrich";
import { processGeneration } from "./generate";
import { requireEnv } from "../env";

// Separate connection for LISTEN — can't share with query connection
const listen = postgres(process.env.DATABASE_URL || "postgresql://localhost:5432/pipeline", {
  max: 1,
});

// Also use the shared db for queries
import { db } from "../db/client";

async function handleNewContent(contentId: number) {
  console.log(`[enrich] content #${contentId}`);
  try {
    const enrichments = await enrichContent(contentId);
    console.log(`[enrich] #${contentId} done — category: ${enrichments.category}, hook: "${enrichments.hook?.slice(0, 60)}"`);
    console.log(`[enrich] #${contentId} format: "${enrichments.formatTemplate?.slice(0, 80)}"`);
    console.log(`[enrich] #${contentId} engagement: ${enrichments.viralitySignals.engagement} (like rate: ${enrichments.viralitySignals.likeRate})`);
  } catch (err) {
    console.error(`[enrich] #${contentId} FAILED:`, err);
  }
}

async function handleNewGeneration(generationId: number) {
  console.log(`[generate] generation #${generationId}`);
  try {
    const brief = await processGeneration(generationId);
    console.log(`[generate] #${generationId} done — concept: "${brief.concept?.slice(0, 80)}"`);
    console.log(`[generate] #${generationId} pinterest: "${brief.pinterestQuery}"`);
  } catch (err) {
    console.error(`[generate] #${generationId} FAILED:`, err);
    await db`UPDATE generations SET status = 'failed', updated_at = NOW() WHERE id = ${generationId}`;
  }
}

async function processBacklog() {
  // Enrich any content that hasn't been enriched yet
  const unenriched = await db`
    SELECT id FROM content WHERE enrichments IS NULL ORDER BY id
  `;
  if (unenriched.length) {
    console.log(`[backlog] ${unenriched.length} unenriched content items`);
    for (const row of unenriched) {
      await handleNewContent(row.id);
    }
  }

  // Process any pending generations
  const pending = await db`
    SELECT id FROM generations WHERE status = 'pending' ORDER BY id
  `;
  if (pending.length) {
    console.log(`[backlog] ${pending.length} pending generations`);
    for (const row of pending) {
      await handleNewGeneration(row.id);
    }
  }
}

async function main() {
  console.log("orchestrator starting...");
  console.log("  processing backlog first...");

  await processBacklog();

  console.log("  listening for new_content, new_generation...");

  await listen.listen("new_content", async (payload) => {
    const id = parseInt(payload, 10);
    if (!isNaN(id)) await handleNewContent(id);
  });

  await listen.listen("new_generation", async (payload) => {
    const id = parseInt(payload, 10);
    if (!isNaN(id)) await handleNewGeneration(id);
  });

  console.log("orchestrator running. ctrl+c to stop.\n");

  // Keep alive
  process.on("SIGINT", async () => {
    console.log("\nshutting down...");
    await listen.end();
    await db.end();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Orchestrator error:", err);
  process.exit(1);
});
