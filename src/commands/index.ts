import { qcmCommand }     from './qcm';
import { revealCommand }  from './reveal';
import { sessionCommand } from './session';
import { pingCommand }    from './ping';

export const commands = [qcmCommand, revealCommand, sessionCommand, pingCommand];

// Name → command map for the interaction handler
export const commandMap = new Map(commands.map(c => [c.data.name, c]));
