// ----------------------
// 📄 server.js
// ----------------------

const express = require("express");
const qrcode = require("qrcode");
const { init } = require("./bot");
const app = express();

let sock;

app.get("/", (req, res) => {
  res.send(`<h1>Lussh MD is running!</h1><p>Visit <a href='/qr.png'>/qr.png</a> to scan the QR code.</p>`);
});

app.get("/qr.png", async (req, res) => {
  if (!sock) sock = await init();

  sock.ev.once("connection.update", async (u) => {
    if (u.qr) {
      const img = await qrcode.toDataURL(u.qr);
      const base64 = img.split(",")[1];
      res.setHeader("Content-Type", "image/png");
      res.send(Buffer.from(base64, "base64"));
    } else {
      res.status(204).send("No QR code available");
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌍 Server running on port ${PORT}`));
