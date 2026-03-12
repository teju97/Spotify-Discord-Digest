import axios, { AxiosError } from "axios";

const SPOTIFY_BASE = "https://api.spotify.com/v1";
const SPOTIFY_ACCOUNTS = "https://accounts.spotify.com";

export interface Track {
  rank: number;
  name: string;
  artists: string[];
  album: string;
  url: string;
  popularity: number;
}

export type TimeRange = "short_term" | "medium_term" | "long_term";

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  short_term: "Last 4 Weeks",
  medium_term: "Last 6 Months",
  long_term: "All Time",
};

export class SpotifyClient {
  private accessToken: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor() {
    this.accessToken = "";
    this.clientId = process.env.SPOTIFY_CLIENT_ID ?? "";
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET ?? "";

    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        "Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in environment"
      );
    }
  }

  /** Exchange a one-time auth code for access + refresh tokens */
  async exchangeCode(
    code: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
    if (!redirectUri) throw new Error("Missing SPOTIFY_REDIRECT_URI");

    const response = await axios.post(
      `${SPOTIFY_ACCOUNTS}/api/token`,
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
      { headers: this.basicAuthHeaders() }
    );

    this.accessToken = response.data.access_token;
    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
    };
  }

  /** Use stored refresh token to get a new access token */
  async refreshAccessToken(): Promise<void> {
    const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
    if (!refreshToken) {
      throw new Error(
        "No SPOTIFY_REFRESH_TOKEN set. Please complete the /auth flow first."
      );
    }

    const response = await axios.post(
      `${SPOTIFY_ACCOUNTS}/api/token`,
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      { headers: this.basicAuthHeaders() }
    );

    this.accessToken = response.data.access_token;
    console.log("✅ Spotify access token refreshed");
  }

  /** Fetch the current user's top tracks, auto-refreshing on 401 */
  async getTopTracks(
    timeRange: TimeRange = "short_term",
    limit = 10
  ): Promise<Track[]> {
    await this.ensureAccessToken();

    try {
      const response = await axios.get(`${SPOTIFY_BASE}/me/top/tracks`, {
        params: { time_range: timeRange, limit },
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return response.data.items.map((item: any, index: number) => ({
        rank: index + 1,
        name: item.name,
        artists: item.artists.map((a: { name: string }) => a.name),
        album: item.album.name,
        url: item.external_urls.spotify,
        popularity: item.popularity,
      }));
    } catch (err) {
      const error = err as AxiosError;

      if (error.response?.status === 401) {
        // Token expired — refresh and retry once
        await this.refreshAccessToken();
        const retry = await axios.get(`${SPOTIFY_BASE}/me/top/tracks`, {
          params: { time_range: timeRange, limit },
          headers: { Authorization: `Bearer ${this.accessToken}` },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return retry.data.items.map((item: any, index: number) => ({
          rank: index + 1,
          name: item.name,
          artists: item.artists.map((a: { name: string }) => a.name),
          album: item.album.name,
          url: item.external_urls.spotify,
          popularity: item.popularity,
        }));
      }

      if (error.response?.status === 429) {
        throw new Error("Spotify rate limit hit. Please try again shortly.");
      }

      throw new Error(
        `Spotify API error: ${error.response?.status ?? "unknown"} — ${
          (error.response?.data as { error?: { message?: string } })?.error
            ?.message ?? error.message
        }`
      );
    }
  }

  /** Build the Spotify OAuth authorization URL */
  buildAuthUrl(): string {
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI ?? "";
    const scopes = "user-top-read";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      scope: scopes,
      redirect_uri: redirectUri,
    });
    return `${SPOTIFY_ACCOUNTS}/authorize?${params.toString()}`;
  }

  private async ensureAccessToken(): Promise<void> {
    if (!this.accessToken) {
      await this.refreshAccessToken();
    }
  }

  private basicAuthHeaders() {
    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`
    ).toString("base64");
    return {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    };
  }
}
