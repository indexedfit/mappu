import type { Context, StepDef } from "./types";

export async function runPipeline(
  steps: StepDef[],
  initial: Context,
): Promise<Context> {
  let ctx = { ...initial };

  for (const step of steps) {
    if (step.when && !step.when(ctx)) {
      console.log(`  skip: ${step.name}`);
      continue;
    }

    const t0 = performance.now();
    try {
      console.log(`  run: ${step.name}...`);
      ctx = await step.run(ctx);
      const ms = (performance.now() - t0).toFixed(0);
      console.log(`  done: ${step.name} (${ms}ms)`);
    } catch (err) {
      const ms = (performance.now() - t0).toFixed(0);
      console.error(`  FAIL: ${step.name} (${ms}ms)`, err);
      throw new PipelineError(step.name, err);
    }
  }

  return ctx;
}

export class PipelineError extends Error {
  constructor(
    public step: string,
    public cause: unknown,
  ) {
    super(`Pipeline failed at step "${step}": ${cause}`);
    this.name = "PipelineError";
  }
}
