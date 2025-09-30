// index.js
// -----------------------------------------------------------
// WhatsApp Chatbot (Twilio) - SODA Mi SABOR
// Producción + Sandbox, con validación de firma opcional,
// menú, carrito, y controles básicos anti-spam.
// -----------------------------------------------------------
require("dotenv").config();
const express = require("express");
const twilio = require("twilio");

// --- App ---
const app = express();
app.use(express.urlencoded({ extended: false })); // Twilio envía application/x-www-form-urlencoded

// --- Seguridad: Validación de firma Twilio (recomendada en prod) ---
const shouldValidate = String(process.env.TWILIO_VALIDATE || "true").toLowerCase() === "true";
const webhookMiddleware = twilio.webhook({
  validate: shouldValidate,
  protocol: process.env.WEBHOOK_PROTOCOL || "https",
  host: process.env.WEBHOOK_HOST || undefined,
});

// --- Catálogo SODA Mi SABOR (inspirado en tus categorías) ---
const MENU = {
  "1": {
    titulo: "Entradas",
    items: [
      "Yuca frita con salsa de ajo",
      "Empanaditas mixtas (carne/queso)",
      "Chifrijo mini con aguacate",
      "Patacones crujientes con pico de gallo",
      "Ceviche de banano estilo de la casa"
    ],
  },
  "2": {
    titulo: "Desayunos",
    items: [
      "Gallo pinto con huevo al gusto",
      "Tortilla palmeada con natilla y queso",
      "Panqueques con miel de tapa dulce",
      "Desayuno típico (pinto, salchichón, plátano, queso)",
      "Avotoast con tomate y culantro"
    ],
  },
  "3": {
    titulo: "Almuerzos",
    items: [
      "Casado con bistec en salsa",
      "Pollo al ajillo con ensalada fresca",
      "Pescado empanizado con papas rústicas",
      "Olla de carne (Jue y Dom)",
      "Chop suey tico con arroz blanco"
    ],
  },
  "4": {
    titulo: "Comidas Rápidas",
    items: [
      "Hamburguesa artesanal con salsa casera",
      "Choripán con chimichurri",
      "Taco tico de carne mechada",
      "Perro caliente con cebolla caramelizada",
      "Quesadilla mixta (pollo/queso)"
    ],
  },
  "5": {
    titulo: "Bebidas Frías",
    items: [
      "Fresco de cas con hielo",
      "Horchata fría",
      "Limonada con hierbabuena",
      "Refresco de tamarindo",
      "Batido de fresa con leche"
    ],
  },
  "6": {
    titulo: "Bebidas Calientes",
    items: [
      "Café chorreado de la casa",
      "Agua dulce caliente",
      "Chocolate caliente",
      "Capuchino clásico",
      "Té negro con canela"
    ],
  },
};

// --- Estado de sesión simple en memoria (por número) ---
// En producción real, usa Redis / DB para persistencia y escalabilidad.
const sessions = new Map();

// --- Anti-spam básico: ventana deslizante por número ---
const RATE = {
  WINDOW_MS: 15 * 1000, // 15s
  MAX_MSGS: 6,
};
const rateBucket = new Map(); // user -> { ts:[], mutedUntil? }

function checkRateLimit(user) {
  const now = Date.now();
  const entry = rateBucket.get(user) || { ts: [] };
  entry.ts = entry.ts.filter(t => now - t < RATE.WINDOW_MS);
  entry.ts.push(now);
  rateBucket.set(user, entry);
  if (entry.mutedUntil && now < entry.mutedUntil) return false;
  if (entry.ts.length > RATE.MAX_MSGS) {
    entry.mutedUntil = now + 30 * 1000; // 30s silencio
    rateBucket.set(user, entry);
    return false;
  }
  return true;
}

// --- Utilidades ---
const normalize = (s = "") =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

const banner = (isSandbox) =>
  "✨ *SODA Mi SABOR* ✨\n" +
  (isSandbox
    ? "Estás chateando en *SANDBOX* de Twilio.\n"
    : "Número *PRODUCCIÓN* ✅\n") +
  "\n" +
  "Elige una opción:\n" +
  "1️⃣ Entradas\n" +
  "2️⃣ Desayunos\n" +
  "3️⃣ Almuerzos\n" +
  "4️⃣ Comidas Rápidas\n" +
  "5️⃣ Bebidas Frías\n" +
  "6️⃣ Bebidas Calientes\n\n" +
  "🧭 Comandos: *MENU*, *CARRITO*, *ELIMINAR N*, *CONFIRMAR*, *UBICACION*, *HORARIO*, *AYUDA*";

function listCategory(catKey) {
  const cat = MENU[catKey];
  if (!cat) return "Categoría no encontrada. Escribe *MENU* para ver opciones.";
  const lines = cat.items.map((txt, i) => `_${i + 1}._ ${txt}`);
  return `*${cat.titulo}*\n${lines.join("\n")}\n\n` +
         "👉 Añade con *AGREGAR " + catKey + " N* (ej: AGREGAR 4 2).";
}

function ensureSession(user) {
  if (!sessions.has(user)) {
    sessions.set(user, { cart: [], lastCategory: null });
  }
  return sessions.get(user);
}

function isSandboxNumber(toNumber) {
  const sandboxFrom = (process.env.TWILIO_WHATSAPP_SANDBOX_FROM || "whatsapp:+14155238886");
  // Si el bot está respondiendo DESDE el número sandbox, es sandbox:
  return toNumber === sandboxFrom;
}

// --- Webhook principal ---
app.post("/whatsapp", webhookMiddleware, (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();

  const from = req.body.From || ""; // whatsapp:+XXXXXXXXXXX
  const to = req.body.To || "";     // whatsapp:+14155238886 (sandbox) o tu número WA Business
  const body = req.body.Body || "";

  const user = from.replace(/^whatsapp:/, "");
  const text = normalize(body);
  const session = ensureSession(user);
  const sandbox = isSandboxNumber(to);

  // Anti-spam
  if (!checkRateLimit(user)) {
    twiml.message("⏳ Estás enviando mensajes muy rápido. Espera unos segundos e intenta de nuevo.");
    return res.type("text/xml").send(twiml.toString());
  }

  // Comandos globales / inicio
  if (!text || ["hola", "buenas", "menu", "inicio", "start"].includes(text)) {
    twiml.message(banner(sandbox));
    return res.type("text/xml").send(twiml.toString());
  }

  if (text === "ubicacion" || text === "ubicación") {
    twiml.message(
      "📍 *Ubicación:*\nSODA Mi SABOR, Calle Principal, San José, Costa Rica.\n" +
      "Mapa: https://maps.app.goo.gl/"
    );
    return res.type("text/xml").send(twiml.toString());
  }

  if (text === "horario") {
    twiml.message(
      "⏰ *Horario:*\n" +
      "L–V 7:00–21:00\n" +
      "S 8:00–21:00\n" +
      "D 8:00–16:00"
    );
    return res.type("text/xml").send(twiml.toString());
  }

  if (text === "ayuda" || text === "help") {
    twiml.message(
      "*Ayuda*\n" +
      "• MENU → ver categorías\n" +
      "• 1..6 → abrir categoría\n" +
      "• AGREGAR C I → añade (ej: AGREGAR 2 1)\n" +
      "• CARRITO / ELIMINAR N / CONFIRMAR\n" +
      "• UBICACION / HORARIO"
    );
    return res.type("text/xml").send(twiml.toString());
  }

  // Carrito
  if (text === "carrito") {
    if (!session.cart.length) {
      twiml.message("🛒 Tu carrito está vacío. Explora con *MENU* y agrega algo sabroso 😋");
    } else {
      const lines = session.cart.map((c, i) => `_${i + 1}._ ${c.categoria} · ${c.item}`);
      twiml.message("*Tu carrito:*\n" + lines.join("\n") + "\n\nPara eliminar: *ELIMINAR N* (ej: ELIMINAR 2)");
    }
    return res.type("text/xml").send(twiml.toString());
  }

  if (text.startsWith("eliminar ")) {
    const n = parseInt(text.split(/\s+/)[1], 10);
    if (!isNaN(n) && session.cart[n - 1]) {
      const removed = session.cart.splice(n - 1, 1)[0];
      twiml.message(`🗑️ Eliminado: ${removed.categoria} · ${removed.item}\nEscribe *CARRITO* para ver el resto.`);
    } else {
      twiml.message("No pude eliminar ese ítem. Revisa el número con *CARRITO*.");
    }
    return res.type("text/xml").send(twiml.toString());
  }

  if (text === "confirmar") {
    if (!session.cart.length) {
      twiml.message("Tu carrito está vacío. Agrega algo con *AGREGAR* antes de confirmar.");
    } else {
      const resumen = session.cart.map((c) => `• ${c.categoria}: ${c.item}`).join("\n");
      session.cart = []; // vaciar
      twiml.message(
        "✅ *Pedido confirmado*\n" +
        resumen +
        "\n\nGracias por elegir *SODA Mi SABOR*. ¡A cocinar! 🍳"
      );
    }
    return res.type("text/xml").send(twiml.toString());
  }

  // Abrir categoría por número
  if (/^[1-6]$/.test(text)) {
    session.lastCategory = text;
    twiml.message(listCategory(text));
    return res.type("text/xml").send(twiml.toString());
  }

  // Añadir por comando: AGREGAR <categoria> <item>
  if (text.startsWith("agregar ")) {
    const parts = text.split(/\s+/);
    const catKey = parts[1];
    const idx = parseInt(parts[2], 10);

    if (!/^[1-6]$/.test(catKey)) {
      twiml.message("Formato: *AGREGAR CATEGORIA ITEM* (ej: AGREGAR 4 2). Escribe *MENU* para ver categorías.");
      return res.type("text/xml").send(twiml.toString());
    }
    const cat = MENU[catKey];
    if (!cat || isNaN(idx) || idx < 1 || idx > cat.items.length) {
      twiml.message("Ese ítem no existe. Escribe el número correcto (ej: *AGREGAR 4 2*).");
      return res.type("text/xml").send(twiml.toString());
    }
    const chosen = cat.items[idx - 1];
    session.cart.push({ categoria: cat.titulo, item: chosen });
    twiml.message(`🛒 Añadido: *${cat.titulo}* · _${chosen}_\nEscribe *CARRITO* o sigue pidiendo 😉`);
    return res.type("text/xml").send(twiml.toString());
  }

  // Abrir categoría por nombre exacto
  const matchCat = Object.entries(MENU).find(
    ([, v]) => normalize(v.titulo) === text
  );
  if (matchCat) {
    session.lastCategory = matchCat[0];
    twiml.message(listCategory(matchCat[0]));
    return res.type("text/xml").send(twiml.toString());
  }

  // Fallback inteligente: si el usuario envía un número de ítem sin contexto, intenta con la última categoría visitada
  if (/^\d+$/.test(text) && session.lastCategory) {
    const idx = parseInt(text, 10);
    const cat = MENU[session.lastCategory];
    if (cat && idx >= 1 && idx <= cat.items.length) {
      const chosen = cat.items[idx - 1];
      session.cart.push({ categoria: cat.titulo, item: chosen });
      twiml.message(`🛒 Añadido: *${cat.titulo}* · _${chosen}_\nEscribe *CARRITO* o sigue pidiendo 😉`);
      return res.type("text/xml").send(twiml.toString());
    }
  }

  // Despedida o no entendido
  if (["gracias", "muchas gracias"].includes(text)) {
    twiml.message("¡Con gusto! 😊 ¿Deseas algo más? Escribe *MENU* para seguir explorando.");
    return res.type("text/xml").send(twiml.toString());
  }

  twiml.message("No te entendí 🤔. Escribe *MENU* para ver opciones o *AYUDA*.");
  return res.type("text/xml").send(twiml.toString());
});

// --- Endpoint de salud ---
app.get("/health", (_req, res) => res.json({ ok: true }));

// --- Servidor ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const mode = shouldValidate ? "validando firma Twilio" : "SIN validación de firma";
  console.log(`✅ WhatsApp bot escuchando en :${PORT} (${mode})`);
});
