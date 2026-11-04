/**
 * Limpieza de texto libre (sin dependencias).
 *
 * Antes se usaba `isomorphic-dompurify` (que arrastra `jsdom`). En un servidor tipo Vercel esa libreria falla al cargarse
 * y tumbaba la ruta completa con un 500 en HTML: la sincronizacion de asientos dejo de funcionar. No hace falta: el texto es
 * plano y todo lo que lo muestra lo escapa (React, el PDF de Odoo, el campo de texto de Odoo). Aqui solo se quitan los
 * caracteres de control (incluido el nulo, que Postgres rechaza), se normalizan los saltos de linea y se recorta el exceso.
 * No se borra nada que parezca una etiqueta: una nota como «cota <3 m y >2 m» es texto legitimo de obra.
 */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function limpiarTexto(valor: unknown, max = 20000): string {
  return String(valor ?? '').replace(/\r\n?/g, '\n').replace(CONTROL, '').slice(0, max);
}
