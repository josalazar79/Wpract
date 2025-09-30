// index.js
import express from "express";
import crypto from "crypto";
import twilio from "twilio";

const MessagingResponse = twilio.twiml.MessagingResponse;

// ====== Config ======
const PORT = process.env.PORT || 3000;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || ""; // opcional
const WHATSAPP_FROM = process.env.WHATSAPP_FROM || "whatsapp:+14155238886";
const BRAND = "MsGames";

// ====== Cursos ======
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
  },
  "python basico intermedio": {
    id: "python-bi",
    nombre: "Python Básico-Intermedio",
    modalidad: "En vivo y asincrónico",
    meses: 3,
    clasesPorSemana: 1,
    mensualidadTexto: "₡11.300",
    asincronicoTexto: "₡16.950",
    temario: [
      "Sintaxis esencial y estructuras de datos",
      "Funciones y módulos",
      "Pandas y automatización de tareas"
    ]
  }
  // ... (agrega los demás cursos igual que antes)
};

// ====== Utils ======
const normalize = (s = "") =>
  s.toLowerCase().normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ").trim();

function ayudaPrincipal() {
  return `👋 Bienvenido/a a *${BRAND}*. 
Escribe:
• *menu* — ver cursos
• *precio X* — ejemplo: "precio python"
• *temario X* — ejemplo: "temario sql"
• *horario* — curso en vivo actual
• *inscribirme* — pasos de inscripción`;
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

// ====== Firma Twilio (opcional) ======
function isValidTwilio(req) {
  if (!TWILIO_AUTH_TOKEN) return true;
  const url = (process.env.PUBLIC_URL || "") + req.originalUrl;
  const sig = req.get("X-Twilio-Signature");
  return twilio.validateRequest(TWILIO_AUTH_TOKEN, sig, url, req.body);
}

// ====== App ======
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", (_req, res) => res.status(200).send(`${BRAND} WhatsApp Bot OK`));

app.post("/whatsapp", (req, res) => {
  if (!isValidTwilio(req)) return res.status(403).send("Firma inválida");

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

// ====== Logs ======
process.on("unhandledRejection", (err) => console.error("[unhandledRejection]", err));
process.on("uncaughtException", (err) => console.error("[uncaughtException]", err));

app.listen(PORT, () => {
  console.log(`[BOOT] ${BRAND} bot escuchando en :${PORT} (FROM=${WHATSAPP_FROM})`);
});
