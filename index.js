// index.js
require("dotenv").config();
const express = require("express");
const twilio = require("twilio");

const app = express();

// Twilio webhook: valida firma en prod, desactívala con TWILIO_VALIDATE=false en .env si lo necesitas
const shouldValidate = String(process.env.TWILIO_VALIDATE || "true").toLowerCase() === "true";
const webhookMiddleware = twilio.webhook({
  validate: shouldValidate,
  // Twilio lee el cuerpo urlencoded
  protocol: process.env.WEBHOOK_PROTOCOL || "https",
  host: process.env.WEBHOOK_HOST || undefined,
});

app.use(express.urlencoded({ extended: false }));

// --- Catálogo de SODA Mi SABOR ---
const MENU = {
  "1": {
    titulo: "Entradas",
    items: [
      "Yuca frita con salsa de ajo",
      "Empanadas de carne y queso",
      "Chifrijo mini",
      "Patacones con pico de gallo",
      "Ceviche de banano (twist de la casa)"
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
      "Filete de pollo al ajillo con ensalada",
      "Pescado empanizado con papas rústicas",
      "Olla de carne (jueves y domingos)",
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

// Estado simple en memoria (por número)
const sessions = new Map();

// Utilidades
const normalize = (s = "") =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

const banner = () =>
  "✨ *SODA Mi SABOR* ✨\n" +
  "¡Bienvenid@! Elige una opción:\n" +
  "1️⃣ Entradas\n" +
  "2️⃣ Desayunos\n" +
  "3️⃣ Almuerzos\n" +
  "4️⃣ Comidas Rápidas\n" +
  "5️⃣ Bebidas Frías\n" +
  "6️⃣ Bebidas Calientes\n\n" +
  "🔁 Escribe *MENU* para volver al inicio.\n" +
  "🛒 Escribe *CARRITO* para ver tu pedido.\n" +
  "✅ Escribe *CONFIRMAR* para finalizar.\n" +
  "📍 Escribe *UBICACION* u *HORARIO* para info útil.";

function listCategory(catKey) {
  const cat = MENU[catKey];
  if (!cat) return "Categoría no encontrada. Escribe *MENU* para ver opciones.";
  const lines = cat.items.map((txt, i) => `_${i + 1}._ ${txt}`);
  return `*${cat.titulo}*\n${lines.join("\n")}\n\n` +
         "👉 Responde con *AGREGAR " + catKey + " N* para añadir (ej: AGREGAR 4 2).";
}

function ensureSession(user) {
  if (!sessions.has(user)) {
    sessions.set(user, { cart: [] });
  }
  return sessions.get(user);
}

// Determina si es sandbox o producción (solo informativo aquí)
function envInfo(toNumber) {
  const sandboxFrom = (process.env.TWILIO_WHATSAPP_SANDBOX_FROM || "whatsapp:+14155238886");
  const isSandbox = (toNumber === sandboxFrom);
  return { isSandbox, sandboxFrom };
}

// Webhook principal
app.post("/whatsapp", webhookMiddleware, (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();

  const from = req.body.From || "";
  const to = req.body.To || "";
  const body = req.body.Body || "";

  const user = from.replace(/^whatsapp:/, "");
  const text = normalize(body);
  const session = ensureSession(user);

  // Comandos globales
  if (!text || ["hola", "buenas", "menu", "inicio", "start"].includes(text)) {
    twiml.message(banner());
    return res.type("text/xml").send(twiml.toString());
  }

  if (text === "ubicacion" || text === "ubicación") {
    twiml.message("📍 *Ubicación:*\nSODA Mi SABOR, Calle Principal, San José, Costa Rica.\nhttps://maps.app.goo.gl/");
    return res.type("text/xml").send(twiml.toString());
  }

  if (text === "horario") {
    twiml.message("⏰ *Horario:*\nL–V 7:00–21:00\nS 8:00–21:00\nD 8:00–16:00");
    return res.type("text/xml").send(twiml.toString());
  }

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
      session.cart = []; // vaciar después de confirmar
      twiml.message(
        "✅ *Pedido confirmado*\n" +
        resumen +
        "\n\nGracias por elegir *SODA Mi SABOR*. ¡A cocinar! 🍳"
      );
    }
    return res.type("text/xml").send(twiml.toString());
  }

  // Mostrar categorías con número
  if (/^[1-6]$/.test(text)) {
    twiml.message(listCategory(text));
    return res.type("text/xml").send(twiml.toString());
  }

  // AGREGAR <categoria> <item>
  if (text.startsWith("agregar ")) {
    const parts = text.split(/\s+/);
    // "agregar", cat, idx
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

  // Mostrar texto de ayuda adicional
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

  // Si escribe el nombre de una categoría
  const matchCat = Object.entries(MENU).find(
    ([, v]) => normalize(v.titulo) === text
  );
  if (matchCat) {
    twiml.message(listCategory(matchCat[0]));
    return res.type("text/xml").send(twiml.toString());
  }

  // Fallback
  twiml.message("No te entendí 🤔. Escribe *MENU* para ver opciones o *AYUDA*.");
  return res.type("text/xml").send(twiml.toString());
});

// Salud
app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const mode = shouldValidate ? "validando firma Twilio" : "SIN validación de firma";
  console.log(`✅ WhatsApp bot escuchando en :${PORT} (${mode})`);
});

