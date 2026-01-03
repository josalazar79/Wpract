/**
 * WhatsApp Bot - CSJS Río Claro
 * Requiere: Twilio WhatsApp + Express
 *
 * Variables necesarias:
 * - PORT (opcional)
 * - TWILIO_AUTH_TOKEN (obligatoria para validar requests)
 *
 * Nota:
 * - Este bot guarda sesiones en memoria (ideal para pruebas y negocios pequeños).
 * - Si quieres que no se pierdan al reiniciar, podemos conectarlo a una BD (MongoDB, Redis, etc.).
 */

const express = require("express");
const twilio = require("twilio");

const app = express();

// Twilio envía data como application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));

// (Opcional pero recomendado) Validación de requests de Twilio
// Necesitas definir: TWILIO_AUTH_TOKEN
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN; 

// Memoria simple para sesiones
// key: numero del cliente (From), value: { step, data }
const sessions = new Map();

/**
 * Helpers
 */
function normalizeText(text = "") {
  return text.toString().trim();
}

function isMenuCommand(msg) {
  const t = normalizeText(msg).toUpperCase();
  return t === "MENU" || t === "MENÚ" || t === "INICIO" || t === "START";
}

function isExitCommand(msg) {
  const t = normalizeText(msg).toUpperCase();
  return t === "5" || t === "SALIR" || t === "EXIT";
}

function mainMenu() {
  return (
    `👋 *¡Bienvenido a CSJS Río Claro!* \n` +
    `Somos tu centro de *reparación y mantenimiento de computadoras*.\n\n` +
    `✅ *Elige una opción respondiendo con el número:*\n\n` +
    `1️⃣ Diagnóstico de computadoras\n` +
    `2️⃣ Mantenimiento preventivo (agendar cita)\n` +
    `3️⃣ Servicios ofrecidos\n` +
    `4️⃣ Consultar por un equipo en taller\n` +
    `5️⃣ Salir\n\n` +
    `📌 Puedes escribir *MENU* en cualquier momento para volver al inicio.`
  );
}

function servicesList() {
  return (
    `🛠️ *Servicios ofrecidos en CSJS Río Claro:*\n\n` +
    `✅ Formateo\n` +
    `✅ Limpieza (interna/externa)\n` +
    `✅ Upgrade de Hardware (RAM, SSD, etc.)\n` +
    `✅ Instalación / configuración de Software\n\n` +
    `📌 Si deseas solicitar alguno, escribe *MENU* y elige una opción.\n` +
    `¿Deseas volver al menú? Escribe *MENU*.`
  );
}

function goodbyeMessage() {
  return (
    `👋 ¡Gracias por escribir a *CSJS Río Claro*! \n` +
    `Cuando gustes, escribe *MENU* para iniciar nuevamente. 😊`
  );
}

/**
 * Construye una respuesta TwiML
 */
function twimlMessage(text) {
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(text);
  return twiml.toString();
}

/**
 * Crea/obtiene sesión
 */
function getSession(from) {
  if (!sessions.has(from)) {
    sessions.set(from, { step: "MENU", data: {} });
  }
  return sessions.get(from);
}

/**
 * Reinicia sesión a menú
 */
function resetToMenu(from) {
  sessions.set(from, { step: "MENU", data: {} });
}

/**
 * RUTA webhook de WhatsApp (Twilio)
 * Configurar en Twilio Console:
 * WhatsApp Sandbox / WhatsApp Sender -> "WHEN A MESSAGE COMES IN" -> tu URL /whatsapp
 */
app.post("/whatsapp", (req, res) => {
  // Validación opcional de Twilio (seguridad)
  if (twilioAuthToken) {
    const signature = req.headers["x-twilio-signature"];
    const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    const isValid = twilio.validateRequest(
      twilioAuthToken,
      signature,
      url,
      req.body
    );
    if (!isValid) {
      return res.status(403).send("Forbidden - Invalid Twilio Signature");
    }
  }

  const from = req.body.From; // ej: "whatsapp:+5068xxxxxxx"
  const body = normalizeText(req.body.Body);

  const session = getSession(from);

  // Comandos globales
  if (isMenuCommand(body)) {
    resetToMenu(from);
    return res.type("text/xml").send(twimlMessage(mainMenu()));
  }

  if (isExitCommand(body)) {
    resetToMenu(from);
    return res.type("text/xml").send(twimlMessage(goodbyeMessage()));
  }

  // Flujos por pasos
  let reply = "";

  switch (session.step) {
    case "MENU": {
      // Si el usuario escribe algo que no sea 1-5, le re-mostramos el menú
      if (body === "1") {
        session.step = "DIAG_MARCA";
        reply =
          `🧪 *Diagnóstico de computadoras*\n\n` +
          `Por favor indícanos la *marca* del equipo.\n` +
          `Ejemplo: HP, Dell, Lenovo, Asus...`;
      } else if (body === "2") {
        session.step = "MANT_FECHA";
        reply =
          `🧼 *Mantenimiento preventivo*\n\n` +
          `Indícanos la *fecha de la cita* para recibir el equipo.\n` +
          `📅 Ejemplo: 10/01/2026 o "lunes 10 a las 2pm".`;
      } else if (body === "3") {
        reply = servicesList();
        // Se queda en MENU
      } else if (body === "4") {
        session.step = "TALLER_NOMBRE";
        reply =
          `🔎 *Consultar por un equipo en taller*\n\n` +
          `Indícanos el *nombre del propietario* del equipo.`;
      } else {
        reply =
          `No entendí tu selección. 🙏\n\n` +
          mainMenu();
      }
      break;
    }

    /**
     * 1) Diagnóstico
     */
    case "DIAG_MARCA": {
      session.data.marca = body;
      session.step = "DIAG_MODELO";
      reply =
        `✅ Marca registrada: *${session.data.marca}*\n\n` +
        `Ahora indícanos el *modelo* del equipo.\n` +
        `Ejemplo: Pavilion 15, ThinkPad T480, Inspiron 14, etc.`;
      break;
    }

    case "DIAG_MODELO": {
      session.data.modelo = body;
      session.step = "DIAG_FALLA";
      reply =
        `✅ Modelo registrado: *${session.data.modelo}*\n\n` +
        `Por favor describe la *falla presentada*.\n` +
        `Ejemplos: no enciende, pantalla azul, se reinicia, no da video, va lento, etc.`;
      break;
    }

    case "DIAG_FALLA": {
      session.data.falla = body;

      reply =
        `🧾 *Solicitud de Diagnóstico registrada*\n\n` +
        `📌 *Marca:* ${session.data.marca}\n` +
        `📌 *Modelo:* ${session.data.modelo}\n` +
        `📌 *Falla:* ${session.data.falla}\n\n` +
        `✅ Gracias. Un técnico revisará tu caso y te responderemos pronto.\n\n` +
        `¿Deseas volver al menú? Escribe *MENU*.`;

      // Volvemos al menú
      resetToMenu(from);
      break;
    }

    /**
     * 2) Mantenimiento preventivo
     */
    case "MANT_FECHA": {
      session.data.fechaCita = body;
      reply =
        `📅 *Cita solicitada*\n\n` +
        `✅ Fecha indicada: *${session.data.fechaCita}*\n\n` +
        `📌 Por favor indícanos:\n` +
        `1) *Marca y modelo* del equipo\n` +
        `2) Si deseas *limpieza + cambio de pasta térmica* (sí/no)\n\n` +
        `Ejemplo: "Dell Latitude 5490, sí"`;

      session.step = "MANT_DETALLES";
      break;
    }

    case "MANT_DETALLES": {
      session.data.detallesMant = body;

      reply =
        `🧾 *Mantenimiento preventivo registrado*\n\n` +
        `📌 *Fecha de cita:* ${session.data.fechaCita}\n` +
        `📌 *Detalles:* ${session.data.detallesMant}\n\n` +
        `✅ Perfecto. Te confirmaremos disponibilidad y hora por este medio.\n\n` +
        `¿Deseas volver al menú? Escribe *MENU*.`;

      resetToMenu(from);
      break;
    }

    /**
     * 4) Consultar equipo en taller
     */
    case "TALLER_NOMBRE": {
      session.data.propietario = body;
      session.step = "TALLER_CARACTERISTICAS";
      reply =
        `✅ Propietario: *${session.data.propietario}*\n\n` +
        `Ahora indícanos las *características del equipo*.\n` +
        `Ejemplo: "Laptop HP 15, color negro, i5, SSD 256GB" o "PC escritorio, Ryzen 5, 16GB RAM".`;
      break;
    }

    case "TALLER_CARACTERISTICAS": {
      session.data.caracteristicas = body;

      reply =
        `🔎 *Consulta registrada*\n\n` +
        `📌 *Propietario:* ${session.data.propietario}\n` +
        `📌 *Características:* ${session.data.caracteristicas}\n\n` +
        `✅ Revisaremos el estado del equipo en taller y te responderemos lo antes posible.\n\n` +
        `¿Deseas volver al menú? Escribe *MENU*.`;

      resetToMenu(from);
      break;
    }

    default: {
      // Si algo se desincroniza, regresamos al menú
      resetToMenu(from);
      reply = mainMenu();
    }
  } 

  return res.type("text/xml").send(twimlMessage(reply));
});

app.get("/", (req, res) => {
  res.send("✅ CSJS Río Claro WhatsApp Bot is running.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});


