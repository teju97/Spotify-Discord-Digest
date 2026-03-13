import "dotenv/config";
import express, { Request, Response } from "express";
import { SpotifyClient, TimeRange } from "./spotify";
import { DiscordClient, DiscordBotClient } from "./discord";
import { runDigest } from "./digest";

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 3000;

// Lazily instantiated so startup doesn't fail if .env is partially configured
let spotify: SpotifyClient;
let discord: DiscordClient | DiscordBotClient;

function getClients(): { spotify: SpotifyClient; discord: DiscordClient | DiscordBotClient } {
  if (!spotify) spotify = new SpotifyClient();
  if (!discord) {
    const useBot = Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CHANNEL_ID);
    discord = useBot ? new DiscordBotClient() : new DiscordClient();
  }
  return { spotify, discord };
}

// ---------------------------------------------------------------------------
// GET /status — health check + auth state
// ---------------------------------------------------------------------------
app.get("/status", (_req: Request, res: Response) => {
  const hasRefreshToken = Boolean(process.env.SPOTIFY_REFRESH_TOKEN);
  const hasBotToken = Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CHANNEL_ID);
  const hasWebhook = Boolean(process.env.DISCORD_WEBHOOK_URL);
  const discordConfigured = hasBotToken || hasWebhook;

  res.json({
    status: "ok",
    ready: hasRefreshToken && discordConfigured,
    auth: {
      spotify: hasRefreshToken ? "configured" : "missing — visit /auth",
      discord: hasBotToken ? "bot" : hasWebhook ? "webhook" : "missing — set DISCORD_BOT_TOKEN or DISCORD_WEBHOOK_URL",
    },
    endpoints: {
      "GET  /status": "Health check",
      "GET  /auth": "Start Spotify OAuth flow",
      "GET  /auth/callback": "OAuth callback (handled automatically)",
      "POST /trigger": "Run the digest now",
    },
  });
});

// ---------------------------------------------------------------------------
// GET /auth — redirect user to Spotify OAuth consent screen
// ---------------------------------------------------------------------------
app.get("/auth", (_req: Request, res: Response) => {
  try {
    const { spotify } = getClients();
    const url = spotify.buildAuthUrl();
    console.log("🔗 Redirecting to Spotify OAuth...");
    res.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /auth/callback — Spotify redirects here with a one-time code
// ---------------------------------------------------------------------------
app.get("/auth/callback", async (req: Request, res: Response) => {
  const code = req.query["code"] as string | undefined;
  const error = req.query["error"] as string | undefined;

  if (error) {
    res.status(400).json({ error: `Spotify auth denied: ${error}` });
    return;
  }

  if (!code) {
    res.status(400).json({ error: "Missing code in callback" });
    return;
  }

  try {
    const { spotify } = getClients();
    const { refreshToken } = await spotify.exchangeCode(code);

    // In production you'd persist this; for this exercise we surface it clearly
    console.log("\n✅ Spotify authorized!");
    console.log(`👉 Add this to your .env file:\n   SPOTIFY_REFRESH_TOKEN=${refreshToken}\n`);

    res.send(`
      <h2>✅ Spotify connected!</h2>
      <p>Copy this refresh token into your <code>.env</code> file as <code>SPOTIFY_REFRESH_TOKEN</code>, then restart the server:</p>
      <pre>${refreshToken}</pre>
      <p>Then hit <a href="/trigger">POST /trigger</a> to send your digest.</p>
    `);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("❌ Auth callback error:", message);
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /trigger — the main webhook endpoint
//
// Optional JSON body:
//   { "time_range": "short_term" | "medium_term" | "long_term", "limit": 10 }
// ---------------------------------------------------------------------------
app.post("/trigger", async (req: Request, res: Response) => {
  const timeRange = (req.body?.time_range as TimeRange) ?? "short_term";
  const limit = Math.min(Number(req.body?.limit ?? 10), 25); // cap at 25

  const validRanges: TimeRange[] = ["short_term", "medium_term", "long_term"];
  if (!validRanges.includes(timeRange)) {
    res.status(400).json({
      error: `Invalid time_range. Must be one of: ${validRanges.join(", ")}`,
    });
    return;
  }

  console.log(`\n📬 /trigger received — time_range=${timeRange}, limit=${limit}`);

  let clients;
  try {
    clients = getClients();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Config error";
    res.status(500).json({ error: message });
    return;
  }

  // Respond immediately so the caller isn't left hanging during API calls
  res.status(202).json({
    status: "accepted",
    message: "Digest is running — check your Discord channel!",
    params: { timeRange, limit },
  });

  // Run async (fire-and-forget after responding)
  const result = await runDigest(clients.spotify, clients.discord, timeRange, limit);
  if (!result.success) {
    console.error("❌ Digest failed:", result.error);
  } else {
    console.log(`✅ Digest complete — ${result.trackCount} tracks posted`);
  }
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`   GET  /status       — health check`);
  console.log(`   GET  /auth         — connect Spotify`);
  console.log(`   POST /trigger      — post digest to Discord\n`);

  if (!process.env.SPOTIFY_REFRESH_TOKEN) {
    console.log(`⚠️  No SPOTIFY_REFRESH_TOKEN found. Visit http://127.0.0.1:${PORT}/auth to connect Spotify.\n`);
  }
});
