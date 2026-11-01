// Configuración única del negocio. Edita aquí y se actualiza todo el sitio.
// Los valores entre {LLAVES} son placeholders: reemplázalos por los reales.

// Las cabañas viven en la tabla cabin_types (se crean y editan desde el panel); estos son solo los valores de respaldo.
export type CabinTypeId = string;

// Cabaña tal como la muestra el sitio público.
export type Cabin = {
  id: CabinTypeId;
  name: string; // corto: "Doble"
  full: string; // completo: "Cabaña Doble"
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
  name: "La Vaca Fifí",
  tagline: "Cabañas y restaurante de finca a 5 minutos de Murillo, Tolima",
  whatsapp: "573142374008",
  phones: ["314 237 4008"],
  address: "Vereda Pajonales, sector El Fifí, vía Líbano – Murillo, Tolima, Colombia",
  street: "Vereda Pajonales, sector El Fifí, vía Líbano – Murillo",
  city: "Murillo",
  region: "Tolima",
  country: "CO",
  lat: 4.8734643,
  lng: -75.1546483,

  // Backend: las rutas /api de este mismo Next.js (Supabase). NEXT_PUBLIC_USE_MOCK_API=1 usa el adaptador simulado.
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "/api",
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "{TURNSTILE_SITE_KEY}",
  correoReservas: "{CORREO_RESERVAS}",
  // Solo para el modo simulado: con Supabase, tarifas, capacidad y número de cabañas viven en la tabla cabin_types.
  unidades: { doble: 1, "dos-camas": 1, familiar: 1, "familiar-vista": 1 } as Record<CabinTypeId, number>,
  // Para pagar por transferencia o en recepción (se edita en el panel: Contenido → Pagos).
  datosPagoAbono: "{DATOS_DE_PAGO}",
  rnt: "208820",
  timeZone: "America/Bogota",

  // Los cuatro tipos de habitación que La Vaca Fifí publica en Booking.com. Tarifas de referencia (desde $160.000 la
  // noche con desayuno): se confirman y ajustan en el panel (Tarifas).
  cabins: {
    doble: {
      id: "doble",
      name: "Doble",
      full: "Cabaña Doble",
      couple: 160000,
      extra: 40000,
      max: 2,
      badge: "Desayuno incluido",
      description:
        "Cabaña con cama doble, baño privado con ducha de agua caliente y balcón con vista a las montañas de Murillo. Para descansar en pareja, con el desayuno americano incluido.",
      features: ["Cama doble", "Baño privado con agua caliente", "Balcón con vista a la montaña", "TV de pantalla plana", "Wifi", "Desayuno americano"],
      photos: ["/fotos/cabana-fachada-roja.jpg", "/fotos/cabanas-corredor.jpg"],
    },
    "dos-camas": {
      id: "dos-camas",
      name: "Dos Camas",
      full: "Cabaña Dos Camas",
      couple: 160000,
      extra: 40000,
      max: 4,
      badge: "Hasta 4 personas",
      description:
        "Dos camas dobles para venir con amigos o en familia. Baño privado con agua caliente, TV de pantalla plana y balcón para tomarse el café mirando la montaña.",
      features: ["Dos camas dobles", "Baño privado con agua caliente", "Balcón con vista a la montaña", "TV de pantalla plana", "Wifi", "Desayuno americano"],
      photos: ["/fotos/cabanas-corredor.jpg", "/fotos/balcon-vista-montanas.jpg"],
    },
    familiar: {
      id: "familiar",
      name: "Familiar",
      full: "Cabaña Familiar",
      couple: 160000,
      extra: 40000,
      max: 6,
      badge: "Hasta 6 personas",
      description:
        "La más amplia: cama doble y camarote, para que los niños tengan su propio rincón. Baño privado, TV y balcón, a pocos pasos del parque infantil y del restaurante.",
      features: ["Cama doble y camarote", "Baño privado con agua caliente", "Balcón", "TV de pantalla plana", "Wifi", "Desayuno americano"],
      photos: ["/fotos/habitacion-camarote.jpg", "/fotos/cabana-fachada-roja.jpg"],
    },
    "familiar-vista": {
      id: "familiar-vista",
      name: "Familiar con Vista",
      full: "Cabaña Familiar con Vista",
      couple: 160000,
      extra: 40000,
      max: 4,
      badge: "Vista a la montaña",
      description:
        "Cama doble y camarote, con el balcón de frente a las montañas y los potreros de la vereda. Baño privado con agua caliente y desayuno americano incluido.",
      features: [
        "Cama doble y camarote",
        "Balcón con vista a la montaña",
        "Baño privado con agua caliente",
        "TV de pantalla plana",
        "Wifi",
        "Desayuno americano",
      ],
      photos: ["/fotos/balcon-vista-montanas.jpg", "/fotos/habitacion-camarote.jpg"],
    },
  } as Record<CabinTypeId, Cabin>,
  checkIn: "2:00 p. m. a 10:00 p. m.",
  checkOut: "12:00 del mediodía",
  checkInStart: "14:00",
  checkInEnd: "22:00",
  checkOutTime: "12:00",
  depositPct: 30,

  policies: [
    { q: "Confirmación de la reserva", a: "Para confirmar tu reserva se requiere un abono del 30 % del valor total. Este abono no es reembolsable." },
    { q: "Documento de identidad", a: "Todo huésped debe presentar su documento de identidad físico al llegar." },
    { q: "Cambios de fecha", a: "– Con 5 días o más: reprogramación hasta 3 meses (según disponibilidad).  – Con menos de 120 horas: no se permiten cambios." },
    { q: "Clima de montaña", a: "Murillo está a casi 3.000 metros de altura y las noches son frías: trae ropa abrigada." },
    { q: "Niños", a: "Los niños de cualquier edad son bienvenidos. Las cabañas no tienen cunas ni camas supletorias: elige una con capacidad para todos." },
    { q: "Mascotas", a: "Tu mascota es bienvenida, sin costo adicional. Cuéntanos de ella al reservar." },
    { q: "Espacios sin humo", a: "No se permite fumar dentro de las cabañas." },
    { q: "Daños", a: "Los daños, las manchas en la lencería o cualquier afectación a la cabaña generan un cobro adicional." },
    { q: "Responsabilidad", a: "No nos hacemos responsables por condiciones climáticas, objetos personales ni vehículos." },
  ] as Policy[],
};

export const fallbackCabins = Object.values(config.cabins);

// "Cabaña Familiar" → "Familiar"
export const shortCabinName = (full: string) => full.replace(/^Cabaña\s+/i, "");

export const isMockApi = process.env.NEXT_PUBLIC_USE_MOCK_API === "1";
