export type QuestionType = 'mcq' | 'short' | 'long';
export type SubmissionStatus = 'STARTED' | 'SUBMITTED' | 'MARKED';

export interface Question {
  id: string;
  examId: string;
  position: number;
  type: QuestionType;
  text: string;
  options?: string[];
  correct?: string;
  points: number;
}

export interface Exam {
  id: string;
  title: string;
  description: string;
  duration: number;
  startTime: string | null;
  published: boolean;
  locked: boolean;
  exceptions: string[];
  questions: Question[];
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  id: string;
  studentId: string;
  name: string;
  surname: string;
  cell: string;
}

export interface Answer {
  questionId: string;
  answerText: string;
  awardedPoints: number | null;
  feedback: string;
}

export interface Batch {
  id: string;
  name: string;
  createdAt: string;
  studentCount?: number;
  startedCount?: number;
  submittedCount?: number;
  markedCount?: number;
}

export interface Submission {
  id: string;
  examId: string;
  examTitle?: string;
  examDuration?: number;
  student: Student;
  batch?: { id: string; name: string } | null;
  status: SubmissionStatus;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  // Number of times this submission has been (re)started: bumped by a teacher Reset so the
  // client can tell a deliberate restart apart from a plain page reload.
  attempt?: number;
  answers: Answer[];
}

export interface StartExamAnswer {
  questionId: string;
  answerText: string;
  // Epoch ms the server last wrote this answer (null/absent if it was never answered). Sent so
  // the client can order its own writes honestly instead of stamping everything "now".
  updatedAt?: number | null;
}

// Response of POST /api/submissions/start. Returned on every load, whether the exam is being
// started for the first time or simply resumed after a reload.
export interface StartExamResponse {
  submissionId: string;
  startedAt: string;
  attempt: number;
  // Server clock at the time of this response, used to align the countdown with the real deadline.
  serverNow: string;
  answers: StartExamAnswer[];
}

export interface SubmissionAnswerDetail {
  id?: string;
  questionId: string;
  questionText: string;
  questionType: QuestionType;
  maxPoints: number;
  answerText: string;
  awardedPoints: number | null;
  feedback: string;
  correct?: string;
}

export interface CreateExamBody {
  title: string;
  description?: string;
  duration: number;
  startTime?: string;
  questions: Omit<Question, 'id' | 'examId'>[];
}

export interface MarkAnswerBody {
  questionId: string;
  awardedPoints: number;
  feedback?: string;
}

export interface FinalizeMarkingBody {
  answers: MarkAnswerBody[];
}