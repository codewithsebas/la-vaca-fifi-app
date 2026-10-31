// Genera el logo y el favicon de La Vaca Fifí a partir de los trazos del personaje (src/components/fifi/fifi-paths.ts):
//   node --experimental-strip-types scripts/fifi-logo.mjs
// Escribe public/logo-la-vaca-fifi.svg (sello de 512 px) y public/favicon-la-vaca-fifi.svg (la cara más grande, para
// 16-48 px). Los PNG del sitio (public/logo-la-vaca-fifi.png, 768 px) y app/favicon.ico se exportan desde estos SVG.
import { writeFile } from "node:fs/promises";
import { FIFI, FIFI_COLORS as C, FIFI_EYES } from "../src/components/fifi/fifi-paths.ts";

const SKY = "#2fa8e0";
const HILLS = "M-20 330C70 296 150 326 236 308C322 290 410 318 532 294V540H-20Z";

// Fifí (sin la taza), con o sin el texto del arete.
function fifi({ tagText }) {
  const eyes = FIFI_EYES.map(
    ({ white: [wx, wy, rx, ry], iris: [ix, iy, ir], pupil: [px, py, pr], shine: [sx, sy, sr] }) =>
      `<ellipse cx="${wx}" cy="${wy}" rx="${rx}" ry="${ry}" fill="${C.white}"/><circle cx="${ix}" cy="${iy}" r="${ir}" fill="${C.iris}" stroke-width="3"/><circle cx="${px}" cy="${py}" r="${pr}" fill="${C.ink}" stroke="none"/><circle cx="${sx}" cy="${sy}" r="${sr}" fill="${C.white}" stroke="none"/>`,
  ).join("");
  return `<g stroke="${C.ink}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
<path d="${FIFI.earRight}" fill="${C.earRight}"/><path d="${FIFI.earRightInner}" fill="${C.earRightInner}" stroke="none"/>
<path d="${FIFI.hornLeft}" fill="${C.horn}"/><path d="${FIFI.hornRight}" fill="${C.horn}"/>
<path d="${FIFI.earLeft}" fill="${C.earLeft}"/><path d="${FIFI.head}" fill="${C.white}"/><path d="${FIFI.patch}" fill="${C.patch}" stroke="none"/>
${eyes}<path d="${FIFI.lashes}" fill="none" stroke-width="4"/>
<path d="${FIFI.muzzle}" fill="${C.muzzle}"/><ellipse cx="100" cy="244" rx="21" ry="12" transform="rotate(-8 100 244)" fill="${C.nostril}" stroke="none"/><path d="${FIFI.mouth}" fill="none" stroke-width="4"/>
<path d="${FIFI.tongue}" fill="${C.tongue}"/><path d="${FIFI.tongueGroove}" fill="none" stroke="${C.tongueGroove}" stroke-width="4"/><path d="${FIFI.tongueShine}" fill="none" stroke="${C.tongueShine}" stroke-width="5"/>
<path d="${FIFI.tagString}" fill="none" stroke-width="3"/><path d="${FIFI.tag}" fill="${C.tag}"/><circle cx="46" cy="174" r="4" fill="${C.white}" stroke-width="3"/>
${tagText ? `<text x="46" y="202" text-anchor="middle" fill="${C.ink}" stroke="none" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="9.5">MURILLO</text>` : ""}
</g>`;
}

// Sello: cielo del letrero, lomas blancas y Fifí al centro, con el borde de tinta.
function seal({ scale, cy, tagText, ring }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<title>La Vaca Fifí</title>
<defs><clipPath id="disc"><circle cx="256" cy="256" r="${256 - ring / 2}"/></clipPath></defs>
<g clip-path="url(#disc)">
<rect width="512" height="512" fill="${SKY}"/>
<path d="${HILLS}" fill="#ffffff"/>
<g transform="translate(256 ${cy}) scale(${scale}) translate(-179 -155)">${fifi({ tagText })}</g>
</g>
<circle cx="256" cy="256" r="${256 - ring / 2}" fill="none" stroke="${C.ink}" stroke-width="${ring}"/>
</svg>
`;
}

await writeFile(new URL("../public/logo-la-vaca-fifi.svg", import.meta.url), seal({ scale: 1.22, cy: 268, tagText: true, ring: 16 }));
await writeFile(new URL("../public/favicon-la-vaca-fifi.svg", import.meta.url), seal({ scale: 1.5, cy: 268, tagText: false, ring: 28 }));
console.log("Logo y favicon generados.");
