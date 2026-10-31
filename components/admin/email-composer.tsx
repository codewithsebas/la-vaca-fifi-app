"use client";

// Enviar un correo a un cliente desde su ficha. El servidor toma el destinatario de las reservas del cliente (no del navegador),
// lo envía con Resend y deja el resultado en la bandeja de correos. Cada intento lleva un identificador propio:
// reintentar después de un fallo nunca envía el mismo mensaje dos veces.
import { useEffect, useState } from "react";
import { CloseIcon, MailIcon } from "@/components/icons";
import { Combobox } from "@/components/ui/combobox";
import { api, type ApiError } from "@/lib/api";
import { fmtDate, timeAgo } from "@/lib/format";
import type { EmailRecord, Reservation } from "@/lib/types";
import { useAdmin } from "./context";
import { adminInput } from "./shared";
import { Badge, Button, Callout, Field, IconButton, Modal } from "./ui";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// UUID v4 (crypto.randomUUID solo existe en contextos seguros: https o localhost).
function newRequestId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const hasEmail = (email: string | null | undefined) => !!email && EMAIL.test(email);

type Props = { clientKey: string; name: string; email: string; reservations: Reservation[]; onClose: () => void };

export function EmailComposer({ clientKey, name, email, reservations, onClose }: Props) {
  const { data, setData, toast, onAuthError, now } = useAdmin();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState(reservations[0]?.code ?? "");
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.admin.emailStatus().then(
      (r) => setConfigured(r.status === 200 ? !!r.data?.configured : null),
      () => setConfigured(null),
    );
  }, []);

  const history = data.emails.filter((e) => e.to.toLowerCase() === email.toLowerCase()).slice(0, 4);
  const store = (e: EmailRecord) => setData((d) => ({ ...d, emails: [e, ...d.emails.filter((x) => x.id !== e.id)] }));

  async function send() {
    if (busy) return;
    const f: Record<string, string> = {};
    if (subject.trim().length < 3) f.subject = "Escribe un asunto de al menos 3 caracteres.";
    if (message.trim().length < 5) f.message = "Escribe el mensaje.";
    setFields(f);
    if (Object.keys(f).length) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.admin.sendEmail({ clientKey, subject: subject.trim(), message: message.trim(), reservationCode: code || null, requestId });
      if (r.status === 401 || r.status === 403) return onAuthError();
      const body = r.data as EmailRecord | ApiError | null;
      if (r.status === 422 && body && "fields" in body && body.fields) return setFields(body.fields);
      if (r.status === 422 && (body as ApiError | null)?.error === "NO_EMAIL") return setError("Este cliente no tiene un correo válido registrado.");
      if ((r.status !== 200 && r.status !== 201) || !body || !("status" in body)) throw 0;
      store(body);
      if (body.status === "sent") {
        toast(`Correo enviado a ${email}`);
        setRequestId(newRequestId());
        onClose();
        return;
      }
      setError(`No se pudo enviar el correo: ${body.lastError || "el servicio de correo no respondió"}. Quedó registrado; puedes reintentar.`);
    } catch {
      setError("No pudimos conectar con el servidor. Revisa tu conexión y vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      labelledBy="em-title"
      describedBy="em-to"
      initialFocus="#em-subject"
      className="m-auto w-[calc(100%-32px)] max-w-[560px] rounded-2xl p-0 motion-safe:open:animate-pop-in"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id="em-title" className="flex items-center gap-2 text-[17px] font-bold text-ink">
            <MailIcon size={18} />
            Enviar correo a {name}
          </h2>
          <p id="em-to" className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
            Para: <strong className="break-all text-ink">{email}</strong>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(email).then(
                  () => setCopied(true),
                  () => {},
                );
              }}
              className="text-[12.5px] font-semibold text-ink underline underline-offset-2"
            >
              {copied ? "Copiado ✓" : "Copiar"}
            </button>
          </p>
        </div>
        <IconButton label="Cerrar" onClick={onClose}>
          <CloseIcon size={19} />
        </IconButton>
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        {configured === false && (
          <Callout tone="warning">
            El envío de correos aún no está configurado (falta <code>RESEND_API_KEY</code> en el servidor). Si lo envías, quedará registrado como no enviado y
            podrás reintentarlo después.{" "}
            <a href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`} className="font-semibold underline">
              Abrir en mi aplicación de correo
            </a>
          </Callout>
        )}
        <Field label="Asunto" error={fields.subject}>
          {(p) => (
            <input
              {...p}
              id="em-subject"
              type="text"
              maxLength={150}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ej. Tu llegada el sábado"
              className={adminInput}
            />
          )}
        </Field>
        <Field label="Mensaje" hint={`Empieza con «Hola ${name.split(" ")[0]},» y termina con la firma del equipo automáticamente.`} error={fields.message}>
          {(p) => (
            <textarea
              {...p}
              rows={6}
              maxLength={5000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className={`${adminInput} resize-y leading-relaxed`}
            />
          )}
        </Field>
        {reservations.length > 0 && (
          <Field label="Reserva relacionada">
            {(p) => (
              <Combobox
                id={p.id}
                value={code}
                onChange={setCode}
                options={[
                  { value: "", label: "Ninguna" },
                  ...reservations.map((r) => ({ value: r.code, label: r.code, description: `${fmtDate(r.checkIn)} → ${fmtDate(r.checkOut)}` })),
                ]}
              />
            )}
          </Field>
        )}
        {error && (
          <Callout tone="error" role="alert">
            {error}
          </Callout>
        )}
        {history.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-line pt-3">
            <h3 className="text-[12px] font-bold tracking-[.06em] text-ink-muted uppercase">Últimos correos a este cliente</h3>
            <ul className="flex flex-col gap-1">
              {history.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="min-w-0 truncate text-ink">
                    {e.kind === "reservation_confirmed" ? `Confirmación ${e.reservationCode ?? ""}` : e.subject}
                  </span>
                  <span className="flex flex-none items-center gap-1.5 text-[12px] text-ink-muted">
                    {timeAgo(e.sentAt ?? e.createdAt, now)}
                    <Badge tone={e.status === "sent" ? "success" : e.status === "failed" ? "danger" : "info"}>
                      {e.status === "sent" ? "Enviado" : e.status === "failed" ? "No enviado" : "En cola"}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 rounded-b-2xl border-t border-line bg-canvas/60 px-5 py-3.5 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={busy} onClick={send} icon={<MailIcon size={15} />}>
          {busy ? "Enviando…" : error ? "Reintentar envío" : "Enviar correo"}
        </Button>
      </div>
    </Modal>
  );
}
