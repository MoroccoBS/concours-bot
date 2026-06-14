import { concoursCommand } from "./concours";
import { pingCommand } from "./ping";
import { qcmCommand } from "./qcm";
import { revealCommand } from "./reveal";
import { sessionCommand } from "./session";

export const commands = [
  qcmCommand,
  revealCommand,
  sessionCommand,
  pingCommand,
  concoursCommand,
];

// Name → command map for the interaction handler
export const commandMap = new Map(commands.map((c) => [c.data.name, c]));
