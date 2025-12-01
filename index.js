// index.js
const express = require("express");
const twilio = require("twilio");
const qs = require("qs");

const app = express();
app.use(express.urlencoded({ extended: false }));

// 🔐 Configuración Twilio desde variables de entorno
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromWhatsAppNumber = process.env.TWILIO_WHATSAPP_FROM; // ej: "whatsapp:+14155238886"

const client = twilio(accountSid, authToken);

// 📞 Número interno donde recibes los avisos
const OPERATOR_WHATSAPP = "whatsapp:+50688998177";

// 🧠 Memoria en RAM por sesión de usuario
// Clave: waId (número de WhatsApp del cliente)
const sessions = {};

/**
 * Obtiene o crea una sesión de usuario
 */
function getSession(waId) {
  if (!sessions[waId]) {
    sessions[waId] = {
      state: "MAIN_MENU",
      flow: null,
      data: {},
    };
  }
  return sessions[waId];
}

/**
 * Responde al cliente con TwiML
 */
function replyTwiml(res, message) {
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(message);
  res.type("text/xml");
  res.send(twiml.toString());
}

/**
 * Menú principal
 */
function getMainMenuText() {
  return (
    "👋 ¡Hola! Bienvenido a *MPC Jsala*.\n" +
    "Especialistas en mantenimiento, reparación y soporte técnico de computadoras.\n\n" +
    "🕒 *Horario de atención:*\n" +
    "L–V: 4pm–9pm\n" +
    "Sábado: 9am–9pm\n\n" +
    "Por favor elige una opción escribiendo solo el número:\n" +
    "1️⃣ Consulta técnica rápida\n" +
    "2️⃣ Agendar cita en taller\n" +
    "3️⃣ Estado de un servicio en curso\n" +
    "4️⃣ Hablar con un asesor"
  );
}

/**
 * Opciones de síntoma
 */
function getSymptomMenuText() {
  return (
    "Ahora cuéntame cuál es el *síntoma principal* del problema:\n\n" +
    "1️⃣ No enciende\n" +
    "2️⃣ Enciende pero no muestra nada en pantalla\n" +
    "3️⃣ Funciona pero está muy lenta\n" +
    "4️⃣ Se apaga o reinicia solo\n" +
    "5️⃣ Aparece un mensaje de error\n" +
    "6️⃣ Problemas con internet o red\n" +
    "7️⃣ Problemas con teclado o mouse\n" +
    "8️⃣ Problemas de audio (parlantes/micrófono)\n" +
    "9️⃣ Cámara web no funciona\n" +
    "🔟 Problemas con impresora\n" +
    "1️⃣1️⃣ Problemas con batería o cargador\n" +
    "1️⃣2️⃣ Programas que no abren o se cierran\n" +
    "1️⃣3️⃣ Sospecha de virus o malware\n" +
    "1️⃣4️⃣ Pantalla azul/negra/códigos de error\n" +
    "1️⃣5️⃣ Sobrecalentamiento\n" +
    "1️⃣6️⃣ Ruidos extraños en ventilador o disco\n" +
    "1️⃣7️⃣ No reconoce USB / disco externo\n" +
    "1️⃣8️⃣ Poco espacio en disco\n" +
    "1️⃣9️⃣ Problemas con cuentas (Windows, correo, contraseñas)\n" +
    "2️⃣0️⃣ Otro (describe brevemente)"
  );
}

/**
 * Envía mensaje interno al operador
 */
async function sendInternalNotification(data) {
  const {
    flow,
    personal = {},
    technical = {},
    service = {},
    status = {},
    asesor = {},
  } = data;

  let body = "🔔 *Nuevo caso desde el chatbot – MPC Jsala*\n\n";

  body += `👤 *Cliente:* ${personal.nombre || "No indicado"}\n`;
  body += `📧 *Correo:* ${personal.correo || "No indicado"}\n`;
  body += `📍 *Zona:* ${personal.zona || "No indicado"}\n`;
  body += `🕒 *Horario preferido:* ${personal.horario || "No indicado"}\n\n`;

  if (flow === "CONSULTA" || flow === "CITA") {
    body += "💻 *Datos técnicos:*\n";
    body += `• Tipo de equipo: ${technical.tipoEquipo || "No indicado"}\n`;
    body += `• Marca/modelo: ${technical.marcaModelo || "No indicado"}\n`;
    body += `• Sistema operativo: ${technical.so || "No indicado"}\n`;
    body += `• Síntoma principal: ${technical.sintoma || "No indicado"}\n`;
    body += `• Desde cuándo ocurre: ${technical.desdeCuando || "No indicado"}\n`;
    body += `• Reparaciones recientes: ${
      technical.reparaciones || "No indicado"
    }\n\n`;
  }

  if (flow === "CITA") {
    body += "📅 *Solicitud de cita:*\n";
    body += `• Día/horario deseado: ${
      service.diaHoraDeseada || "No indicado"
    }\n\n`;
  }

  if (flow === "ESTADO") {
    body += "📘 *Consulta de estado de servicio:*\n";
    body += `• Nombre registrado: ${status.nombreServicio || "No indicado"}\n`;
    body += `• Fecha aproximada ingreso: ${
      status.fechaAprox || "No indicado"
    }\n`;
    body += `• Número de orden: ${status.numeroOrden || "No indicado"}\n\n`;
  }

  if (flow === "ASESOR") {
    body += "🗣️ *Solicitud para hablar con asesor:*\n";
    body += `• Tema: ${asesor.tema || "No indicado"}\n\n`;
  }

  body += `📘 *Flujo:* ${flow || "No indicado"}`;

  try {
    await client.messages.create({
      from: fromWhatsAppNumber,
      to: OPERATOR_WHATSAPP,
      body,
    });
  } catch (err) {
    console.error("Error enviando mensaje interno:", err.message);
  }
}

/**
 * Normaliza texto de entrada
 */
function normalizeText(text) {
  return text ? text.trim() : "";
}

/**
 * Ruta Webhook de Twilio para WhatsApp
 */
app.post("/whatsapp", async (req, res) => {
  const body = req.body || qs.parse(req.body);
  const from = body.From; // ej: "whatsapp:+5068..."
  const waId = from; // usamos el número completo como ID
  const incoming = normalizeText(body.Body || "");

  const session = getSession(waId);

  // Comando global: MENÚ
  if (incoming.toUpperCase() === "MENU" || incoming.toUpperCase() === "MENÚ") {
    session.state = "MAIN_MENU";
    session.flow = null;
    session.data = {};
    return replyTwiml(res, getMainMenuText());
  }

  // Enrutador principal según estado
  switch (session.state) {
    case "MAIN_MENU": {
      // Si es la primera vez o sin opción válida, mostrar menú
      if (!incoming || !["1", "2", "3", "4"].includes(incoming)) {
        session.state = "MAIN_MENU";
        return replyTwiml(
          res,
          getMainMenuText() +
            "\n\n👉 Escribe solo el número de la opción que prefieras."
        );
      }

      if (incoming === "1") {
        // Consulta técnica rápida
        session.flow = "CONSULTA";
        session.data.personal = {};
        session.data.technical = {};
        session.state = "ASK_NAME";
        return replyTwiml(res, "Perfecto, vamos con una *consulta técnica rápida* 🛠️\n\nPrimero, ¿cuál es tu *nombre completo*?");
      }

      if (incoming === "2") {
        // Agendar cita en taller
        session.flow = "CITA";
        session.data.personal = {};
        session.data.technical = {};
        session.data.service = {};
        session.state = "ASK_NAME";
        return replyTwiml(
          res,
          "Vamos a *agendar una cita en el taller* 🛠️\n\nPrimero, ¿cuál es tu *nombre completo*?"
        );
      }

      if (incoming === "3") {
        // Estado de servicio
        session.flow = "ESTADO";
        session.data.status = {};
        session.state = "ASK_STATUS_NAME";
        return replyTwiml(
          res,
          "Para ayudarte con el *estado de tu servicio*, por favor dime:\n\n¿A nombre de quién está el servicio? (nombre completo)"
        );
      }

      if (incoming === "4") {
        // Hablar con asesor
        session.flow = "ASESOR";
        session.data.asesor = {};
        session.state = "ASK_ASESOR_TOPIC";
        return replyTwiml(
          res,
          "Claro 👍\nCuéntame brevemente *sobre qué tema necesitas ayuda* (ejemplo: reparación, mantenimiento, formateo, respaldo de datos, etc.)."
        );
      }

      break;
    }

    /**
     * DATOS PERSONALES (flujos CONSULTA y CITA)
     */
    case "ASK_NAME": {
      session.data.personal.nombre = incoming;
      session.state = "ASK_EMAIL";
      return replyTwiml(
        res,
        `Gracias, *${incoming}* ✅\n\n¿Podrías compartir tu *correo electrónico*? (Si no deseas, escribe: No)`
      );
    }

    case "ASK_EMAIL": {
      session.data.personal.correo =
        incoming.toUpperCase() === "NO" ? "" : incoming;
      session.state = "ASK_ZONE";
      return replyTwiml(
        res,
        "¿En qué *zona o barrio* te encuentras?"
      );
    }

    case "ASK_ZONE": {
      session.data.personal.zona = incoming;
      session.state = "ASK_CONTACT_TIME";
      return replyTwiml(
        res,
        "¿En qué horario prefieres que te contactemos?\n" +
          "1️⃣ Mañana\n" +
          "2️⃣ Tarde\n" +
          "3️⃣ Noche\n" +
          "4️⃣ Cualquier horario"
      );
    }

    case "ASK_CONTACT_TIME": {
      let horario = "No indicado";
      if (incoming === "1") horario = "Mañana";
      else if (incoming === "2") horario = "Tarde";
      else if (incoming === "3") horario = "Noche";
      else if (incoming === "4") horario = "Cualquier horario";
      else horario = incoming;

      session.data.personal.horario = horario;

      // Ahora seguimos según el flujo
      if (session.flow === "CONSULTA" || session.flow === "CITA") {
        session.state = "ASK_DEVICE_TYPE";
        return replyTwiml(
          res,
          "Ahora, sobre tu equipo 💻\n\n¿Qué tipo de equipo es?\n" +
            "1️⃣ Computadora de escritorio\n" +
            "2️⃣ Laptop / Portátil\n" +
            "3️⃣ All in One"
        );
      }

      break;
    }

    /**
     * DATOS TÉCNICOS (CONSULTA y CITA)
     */
    case "ASK_DEVICE_TYPE": {
      let tipo = "No indicado";
      if (incoming === "1") tipo = "Escritorio";
      else if (incoming === "2") tipo = "Laptop / Portátil";
      else if (incoming === "3") tipo = "All in One";
      else tipo = incoming;

      session.data.technical.tipoEquipo = tipo;
      session.state = "ASK_BRAND_MODEL";
      return replyTwiml(
        res,
        "¿Sabes la *marca y modelo* del equipo? (ejemplo: Dell Inspiron 15)"
      );
    }

    case "ASK_BRAND_MODEL": {
      session.data.technical.marcaModelo = incoming;
      session.state = "ASK_OS";
      return replyTwiml(
        res,
        "¿Qué *sistema operativo* tiene tu equipo?\n" +
          "1️⃣ Windows\n" +
          "2️⃣ MacOS\n" +
          "3️⃣ Linux\n" +
          "4️⃣ No estoy seguro"
      );
    }

    case "ASK_OS": {
      let so = "No indicado";
      if (incoming === "1") so = "Windows";
      else if (incoming === "2") so = "MacOS";
      else if (incoming === "3") so = "Linux";
      else if (incoming === "4") so = "No está seguro";
      else so = incoming;

      session.data.technical.so = so;
      session.state = "ASK_SYMPTOM";
      return replyTwiml(res, getSymptomMenuText());
    }

    case "ASK_SYMPTOM": {
      // Si elige opción 20, dejamos que describa libremente
      if (incoming === "20") {
        session.state = "ASK_SYMPTOM_OTHER";
        return replyTwiml(
          res,
          "Por favor describe brevemente el problema que estás teniendo:"
        );
      }

      // Guardamos el valor directamente (puedes mapear cada número a texto)
      session.data.technical.sintoma = incoming;
      session.state = "ASK_DURATION";
      return replyTwiml(
        res,
        "¿Desde cuándo sucede esto? (ejemplo: hoy, 2 días, 1 semana, varios meses)"
      );
    }

    case "ASK_SYMPTOM_OTHER": {
      session.data.technical.sintoma = incoming;
      session.state = "ASK_DURATION";
      return replyTwiml(
        res,
        "¿Desde cuándo sucede esto? (ejemplo: hoy, 2 días, 1 semana, varios meses)"
      );
    }

    case "ASK_DURATION": {
      session.data.technical.desdeCuando = incoming;
      session.state = "ASK_RECENT_REPAIRS";
      return replyTwiml(
        res,
        "¿Le han hecho alguna *reparación o cambio reciente*? (ejemplo: cambio de disco, formateo, limpieza, etc.). Si no, puedes escribir: No"
      );
    }

    case "ASK_RECENT_REPAIRS": {
      session.data.technical.reparaciones =
        incoming.toUpperCase() === "NO" ? "" : incoming;

      // Si es consulta técnica, cerramos flujo
      if (session.flow === "CONSULTA") {
        session.state = "MAIN_MENU";

        // Mensaje final cliente
        replyTwiml(
          res,
          "✅ ¡Gracias! Con esta información podemos entender mejor tu caso.\n\n" +
            "📌 En *MPC Jsala* no contamos con servicio a domicilio.\n" +
            "🛠️ Si el problema es de software, podemos ayudarte de forma *remota*.\n" +
            "🖥️ Si requiere revisión física, podrás agendar una cita para traer tu equipo al taller.\n\n" +
            "Un técnico revisará tu caso y te contactará por este mismo número de WhatsApp.\n\n" +
            "Si deseas volver al menú principal, escribe *MENÚ*."
        );

        // Enviar notificación interna
        sendInternalNotification({
          flow: session.flow,
          personal: session.data.personal,
          technical: session.data.technical,
        });

        // No olvidamos el return
        return;
      }

      // Si es cita, pedimos día/hora deseada
      if (session.flow === "CITA") {
        session.state = "ASK_DATE_TIME";
        return replyTwiml(
          res,
          "Perfecto ✅\n\nAhora dime, ¿qué *día y horario* te gustaría para la cita en el taller? (ejemplo: miércoles 5pm, sábado en la mañana)."
        );
      }

      break;
    }

    /**
     * CITA – pedir día/hora
     */
    case "ASK_DATE_TIME": {
      session.data.service.diaHoraDeseada = incoming;
      session.state = "MAIN_MENU";

      replyTwiml(
        res,
        "✅ ¡Listo! Hemos recibido tu solicitud de *cita en el taller*.\n\n" +
          "Un técnico de *MPC Jsala* revisará la disponibilidad y te confirmará por este medio el día y la hora exactos.\n\n" +
          "Recuerda que no contamos con servicio a domicilio, pero sí podemos ayudarte de forma remota cuando la falla lo permite.\n\n" +
          "Si deseas volver al menú principal, escribe *MENÚ*."
      );

      // Notificación interna
      sendInternalNotification({
        flow: session.flow,
        personal: session.data.personal,
        technical: session.data.technical,
        service: session.data.service,
      });

      return;
    }

    /**
     * ESTADO DE SERVICIO
     */
    case "ASK_STATUS_NAME": {
      session.data.status.nombreServicio = incoming;
      session.state = "ASK_STATUS_DATE";
      return replyTwiml(
        res,
        "¿Aproximadamente en qué *fecha ingresaste el equipo* o se coordinó el servicio?"
      );
    }

    case "ASK_STATUS_DATE": {
      session.data.status.fechaAprox = incoming;
      session.state = "ASK_STATUS_ORDER";
      return replyTwiml(
        res,
        "Si tienes un *número de orden o referencia*, escríbelo ahora.\nSi no lo tienes, escribe: No"
      );
    }

    case "ASK_STATUS_ORDER": {
      session.data.status.numeroOrden =
        incoming.toUpperCase() === "NO" ? "" : incoming;
      session.state = "MAIN_MENU";

      replyTwiml(
        res,
        "Gracias ✅\nUn asesor revisará el estado de tu servicio y te responderá por este mismo chat con la información actualizada.\n\n" +
          "Si deseas volver al menú principal, escribe *MENÚ*."
      );

      sendInternalNotification({
        flow: session.flow,
        status: session.data.status,
      });

      return;
    }

    /**
     * ASESOR – tema
     */
    case "ASK_ASESOR_TOPIC": {
      session.data.asesor.tema = incoming;
      session.state = "MAIN_MENU";

      replyTwiml(
        res,
        "Gracias por la información ✅\n\n" +
          "Un asesor de *MPC Jsala* tomará tu caso y te responderá por este mismo chat lo antes posible.\n\n" +
          "Si deseas volver al menú principal, escribe *MENÚ*."
      );

      sendInternalNotification({
        flow: session.flow,
        asesor: session.data.asesor,
      });

      return;
    }

    default: {
      // Estado desconocido → reset
      session.state = "MAIN_MENU";
      session.flow = null;
      session.data = {};
      return replyTwiml(
        res,
        "Ocurrió un pequeño inconveniente con la conversación. Vamos a empezar de nuevo.\n\n" +
          getMainMenuText()
      );
    }
  }

  // Si llegamos aquí por alguna razón no contemplada
  return replyTwiml(
    res,
    "No logré entender tu mensaje.\n\n" +
      "Si deseas volver al menú principal, escribe *MENÚ*."
  );
});

// 🚀 Arranque del servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`WhatsApp bot escuchando en puerto ${PORT}`);
});


