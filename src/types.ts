export interface PollOption {
  letter: string; // 'A' | 'B' | 'C' | 'D'
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
  questionNumber?: number; // set when a session is active
  sessionId?: string;
}

export interface Session {
  id: string;
  channelId: string;
  creatorId: string;
  totalQuestions: number;
  currentQuestion: number; // increments each /qcm
  scores: Map<string, number>; // userId → correct count
  startedAt: number;
  active: boolean;
}
