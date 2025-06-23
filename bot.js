const { default: makeWASocket, useSingleFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");
const P = require("pino");

require("dotenv").config();
const MONGODB_URI = process.env.MONGODB_URI;
const OWNER_NUMBER = process.env.OWNER_NUMBER;
const PREFIX = process.env.BOT_PREFIX || "!";

// Auth
const authFilePath = "./session.auth.json";
const { state, saveState } = useSingleFileAuthState(authFilePath);

// MongoDB
let db;
MongoClient.connect(MONGODB_URI)
  .then(client => {
    db = client.db("lusshbot");
    console.log("📦 MongoDB connected");
  })
  .catch(err => console.error("❌ MongoDB connection error:", err));

async function init() {
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    printQRInTerminal: false,
    auth: state,
    logger: P({ level: "silent" }),
    browser: ["Lussh MD", "Safari", "1.0"]
  });

  sock.ev.on("creds.update", saveState);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) console.log("📷 QR code generated");
    if (connection === "close") {
      const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("❌ Disconnected. Reconnecting:", shouldReconnect);
      if (shouldReconnect) init();
    } else if (connection === "open") {
      console.log("✅ Bot connected as", sock.user?.id);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" || !messages[0]?.message) return;
    const msg = messages[0];
    const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
    const from = msg.key.remoteJid;

    if (body.startsWith(PREFIX)) {
      const command = body.slice(PREFIX.length).trim().toLowerCase();
      if (command === "ping") {
        await sock.sendMessage(from, { text: "🏓 Pong!" }, { quoted: msg });
      }
    }
  });

  return sock;
}

module.exports = { init };
