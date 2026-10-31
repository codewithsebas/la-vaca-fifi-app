// Trazos de Fifí, la vaca del letrero del restaurante (lienzo 440 × 360): cabeza de tres cuartos mirando a la derecha,
// mancha negra sobre la frente que baja por el ojo derecho, ojos verdes (el izquierdo con pestañas), cuernos beige,
// oreja izquierda rosada con el arete amarillo de «MURILLO», oreja derecha gris, hocico beige con una fosa grande y la
// lengua roja relamiéndose; al lado, la taza de café con sus granos. Un solo origen para el personaje de la página
// (components/brand/fifi.tsx), el logo y los íconos (scripts/fifi-logo.ts).

const FIFI_INK = "#221a16";

export const FIFI = {
  earRight: "M246 104C266 74 306 58 338 64C332 94 300 116 258 124Z",
  earRightInner: "M262 106C280 88 304 78 324 76C318 94 298 108 272 114Z",
  hornLeft: "M150 98C136 78 128 54 136 28C150 46 166 66 184 88Z",
  hornRight: "M212 84C220 62 228 40 242 22C252 46 250 72 238 94Z",
  earLeft: "M124 142C100 128 72 130 52 144C70 162 100 168 126 160Z",
  head: "M106 170C98 120 140 84 196 80C248 76 288 100 296 148C302 190 292 232 256 254L150 262C122 250 110 210 106 170Z",
  patch:
    "M108 136C112 102 150 80 196 78C244 76 282 98 294 138C296 160 290 176 278 182C266 186 256 176 252 160C246 136 222 124 204 124C186 124 168 122 150 124C132 126 118 132 108 136Z",
  lashes: "M135 160L124 154M140 152L132 143M148 147L145 137",
  muzzle: "M66 230C64 206 88 196 120 198L232 206C264 208 280 226 276 252C272 278 250 290 222 288L104 282C78 280 66 260 66 230Z",
  mouth: "M150 276C176 282 204 284 226 282",
  tongue: "M232 282C272 288 300 266 302 234C304 204 284 184 260 186C240 188 232 206 240 220C248 234 258 246 250 262C244 272 236 276 232 282Z",
  tongueGroove: "M262 200C276 210 282 228 278 246",
  tongueShine: "M248 200C254 194 264 194 270 198",
  tagString: "M56 148C54 156 50 164 46 170",
  tag: "M20 172L46 161L72 172V214C72 219 68 222 64 222H28C23 222 20 219 20 214Z",
  cup: "M316 214H396L388 284C387 292 380 298 372 298H340C332 298 325 292 324 284Z",
  cupHandle: "M394 230C414 228 422 244 416 258C410 270 396 272 388 268",
  coffeeSplash: "M330 212C334 198 346 196 350 206C354 192 368 192 372 204C378 196 388 200 386 210",
  beanGroove: "M-12 0C-6 -6 6 6 12 0",
} as const;

// Ojos: [cx, cy, rx, ry] del blanco; el iris y la pupila miran hacia la taza.
export const FIFI_EYES = [
  { white: [156, 172, 26, 29], iris: [166, 176, 15], pupil: [168, 177, 8], shine: [172, 172, 3.5] },
  { white: [228, 154, 24, 27], iris: [237, 158, 14], pupil: [239, 159, 7.5], shine: [243, 154, 3.2] },
] as const;

// Granos de café que saltan de la taza: [cx, cy, giro].
export const FIFI_BEANS: [x: number, y: number, rotate: number][] = [
  [336, 160, -25],
  [380, 136, 20],
];

export const FIFI_COLORS = {
  ink: FIFI_INK,
  white: "#ffffff",
  patch: FIFI_INK,
  horn: "#efcfa4",
  earLeft: "#f2c4ae",
  earRight: "#bcc6d2",
  earRightInner: "#9aa6b5",
  iris: "#5cb236",
  muzzle: "#efcca2",
  nostril: "#2c2420",
  tongue: "#e8344a",
  tongueGroove: "#b81e33",
  tongueShine: "#ff8a97",
  tag: "#ffd23f",
  coffee: "#5a2e17",
  bean: "#8a4b22",
} as const;

// Encuadres: la cabeza sola o con la taza.
export const FIFI_VIEWBOX = { head: "14 14 330 282", cup: "14 14 412 290" } as const;
