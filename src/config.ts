// Bun reads .env automatically — no dotenv needed

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`❌ Missing required env var: ${key}`);
  return val;
}

export const config = {
  token: requireEnv("DISCORD_TOKEN"),
  clientId: requireEnv("CLIENT_ID"),
  guildId: process.env.GUILD_ID ?? null, // null = global commands
};
