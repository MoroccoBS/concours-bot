import { Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "./config";
import { handleButton, handleVoteSelect } from "./handlers/buttonHandler";
import { handleCommand } from "./handlers/commandHandler";

// ── Client setup ──────────────────────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ── Ready ─────────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, (c) => {
  console.log(`✅ Connecté en tant que ${c.user.tag}`);
  console.log(`   Serveurs : ${c.guilds.cache.size}`);
});

// ── Interaction router ────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      await handleVoteSelect(interaction);
      return;
    }
  } catch (err) {
    console.error("[interaction]", err);
  }
});

// ── Error handlers ────────────────────────────────────────────────────────────
client.on(Events.Error, (err) => console.error("[client error]", err));
process.on("unhandledRejection", (err) =>
  console.error("[unhandledRejection]", err),
);

// ── Login ─────────────────────────────────────────────────────────────────────
client.login(config.token);
