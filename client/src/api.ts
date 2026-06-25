import type {
  Exam,
  Student,
  Submission,
  Batch,
  CreateExamBody,
  FinalizeMarkingBody,
} from './types';

const BASE = import.meta.env.VITE_API_URL || '';

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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

// Teacher
export const teacherLogin = (password: string) =>
  request<{ token: string }>('POST', '/api/teacher/login', { password });

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
  request<{ reset: boolean }>('POST', `/api/submissions/${id}/reset`);

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
  request<{ token: string; student: Student }>('POST', '/api/students/login', body);

export const startExam = (examId: string) =>
  request<{
    submissionId: string;
    startedAt: string;
    answers: { questionId: string; answerText: string }[];
  }>('POST', '/api/submissions/start', { examId });

export const saveAnswers = (
  submissionId: string,
  answers: { questionId: string; answerText: string }[]
) =>
  request<{ saved: boolean }>('PUT', `/api/submissions/${submissionId}/answers`, {
    answers,
  });

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
