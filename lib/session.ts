import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/**
 * Clave con la que se firman las sesiones (SESSION_SECRET, mínimo 32 caracteres).
 *
 * ANTES había una clave por defecto escrita en el código: quien la leyera (está en el repositorio) podía fabricarse una
 * sesión de administrador. En producción ya no existe: sin SESSION_SECRET no se crean ni se aceptan sesiones.
 */
const CLAVE_SOLO_PARA_DESARROLLO = "clave-solo-para-desarrollo-local-no-usar-en-produccion";

export function claveDeSesion(env: Record<string, string | undefined> = process.env): Uint8Array {
  const secreto = env.SESSION_SECRET?.trim();
  if (secreto && secreto.length >= 32) return new TextEncoder().encode(secreto);
  if (env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET no está configurada (mínimo 32 caracteres): las sesiones quedan deshabilitadas");
  }
  return new TextEncoder().encode(CLAVE_SOLO_PARA_DESARROLLO);
}

export async function createSession(payload: any, duracion: string = "7d") {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(duracion) // 1 semana de expiracion
    .sign(claveDeSesion());
}

/**
 * Valida una sesión. Los tokens «pendientes» (la persona ya se identificó pero aún no eligió empresa) NO sirven como
 * sesión: solo se aceptan cuando se piden expresamente (`{ pendiente: true }`), para el paso de elegir empresa.
 */
export async function verifySession(session: string | undefined = "", opciones: { pendiente?: boolean } = {}) {
  try {
    const { payload } = await jwtVerify(session, claveDeSesion(), {
      algorithms: ["HS256"],
    });
    const esPendiente = payload.tipo === "pendiente";
    if (esPendiente !== Boolean(opciones.pendiente)) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const session = cookieStore.get("terra_session")?.value;
  if (!session) return null;
  return await verifySession(session);
}

export async function getSessionFromRequest(req: Request) {
  // Intentar leer de cabecera Authorization: Bearer <token>
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    return await verifySession(token);
  }

  // Fallback a cookie
  return await getSession();
}

export async function setSessionCookie(payload: any) {
  const session = await createSession(payload);
  const cookieStore = await cookies();

  cookieStore.set("terra_session", session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 dias
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete("terra_session");
  cookieStore.delete("terra_pendiente");
}

/** Cookie del paso intermedio «elegir empresa» (10 minutos; no da acceso a ninguna API). */
export async function setPendingCookie(payload: Record<string, unknown>) {
  const token = await createSession({ ...payload, tipo: "pendiente" }, "10m");
  const cookieStore = await cookies();
  cookieStore.set("terra_pendiente", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
}

export async function getPending() {
  const cookieStore = await cookies();
  const token = cookieStore.get("terra_pendiente")?.value;
  if (!token) return null;
  return await verifySession(token, { pendiente: true });
}

export async function clearPendingCookie() {
  const cookieStore = await cookies();
  cookieStore.delete("terra_pendiente");
}
