module.exports = {
  name: "ping",
  description: "Health check",
  async execute({ reply }) {
    await reply("pong!");
  }
};
