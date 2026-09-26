/**
 * Inicio de sesión único con la billetera digital (MiHome).
 *
 * La persona ya inició sesión en la billetera (correo + contraseña + PIN). Al tocar «Asistencia», la billetera pide al
 * banco un CÓDIGO de un solo uso (60 s) y la manda aquí. Este servidor lo canjea con el banco firmando con su secreto
 * (nunca desde el navegador) y recibe el correo VERIFICADO de esa persona. Nunca se comparte la sesión de la billetera.
 */
import { createHash, createHmac } from "node:crypto";

export const RE_CODIGO = /^[A-Za-z0-9_-]{20,100}$/;

export interface UsuarioSso {
  email: string;
  nombre: string;
  cuenta: string;
}

export type ResultadoSso =
  | { ok: true; usuario: UsuarioSso }
  | { ok: false; motivo: "configuracion" | "codigo" | "red" };

interface ConfigSso {
  url: string;
  app: string;
  secreto: string;
  db?: string;
}

export function configSso(env: Record<string, string | undefined> = process.env): ConfigSso | null {
  const url = env.WALLET_URL?.trim().replace(/\/+$/, "");
  const app = env.WALLET_SSO_APP?.trim();
  const secreto = env.WALLET_SSO_SECRET?.trim();
  if (!url || !app || !secreto) return null;
  return { url, app, secreto, db: env.WALLET_DB?.trim() || undefined };
}

/** HMAC-SHA256 hex de "<timestamp>\n<ruta>\n<sha256(cuerpo)>": la misma firma que usa el banco con todas las plataformas. */
export function firmar(secreto: string, timestamp: number, ruta: string, cuerpo: string | Buffer): string {
  const digest = createHash("sha256").update(cuerpo).digest("hex");
  return createHmac("sha256", secreto).update(`${timestamp}\n${ruta}\n${digest}`).digest("hex");
}

export async function canjearCodigo(codigo: string, config: ConfigSso | null = configSso(), fetchFn: typeof fetch = fetch, ahora: () => number = Date.now): Promise<ResultadoSso> {
  if (!config) return { ok: false, motivo: "configuracion" };
  if (!RE_CODIGO.test(codigo)) return { ok: false, motivo: "codigo" };
  const ruta = "/api/wallet/sso/exchange";
  const cuerpo = JSON.stringify({ jsonrpc: "2.0", method: "call", params: { code: codigo } });
  const ts = Math.floor(ahora() / 1000);
  try {
    const r = await fetchFn(`${config.url}${ruta}${config.db ? `?db=${encodeURIComponent(config.db)}` : ""}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-wallet-platform": config.app,
        "x-wallet-timestamp": String(ts),
        "x-wallet-signature": firmar(config.secreto, ts, ruta, cuerpo),
      },
      body: cuerpo,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return { ok: false, motivo: "red" };
    const resultado = ((await r.json()) as { result?: Record<string, unknown> }).result;
    const usuario = resultado?.user as Record<string, unknown> | undefined;
    if (!resultado?.success || !usuario || usuario.email_verified !== true || typeof usuario.email !== "string" || !usuario.email) {
      return { ok: false, motivo: "codigo" };
    }
    return { ok: true, usuario: { email: usuario.email, nombre: String(usuario.name ?? ""), cuenta: String(usuario.account ?? "") } };
  } catch {
    return { ok: false, motivo: "red" };
  }
}
