/**
 * The shape of a saved session, shared by the read endpoints and the
 * builder. A session is one `generations` row: the inputs, the transcript,
 * and the latest artifact (§2c — the record is the durable source of truth,
 * not the exported file).
 */

export type Pointer = {
  controlId: string | null;
  role: string | null;
  label: string;
  elementSnippet: string;
};

export type Turn = {
  id: string;
  at: string;
  role: "teacher" | "slate";
  kind: "goal" | "refine" | "correction" | "result";
  text: string;
  pointer?: Pointer | null;
  attachments?: string[];
  model?: string;
  complexity?: string | null;
  verification?: { passed: boolean; attempts: number } | null;
};

export type SessionRecord = {
  goal: string;
  classNumber: number;
  language: "ml" | "en";
  photoPath?: string | null;
  photoPaths?: string[];
  conceptComplexity?: "simple" | "standard" | "dense" | null;
  corrections?: Array<Record<string, unknown>>;
  turns?: Turn[];
};

/**
 * Rebuild a transcript from a stored record.
 *
 * Rows written before v3 have no `turns`, only `corrections[]`. Rather than
 * migrating them, synthesise a transcript on read: the original goal, then
 * one teacher turn per correction. The result is lossy about exact timing
 * (older corrections carry no timestamp) but it means every record ever
 * written can still be reopened, which is the point of §2c.
 */
export function turnsFromRecord(
  record: SessionRecord,
  createdAt: string,
  verification?: { passed?: boolean; attempts?: number } | null
): Turn[] {
  if (record.turns?.length) return record.turns;

  // Pre-v3 rows recorded one verification for the whole row. It is shown as
  // the outcome of the last thing that happened; earlier results are assumed
  // to have passed, since a failing round could not have been corrected.
  const outcome = {
    passed: verification?.passed ?? true,
    attempts: verification?.attempts ?? 1,
  };
  const result = (id: string, model?: string, last = false): Turn => ({
    id,
    at: createdAt,
    role: "slate",
    kind: "result",
    text: last ? (outcome.passed ? "done" : "failed") : "done",
    model,
    verification: last ? outcome : { passed: true, attempts: 1 },
  });

  const turns: Turn[] = [
    {
      id: "goal",
      at: createdAt,
      role: "teacher",
      kind: "goal",
      text: record.goal,
      attachments: record.photoPaths ?? (record.photoPath ? [record.photoPath] : []),
    },
  ];

  const corrections = record.corrections ?? [];
  turns.push(result("goal-result", undefined, corrections.length === 0));

  for (const [index, raw] of corrections.entries()) {
    const correction = raw as {
      id?: string;
      comment?: string;
      label?: string;
      controlId?: string | null;
      role?: string | null;
      elementSnippet?: string;
      model?: string;
      complexity?: string | null;
    };

    turns.push({
      id: correction.id ?? `correction-${index}`,
      at: createdAt,
      role: "teacher",
      kind: "correction",
      text: correction.comment ?? "",
      pointer: {
        controlId: correction.controlId ?? null,
        role: correction.role ?? null,
        label: correction.label ?? "",
        elementSnippet: correction.elementSnippet ?? "",
      },
      model: correction.model,
      complexity: correction.complexity ?? null,
    });
    turns.push(
      result(`correction-${index}-result`, correction.model, index === corrections.length - 1)
    );
  }

  return turns;
}
