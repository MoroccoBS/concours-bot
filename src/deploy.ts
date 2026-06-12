import { REST, Routes } from 'discord.js';
import { config } from './config';
import { commands } from './commands';

const rest = new REST().setToken(config.token);
const body = commands.map(c => c.data.toJSON());

console.log(`📡 Enregistrement de ${body.length} commande(s)...`);

if (config.guildId) {
  // Guild commands → instant (great for development)
  await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body },
  );
  console.log(`✅ Commandes enregistrées sur le serveur ${config.guildId}`);
} else {
  // Global commands → up to 1h propagation
  await rest.put(
    Routes.applicationCommands(config.clientId),
    { body },
  );
  console.log('✅ Commandes globales enregistrées (propagation ~1h)');
}
