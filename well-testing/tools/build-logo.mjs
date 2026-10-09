// Genera js/logo.js con los logotipos incrustados como data URI.
// Las exportaciones a PNG/SVG (macropera, DTI) usan esta copia porque, al abrir
// las páginas con doble clic (file://), el navegador no deja leer archivos SVG
// externos dentro de un lienzo. Ejecútelo después de reemplazar el logotipo:
//   node well-testing/tools/build-logo.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uri = (f) => 'data:image/svg+xml;base64,' + readFileSync(path.join(root, 'assets', f)).toString('base64');
const out = `/* Generado por tools/build-logo.mjs a partir de assets/logo-rbtec*.svg — no editar a mano. */
(function () {
  'use strict';
  var WT = (window.WT = window.WT || {});
  WT.logo = {
    color: '${uri('logo-rbtec.svg')}',
    blanco: '${uri('logo-rbtec-blanco.svg')}'
  };
})();
`;
writeFileSync(path.join(root, 'js', 'logo.js'), out);
console.log('js/logo.js actualizado');
