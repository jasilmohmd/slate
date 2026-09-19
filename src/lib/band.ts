export type Band = "A" | "B" | "C";

export function bandFromClass(classNumber: number): Band | null {
  if (classNumber >= 5 && classNumber <= 7) return "A";
  if (classNumber >= 8 && classNumber <= 10) return "B";
  if (classNumber >= 11 && classNumber <= 12) return "C";
  return null;
}
