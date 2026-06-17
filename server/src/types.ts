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

export interface Submission {
  id: string;
  examId: string;
  student: Student;
  status: SubmissionStatus;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  answers: Answer[];
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