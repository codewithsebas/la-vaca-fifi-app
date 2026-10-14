// Piezas del paisaje ilustrado del sitio (portada, cierre de las secciones y pie de página). Los pinos, los
// frailejones, los arbustos y las lomas salen de unas pocas reglas, así todas las capas comparten el mismo trazo. El
// color lo pone el CSS, de modo que el paisaje toma la paleta que se elija en el panel.

const r = (n: number) => Math.round(n * 10) / 10;

// Pino: copa en pisos que se abren hacia abajo y un tronco corto. (cx, base) es el centro de la base; h, el alto;
// w, el medio ancho de la copa.
export function pine(cx: number, base: number, h: number, w = h * 0.24, tiers = 5): string {
  const trunk = h * 0.08;
  const top = base - h;
  const crown = h - trunk;
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 1; i <= tiers; i++) {
    const y = top + (crown * i) / tiers;
    const half = w * (0.2 + 0.8 * (i / tiers));
    left.push(`L${r(cx - half)} ${r(y)}`);
    right.unshift(`L${r(cx + half)} ${r(y)}`);
    if (i < tiers) {
      // Cada piso entra hacia el tronco antes de abrir el siguiente.
      const inner = half * 0.44;
      const up = (crown / tiers) * 0.14;
      left.push(`L${r(cx - inner)} ${r(y - up)}`);
      right.unshift(`L${r(cx + inner)} ${r(y - up)}`);
    }
  }
  const t = Math.max(1, w * 0.11);
  return `M${r(cx)} ${r(top)}${left.join("")}L${r(cx - t)} ${r(base - trunk)}L${r(cx - t)} ${r(base)}L${r(cx + t)} ${r(base)}L${r(cx + t)} ${r(base - trunk)}${right.join("")}Z`;
}

// Números pseudoaleatorios repetibles: el servidor y el navegador dibujan el mismo bosque.
const random = (seed: number) => {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280), s / 233280);
};

// Línea de una loma o una cordillera: puntos [x, y] de izquierda a derecha.
export type Pt = [x: number, y: number];

// Silueta rellena bajo una línea (suavizada con curvas que pasan por los puntos; con `sharp`, en picos rectos) hasta
// `bottom`.
export function ridge(points: Pt[], bottom: number, sharp = false): string {
  let d = `M${r(points[0][0])} ${bottom}V${r(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [points[i - 1] ?? points[i], points[i], points[i + 1], points[i + 2] ?? points[i + 1]];
    d += sharp
      ? `L${r(p2[0])} ${r(p2[1])}`
      : `C${r(p1[0] + (p2[0] - p0[0]) / 6)} ${r(p1[1] + (p2[1] - p0[1]) / 6)} ${r(p2[0] - (p3[0] - p1[0]) / 6)} ${r(p2[1] - (p3[1] - p1[1]) / 6)} ${r(p2[0])} ${r(p2[1])}`;
  }
  return `${d}V${bottom}Z`;
}

// Alto de la línea en x (entre dos puntos, en línea recta: basta para apoyar árboles y animales).
export function heightAt(points: Pt[], x: number): number {
  const i = points.findIndex(([px]) => px >= x);
  if (i <= 0) return points[i === 0 ? 0 : points.length - 1][1];
  const [[x0, y0], [x1, y1]] = [points[i - 1], points[i]];
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

// Lomas o picos al azar: `count` tramos a lo ancho, alrededor de `base` y con altura de hasta `amp`.
export function hills(seed: number, { w = 1600, base, amp, count }: { w?: number; base: number; amp: number; count: number }): Pt[] {
  const rnd = random(seed);
  return Array.from({ length: count + 1 }, (_, i) => [r((w * i) / count + (i % count ? (rnd() - 0.5) * (w / count) * 0.5 : 0)), r(base - amp * rnd())] as Pt);
}

// Pinos sobre una línea, de `from` a `to`, separados más o menos `gap`, de alto entre `min` y `max`. Se hunden un poco
// (`sink`) para que la base no deje ver el borde de la loma.
export function forest(points: Pt[], { from, to, gap, min, max, seed, sink = 4 }: { from: number; to: number; gap: number; min: number; max: number; seed: number; sink?: number }): string {
  const rnd = random(seed);
  let d = "";
  for (let x = from; x <= to; x += gap * (0.6 + rnd() * 0.8)) {
    const h = min + (max - min) * rnd();
    d += pine(x, heightAt(points, x) + sink, h, h * (0.2 + 0.07 * rnd()), 4 + Math.round(rnd() * 2));
  }
  return d;
}

// Frailejón (la planta del páramo): tronco grueso cubierto de hojas secas y, arriba, una roseta de hojas largas que se
// abren en todas direcciones. (cx, base) es el pie; h, el alto total.
export function frailejon(cx: number, base: number, h: number, seed = 1): string {
  const rnd = random(seed);
  const top = base - h * 0.66; // centro de la roseta
  const tw = h * 0.07;
  // Tronco con el borde deshilachado.
  let d = `M${r(cx - tw)} ${r(base)}`;
  const steps = 6;
  for (let i = 1; i <= steps; i++) d += `L${r(cx - tw - (i % 2 ? h * 0.025 : 0))} ${r(base - ((base - top) * i) / steps)}`;
  for (let i = steps; i >= 0; i--) d += `L${r(cx + tw + (i % 2 ? h * 0.025 : 0))} ${r(base - ((base - top) * i) / steps)}`;
  d += "Z";
  // Roseta: hojas en punta alrededor del centro, más largas hacia arriba y a los lados que hacia abajo.
  const R = h * 0.3;
  const leaves = 22;
  let rose = "";
  for (let i = 0; i < leaves; i++) {
    const a = (Math.PI * 2 * i) / leaves - Math.PI / 2;
    const reach = R * (0.72 + 0.28 * Math.max(0, -Math.sin(a) * 0.6 + Math.abs(Math.cos(a)) * 0.6)) * (0.88 + rnd() * 0.24);
    const half = (Math.PI * 2) / leaves / 2;
    const inner = R * 0.32;
    rose += `${i ? "L" : "M"}${r(cx + Math.cos(a - half) * inner)} ${r(top + Math.sin(a - half) * inner)}L${r(cx + Math.cos(a) * reach)} ${r(top + Math.sin(a) * reach)}`;
  }
  return `${d}${rose}Z`;
}

// Matorral del primer plano: matas redondeadas de alto irregular, con briznas de pasto que asoman, de `from` a `to`
// sobre la línea `base`, rellenas hasta `bottom`.
export function shrubs(seed: number, { from, to, base, h, bottom }: { from: number; to: number; base: number; h: number; bottom: number }): string {
  const rnd = random(seed);
  let d = `M${from} ${bottom}V${base}`;
  let x = from;
  let y = base;
  while (x < to) {
    const step = Math.min(to - x, 16 + rnd() * 34);
    const top = base - h * (0.35 + rnd() * 0.65);
    const end = base - h * 0.3 * rnd();
    // Una brizna en punta en la cima de algunas matas.
    if (rnd() > 0.7) d += `Q${r(x + step * 0.2)} ${r(top - 2)} ${r(x + step * 0.42)} ${r(top)}L${r(x + step * 0.48)} ${r(top - h * 0.3)}L${r(x + step * 0.56)} ${r(top)}Q${r(x + step * 0.8)} ${r(top - 2)} ${r(x + step)} ${r(end)}`;
    // El punto de control queda al doble de altura: la curva toca `top` a mitad de la mata.
    else d += `Q${r(x + step / 2)} ${r(2 * top - (y + end) / 2)} ${r(x + step)} ${r(end)}`;
    x += step;
    y = end;
  }
  return `${d}V${bottom}Z`;
}

// Varas en flor de un frailejón (para dibujarlas con trazo) y la posición de cada flor.
export function frailejonFlowers(cx: number, base: number, h: number): { stalks: string; heads: Pt[] } {
  const top = base - h * 0.66;
  const tips: Pt[] = [
    [cx - h * 0.2, top - h * 0.42],
    [cx + h * 0.05, top - h * 0.5],
    [cx + h * 0.26, top - h * 0.36],
  ];
  return { stalks: tips.map(([x, y]) => `M${r(cx)} ${r(top - h * 0.1)}Q${r((cx + x) / 2)} ${r(y + h * 0.12)} ${r(x)} ${r(y)}`).join(""), heads: tips };
}
