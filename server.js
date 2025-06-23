const express = require("express");
const qrcode = require("qrcode");
const { init } = require("./bot");

const app = express();
let sock;

app.get("/", (req, res) => {
  if (sock && sock.authState?.creds?.noiseKey) {
    res.send("Bot already connected 👍");
  } else {
    res.send(`<img src="/qr.png"/><p>Scan to connect</p>`);
  }
});

app.get("/qr.png", async (req, res) => {
  if (!sock) {
    sock = await init();
  }
  sock.ev.once("connection.update", async (u) => {
    if (u.qr) {
      const img = await qrcode.toDataURL(u.qr);
      const base64 = img.split(",")[1];
      res.setHeader("Content-Type", "image/png");
      res.send(Buffer.from(base64, "base64"));
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌍 Server running on port ${PORT}`));