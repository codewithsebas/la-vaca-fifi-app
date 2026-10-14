// Configuración única del negocio. Edita aquí y se actualiza todo el sitio.
// Los valores entre {LLAVES} son placeholders: reemplázalos por los reales.

// Los domos viven en la tabla cabin_types (se crean y editan desde el panel); estos son solo los valores de respaldo.
export type CabinTypeId = string;

// Domo tal como lo muestra el sitio público.
export type Cabin = {
  id: CabinTypeId;
  name: string; // corto: "Pareja"
  full: string; // completo: "Domo Pareja"
  couple: number;
  extra: number;
  max: number;
  badge: string;
  description: string;
  features: string[];
  photos: string[]; // URLs públicas
};

export type Policy = { q: string; a: string };

export const config = {
  name: "Stellarium Glamping",
  tagline: "El glamping más alto del Tolima, bajo un cielo de estrellas",
  whatsapp: "573155918577",
  phones: ["315 591 8577"],
  address: "Finca Portento, vereda El Fifi, entrada a Murillo, Tolima, Colombia",
  street: "Finca Portento, vereda El Fifi",
  city: "Murillo",
  region: "Tolima",
  country: "CO",
  lat: 4.8740944,
  lng: -75.1616015,

  // Backend: las rutas /api de este mismo Next.js (Supabase). NEXT_PUBLIC_USE_MOCK_API=1 usa el adaptador simulado.
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "/api",
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "{TURNSTILE_SITE_KEY}",
  correoReservas: "{CORREO_RESERVAS}",
  // Solo para el modo simulado: con Supabase, tarifas, capacidad y número de domos viven en la tabla cabin_types.
  unidades: { pareja: 1, familiar: 1 } as Record<CabinTypeId, number>,
  // Para pagar en recepción o por transferencia cuando el pago en línea no es posible (se edita en el panel: Contenido → Pagos).
  datosPagoAbono: "{DATOS_DE_PAGO}",
  rnt: "107343",
  timeZone: "America/Bogota",

  cabins: {
    pareja: {
      id: "pareja", name: "Pareja", full: "Domo Pareja", couple: 470000, extra: 50000, max: 2, badge: "Jacuzzi privado",
      description: "Domo geodésico con cama king y vista panorámica a las montañas. Afuera, en tu terraza privada, un jacuzzi para ver caer la noche y contar estrellas.",
      features: ["Jacuzzi privado", "Cama king", "Baño privado con ducha", "Calefacción", "Terraza con vista", "Desayuno"],
      photos: ["/fotos/domo-interior-vista.webp", "/fotos/domo-jacuzzi-terraza.webp", "/fotos/domo-exterior.webp", "/fotos/domo-detalle.webp"],
    },
    familiar: {
      id: "familiar", name: "Familiar", full: "Domo Familiar", couple: 470000, extra: 50000, max: 4, badge: "Hasta 4 personas",
      description: "Domo geodésico amplio con cama king y cama queen, para venir en familia o con amigos. Terraza privada con jacuzzi y calefacción para las noches frías de la alta montaña.",
      features: ["Jacuzzi privado", "Cama king y cama queen", "Baño privado con ducha", "Calefacción", "Terraza con vista", "Desayuno"],
      photos: ["/fotos/domo-interior-familiar.jpg", "/fotos/bano-ducha.jpg"],
    },
  } as Record<CabinTypeId, Cabin>,
  checkIn: "3:00 p. m. a 7:00 p. m.",
  checkOut: "12:00 del mediodía",
  checkInStart: "15:00",
  checkInEnd: "19:00",
  checkOutTime: "12:00",
  depositPct: 30,

  policies: [
    { q: "Confirmación de la reserva", a: "Para confirmar tu reserva se requiere un abono del 30 % del valor total. Este abono no es reembolsable." },
    { q: "Documento de identidad", a: "Todo huésped debe presentar su documento de identidad físico al llegar." },
    { q: "Cambios de fecha", a: "– Con 5 días o más: reprogramación hasta 3 meses (según disponibilidad).  – Con menos de 120 horas: no se permiten cambios." },
    { q: "Clima de alta montaña", a: "Estamos a 2.950 metros sobre el nivel del mar y las noches son frías. Cada domo tiene calefacción; aun así, trae ropa abrigada." },
    { q: "Daños", a: "Los daños, las manchas en la lencería o cualquier afectación al domo generan un cobro adicional." },
    { q: "Responsabilidad", a: "No nos hacemos responsables por condiciones climáticas, objetos personales ni vehículos." },
    { q: "Mascotas", a: "Tu mascota es bienvenida, sin costo adicional. Cuéntanos de ella al reservar." },
  ] as Policy[],
};

export const fallbackCabins = Object.values(config.cabins);

// "Domo Familiar" → "Familiar"
export const shortCabinName = (full: string) => full.replace(/^Domo\s+/i, "");

export const isMockApi = process.env.NEXT_PUBLIC_USE_MOCK_API === "1";
