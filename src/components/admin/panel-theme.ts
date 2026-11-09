// Tema del panel, fijo. Va en una hoja aparte (no en app/globals.css) porque solo aplica mientras el panel está abierto:
// el sitio público tiene sus propios colores.
export const PANEL_THEME_CSS = `
:root:not([data-admin-theme="dark"]) {
  --color-ink:#10244a;
  --color-focus:#10244a;
  --color-chart:#10244a;
  --color-series-1:#10244a;
  --color-ink-muted:color-mix(in srgb, #10244a 66%, var(--color-canvas));
  --color-ink-subtle:color-mix(in srgb, #10244a 52%, var(--color-canvas));
  --color-sidebar:#123f9c;
  --color-canvas:#f8f4dd;
  --color-panel:#f0e9c9;
  --color-paper:#fffdf2;
  --color-line:#dfd6ad;
  --color-line-strong:color-mix(in srgb, #dfd6ad 88%, #000);
  --color-pink:#f58e68;
  --color-pink-soft:color-mix(in srgb, #f58e68 55%, #fff);
  --color-pink-deep:color-mix(in srgb, #f58e68 86%, #000);
  --color-yellow:#f7cf1f;
  --color-yellow-soft:color-mix(in srgb, #f7cf1f 55%, #fff);
  --color-yellow-deep:color-mix(in srgb, #f7cf1f 86%, #000);
  --color-warning:color-mix(in srgb, #f7cf1f 38%, #000);
  --color-warning-soft:color-mix(in srgb, #f7cf1f 55%, #fff);
  --color-green:#5cc46f;
  --color-green-soft:color-mix(in srgb, #5cc46f 55%, #fff);
  --color-green-deep:color-mix(in srgb, #5cc46f 86%, #000);
  --color-success:color-mix(in srgb, #5cc46f 38%, #000);
  --color-success-soft:color-mix(in srgb, #5cc46f 55%, #fff);
  --color-blue:#74a9f4;
  --color-blue-soft:color-mix(in srgb, #74a9f4 55%, #fff);
  --color-blue-deep:color-mix(in srgb, #74a9f4 86%, #000);
  --color-info:color-mix(in srgb, #74a9f4 38%, #000);
  --color-info-soft:color-mix(in srgb, #74a9f4 55%, #fff);
  --color-series-2:color-mix(in srgb, #f58e68 60%, #000);
  --color-error:#c41e2a;
  --color-error-soft:color-mix(in srgb, #c41e2a 20%, #fff);
}
:root[data-admin-theme="dark"] {
  --color-sidebar:#123f9c;
  --color-pink:color-mix(in srgb, #f58e68 48%, #000);
  --color-pink-soft:color-mix(in srgb, #f58e68 20%, #121110);
  --color-pink-deep:color-mix(in srgb, #f58e68 68%, #000);
  --color-yellow:color-mix(in srgb, #f7cf1f 48%, #000);
  --color-yellow-soft:color-mix(in srgb, #f7cf1f 20%, #121110);
  --color-yellow-deep:color-mix(in srgb, #f7cf1f 68%, #000);
  --color-warning:color-mix(in srgb, #f7cf1f 70%, #fff);
  --color-warning-soft:color-mix(in srgb, #f7cf1f 20%, #121110);
  --color-green:color-mix(in srgb, #5cc46f 48%, #000);
  --color-green-soft:color-mix(in srgb, #5cc46f 20%, #121110);
  --color-green-deep:color-mix(in srgb, #5cc46f 68%, #000);
  --color-success:color-mix(in srgb, #5cc46f 70%, #fff);
  --color-success-soft:color-mix(in srgb, #5cc46f 20%, #121110);
  --color-blue:color-mix(in srgb, #74a9f4 48%, #000);
  --color-blue-soft:color-mix(in srgb, #74a9f4 20%, #121110);
  --color-blue-deep:color-mix(in srgb, #74a9f4 68%, #000);
  --color-info:color-mix(in srgb, #74a9f4 70%, #fff);
  --color-info-soft:color-mix(in srgb, #74a9f4 20%, #121110);
  --color-series-2:#f58e68;
  --color-error:color-mix(in srgb, #c41e2a 55%, #fff);
  --color-error-soft:color-mix(in srgb, #c41e2a 28%, #121110);
}
`;
