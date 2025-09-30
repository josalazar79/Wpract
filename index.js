// index.js
import express from "express";
import crypto from "crypto";
import twilio from "twilio"; // <- IMPORTA el paquete raíz (no uses rutas internas)

const { MessagingResponse } = twilio.twiml;

// ====== Config ======
const PORT = process.env.PORT || 3000;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || ""; // opcional para validar firma
const WHATSAPP_FROM = process.env.WHATSAPP_FROM || "whatsapp:+14155238886";
const BRAND = "MsGames";

// ====== Cursos (igual que antes, recortado por brevedad: pega tus datos) ======
const cursos = {
  "como crear un chatbot de whatsapp": {
    id: "chatbot-whatsapp",
    nombre: "Cómo crear un chatbot de WhatsApp",
    modalidad: "En vivo (abre el siguiente)",
    inicio: "Jueves 18 de setiembre a las 7:00pm",
    clases: 3,
    duracionClase: "1 hora",
    precioTexto: "₡5.650",
    temario: [
      "Fundamentos de WhatsApp Business y Twilio",
      "Diseño de flujo conversacional",
      "Despliegue en Sandbox y Producción"
    ]
  }
  // ... (resto de cursos)
};

// ====== Utils ======
const normalize = (s="") =>
  s.toLowerCase().normalize("NFD")
   .replace(/\p{Diacritic}/gu, "")
   .replace(/[^\p{L}\p{N}\s]/gu, " ")
   .replace(/\s+/g, " ").trim();

function ayudaPrincipal() {
  return `👋 Bienvenido/a a *${BRAND}*. Escribe *menu* para ver cursos, *precio X*, *temario X*, *horario*, *inscribirme*.`;
}
function listarCursos() {
  const items = Object.values(cursos).map(c => `• ${c.nombre}`).join("\n");
  return `🎓 Cursos disponibles:\n${items}`;
}
function infoHorario() {
  const c = cursos["como crear un chatbot de whatsapp"];
  return `🗓️ Próximo en vivo: *${c.nombre}*\n• Inicio: ${c.inicio}\n• Clases: ${c.clases} (de ${c.duracionClase})\n• Inversión: ${c.precioTexto}`;
}
function respuestaFallback() {
  return `No te entendí 🤔. Escribe *menu* o *ayuda*.`;
}

// ====== (Opcional) Validación de firma Twilio, segura en prod ======
function isValidTwilio(req) {
  if (!TWILIO_AUTH_TOKEN) return true; // en dev, omite
  const url = (process.env.PUBLIC_URL || "") + req.originalUrl;
  const signature = req.get("X-Twilio-Signature");
  return twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, url, req.body);
}

// ====== App ======
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Salud / healthcheck (Render usa esto para ver si está vivo)
app.get("/", (_req, res) => {
  res.status(200).send(`${BRAND} WhatsApp Bot OK`);
});

// Webhook
app.post("/whatsapp", (req, res) => {
  if (!isValidTwilio(req)) return res.status(403).send("Firma Twilio inválida");

  const twiml = new MessagingResponse();
  const incoming = (req.body.Body || "").toString();
  const body = normalize(incoming);

  if (["ayuda", "help", "hola", "hi"].includes(body)) {
    twiml.message(ayudaPrincipal());
    return res.type("text/xml").send(twiml.toString());
  }
  if (["menu", "cursos", "opciones"].includes(body)) {
    twiml.message(listarCursos());
    return res.type("text/xml").send(twiml.toString());
  }
  if (body.startsWith("horario")) {
    twiml.message(infoHorario());
    return res.type("text/xml").send(twiml.toString());
  }

  twiml.message(respuestaFallback());
  return res.type("text/xml").send(twiml.toString());
});

// ====== Logs y manejo de errores no atrapados ======
process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err);
  // no hacemos process.exit; dejamos que Render lo mantenga corriendo
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

app.listen(PORT, () => {
  console.log(`[${BRAND}] WhatsApp bot escuchando en :${PORT} (FROM=${WHATSAPP_FROM})`);
});

