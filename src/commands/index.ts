import { answerCommand } from "./answer";
import { concoursCommand } from "./concours";
import { pingCommand } from "./ping";
import { qcmCommand } from "./qcm";
import { revealCommand } from "./reveal";

export const commands = [
  answerCommand,
  qcmCommand,
  revealCommand,
  pingCommand,
  concoursCommand,
];

// Name → command map for the interaction handler
export const commandMap = new Map(commands.map((c) => [c.data.name, c]));
