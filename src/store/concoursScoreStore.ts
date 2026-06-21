import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ConcoursUserScore } from "../types";

const scorePath = resolve("data", "concours-scores.json");

interface StoredScores {
  channels: Record<string, Record<string, Record<string, ConcoursUserScore>>>;
}

function loadScores(): StoredScores {
  if (!existsSync(scorePath)) return { channels: {} };
  try {
    return JSON.parse(readFileSync(scorePath, "utf8")) as StoredScores;
  } catch (error) {
    console.error("Failed to load concours scores file, resetting:", error);
    return { channels: {} };
  }
}

function saveScores(scores: StoredScores) {
  mkdirSync(resolve("data"), { recursive: true });
  writeFileSync(scorePath, `${JSON.stringify(scores, null, 2)}\n`);
}

const writeQueues = new Map<string, Promise<void>>();

function getQueue(channelId: string, bankId: string): Promise<void> {
  const key = `${channelId}:${bankId}`;
  return writeQueues.get(key) ?? Promise.resolve();
}

function setQueue(channelId: string, bankId: string, promise: Promise<void>) {
  const key = `${channelId}:${bankId}`;
  writeQueues.set(key, promise);
}

async function serializeWrite(
  channelId: string,
  bankId: string,
  task: () => void | Promise<void>,
): Promise<void> {
  const currentQueue = getQueue(channelId, bankId);
  const nextQueue = currentQueue
    .then(async () => {
      await task();
    })
    .catch((error) => {
      console.error(
        `Error in score store operation queue for ${channelId}:${bankId}:`,
        error,
      );
      throw error;
    });
  setQueue(channelId, bankId, nextQueue);
  return nextQueue;
}

export const concoursScoreStore = {
  async addResult(
    channelId: string,
    bankId: string,
    userId: string,
    points: number,
  ): Promise<void> {
    return serializeWrite(channelId, bankId, () => {
      const scores = loadScores();
      const channel = scores.channels[channelId] ?? {};
      const bank = channel[bankId] ?? {};
      const current = bank[userId] ?? { userId, points: 0, answered: 0 };

      bank[userId] = {
        userId,
        points: current.points + points,
        answered: current.answered + 1,
      };
      channel[bankId] = bank;
      scores.channels[channelId] = channel;
      saveScores(scores);
    });
  },

  list(channelId: string, bankId: string): ConcoursUserScore[] {
    const bank = loadScores().channels[channelId]?.[bankId];
    if (!bank) return [];
    return Object.values(bank).sort((a, b) => b.points - a.points);
  },

  async reset(channelId: string, bankId: string): Promise<void> {
    return serializeWrite(channelId, bankId, () => {
      const scores = loadScores();
      const channel = scores.channels[channelId];
      if (!channel?.[bankId]) return;

      delete channel[bankId];
      scores.channels[channelId] = channel;
      saveScores(scores);
    });
  },
};
