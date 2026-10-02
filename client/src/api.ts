import type {
  Exam, Student, Submission, Batch, CreateExamBody, FinalizeMarkingBody, StartExamResponse,
} from './types';

const BASE = import.meta.env.VITE_API_URL || '';
const TIMEOUT_MS = 25000;

function redirectToLanding() {
  localStorage.removeItem('student_token');
  localStorage.removeItem('student_data');
  localStorage.removeItem('teacher_token');
  if (window.location.pathname !== '/' && window.location.pathname !== '') {
    window.location.href = '/';
  }
}

function getHeaders(extra?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  const teacherToken = localStorage.getItem('teacher_token');
  if (teacherToken) headers['Authorization'] = `Bearer ${teacherToken}`;
  const studentToken = localStorage.getItem('student_token');
  if (studentToken) headers['X-Student-Token'] = studentToken;
  return headers;
}

// ── Silent session recovery ────────────────────────────────────────────────
// A student's session only lives in the `students.session_token` column, so a second login
// (another device/tab), a teacher Reset, or the hourly stale-session sweep can invalidate it
// mid-exam. That 401 used to wipe localStorage and hard-navigate to the landing page — which is
// exactly how students got "sent back to Question 1" with their typing gone.
//
// Recovery is now identity-based: every login stores a long-lived `student_authtoken` (a JWT
// whose subject is the student's own row id), and POST /api/students/refresh mints a new session
// for that SAME row. So re-authenticating can never re-match the student by name and land them
// on a different (empty) submission. Only if there is no auth token do we fall back to a plain
// login with the details captured at first sign-in.

const AUTH_TOKEN_KEY = 'student_authtoken';

function storedStudent(): Student | null {
  const raw = localStorage.getItem('student_data');
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Student;
    return s && s.name && s.surname ? s : null;
  } catch {
    return null;
  }
}

export function getStudentAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStudentAuthToken(token: string): void {
  try { localStorage.setItem(AUTH_TOKEN_KEY, token); } catch { /* storage disabled */ }
}

function persistedSession(data: any): boolean {
  if (!data?.token) return false;
  localStorage.setItem('student_token', data.token);
  if (data.student) localStorage.setItem('student_data', JSON.stringify(data.student));
  if (data.authToken) setStudentAuthToken(data.authToken);
  return true;
}

async function reAuthStudent(): Promise<boolean> {
  // Preferred path: prove identity with the auth token we already hold.
  const authToken = getStudentAuthToken();
  if (authToken) {
    try {
      const res = await fetch(`${BASE}/api/students/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Student-AuthToken': authToken },
      });
      if (res.ok && persistedSession(await res.json())) return true;
    } catch {
      // fall through to the name-based login below
    }
  }

  // Fallback: sign in again with the details captured at first login. This also mints a fresh
  // auth token, so subsequent recoveries use the identity-based path above.
  const s = storedStudent();
  if (!s) return false;
  try {
    const res = await fetch(`${BASE}/api/students/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: s.name,
        surname: s.surname,
        studentId: s.studentId || '',
        cell: s.cell || '',
      }),
    });
    if (!res.ok) return false;
    return persistedSession(await res.json());
  } catch {
    return false;
  }
}

type RawResponse = { res: Response; data: any };

async function send(
  method: string,
  path: string,
  body?: unknown,
  keepalive = false
): Promise<RawResponse> {
  // keepalive requests are fired while the page is unloading (refresh/close), so they must not
  // be aborted by our timeout and must never trigger a redirect — the browser is already leaving.
  const controller = keepalive ? null : new AbortController();
  const timeoutId = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller ? controller.signal : undefined,
      keepalive,
    });
  } catch (err: any) {
    if (timeoutId !== null) clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      throw new Error('The server took too long to respond. Please try again.');
    }
    throw new Error('Unable to reach the server. Please check your internet connection and try again.');
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }

  const text = await res.text();
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }
  return { res, data };
}

function unwrap<T>(r: RawResponse): T {
  if (!r.res.ok) throw new Error(r.data?.error || `Request failed (${r.res.status})`);
  return r.data as T;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts?: { keepalive?: boolean }
): Promise<T> {
  const keepalive = opts?.keepalive === true;
  const first = await send(method, path, body, keepalive);

  // Login endpoints must never redirect: a wrong password is a local form error, not an
  // expired session. (Redirecting here used to bounce teachers to the landing page on a typo.)
  if (
    first.res.status === 401 &&
    !keepalive &&
    path !== '/api/students/login' &&
    path !== '/api/teacher/login'
  ) {
    if (await reAuthStudent()) return unwrap<T>(await send(method, path, body));
    redirectToLanding();
  }

  return unwrap<T>(first);
}

// ── Cold-start warmup ──────────────────────────────────────────────────────
// The API sleeps when idle, so the first request after a lull can take tens of seconds
// while the host wakes the server and its DB pool. Login pages fire this on mount —
// by the time the password is typed and submitted, the server is already awake and the
// sign-in itself is a fast, DB-free password check + JWT sign.
let warmupFired = false;
export function warmServer(): void {
  if (warmupFired) return;
  warmupFired = true;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10000);
  fetch(`${BASE}/api/health`, { signal: controller.signal })
    .catch(() => {
      /* best effort — the real request retries anyway */
    })
    .finally(() => clearTimeout(t));
}

// Teacher
export const teacherLogin = async (password: string) => {
  try {
    return await request<{ token: string }>('POST', '/api/teacher/login', { password });
  } catch (err: any) {
    // A cold start can still beat the warmup ping: one immediate retry turns that slow
    // first attempt into a fast success instead of an error the teacher must retry by hand.
    if (/took too long|Unable to reach/i.test(err?.message || '')) {
      return request<{ token: string }>('POST', '/api/teacher/login', { password });
    }
    throw err;
  }
};

export const getStats = () =>
  request<{ totalExams: number; pending: number; marked: number; inProgress: number }>(
    'GET',
    '/api/teacher/stats'
  );

// Exams
export const getExams = () => request<Exam[]>('GET', '/api/exams');
export const getExam = (id: string) => request<Exam>('GET', `/api/exams/${id}`);
export const createExam = (body: CreateExamBody) =>
  request<Exam>('POST', '/api/exams', body);
export const updateExam = (id: string, body: CreateExamBody) =>
  request<Exam>('PUT', `/api/exams/${id}`, body);
export const deleteExam = (id: string) =>
  request<{ deleted: boolean }>('DELETE', `/api/exams/${id}`);
export const togglePublish = (id: string) =>
  request<{ published: boolean }>('PATCH', `/api/exams/${id}/publish`);

// Submissions (teacher)
export const getSubmissions = (params?: {
  status?: string;
  examId?: string;
  search?: string;
  batchId?: string;
}) => {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return request<Submission[]>('GET', `/api/submissions${qs ? '?' + qs : ''}`);
};

export const getSubmission = (id: string) =>
  request<any>('GET', `/api/submissions/${id}`);

export const finalizeMarking = (id: string, body: FinalizeMarkingBody) =>
  request<{ score: number; status: string }>(
    'POST',
    `/api/submissions/${id}/finalize`,
    body
  );

export const resetSubmission = (id: string) =>
  request<{ reset: boolean; attempt: number }>('POST', `/api/submissions/${id}/reset`);

// Reopen restarts the timer but KEEPS the answers, so it deliberately does not bump `attempt`
// (the attempt only moves when the answers have actually been cleared, i.e. a Reset).
export const reopenSubmission = (id: string) =>
  request<{ reopened: boolean }>('POST', `/api/submissions/${id}/reopen`);

export const deleteSubmission = (id: string) =>
  request<{ deleted: boolean }>('DELETE', `/api/submissions/${id}`);

export const clearStudentSession = (id: string) =>
  request<{ cleared: boolean }>('DELETE', `/api/submissions/${id}/session`);

// Student
export const studentLogin = (body: {
  name: string;
  surname: string;
  studentId: string;
  cell: string;
}) =>
  request<{ token: string; authToken: string; student: Student }>('POST', '/api/students/login', body);

export const startExam = (examId: string) =>
  request<StartExamResponse>('POST', '/api/submissions/start', { examId });

// Answer payload. `editedAt` is the server-aligned moment this specific answer was last changed,
// so the server can keep the newest value per question even across two tabs or two devices.
export interface SaveAnswerItem {
  questionId: string;
  answerText: string;
  editedAt?: number;
}

export interface SaveResult {
  saved: boolean;
  attempt?: number;
  // True when the submission has been Reset (attempt moved on) and this payload is from an older
  // attempt — the answers were deliberately deleted and must not be re-applied.
  staleAttempt?: boolean;
  // Question ids the server refused to overwrite because the stored value was newer.
  rejected?: string[];
}

// `clientSavedAt` lets the server reject stale writes: every save carries the moment the
// snapshot was taken, and the server only overwrites an answer that was written earlier.
// That makes a second (older) tab or a replayed request unable to clobber newer answers.
export const saveAnswers = (
  submissionId: string,
  answers: SaveAnswerItem[],
  opts?: { attempt?: number; clientSavedAt?: number }
) =>
  request<SaveResult>('PUT', `/api/submissions/${submissionId}/answers`, {
    answers,
    attempt: opts?.attempt,
    clientSavedAt: opts?.clientSavedAt ?? Date.now(),
  });

// Fire-and-forget save used while the page is unloading (refresh/close/tab switch).
// `keepalive` lets the browser finish the request after the page is gone.
export const saveAnswersKeepalive = (
  submissionId: string,
  answers: SaveAnswerItem[],
  opts?: { attempt?: number; clientSavedAt?: number }
) =>
  request<SaveResult>(
    'PUT',
    `/api/submissions/${submissionId}/answers`,
    { answers, attempt: opts?.attempt, clientSavedAt: opts?.clientSavedAt ?? Date.now() },
    { keepalive: true }
  );

export const submitExam = (submissionId: string) =>
  request<{ submittedAt: string }>(
    'POST',
    `/api/submissions/${submissionId}/submit`
  );

export const getResult = (submissionId: string) =>
  request<any>('GET', `/api/submissions/${submissionId}/result`);

// Batches
export const getBatches = () => request<Batch[]>('GET', '/api/batches');
export const createBatch = (name: string) =>
  request<Batch>('POST', '/api/batches', { name });
export const updateBatch = (id: string, name: string) =>
  request<Batch>('PUT', `/api/batches/${id}`, { name });
export const deleteBatch = (id: string) =>
  request<{ deleted: boolean }>('DELETE', `/api/batches/${id}`);
export const assignBatch = (submissionId: string, batchId: string | null) =>
  request<{ updated: boolean }>('PATCH', `/api/submissions/${submissionId}/batch`, { batchId });