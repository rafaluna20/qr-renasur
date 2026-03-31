import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// The secret should normally be in process.env.SESSION_SECRET
// For this quick implementation we use a fallback if not provided
const secretKey = process.env.SESSION_SECRET || "terra-lima-super-secret-key-32-chars!!";
const encodedKey = new TextEncoder().encode(secretKey);

export async function createSession(payload: any) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d") // 1 semana de expiracion
    .sign(encodedKey);
}

export async function verifySession(session: string | undefined = "") {
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ["HS256"],
    });
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

export async function setSessionCookie(payload: any) {
  const session = await createSession(payload);
  const cookieStore = await cookies();
  
  cookieStore.set("terra_session", session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 dÃ­as
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete("terra_session");
}
