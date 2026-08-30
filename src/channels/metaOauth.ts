// Agencia (conectores Facebook/Instagram, autoservicio real): pegar
// manualmente un Page Access Token obliga a cada cliente nuevo a entrar al
// dashboard de Meta y sacarlo a mano — no es "fácil" para un dueño de
// negocio no técnico, y no escala sin que Oscar (o Claude) intervenga en
// cada alta. Este OAuth ("Facebook Login for Business") es el mismo
// patrón ya usado para Google Calendar (src/calendar/oauth.ts): un botón
// "Conectar con Facebook", el dueño inicia sesión con SU propia cuenta,
// autoriza, y Radamantis obtiene el Page Access Token solo — sin tokens
// a mano, sin ir al Graph API Explorer.
//
// Nota real (no oculta a Oscar): mientras la App de Meta esté en modo
// Desarrollo, esta autorización solo funciona para cuentas que sean
// Admin/Developer/Tester de la App — para clientes externos reales hace
// falta pasar la App por Meta App Review una vez (permisos
// pages_messaging/instagram_manage_messages). El código no cambia cuando
// eso pase, solo se destraba para más cuentas.

const GRAPH_API_VERSION = "v21.0";
const OAUTH_SCOPES = ["pages_show_list", "pages_messaging", "pages_manage_metadata", "instagram_basic", "instagram_manage_messages"].join(",");

export function buildFacebookAuthUrl(appId: string, redirectUri: string, tenantId: string): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state: tenantId,
    scope: OAUTH_SCOPES,
    response_type: "code",
  });
  return `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;
}

interface FacebookTokenResponse {
  access_token: string;
}

export async function exchangeCodeForUserToken(appId: string, appSecret: string, redirectUri: string, code: string): Promise<string> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", code);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Meta OAuth (code→token) falló: ${res.status} ${await res.text()}`);
  return ((await res.json()) as FacebookTokenResponse).access_token;
}

// Un Page Access Token obtenido con un User Access Token de larga duración
// no expira (mientras el usuario no revoque el acceso) — por eso este paso
// importa: sin él, el token de la Página duraría solo ~1-2 horas.
export async function exchangeForLongLivedUserToken(appId: string, appSecret: string, shortLivedToken: string): Promise<string> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Meta OAuth (token de larga duración) falló: ${res.status} ${await res.text()}`);
  return ((await res.json()) as FacebookTokenResponse).access_token;
}

export interface ConnectedPage {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  instagramBusinessAccountId: string | null;
}

// GET /me/accounts devuelve las Páginas que administra el usuario que
// autorizó, cada una YA con su propio Page Access Token (no hace falta un
// intercambio extra). Se consulta instagram_business_account por Página
// para detectar automáticamente si tiene un Instagram vinculado — así el
// dueño del negocio no tiene que buscar ese ID a mano.
export async function listManagedPages(longLivedUserToken: string): Promise<ConnectedPage[]> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts?access_token=${encodeURIComponent(longLivedUserToken)}`,
  );
  if (!res.ok) throw new Error(`Meta (listar Páginas) falló: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { data: { id: string; name: string; access_token: string }[] };

  return Promise.all(
    data.data.map(async (page) => {
      const igRes = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(page.access_token)}`,
      );
      const igData = igRes.ok ? ((await igRes.json()) as { instagram_business_account?: { id: string } }) : {};
      return {
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.access_token,
        instagramBusinessAccountId: igData.instagram_business_account?.id ?? null,
      };
    }),
  );
}
