/**
 * Per-job model routing (§5b). One model per job, chosen at the call site
 * rather than pinned in a module constant, so a single session can run
 * generation, repair, correction, vision and classification on different
 * models as each job's economics warrant.
 *
 * Prices per million tokens (§5b), for reference when changing this:
 *   gpt-6-astra   $10 / $50    gpt-5.6-sol   $4 / $20
 *   gpt-5.6-terra  $2 / $12    gpt-5.6-luna  $0.20 / $1.20
 */

export type Job =
  /** One-time reference-artifact draft; outside the live request path. */
  | "reference-artifact"
  /** Default artifact generation. */
  | "generate"
  /** Escalation after a Tier 1 verification failure. */
  | "repair"
  /** Correction-by-pointing regeneration. */
  | "correction"
  /** Textbook/board photo extraction. */
  | "vision"
  | "translate"
  | "test-case-gen"
  | "classify";

export interface RoutingContext {
  /** Repair attempt number, 0 for the first generation. */
  attemptNumber?: number;
  /** Luna's triage verdict for a correction (see models/classify.ts). */
  correctionComplexity?: "simple" | "complex";
}

const SOL = "gpt-5.6-sol";
const LUNA = "gpt-5.6-luna";
const ASTRA = "gpt-6-astra";

/**
 * §5b leaves the default generation model to measurement (Terra if it
 * clears a 70% first-pass Tier 1 rate, Sol otherwise). Keeping it in the
 * environment makes that decision a config change, not a code change.
 */
export const DEFAULT_GENERATION_MODEL =
  process.env.SLATE_GENERATION_MODEL?.trim() || SOL;

export function chooseModel(job: Job, ctx: RoutingContext = {}): string {
  switch (job) {
    case "generate":
      return DEFAULT_GENERATION_MODEL;

    // Astra's 2.5x premium over Sol is not justified for HTML generation,
    // so a verification failure escalates to Sol and stops there.
    case "repair":
      return SOL;

    // A correction is natural-language interpretation, not a mechanical
    // fix against a named check, so anything Luna cannot confidently call
    // simple goes to Sol.
    case "correction":
      return ctx.correctionComplexity === "simple" ? DEFAULT_GENERATION_MODEL : SOL;

    // §5b: "Never Luna" for vision — notation and syllabus errors here
    // propagate into everything generated downstream. Deliberately takes
    // no context override, so it cannot be misrouted by a caller.
    case "vision":
      return SOL;

    case "translate":
    case "test-case-gen":
    case "classify":
      return LUNA;

    case "reference-artifact":
      return ASTRA;
  }
}
