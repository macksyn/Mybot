const { default: makeWASocket, DisconnectReason, useSingleFileAuthState } = require("@whiskeysockets/baileys");
const { loadCommands } = require("./lib/commandLoader");
const { connect: dbConnect } = require("./database");
const config = require("./config");

function startBot(auth) {
  const sock = makeWASocket({ auth });
  sock.commands = new Map();
  sock.aliases = new Map();
  loadCommands(sock);

  sock.ev.on("connection.update", (u) => {
    const { connection, lastDisconnect } = u;
    if (connection === "open") console.log("✅ Bot connected");
    else if (connection === "close") {
      if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        startBot(auth);
      } else console.log("🛑 Connection closed by user");
    }
  });

  sock.ev.on("messages.upsert", async (msgUp) => {
    const msg = msgUp.messages[0];
    if (!msg.message || msg.key.fromMe || !msg.key.remoteJid.endsWith(".net")) return;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
    if (!text.startsWith(config.prefix)) return;

    const [cmdName, ...args] = text.slice(config.prefix.length).trim().split(/\s+/);
    const command = sock.commands.get(cmdName) || sock.commands.get(sock.aliases.get(cmdName));
    if (!command) return;

    try {
      await command.execute({ sock, msg, args, reply: async (resp) => {
        await sock.sendMessage(msg.key.remoteJid, { text: resp }, { quoted: msg });
      }, db: sock });
    } catch (err) {
      console.error("Command error", err);
    }
  });

  return sock;
}

async function init() {
  await dbConnect();
  const { state, saveState } = useSingleFileAuthState("./auth_info.json");
  const sock = startBot({ state });
  sock.ev.on("creds.update", saveState);
}

module.exports = { init };