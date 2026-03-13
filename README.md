# 🎵 Spotify → Discord Weekly Digest

A lightweight TypeScript app that fetches your Spotify top tracks and posts a well formatted digest to a Discord channel. Exposes a webhook so anyone can trigger it on demand.

## What it does

1. Authenticates with Spotify via OAuth 2.0 (Authorization Code flow)
2. Fetches your top tracks for a given time range (`short_term` / `medium_term` / `long_term`)
3. Posts a rich embed to Discord via the Bot API (or Incoming Webhook as a fallback)
4. Exposes a `POST /trigger` endpoint to kick this off on demand

---

## Setup

### 1. Clone & install

```bash
git clone <repo-url>
cd spotify-discord-digest
npm install
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

### 3. Create a Spotify App

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create an app — name and description can be anything
3. Add `http://127.0.0.1:3000/auth/callback` as a Redirect URI
4. Copy the **Client ID** and **Client Secret** into your `.env`

### 4. Set up Discord

The app supports two Discord integration options. **Option 2 (Bot API) is preferred** as it uses explicit authentication; Option 1 is simpler if you just want to get running quickly.

#### Option 1 — Incoming Webhook (simpler, no auth)

1. In Discord, go to your channel → **Edit Channel → Integrations → Webhooks → New Webhook**
2. Copy the **Webhook URL** into your `.env` as `DISCORD_WEBHOOK_URL`

#### Option 2 — Bot API (recommended, explicit authentication)

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) and create a new application
2. Under **Bot**, click **Add Bot** and copy the **Token** into your `.env` as `DISCORD_BOT_TOKEN`
3. Under **OAuth2 → URL Generator**, select the `bot` scope and the `Send Messages` permission, then use the generated URL to invite the bot to your server
4. Copy the target channel's ID (right-click the channel → **Copy Channel ID**) into your `.env` as `DISCORD_CHANNEL_ID`

If both options are configured, the Bot API takes precedence. You can verify which is active by hitting `GET /status` — it will show `"discord": "bot"` or `"discord": "webhook"`.

### 5. Authorize Spotify (one-time)

Start the server and complete the OAuth flow:

```bash
npm run dev
```

Visit [http://127.0.0.1:3000/auth](http://127.0.0.1:3000/auth) in your browser. After approving, you'll see a refresh token — copy it into your `.env` as `SPOTIFY_REFRESH_TOKEN`, then restart the server.

```
SPOTIFY_REFRESH_TOKEN=AQD...
```

---

## Running the server

```bash
# Development (ts-node, no build step)
npm run dev

# Production (compile first)
npm run build && npm start
```

Server starts on `http://127.0.0.1:3000`.

---

## Endpoints

### `GET /status`
Health check. Shows whether Spotify and Discord are configured.

```bash
curl http://127.0.0.1:3000/status
```

### `GET /auth`
Redirects to Spotify's OAuth consent screen. Visit in a browser.

### `POST /trigger`
Runs the digest. Posts your top tracks to Discord.

```bash
# Defaults: short_term, top 10
curl -X POST http://127.0.0.1:3000/trigger

# Custom: last 6 months, top 5
curl -X POST http://127.0.0.1:3000/trigger \
  -H "Content-Type: application/json" \
  -d '{"time_range": "medium_term", "limit": 5}'
```

**Body params (all optional):**
| Field | Values | Default |
|---|---|---|
| `time_range` | `short_term` (4 weeks) · `medium_term` (6 months) · `long_term` (all time) | `short_term` |
| `limit` | 1–25 | `10` |

The endpoint returns `202 Accepted` immediately and posts to Discord asynchronously.

---

## Error handling

| Scenario | Behaviour |
|---|---|
| Spotify token expired | Auto-refreshes using the refresh token and retries |
| Missing refresh token | Returns 500 with a helpful message pointing to `/auth` |
| Spotify rate limit (429) | Returns a clear error message |
| Discord webhook invalid | Returns a clear error message with remediation |
| Discord bot token invalid (401) | Returns a clear error message |
| Discord bot lacks channel permissions (403) | Returns a clear error message |
| Invalid `time_range` param | Returns 400 with valid options listed |
| No top tracks found | Posts an error embed to Discord, returns `success: false` |

---

## Assumptions

- The Spotify refresh token is long-lived and stored in `.env`. In a production system this would be encrypted and persisted in a database, with a token store per user.
- Two Discord integration modes are supported: Bot API (authenticates with `Authorization: Bot <token>`) and Incoming Webhook (capability URL, no formal auth). The Bot API is preferred. In production, OAuth2 with a bot token per guild would be the right approach.
- The `/trigger` endpoint is unauthenticated for demo simplicity. In production, you'd add a shared secret or Bearer token check.
- `limit` is capped at 25 to keep Discord embeds readable.

---

## Project structure

```
src/
├── index.ts     # Express server — all HTTP endpoints
├── spotify.ts   # Spotify API client (OAuth, top tracks, token refresh)
├── discord.ts   # Discord clients: DiscordBotClient (Bot API) + DiscordClient (webhook)
└── digest.ts    # Orchestration — ties Spotify + Discord together
```
