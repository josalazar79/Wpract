import express from "express";
import crypto from "crypto";
import twilio from "twilio";

const MessagingResponse = twilio.twiml.MessagingResponse;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", (_req, res) => res.status(200).send("OK MsGames"));

app.post("/whatsapp", (req, res) => {
  // si validas firma, usa twilio.validateRequest(...)
  const twiml = new MessagingResponse();
  twiml.message("Hola 👋 tu webhook está vivo.");
  res.type("text/xml").send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[BOOT] Puerto ${PORT} listo`));
