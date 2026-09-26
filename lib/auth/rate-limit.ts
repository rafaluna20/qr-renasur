/**
 * Límite de intentos de inicio de sesión (en memoria, por instancia del servidor).
 *
 * En un hosting serverless cada instancia lleva su propia cuenta, así que frena la fuerza bruta casual pero no a un
 * atacante distribuido: por eso el inicio de sesión con DNI debe reemplazarse por el inicio de sesión único.
 */
interface Cubeta {
  intentos: number;
  desde: number;
}

const cubetas = new Map<string, Cubeta>();
const MAX_CUBETAS = 5000;

export const MAX_INTENTOS = 5;
export const VENTANA_MS = 15 * 60 * 1000;

/** Registra un intento y dice si aún está permitido. Devuelve también los segundos que faltan si no lo está. */
export function registrarIntento(clave: string, ahora = Date.now()): { permitido: boolean; reintentarEn: number } {
  if (cubetas.size > MAX_CUBETAS) {
    for (const [k, c] of cubetas) if (ahora - c.desde > VENTANA_MS) cubetas.delete(k);
  }
  const actual = cubetas.get(clave);
  if (!actual || ahora - actual.desde > VENTANA_MS) {
    cubetas.set(clave, { intentos: 1, desde: ahora });
    return { permitido: true, reintentarEn: 0 };
  }
  actual.intentos += 1;
  if (actual.intentos > MAX_INTENTOS) {
    return { permitido: false, reintentarEn: Math.ceil((VENTANA_MS - (ahora - actual.desde)) / 1000) };
  }
  return { permitido: true, reintentarEn: 0 };
}

/** Un inicio de sesión correcto borra el contador de esa clave. */
export function limpiarIntentos(clave: string): void {
  cubetas.delete(clave);
}

export function reiniciarTodo(): void {
  cubetas.clear();
}
