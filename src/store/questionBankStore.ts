import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join, parse, resolve } from "node:path";
import type { BankProgress, QuestionBank } from "../types";

const bankDir = resolve("data", "question-banks");
const progressPath = resolve("data", "question-progress.json");

interface ChannelProgress {
  selectedBankId?: string;
  banks: Record<string, BankProgress>;
}

interface StoredProgress {
  channels: Record<string, ChannelProgress>;
}

function loadProgress(): StoredProgress {
  if (!existsSync(progressPath)) return { channels: {} };
  try {
    return JSON.parse(readFileSync(progressPath, "utf8")) as StoredProgress;
  } catch (error) {
    console.error("Failed to load progress file, resetting:", error);
    return { channels: {} };
  }
}

function saveProgress(progress: StoredProgress) {
  mkdirSync(resolve("data"), { recursive: true });
  // writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
  try {
    writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
  } catch (error) {
    console.error("Failed to save progress file:", error);
    throw error;
  }
}

function bankLabel(bank: QuestionBank): string {
  const parts = [bank.examTitle, bank.specialty, bank.year]
    .filter(Boolean)
    .map(String);
  return parts.length > 0 ? parts.join(" - ") : parse(bank.sourceFile).name;
}

function normalizeBank(raw: Omit<QuestionBank, "id">, fileName: string) {
  return {
    id: parse(fileName).name,
    ...raw,
    sourceFile: raw.sourceFile ?? fileName,
  } satisfies QuestionBank;
}

export const questionBankStore = {
  list(): QuestionBank[] {
    if (!existsSync(bankDir)) return [];

    return readdirJson(bankDir)
      .flatMap((fileName) => {
        try {
          const fullPath = join(bankDir, fileName);
          const raw = JSON.parse(readFileSync(fullPath, "utf8")) as Omit<
            QuestionBank,
            "id"
          >;
          return [normalizeBank(raw, fileName)];
        } catch (error) {
          console.error(`Failed to load question bank ${fileName}:`, error);
          return [];
        }
      })
      .sort((a, b) => bankLabel(a).localeCompare(bankLabel(b)));
  },

  get(bankId: string): QuestionBank | undefined {
    return this.list().find((bank) => bank.id === bankId);
  },

  label(bank: QuestionBank): string {
    return bankLabel(bank);
  },

  select(channelId: string, bankId: string): BankProgress {
    const bank = this.get(bankId);
    if (!bank) {
      throw new Error(`Unknown question bank: ${bankId}`);
    }

    const progress = loadProgress();
    const channel = progress.channels[channelId] ?? { banks: {} };
    const selected = channel.banks[bankId] ?? {
      channelId,
      bankId,
      nextIndex: 0,
      covered: 0,
      updatedAt: Date.now(),
    };
    channel.selectedBankId = bankId;
    channel.banks[bankId] = { ...selected, updatedAt: Date.now() };
    progress.channels[channelId] = channel;
    saveProgress(progress);
    return channel.banks[bankId];
  },

  getProgress(channelId: string): BankProgress | undefined {
    const channel = loadProgress().channels[channelId];
    if (!channel?.selectedBankId) return undefined;
    return channel.banks[channel.selectedBankId];
  },

  listProgress(channelId: string): BankProgress[] {
    const channel = loadProgress().channels[channelId];
    if (!channel) return [];
    return Object.values(channel.banks).sort((a, b) =>
      a.bankId.localeCompare(b.bankId),
    );
  },

  advance(channelId: string): BankProgress | undefined {
    const progress = loadProgress();
    const channel = progress.channels[channelId];
    if (!channel?.selectedBankId) return undefined;

    const current = channel.banks[channel.selectedBankId];
    if (!current) return undefined;

    const next: BankProgress = {
      ...current,
      nextIndex: current.nextIndex + 1,
      covered: current.covered + 1,
      updatedAt: Date.now(),
    };
    channel.banks[channel.selectedBankId] = next;
    progress.channels[channelId] = channel;
    saveProgress(progress);
    return next;
  },

  reset(channelId: string): boolean {
    const progress = loadProgress();
    const channel = progress.channels[channelId];
    const existed = Boolean(channel?.selectedBankId);
    if (channel) {
      delete channel.selectedBankId;
      progress.channels[channelId] = channel;
    }
    saveProgress(progress);
    return existed;
  },
};

function readdirJson(dir: string): string[] {
  return readdirSync(dir)
    .filter((fileName: string) => fileName.endsWith(".json"))
    .filter((fileName: string) => basename(fileName) === fileName);
}
