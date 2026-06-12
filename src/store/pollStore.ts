import type { Poll } from "../types";

// One active poll per channel at a time
const polls = new Map<string, Poll>();
const questionNumbers = new Map<string, number>();

// Track running timers so we can clear them on early reveal
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const pollStore = {
  set(channelId: string, poll: Poll) {
    polls.set(channelId, poll);
  },

  get(channelId: string): Poll | undefined {
    return polls.get(channelId);
  },

  delete(channelId: string) {
    polls.delete(channelId);
  },

  nextQuestionNumber(channelId: string): number {
    const next = (questionNumbers.get(channelId) ?? 0) + 1;
    questionNumbers.set(channelId, next);
    return next;
  },

  rememberQuestionNumber(channelId: string, questionNumber: number) {
    questionNumbers.set(channelId, questionNumber);
  },

  setTimer(channelId: string, timer: ReturnType<typeof setTimeout>) {
    timers.set(channelId, timer);
  },

  clearTimer(channelId: string) {
    const t = timers.get(channelId);
    if (t) {
      clearTimeout(t);
      timers.delete(channelId);
    }
  },
};
