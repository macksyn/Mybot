const fs = require("fs");
function loadCommands(bot) {
  const plugins = fs.readdirSync(__dirname + "/../plugins")
    .filter(f => f.endsWith(".js"));
  for (const file of plugins) {
    const cmd = require(`../plugins/${file}`);
    if (cmd.name && typeof cmd.execute === "function") {
      bot.commands.set(cmd.name, cmd);
      if (cmd.aliases) cmd.aliases.forEach(a => bot.aliases.set(a, cmd.name));
    }
  }
}
module.exports = { loadCommands };
