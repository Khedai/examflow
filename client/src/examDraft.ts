// ── Local answer draft + resume position ──────────────────────────────────
// The database is the source of truth, but a reload, crash, lost connection or forced re-login
// between two saves used to lose everything typed since the last tick. So we mirror the
// in-progress answers into localStorage on every keystroke; on the next load the draft is
// merged back in and pushed to the server. The question position is cached the same way.

export interface ExamDraft {
  submissionId: string;
  attempt: number; // server attempt counter this draft belongs to (bumped by a teacher Reset)
  savedAt: number; // epoch ms of the last local write
  answers: Record<string, string>;
}

const draftKey = (examId: string) => `examflow_draft_${examId}`;
const positionKey = (examId: string) => `examflow_position_${examId}`;

export function readDraft(examId: string): ExamDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(examId));
    if (!raw) return null;
    const d = JSON.parse(raw) as ExamDraft;
    if (!d || typeof d.submissionId !== 'string' || typeof d.savedAt !== 'number' || !d.answers) return null;
    // Drafts written before attempt tracking existed belong to attempt 1.
    if (typeof d.attempt !== 'number') d.attempt = 1;
    return d;
  } catch {
    return null;
  }
}

export function writeDraft(examId: string, submissionId: string, attempt: number, answers: Record<string, string>): void {
  try {
    const draft: ExamDraft = { submissionId, attempt, savedAt: Date.now(), answers };
    localStorage.setItem(draftKey(examId), JSON.stringify(draft));
  } catch {
    // storage full / disabled (private mode) — the server save still protects her work
  }
}

export function clearDraft(examId: string): void {
  try { localStorage.removeItem(draftKey(examId)); } catch { /* ignore */ }
}

export function readPosition(examId: string): number {
  try {
    const raw = localStorage.getItem(positionKey(examId));
    const idx = Number(raw);
    return Number.isFinite(idx) && idx >= 0 ? Math.trunc(idx) : 0;
  } catch {
    return 0;
  }
}

export function writePosition(examId: string, index: number): void {
  try { localStorage.setItem(positionKey(examId), String(index)); } catch { /* ignore */ }
}

export function clearPosition(examId: string): void {
  try { localStorage.removeItem(positionKey(examId)); } catch { /* ignore */ }
}
