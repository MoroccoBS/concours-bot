export interface PollOption {
  letter: string; // 'A' | 'B' | 'C' | 'D' | 'E'
  text: string;
}

export interface Poll {
  messageId: string;
  channelId: string;
  guildId: string;
  question: string;
  options: PollOption[];
  correctAnswers?: string[]; // hidden until reveal, absent for blind QCMs
  votes: Map<string, string[]>; // userId -> selected letters
  creatorId: string;
  endsAt: number; // Unix ms
  revealed: boolean;
  questionNumber?: number;
  bankId?: string;
}

export interface QuestionBankOption {
  letter: string;
  text: string;
}

export interface QuestionBankQuestion {
  number: number;
  text: string;
  options: QuestionBankOption[];
  correctAnswers?: string[];
  pageStart?: number;
  pageEnd?: number;
  confidence?: number;
  needsReview?: boolean;
  reviewNotes?: string[];
}

export interface QuestionBank {
  id: string;
  sourceFile: string;
  examTitle?: string | null;
  specialty?: string | null;
  year?: number | null;
  language?: string;
  questions: QuestionBankQuestion[];
  warnings?: string[];
}

export interface BankProgress {
  channelId: string;
  bankId: string;
  nextIndex: number;
  covered: number;
  updatedAt: number;
}

export interface ConcoursUserScore {
  userId: string;
  points: number;
  answered: number;
}
