const fs = require('fs');
const f = 'components/UserDashboard.tsx';
let c = fs.readFileSync(f, 'utf8');

const replacements = [
  // Status messages
  ["Obteniendo ubicaci\u00c3\u00b3n...", "Obteniendo ubicaci\u00f3n..."],
  ["Procesando sin ubicaci\u00c3\u00b3n...", "Procesando sin ubicaci\u00f3n..."],
  // Location messages
  ["ubicaci\u00c3\u00b3n:", "ubicaci\u00f3n:"],
  [" (UbicaciÃ³n:", " (Ubicaci\u00f3n:"],
  [" (Sin ubicaciÃ³n)", " (Sin ubicaci\u00f3n)"],
  // Entry/exit
  ["Â¡Entrada registrada", "¡Entrada registrada"],
  ["Â¡Salida registrada", "¡Salida registrada"],
  // Error handling
  ["userID no es un nÃºmero vÃ¡lido", "userID no es un n\u00famero v\u00e1lido"],
  ["No se pudo obtener ubicaciÃ³n:", "No se pudo obtener ubicaci\u00f3n:"],
  // Remaining
  ["geolocalizaciÃ³n", "geolocalizaci\u00f3n"],
  ["ubicaciÃ³n", "ubicaci\u00f3n"],
  ["UbicaciÃ³n", "Ubicaci\u00f3n"],
  ["nÃºmero", "n\u00famero"],
  ["vÃ¡lido", "v\u00e1lido"],
];

let changed = 0;
for (const [from, to] of replacements) {
  if (c.includes(from)) {
    c = c.split(from).join(to);
    changed++;
  }
}

fs.writeFileSync(f, c, 'utf8');
console.log('Fixed', changed, 'occurrences.');
