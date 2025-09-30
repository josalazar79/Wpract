// index.js
// WhatsApp Chatbot - MsGames (Twilio + Express)
// Funciona en Sandbox y Producción. Ver variables de entorno abajo.

import express from "express";
import crypto from "crypto";
import { MessagingResponse } from "twilio/lib/twiml/MessagingResponse.js";

// ====== Config ======
const PORT = process.env.PORT || 3000;

// Twilio (recomendado: usar variables de entorno)
// Ej. Sandbox FROM = 'whatsapp:+14155238886'
// Producción FROM = 'whatsapp:+<tu_numero_verificado>'
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || ""; // opcional para validación de firma
const WHATSAPP_FROM = process.env.WHATSAPP_FROM || "whatsapp:+14155238886"; // default sandbox
const BRAND = "MsGames";

// ====== Datos de cursos (según requerimientos) ======
/**
 * Notas:
 * - Se inventan temarios por ser prueba.
 * - Si preguntan por otro curso: "de momento no hay".
 * - Montos y duraciones según documento de requerimientos.
 * - Horario del curso en vivo "Cómo crear un chatbot de WhatsApp": Jueves 18 de setiembre 7:00pm, 3 clases, 1h c/u, inversión única 5650.
 */
const cursos = {
  "como crear un chatbot de whatsapp": {
    id: "chatbot-whatsapp",
    nombre: "Cómo crear un chatbot de WhatsApp",
    modalidad: "En vivo (abre el siguiente)",
    inicio: "Jueves 18 de setiembre a las 7:00pm",
    clases: 3,
    duracionClase: "1 hora",
    precio: 5650,
    precioTexto: "₡5.650",
    temario: [
      "Fundamentos de WhatsApp Business y Twilio",
      "Diseño de flujo conversacional (menús, intents, fallback)",
      "Despliegue en Sandbox y Producción (webhooks, validación, logs)"
    ]
  },
  "python basico intermedio": {
    id: "python-bi",
    nombre: "Python Básico-Intermedio",
    modalidad: "En vivo y asincrónico",
    meses: 3,
    clasesPorSemana: 1,
    mensualidad: 11300,
    mensualidadTexto: "₡11.300",
    asincronico: 16950,
    asincronicoTexto: "₡16.950",
    temario: [
      "Sintaxis esencial y estructuras de datos",
      "Funciones, módulos y entornos virtuales",
      "Pandas y automatización de tareas"
    ]
  },
  "sql basico intermedio": {
    id: "sql-bi",
    nombre: "SQL Básico-Intermedio",
    modalidad: "En vivo y asincrónico",
    meses: 4,
    clasesPorSemana: 1,
    // En el documento aparece el símbolo €, conservamos el valor textual:
    mensualidad: 11300,
    mensualidadTexto: "€11.300",
    asincronico: 22680,
    asincronicoTexto: "₡22.680",
    temario: [
      "SELECT, filtros y ordenamientos",
      "JOINs, subconsultas y funciones de agregación",
      "Modelado básico y optimización de consultas"
    ]
  },
  "photoshop basico intermedio": {
    id: "ps-bi",
    nombre: "Photoshop Básico-Intermedio",
    modalidad: "En vivo y asincrónico",
    meses: 2,
    clasesPorSemana: 1,
    mensualidad: 11300,
    mensualidadTexto: "₡11.300",
    asincronico: 11300,
    asincronicoTexto: "₡11.300",
    temario: [
      "Capas, selecciones y máscaras",
      "Retoque fotográfico y corrección de color",
      "Montajes, texto y exportación"
    ]
  },
  "ligma basico intermedio": {
    id: "ligma-bi",
    nombre: "Ligma Básico-Intermedio",
    modalidad: "En vivo y asincrónico",
    meses: 3,
    clasesPorSemana: 1,
    mensualidad: 11300,
    mensualidadTexto: "₡11.300",
    asincronico: 11300,
    asincronicoTexto: "₡11.300",
    temario: [
      "Fundamentos y sintaxis de Ligma",
      "Patrones de uso intermedio",
      "Proyecto guiado y buenas prácticas"
    ]
  },
  "programacion de video juegos de plataforma 2d": {
    id: "games2d",
    nombre: "Programación de Videojuegos de Plataforma 2D",
    modalidad: "En vivo y asincrónico",
    semanas: 5,
    clasesPorSemana: 1,
    mensualidad: 11300,
    mensualidadTexto: "₡11.300",
    asincronico: 11300,
    asincronicoTexto: "₡11.300",
    temario: [
      "Motor 2D y movimiento del personaje",
      "Colisiones, físicas básicas y cámaras",
      "Enemigos, UI y empaquetado"
    ]
  }
};

// Índices de ayuda para búsquedas flexibles
const aliasMapa = new Map([
  ["chatbot", "como crear un chatbot de whatsapp"],
  ["whatsapp", "como crear un chatbot de whatsapp"],
  ["python", "python basico intermedio"],
  ["sql", "sql basico intermedio"],
  ["photoshop", "photoshop basico intermedio"],
  ["ps", "photoshop basico intermedio"],
  ["ligma", "ligma basico intermedio"],
  ["videojuegos 2d", "programacion de video juegos de plataforma 2d"],
  ["juegos", "programacion de video juegos de plataforma 2d"],
]);

// ====== Utilidades ======
const normalize = (s="") =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

function encontrarCurso(texto) {
  const t = normalize(texto);

  // Match exacto por nombre
  for (const k of Object.keys(cursos)) {
    if (t.includes(normalize(k))) return k;
  }

  // Alias por palabras clave
  for (const [alias, destino] of aliasMapa.entries()) {
    if (t.includes(normalize(alias))) return destino;
  }

  // Heurística por tokens
  const tokens = t.split(" ");
  const puntajes = {};
  for (const k of Object.keys(cursos)) {
    const nombreTokens = normalize(k).split(" ");
    const score = tokens.filter(tok => nombreTokens.includes(tok)).length;
    if (score > 0) puntajes[k] = score;
  }
  const mejor = Object.entries(puntajes).sort((a, b) => b[1] - a[1])[0];
  return mejor?.[0] || null;
}

function ayudaPrincipal() {
  return (
`👋 Bienvenido/a a *${BRAND}* — cursos libres de informática y programación.

Puedes escribir:
• *menu* o *cursos* — ver opciones
• *precio {curso}* — ejemplo: "precio Python"
• *temario {curso}* — ejemplo: "temario SQL"
• *horario* — del curso en vivo actual
• *inscribirme* — pasos para reservar tu cupo

Tip: intenta con "precio chatbot", "temario photoshop", "precio ligma", etc.`
  );
}

function listarCursos() {
  const items = Object.values(cursos).map(c => `• ${c.nombre}`);
  return `🎓 Cursos disponibles:\n${items.join("\n")}\n\nSi preguntas por otro curso, de momento no hay.`;
}

function infoPrecio(nombre) {
  const c = cursos[nombre];
  if (!c) return "No encontré ese curso. Prueba con *menu* para ver los disponibles.";

  if (c.id === "chatbot-whatsapp") {
    return `💰 *${c.nombre}*\nInversión única: *${c.precioTexto}*.\nModalidad: ${c.modalidad}.\nInicio: ${c.inicio}.\nClases: ${c.clases} (de ${c.duracionClase}).`;
  }

  let lineaDuracion = "";
  if (c.meses) lineaDuracion = `${c.meses} meses, ${c.clasesPorSemana} clase por semana.`;
  if (c.semanas) lineaDuracion = `${c.semanas} semanas, ${c.clasesPorSemana} clase por semana.`;

  return (
`💰 *${c.nombre}*
Modalidad: ${c.modalidad}.
Duración: ${lineaDuracion}
Mensualidad (en vivo): *${c.mensualidadTexto}*
Asincrónico: *${c.asincronicoTexto}*`
  );
}

function infoTemario(nombre) {
  const c = cursos[nombre];
  if (!c) return "No encontré ese curso. Escribe *menu* para ver los disponibles.";
  return `📚 *Temario - ${c.nombre}*\n- ${c.temario.join("\n- ")}`;
}

function infoHorario() {
  const c = cursos["como crear un chatbot de whatsapp"];
  return `🗓️ Próximo en vivo: *${c.nombre}*\n• Inicio: ${c.inicio}\n• Clases: ${c.clases} (de ${c.duracionClase})\n• Inversión única: ${c.precioTexto}`;
}

function pasosInscripcion() {
  return (
`✅ Para inscribirte:
1) Responde con "*Inscribirme {curso}*". Ej.: "Inscribirme Python".
2) Te enviaremos el enlace de pago seguro y confirmación.
3) ¡Listo! Recibirás indicaciones por WhatsApp y correo.`
  );
}

function respuestaFallback() {
  return (
`No te entendí del todo 🤔. Escribe *ayuda* o *menu* para empezar.
Ejemplos: "precio sql", "temario photoshop", "horario chatbot".`
  );
}

// ====== Seguridad opcional: Validar firma de Twilio ======
function validateTwilioSignature(req) {
  // Si no hay token, omitir validación (útil para desarrollo local/sandbox).
  if (!TWILIO_AUTH_TOKEN) return true;

  const url = (process.env.PUBLIC_URL || "") + req.originalUrl;
  const params = { ...req.body };
  const signature = req.get("x-twilio-signature") || req.get("X-Twilio-Signature");
  if (!signature) return false;

  // Validación manual (compatibilidad ESM)
  const sorted = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  const expected = crypto.createHmac("sha1", TWILIO_AUTH_TOKEN).update(sorted).digest("base64");
  return signature === expected;
}

// ====== App ======
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Salud
app.get("/", (_req, res) => {
  res.status(200).send(`${BRAND} WhatsApp Bot OK`);
});

// Webhook WhatsApp
app.post("/whatsapp", (req, res) => {
  if (!validateTwilioSignature(req)) {
    return res.status(403).send("Firma Twilio inválida");
  }

  const twiml = new MessagingResponse();
  const incoming = (req.body.Body || "").toString();
  const from = (req.body.From || "").toString();

  const body = normalize(incoming);

  // Comandos globales
  if (["ayuda", "help", "hola", "hi"].some(k => body === k || body.startsWith(k))) {
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

  if (body.startsWith("inscribirme")) {
    const posibleNombre = body.replace("inscribirme", "").trim();
    const cursoKey = posibleNombre ? (encontrarCurso(posibleNombre) || null) : null;

    const msg = pasosInscripcion()
      + (cursoKey ? `\n\nCurso elegido: *${cursos[cursoKey].nombre}*.\nTe contactaremos a este número (${from.replace("whatsapp:", "")}) con el enlace de pago.` 
                  : `\n\nDime el curso. Ej.: "Inscribirme SQL".`);

    twiml.message(msg);
    return res.type("text/xml").send(twiml.toString());
  }

  // Intenciones con palabras clave: "precio X", "temario X"
  const precioRegex = /(precio|costo|inversion)\s+(.*)$/i;
  const temarioRegex = /(temario|contenido|silabo)\s+(.*)$/i;

  if (precioRegex.test(incoming)) {
    const match = incoming.match(precioRegex);
    const query = match?.[2] || "";
    const key = encontrarCurso(query);
    if (key) {
      twiml.message(infoPrecio(key));
    } else {
      twiml.message("No encontré ese curso. Escribe *menu* para ver los disponibles. De momento no hay otros cursos.");
    }
    return res.type("text/xml").send(twiml.toString());
  }

  if (temarioRegex.test(incoming)) {
    const match = incoming.match(temarioRegex);
    const query = match?.[2] || "";
    const key = encontrarCurso(query);
    if (key) {
      twiml.message(infoTemario(key));
    } else {
      twiml.message("No encontré ese curso. Prueba con *menu*. De momento no hay más cursos.");
    }
    return res.type("text/xml").send(twiml.toString());
  }

  // Si el usuario menciona solo el nombre del curso -> mostrar resumen + precios
  const keyDirecta = encontrarCurso(incoming);
  if (keyDirecta) {
    const resumen = infoPrecio(keyDirecta) + `\n\n¿Quieres ver el *temario*? Escribe: "temario ${cursos[keyDirecta].nombre}".`;
    twiml.message(resumen);
    return res.type("text/xml").send(twiml.toString());
  }

  // Fallback
  twiml.message(respuestaFallback());
  return res.type("text/xml").send(twiml.toString());
});

app.listen(PORT, () => {
  console.log(`[${BRAND}] WhatsApp bot escuchando en :${PORT}. FROM=${WHATSAPP_FROM}`);
});
