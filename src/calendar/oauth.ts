import { getCalendarConnection, updateAccessToken } from "./repository";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

export function buildGoogleAuthUrl(clientId: string, redirectUri: string, tenantId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: tenantId,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function requestToken(params: Record<string, string>): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const data = (await res.json()) as GoogleTokenResponse;
  if (!res.ok || data.error) {
    throw new Error(`Google OAuth token request falló: ${data.error_description ?? data.error ?? res.status}`);
  }
  return data;
}

export async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
  const data = await requestToken({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (!data.refresh_token) {
    throw new Error(
      "Google no devolvió refresh_token — probablemente el tenant ya había autorizado antes; revoca el acceso en myaccount.google.com/permissions y vuelve a conectar.",
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: string }> {
  const data = await requestToken({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

// Da un access_token vigente para el tenant, refrescándolo si ya venció.
// Margen de 60s para no usar un token que expire a mitad de la request.
export async function getValidAccessToken(
  db: D1Database,
  clientId: string,
  clientSecret: string,
  tenantId: string,
): Promise<{ accessToken: string; calendarId: string } | null> {
  const connection = await getCalendarConnection(db, tenantId);
  if (!connection) return null;

  const expiresInMs = new Date(connection.expiresAt).getTime() - Date.now();
  if (expiresInMs > 60_000) {
    return { accessToken: connection.accessToken, calendarId: connection.calendarId };
  }

  const refreshed = await refreshAccessToken(clientId, clientSecret, connection.refreshToken);
  await updateAccessToken(db, tenantId, refreshed.accessToken, refreshed.expiresAt);
  return { accessToken: refreshed.accessToken, calendarId: connection.calendarId };
}
