import type { Session } from '../types';
import { randomUUID } from 'crypto';

const sessions = new Map<string, Session>(); // channelId → Session

export const sessionStore = {
  create(channelId: string, creatorId: string, totalQuestions: number): Session {
    const session: Session = {
      id: randomUUID(),
      channelId,
      creatorId,
      totalQuestions,
      currentQuestion: 0,
      scores: new Map(),
      startedAt: Date.now(),
      active: true,
    };
    sessions.set(channelId, session);
    return session;
  },

  get(channelId: string): Session | undefined {
    return sessions.get(channelId);
  },

  delete(channelId: string) {
    sessions.delete(channelId);
  },

  /** Called when a correct vote is revealed */
  addScore(channelId: string, userId: string) {
    const s = sessions.get(channelId);
    if (!s) return;
    s.scores.set(userId, (s.scores.get(userId) ?? 0) + 1);
  },

  /** Called each time /qcm runs inside a session */
  incrementQuestion(channelId: string): number {
    const s = sessions.get(channelId);
    if (!s) return 0;
    s.currentQuestion++;
    return s.currentQuestion;
  },
};
