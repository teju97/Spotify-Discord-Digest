import { SpotifyClient, TimeRange } from "./spotify";
import { DiscordSender } from "./discord";

export interface DigestResult {
  success: boolean;
  trackCount?: number;
  timeRange?: TimeRange;
  error?: string;
}

export async function runDigest(
  spotify: SpotifyClient,
  discord: DiscordSender,
  timeRange: TimeRange = "short_term",
  limit = 10
): Promise<DigestResult> {
  try {
    console.log(`🎵 Fetching top ${limit} tracks (${timeRange})...`);
    const tracks = await spotify.getTopTracks(timeRange, limit);

    if (tracks.length === 0) {
      const msg = "No top tracks found for this time range. Listen to more music on Spotify!";
      await discord.postError(msg);
      return { success: false, error: msg };
    }

    await discord.postDigest(tracks, timeRange);

    return { success: true, trackCount: tracks.length, timeRange };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("❌ Digest failed:", message);

    // Best-effort: try to notify Discord about the failure
    try {
      await discord.postError(message);
    } catch {
      console.error("❌ Also failed to post error to Discord");
    }

    return { success: false, error: message };
  }
}
