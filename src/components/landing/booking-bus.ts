// Comunicación entre el buscador del encabezado (components/landing/header.tsx) y la tarjeta de reserva
// (components/landing/booking-widget.tsx), que viven en partes distintas de la portada: el buscador pide abrir una parte
// de la tarjeta y la tarjeta publica lo elegido para que el buscador lo muestre. Con eventos de la ventana, sin estado
// compartido.

export type BookingPart = "dates" | "type" | "guests" | null; // null: solo llevar a la tarjeta
export type BookingSummary = { dates?: string; cabin?: string; guests?: string };

const OPEN = "fifi:booking-open";
const SUMMARY = "fifi:booking-summary";

// La última publicada, para quien se suscriba después.
let last: BookingSummary = {};

export function openBooking(part: BookingPart) {
  window.dispatchEvent(new CustomEvent<BookingPart>(OPEN, { detail: part }));
}

export function onOpenBooking(fn: (part: BookingPart) => void) {
  const h = (e: Event) => fn((e as CustomEvent<BookingPart>).detail);
  window.addEventListener(OPEN, h);
  return () => window.removeEventListener(OPEN, h);
}

export function publishBookingSummary(s: BookingSummary) {
  last = s;
  window.dispatchEvent(new CustomEvent<BookingSummary>(SUMMARY, { detail: s }));
}

export function onBookingSummary(fn: (s: BookingSummary) => void) {
  fn(last);
  const h = (e: Event) => fn((e as CustomEvent<BookingSummary>).detail);
  window.addEventListener(SUMMARY, h);
  return () => window.removeEventListener(SUMMARY, h);
}
