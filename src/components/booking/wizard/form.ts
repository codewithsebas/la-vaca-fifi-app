import type { DocType, FieldErrors } from "@/lib/types";

export const STEPS = ["Fechas y huéspedes", "Cabaña", "Tus datos", "Revisar y pagar"];
export const OCCASIONS: Record<string, string> = { aniversario: "Aniversario", cumpleanos: "Cumpleaños", propuesta: "Propuesta", otra: "Otra" };
// Errores del servidor (rutas del contrato) → campos del formulario.
export const SERVER_FIELD: Record<string, string> = {
  "guest.fullName": "fullName",
  "guest.docType": "docType",
  "guest.docNumber": "docNumber",
  "guest.email": "email",
  "guest.phone": "phone",
  "guest.city": "city",
  estimatedArrival: "arrival",
  "pet.smallBreedConfirmed": "smallBreed",
  "decoration.occasion": "occasion",
  "consents.policies": "policies",
  "consents.dataProcessing": "dataProcessing",
};
export const LABEL: Record<string, string> = {
  fullName: "Nombre completo",
  docType: "Tipo de documento",
  docNumber: "Número de documento",
  email: "Correo electrónico",
  phone: "Celular",
  city: "Ciudad de procedencia",
  arrival: "Hora estimada de llegada",
  smallBreed: "Mascota",
  occasion: "Ocasión",
  policies: "Políticas de reserva",
  dataProcessing: "Tratamiento de datos",
  checkIn: "Fechas",
  adults: "Huéspedes",
  cabinTypeId: "Cabaña",
  specialRequests: "Solicitudes especiales",
  captchaToken: "Verificación antispam",
};
export const FIELD_ID: Record<string, string> = {
  fullName: "f-name",
  docType: "f-doctype",
  docNumber: "f-docnum",
  email: "f-email",
  phone: "f-phone",
  city: "f-city",
  arrival: "f-arrival",
  smallBreed: "f-smallbreed",
  occasion: "f-occasion",
  policies: "f-policies",
  dataProcessing: "f-data",
};
export const ORDER = Object.keys(FIELD_ID);

export type Form = {
  fullName: string;
  docType: DocType;
  docNumber: string;
  email: string;
  phone: string;
  city: string;
  arrival: string;
  hasPet: "no" | "si";
  smallBreed: boolean;
  decoRequested: boolean;
  occasion: string;
  decoNotes: string;
  specialRequests: string;
  policies: boolean;
  dataProcessing: boolean;
  marketing: boolean;
  website: string;
};

export const EMPTY_FORM: Form = {
  fullName: "",
  docType: "CC",
  docNumber: "",
  email: "",
  phone: "",
  city: "",
  arrival: "",
  hasPet: "no",
  smallBreed: false,
  decoRequested: false,
  occasion: "",
  decoNotes: "",
  specialRequests: "",
  policies: false,
  dataProcessing: false,
  marketing: false,
  website: "",
};

export function validate(f: Form): FieldErrors {
  const e: FieldErrors = {};
  const digits = f.phone.replace(/\D/g, "");
  if (f.fullName.trim().length < 3 || f.fullName.trim().indexOf(" ") < 0) e.fullName = "Escribe tu nombre y apellido.";
  const dn = f.docNumber.trim();
  if (!dn) e.docNumber = "Escribe el número de documento.";
  else if (f.docType === "CC" && !/^\d{6,10}$/.test(dn)) e.docNumber = "La cédula debe tener entre 6 y 10 dígitos, sin puntos.";
  else if (f.docType !== "CC" && !/^[A-Za-z0-9]{5,15}$/.test(dn)) e.docNumber = "Usa solo letras y números (5 a 15 caracteres).";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = "Escribe un correo válido, por ejemplo nombre@correo.com.";
  if (!/^3\d{9}$/.test(digits)) e.phone = "El celular debe tener 10 dígitos y empezar por 3.";
  if (!f.city.trim()) e.city = "Escribe tu ciudad de procedencia.";
  if (!f.arrival) e.arrival = "Elige la hora estimada de llegada.";
  if (f.hasPet === "si" && !f.smallBreed) e.smallBreed = "Confirma que te haces responsable de tu mascota.";
  if (f.decoRequested && !f.occasion) e.occasion = "Elige la ocasión.";
  if (!f.policies) e.policies = "Debes aceptar las políticas de reserva.";
  if (!f.dataProcessing) e.dataProcessing = "Debes autorizar el tratamiento de tus datos.";
  return e;
}

// Celular de Colombia: solo dígitos, sin el indicativo si lo pegaron (57…), agrupado como 315 205 8712.
export const phoneDigits = (v: string) => {
  let d = v.replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("57")) d = d.slice(2);
  return d.slice(0, 10);
};
export const fmtPhone = (d: string) => [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join(" ");

export const DOC_TYPES = [
  { value: "CC", label: "CC · Cédula de ciudadanía" },
  { value: "CE", label: "CE · Cédula de extranjería" },
  { value: "Pasaporte", label: "Pasaporte" },
  { value: "PPT", label: "PPT · Permiso por Protección Temporal" },
];
