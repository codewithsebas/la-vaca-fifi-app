// Correos transaccionales: HTML de 600 px con tablas, estilos inline y colores hex (funciona en Gmail, Outlook y Apple Mail).
// Los que se envían de verdad (confirmación de reserva y mensaje del equipo) se generan con funciones que reciben los datos;
// el resto son plantillas de referencia con variables {{var}} que todavía no se envían.
import { cop, fmtDate, nightsBetween, plural } from "./format";
import { BALANCE_MINUTES } from "./payments";
import { fmtTime, type SiteConfig } from "./site";

type Cfg = SiteConfig;

const X = { bg: "#FFF8EB", card: "#FFFFFF", box: "#FFF3DC", ink: "#241A14", muted: "#5E5550", brand: "#241A14", cream: "#FFF8EB", hl: "#FFD23F", line: "#F3E6D2", accent: "#157AB8", accentSoft: "#DDF0FA" };
const FONT = "Arial, Helvetica, sans-serif";
const DISPLAY = "'Lilita One', 'Arial Rounded MT Bold', 'Arial Black', Arial, sans-serif";
// El nombre, en letras redondas y gruesas como las del letrero de Fifí (las fuentes web no llegan a todos los clientes
// de correo: Lilita One si está, si no una gruesa del sistema).
const WORDMARK = "'Lilita One', 'Arial Rounded MT Bold', 'Arial Black', Arial, sans-serif";
const DARK =
  ".em-body{background:#120D0A!important}.em-card{background:#241A14!important}.em-text{color:#FFF8EB!important}.em-muted{color:#CFC6BD!important}.em-box{background:#33261D!important}.em-line{border-color:#4A382B!important}.em-code{color:#FFD23F!important}.em-ok{background:#33261D!important;color:#DDF0FA!important}";

// Todo dato del huésped o del equipo se escapa antes de entrar al HTML.
export const esc = (s: string | number) =>
  String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const h1 = (t: string) => `<h1 class="em-text em-h1" style="margin:0 0 12px;font-family:${DISPLAY};font-size:32px;line-height:36px;font-weight:400;color:${X.ink}">${t}</h1>`;
const p = (t: string) => `<p class="em-text" style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:24px;color:${X.ink}">${t}</p>`;
const small = (t: string) => `<p class="em-muted" style="margin:0 0 10px;font-family:${FONT};font-size:13px;line-height:20px;color:${X.muted}">${t}</p>`;
const h2 = (t: string) => `<h2 class="em-text" style="margin:26px 0 10px;font-family:${FONT};font-size:13px;line-height:18px;font-weight:bold;text-transform:uppercase;letter-spacing:1.5px;color:${X.ink}">${t}</h2>`;
const pill = (t: string) =>
  `<p style="margin:0 0 14px"><span class="em-ok" style="display:inline-block;padding:5px 12px;border-radius:999px;background:${X.accentSoft};font-family:${FONT};font-size:12px;font-weight:bold;letter-spacing:.5px;color:${X.ink}">&#10003;&nbsp; ${t}</span></p>`;
const kv = (rows: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="em-box" style="background:${X.box};border-radius:12px">${rows
    .map(
      ([k, v], i) =>
        `<tr><td class="em-muted em-line" style="padding:11px 16px;font-family:${FONT};font-size:13px;line-height:18px;color:${X.muted};${i ? `border-top:1px solid ${X.line};` : ""}width:36%;vertical-align:top">${k}</td><td class="em-text em-line" style="padding:11px 16px;font-family:${FONT};font-size:14px;line-height:20px;font-weight:bold;color:${X.ink};${i ? `border-top:1px solid ${X.line};` : ""}">${v}</td></tr>`,
    )
    .join("")}</table>`;
// Montos alineados a la derecha; la última fila (lo pendiente) se destaca.
const amounts = (rows: [string, string, string?][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="em-box" style="background:${X.box};border-radius:12px">${rows
    .map(([k, v, note], i) => {
      const last = i === rows.length - 1;
      const top = i ? `border-top:1px solid ${X.line};` : "";
      return `<tr><td class="em-text em-line" style="padding:12px 16px;font-family:${FONT};font-size:14px;line-height:20px;color:${X.ink};${top}${last ? "font-weight:bold;" : ""}">${k}${note ? `<br><span class="em-muted" style="font-size:12px;line-height:18px;font-weight:normal;color:${X.muted}">${note}</span>` : ""}</td><td align="right" class="em-text em-line" style="padding:12px 16px;font-family:${last ? DISPLAY : FONT};font-size:${last ? "28px" : "15px"};line-height:${last ? "30px" : "20px"};font-weight:${last ? "normal" : "bold"};color:${X.ink};white-space:nowrap;vertical-align:top;${top}">${v}</td></tr>`;
    })
    .join("")}</table>`;
const list = (items: string[]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items
    .map(
      (t) =>
        `<tr><td width="22" valign="top" style="padding:3px 0;font-family:${FONT};font-size:15px;line-height:22px;color:${X.hl}">&#9679;</td><td class="em-text" style="padding:3px 0;font-family:${FONT};font-size:15px;line-height:22px;color:${X.ink}">${t}</td></tr>`,
    )
    .join("")}</table>`;
const btn = (label: string, href: string, bg: string, fg: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 6px"><tr><td align="center" bgcolor="${bg}" style="border-radius:999px;background:${bg}"><a href="${href}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:15px;font-weight:bold;line-height:20px;color:${fg};text-decoration:none;border-radius:999px">${label}</a></td></tr></table>`;
const btns = (items: [string, string, string, string][]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${items.map((b) => `<td class="em-col" style="padding:0 10px 0 0">${btn(...b)}</td>`).join("")}</tr></table>`;
const codeBox = (code: string, status: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px"><tr><td style="background:${X.brand};border-radius:14px;padding:18px 20px"><p style="margin:0;font-family:${FONT};font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${X.cream}">Código de reserva</p><p class="em-code" style="margin:4px 0 0;font-family:${DISPLAY};font-size:40px;line-height:42px;letter-spacing:2px;color:${X.hl}">${code}</p>${
    status ? `<p style="margin:8px 0 0"><span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${X.hl};font-family:${FONT};font-size:12px;font-weight:bold;color:${X.ink}">${status}</span></p>` : ""
  }</td></tr></table>`;

export function emailLayout(c: Cfg, { title, preheader, body }: { title: string; preheader: string; body: string }) {
  const phones = c.phones.join(" · ");
  const darkRules = (prefix: string) =>
    DARK.split("}")
      .filter(Boolean)
      .map((r) => prefix + r + "}")
      .join("");
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${title}</title>
<style>@media (max-width:620px){.em-container{width:100%!important}.em-pad{padding:22px 18px!important}.em-col{display:block!important;width:100%!important}.em-h1{font-size:27px!important;line-height:31px!important}}
@media (prefers-color-scheme:dark){${DARK}}
${darkRules("[data-ogsc] ")}
${darkRules(".dm ")}</style></head>
<body class="em-body" style="margin:0;padding:0;background:${X.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${preheader}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="em-body" style="background:${X.bg}"><tr><td align="center" style="padding:24px 10px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="em-container" style="width:600px;max-width:600px">
<tr><td class="em-pad" style="background:${X.brand};border-radius:20px 20px 0 0;padding:22px 32px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:12px"><img src="{{logoUrl}}" width="44" height="44" alt="${c.name}" style="display:block;border:0;width:44px;height:44px"></td><td style="font-family:${FONT};color:${X.cream}"><span style="display:block;font-family:${WORDMARK};font-size:24px;line-height:26px;font-weight:normal;color:${X.hl}">La Vaca Fifí</span><span style="display:block;font-size:11px;letter-spacing:3px;text-transform:uppercase">Cabañas · Restaurante · Café</span></td></tr></table></td></tr>
<tr><td class="em-card em-pad" style="background:${X.card};padding:32px">${body}</td></tr>
<tr><td class="em-pad" style="background:${X.brand};border-radius:0 0 20px 20px;padding:24px 32px;font-family:${FONT};font-size:12px;line-height:19px;color:${X.cream}">
<p style="margin:0 0 6px;font-weight:bold">${c.name}</p><p style="margin:0 0 6px">${c.address}</p><p style="margin:0 0 6px">Tel. ${phones} · WhatsApp +${c.whatsapp}</p>${c.rnt ? `<p style="margin:0 0 10px">RNT ${c.rnt}</p>` : ""}
<p style="margin:0;color:#CFC6BD">Ley 679 de 2001: rechazamos la explotación y el abuso sexual de niños, niñas y adolescentes. Recibes este correo por tu reserva con nosotros.</p></td></tr>
</table></td></tr></table></body></html>`;
}

const footText = (c: Cfg) =>
  "\n\n—\n" + `${c.name}\n${c.address}\nTel. ${c.phones.join(" · ")} · WhatsApp +${c.whatsapp}${c.rnt ? `\nRNT ${c.rnt}` : ""}\nLey 679 de 2001: rechazamos la explotación y el abuso sexual de niños, niñas y adolescentes.`;

export type RenderedEmail = { subject: string; preheader: string; html: string; text: string };

const finish = (c: Cfg, logoUrl: string, e: Omit<RenderedEmail, "html"> & { body: string }): RenderedEmail => ({
  subject: e.subject,
  preheader: e.preheader,
  text: e.text,
  html: emailLayout(c, { title: esc(e.subject), preheader: esc(e.preheader), body: e.body }).replace("{{logoUrl}}", logoUrl),
});

/* ───────────── Reserva confirmada (automático, al aprobarse el abono) ───────────── */

export type ConfirmedEmailData = {
  nombre: string;
  codigo: string;
  cabana: string;
  checkIn: string; // AAAA-MM-DD
  checkOut: string;
  adultos: number;
  ninos: number;
  mascota: boolean;
  total: number;
  pagado: number;
  miReservaUrl: string;
  comoLlegarUrl: string;
  whatsappUrl: string;
  logoUrl: string;
};

export function reservationConfirmedEmail(c: Cfg, d: ConfirmedEmailData): RenderedEmail {
  const first = d.nombre.trim().split(/\s+/)[0] || d.nombre;
  const nights = plural(nightsBetween(d.checkIn, d.checkOut), "noche", "noches");
  const guests = `${plural(d.adultos, "adulto", "adultos")}${d.ninos ? ` · ${plural(d.ninos, "niño", "niños")}` : ""}`;
  const saldo = Math.max(0, d.total - d.pagado);
  const llegada = `${fmtDate(d.checkIn, true)}`;
  const salida = `${fmtDate(d.checkOut, true)}`;
  const checkInWindow = `de ${fmtTime(c.checkInStart)} a ${fmtTime(c.checkInEnd)}`;
  const balanceNote = `Puedes pagarlo desde «Mi reserva» cuando quieras antes de llegar, o en línea en la hora siguiente al check-in (${BALANCE_MINUTES / 60} hora de plazo).`;
  const full = saldo === 0;
  const arrival = [
    "Presenta el <strong>documento de identidad físico</strong> de cada huésped.",
    `El check-in es ${checkInWindow.replace(/\.$/, "")}. Si vas a llegar más tarde, avísanos por WhatsApp.`,
    "Trae ropa abrigada: Murillo está a casi 3.000 metros de altura y las noches son frías.",
    ...(d.mascota ? ["Tu mascota es bienvenida, sin costo adicional."] : []),
    `Dirección: ${esc(c.address)}. El Nevado del Ruiz queda a aproximadamente 1 hora en carro.`,
  ];
  const body =
    pill("Reserva confirmada") +
    h1(`¡Te esperamos, ${esc(first)}!`) +
    p(`Recibimos tu ${full ? "pago" : "abono"} y tu reserva quedó confirmada. Aquí tienes lo esencial para tu llegada.`) +
    codeBox(esc(d.codigo), "Confirmada") +
    h2("Tu estadía") +
    kv([
      ["Cabaña", esc(d.cabana)],
      ["Llegada", `${llegada}<br><span style="font-weight:normal">Check-in ${checkInWindow}</span>`],
      ["Salida", `${salida}<br><span style="font-weight:normal">Check-out hasta las ${c.checkOut}</span>`],
      ["Estadía", `${nights} · ${guests}`],
    ]) +
    h2("Pagos") +
    amounts([
      ["Valor total", cop(d.total)],
      [full ? "Pagado" : "Abono pagado", `&#10003; ${cop(d.pagado)}`],
      ["Saldo pendiente", cop(saldo), saldo ? balanceNote : "No tienes saldo pendiente."],
    ]) +
    h2("Para tu llegada") +
    list(arrival) +
    btns([
      ["Ver mi reserva", d.miReservaUrl, X.hl, X.ink],
      ["Cómo llegar", d.comoLlegarUrl, X.brand, X.cream],
    ]) +
    small(`Adjuntamos <strong>reserva-${esc(d.codigo)}.ics</strong> para que la agregues a tu calendario. ¿Dudas? <a href="${d.whatsappUrl}" class="em-text" style="color:${X.ink};font-weight:bold;text-decoration:underline">Escríbenos por WhatsApp</a>.`) +
    small("El abono no es reembolsable. Los cambios de fecha se solicitan con al menos 5 días de anticipación.");
  const text =
    `¡Te esperamos, ${first}! Tu reserva está confirmada.\n\n` +
    `Código: ${d.codigo} (confirmada)\nCabaña: ${d.cabana}\nLlegada: ${llegada} · check-in ${checkInWindow}\nSalida: ${salida} · check-out hasta las ${c.checkOut}\nEstadía: ${nights} · ${guests}\n\n` +
    `PAGOS\nValor total: ${cop(d.total)}\n${full ? "Pagado" : "Abono pagado"}: ${cop(d.pagado)}\nSaldo pendiente: ${cop(saldo)}${saldo ? `\n${balanceNote}` : ""}\n\n` +
    `PARA TU LLEGADA\n- Presenta el documento de identidad físico de cada huésped.\n- Check-in ${checkInWindow.replace(/\.$/, "")}. Si llegas más tarde, avísanos por WhatsApp.\n- Trae ropa abrigada: las noches son frías.\n${d.mascota ? "- Tu mascota es bienvenida, sin costo adicional.\n" : ""}- Dirección: ${c.address}\n\n` +
    `Ver mi reserva: ${d.miReservaUrl}\nCómo llegar: ${d.comoLlegarUrl}\nWhatsApp: ${d.whatsappUrl}\nAdjunto: reserva-${d.codigo}.ics` +
    footText(c);
  return finish(c, d.logoUrl, { subject: `Reserva confirmada ${d.codigo} · ${fmtDate(d.checkIn)}`, preheader: full ? `Te esperamos el ${llegada}. Tu estadía está pagada.` : `Te esperamos el ${llegada}. Abono recibido; saldo pendiente ${cop(saldo)}.`, body, text });
}

/* ───────────── Mensaje del equipo (desde la ficha del cliente) ───────────── */

export type TeamMessageData = { nombre: string; asunto: string; mensaje: string; codigo?: string | null; whatsappUrl: string; logoUrl: string };

export function teamMessageEmail(c: Cfg, d: TeamMessageData): RenderedEmail {
  const first = d.nombre.trim().split(/\s+/)[0] || d.nombre;
  const paragraphs = d.mensaje
    .trim()
    .split(/\n{2,}/)
    .map((para) => p(esc(para).replace(/\n/g, "<br>")))
    .join("");
  const body =
    p(`Hola ${esc(first)},`) +
    paragraphs +
    p(`Un saludo,<br><strong>Equipo de ${esc(c.name)}</strong>`) +
    (d.codigo ? small(`Referencia: reserva <strong>${esc(d.codigo)}</strong>`) : "") +
    btn("Escribir por WhatsApp", d.whatsappUrl, X.hl, X.ink) +
    small("Puedes responder a este correo o escribirnos por WhatsApp.");
  const text = `Hola ${first},\n\n${d.mensaje.trim()}\n\nUn saludo,\nEquipo de ${c.name}${d.codigo ? `\n\nReferencia: reserva ${d.codigo}` : ""}\n\nWhatsApp: ${d.whatsappUrl}` + footText(c);
  return finish(c, d.logoUrl, { subject: d.asunto.trim(), preheader: d.mensaje.trim().slice(0, 90), body, text });
}

/* ───────────── Vista previa (/correos) ───────────── */

export type EmailTemplate = { name: string; to: string; subject: string; preheader: string; vars: string; html: string; text: string; sent: "auto" | "panel" | null };

const SAMPLE = { checkIn: "2026-10-03", checkOut: "2026-10-04" };

export function emailTemplates(c: Cfg): EmailTemplate[] {
  const preview = (logo: string) => {
    const confirmed = reservationConfirmedEmail(c, {
      nombre: "Laura Gómez", codigo: "VF-7W9DX", cabana: "Cabaña Doble", ...SAMPLE, adultos: 2, ninos: 0, mascota: true, total: 470000, pagado: 141000,
      miReservaUrl: "#", comoLlegarUrl: "#", whatsappUrl: "#", logoUrl: logo,
    });
    const team = teamMessageEmail(c, {
      nombre: "Laura Gómez", asunto: "Tu llegada el sábado", codigo: "VF-7W9DX", whatsappUrl: "#", logoUrl: logo,
      mensaje: "Te escribimos para confirmar tu hora de llegada.\n\nSi necesitas indicaciones para llegar desde Murillo, cuéntanos y te enviamos la ubicación exacta.",
    });
    return { confirmed, team };
  };
  const { confirmed, team } = preview("{{logoUrl}}");
  const ref = (body: string, title: string, preheader: string) => emailLayout(c, { title, preheader, body });
  const pct = c.depositPct + " %";
  return [
    { name: "Reserva confirmada", to: "Huésped", sent: "auto", subject: confirmed.subject, preheader: confirmed.preheader, html: confirmed.html, text: confirmed.text,
      vars: "Se envía una sola vez cuando se aprueba el abono o el pago total (en línea o registrado por el equipo). Adjunta el .ics de la estadía." },
    { name: "Mensaje del equipo", to: "Cliente", sent: "panel", subject: team.subject, preheader: team.preheader, html: team.html, text: team.text,
      vars: "Se envía desde la ficha del cliente (botón «Correo») con el asunto y el mensaje que escribe el equipo." },
    {
      name: "Nueva reserva (negocio)",
      to: `Negocio · ${c.correoReservas}`,
      sent: null,
      subject: "Nueva reserva {{codigo}} · {{checkIn}}–{{checkOut}}",
      preheader: "{{nombre}} · {{cabana}} · abono {{abono}} pagado",
      vars: "codigo, checkIn, checkOut, noches, cabana, adultos, ninos, nombre, email, celular, total, abono, saldo, panelUrl",
      html: ref(
        h1("Nueva reserva {{codigo}}") +
          p(`El huésped pagó el abono del ${pct} y la reserva quedó confirmada.`) +
          kv([["Cabaña", "{{cabana}}"], ["Fechas", "{{checkIn}} → {{checkOut}} · {{noches}} noches"], ["Huéspedes", "{{adultos}} adultos · {{ninos}} niños"], ["Huésped", "{{nombre}} · {{celular}}"], ["Total", "{{total}}"], ["Abono pagado", "{{abono}}"], ["Saldo", "{{saldo}}"]]) +
          btn("Ver en el panel", "{{panelUrl}}", X.brand, X.cream),
        "Nueva reserva",
        "{{nombre}} · {{cabana}}",
      ),
      text: "Nueva reserva {{codigo}} ({{checkIn}} → {{checkOut}})\n{{nombre}} · {{celular}}\nTotal {{total}} · abono pagado {{abono}} · saldo {{saldo}}\nPanel: {{panelUrl}}" + footText(c),
    },
    {
      name: "Recordatorio 2 días antes",
      to: "Huésped · {{email}}",
      sent: null,
      subject: "Faltan 2 días para tu llegada, {{nombre}}",
      preheader: `Check-in: ${c.checkIn}. Recuerda tu documento físico.`,
      vars: "nombre, email, codigo, cabana, checkIn, checkOut, saldo, comoLlegarUrl, whatsappUrl",
      html: ref(
        h1("Faltan 2 días") +
          p("Hola {{nombre}}, el {{checkIn}} te esperamos en la {{cabana}}. Te dejamos lo esencial para tu llegada.") +
          kv([["Check-in", c.checkIn], ["Check-out", `hasta las ${c.checkOut}`], ["Saldo pendiente", `{{saldo}} · en línea, antes de llegar o en la hora siguiente al check-in`], ["Documento", "Documento de identidad físico de cada huésped"], ["Dirección", c.address]]) +
          btns([["Cómo llegar", "{{comoLlegarUrl}}", X.brand, X.cream], ["Escribir por WhatsApp", "{{whatsappUrl}}", X.hl, X.ink]]),
        "Faltan 2 días",
        "Recuerda tu documento físico.",
      ),
      text: `Hola {{nombre}}, faltan 2 días para tu llegada.\nReserva {{codigo}} · {{cabana}}\nCheck-in: ${c.checkIn} · Check-out: hasta las ${c.checkOut}\nSaldo pendiente: {{saldo}} (en línea, dentro de la hora siguiente al check-in)\nCómo llegar: {{comoLlegarUrl}}` + footText(c),
    },
    {
      name: "Reserva cancelada",
      to: "Huésped · {{email}}",
      sent: null,
      subject: "Tu reserva {{codigo}} fue cancelada",
      preheader: "Cancelamos tu reserva del {{checkIn}}.",
      vars: "nombre, email, codigo, cabana, checkIn, checkOut, motivo, reservarUrl, whatsappUrl",
      html: ref(
        h1("Reserva cancelada") +
          p("Hola {{nombre}}, tu reserva {{codigo}} para la {{cabana}} del {{checkIn}} al {{checkOut}} fue cancelada.") +
          kv([["Motivo", "{{motivo}}"]]) +
          small("Según nuestras políticas, el abono no es reembolsable.") +
          btns([["Hacer una nueva reserva", "{{reservarUrl}}", X.brand, X.cream], ["Escribir por WhatsApp", "{{whatsappUrl}}", X.hl, X.ink]]),
        "Reserva cancelada",
        "Cancelamos tu reserva.",
      ),
      text: "Hola {{nombre}}, tu reserva {{codigo}} ({{cabana}}, {{checkIn}} → {{checkOut}}) fue cancelada.\nMotivo: {{motivo}}\nSegún nuestras políticas, el abono no es reembolsable." + footText(c),
    },
    {
      name: "Reserva reprogramada",
      to: "Huésped · {{email}}",
      sent: null,
      subject: "Tu reserva {{codigo}} cambió de fecha",
      preheader: "Nuevas fechas: {{nuevoCheckIn}} → {{nuevoCheckOut}}.",
      vars: "nombre, email, codigo, cabana, checkInAnterior, checkOutAnterior, nuevoCheckIn, nuevoCheckOut, total, pagado, saldo, miReservaUrl",
      html: ref(
        h1("Nuevas fechas") +
          p("Hola {{nombre}}, reprogramamos tu reserva {{codigo}}. Tu abono se mantiene.") +
          kv([["Cabaña", "{{cabana}}"], ["Antes", "{{checkInAnterior}} → {{checkOutAnterior}}"], ["Ahora", "{{nuevoCheckIn}} → {{nuevoCheckOut}}"], ["Total", "{{total}}"], ["Pagado", "{{pagado}}"], ["Saldo pendiente", "{{saldo}} · en línea, dentro de la hora siguiente al check-in"]]) +
          btn("Ver mi reserva", "{{miReservaUrl}}", X.brand, X.cream) +
          small("Con menos de 5 días (120 horas) antes de la llegada ya no se permiten nuevos cambios."),
        "Nuevas fechas",
        "Reprogramamos tu reserva.",
      ),
      text: "Hola {{nombre}}, reprogramamos tu reserva {{codigo}}.\nAhora: {{nuevoCheckIn}} → {{nuevoCheckOut}}\nTotal {{total}} · pagado {{pagado}} · saldo {{saldo}}\nVer mi reserva: {{miReservaUrl}}" + footText(c),
    },
  ];
}
