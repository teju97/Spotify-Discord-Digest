import axios, { AxiosError } from "axios";
import { Track, TimeRange, TIME_RANGE_LABELS } from "./spotify";

// Discord color: Spotify green
const SPOTIFY_GREEN = 0x1db954;

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  footer: { text: string };
  timestamp: string;
  thumbnail?: { url: string };
}

export interface DiscordSender {
  postDigest(tracks: Track[], timeRange: TimeRange): Promise<void>;
  postError(message: string): Promise<void>;
}

export class DiscordClient implements DiscordSender {
  private readonly webhookUrl: string;

  constructor() {
    this.webhookUrl = process.env.DISCORD_WEBHOOK_URL ?? "";
    if (!this.webhookUrl) {
      throw new Error("Missing DISCORD_WEBHOOK_URL in environment");
    }
  }

  /** Post the top tracks digest as a rich Discord embed */
  async postDigest(tracks: Track[], timeRange: TimeRange): Promise<void> {
    const label = TIME_RANGE_LABELS[timeRange];
    const trackList = tracks
      .map(
        (t) =>
          `**${t.rank}.** [${t.name}](${t.url})\n` +
          `┗ ${t.artists.join(", ")} · *${t.album}*`
      )
      .join("\n\n");

    const embed: DiscordEmbed = {
      title: `🎵 Your Spotify Top Tracks — ${label}`,
      description: trackList,
      color: SPOTIFY_GREEN,
      footer: {
        text: "Powered by Spotify × Discord Digest",
      },
      timestamp: new Date().toISOString(),
    };

    await this.send({ embeds: [embed] });
    console.log(`✅ Discord digest posted for time range: ${timeRange}`);
  }

  /** Post a plain error notification to the channel */
  async postError(message: string): Promise<void> {
    await this.send({
      embeds: [
        {
          title: "⚠️ Digest Error",
          description: message,
          color: 0xff4444,
          timestamp: new Date().toISOString(),
        },
      ],
    });
  }

  private async send(payload: object): Promise<void> {
    try {
      await axios.post(this.webhookUrl, payload, {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      const error = err as AxiosError;

      if (error.response?.status === 429) {
        throw new Error("Discord rate limit hit. Please try again shortly.");
      }
      if (error.response?.status === 404) {
        throw new Error(
          "Discord webhook URL not found. Check DISCORD_WEBHOOK_URL is correct."
        );
      }

      throw new Error(
        `Discord API error: ${error.response?.status ?? "unknown"} — ${error.message}`
      );
    }
  }
}

export class DiscordBotClient implements DiscordSender {
  private readonly token: string;
  private readonly channelId: string;
  private readonly apiBase = "https://discord.com/api/v10";

  constructor() {
    this.token = process.env.DISCORD_BOT_TOKEN ?? "";
    this.channelId = process.env.DISCORD_CHANNEL_ID ?? "";
    if (!this.token) throw new Error("Missing DISCORD_BOT_TOKEN in environment");
    if (!this.channelId) throw new Error("Missing DISCORD_CHANNEL_ID in environment");
  }

  /** Post the top tracks digest as a rich Discord embed */
  async postDigest(tracks: Track[], timeRange: TimeRange): Promise<void> {
    const label = TIME_RANGE_LABELS[timeRange];
    const trackList = tracks
      .map(
        (t) =>
          `**${t.rank}.** [${t.name}](${t.url})\n` +
          `┗ ${t.artists.join(", ")} · *${t.album}*`
      )
      .join("\n\n");

    const embed: DiscordEmbed = {
      title: `🎵 Your Spotify Top Tracks — ${label}`,
      description: trackList,
      color: SPOTIFY_GREEN,
      footer: { text: "Powered by Spotify × Discord Digest" },
      timestamp: new Date().toISOString(),
    };

    await this.send({ embeds: [embed] });
    console.log(`✅ Discord digest posted for time range: ${timeRange}`);
  }

  /** Post a plain error notification to the channel */
  async postError(message: string): Promise<void> {
    await this.send({
      embeds: [
        {
          title: "⚠️ Digest Error",
          description: message,
          color: 0xff4444,
          timestamp: new Date().toISOString(),
        },
      ],
    });
  }

  private async send(payload: object): Promise<void> {
    try {
      await axios.post(
        `${this.apiBase}/channels/${this.channelId}/messages`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bot ${this.token}`,
          },
        }
      );
    } catch (err) {
      const error = err as AxiosError;

      if (error.response?.status === 429) {
        throw new Error("Discord rate limit hit. Please try again shortly.");
      }
      if (error.response?.status === 401) {
        throw new Error(
          "Discord bot token invalid. Check DISCORD_BOT_TOKEN is correct."
        );
      }
      if (error.response?.status === 403) {
        throw new Error(
          "Discord bot lacks permission to post in this channel. Check the bot's channel permissions."
        );
      }
      if (error.response?.status === 404) {
        throw new Error(
          "Discord channel not found. Check DISCORD_CHANNEL_ID is correct."
        );
      }

      throw new Error(
        `Discord API error: ${error.response?.status ?? "unknown"} — ${error.message}`
      );
    }
  }
}
