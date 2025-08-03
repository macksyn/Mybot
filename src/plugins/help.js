import { config } from '../config/config.js';

export default {
    name: 'help',
    description: 'Show available commands and bot information',
    usage: '!help [command]',
    category: 'utility',
    
    async execute(context) {
        const { reply, args } = context;
        
        if (args.length > 0) {
            // Show help for specific command
            const commandName = args[0].toLowerCase();
            await this.showCommandHelp(reply, commandName);
        } else {
            // Show general help
            await this.showGeneralHelp(reply);
        }
    },
    
    async showGeneralHelp(reply) {
        const helpText = `🤖 *${config.BOT_NAME} - Help Menu*\n\n` +
                        `📋 *Available Commands:*\n\n` +
                        `*🔧 Utility*\n` +
                        `• ${config.PREFIX}ping - Check bot status\n` +
                        `• ${config.PREFIX}info - Bot information\n` +
                        `• ${config.PREFIX}help [command] - Show help\n\n` +
                        
                        (config.ENABLE_WEATHER ? 
                        `*🌤️ Weather*\n` +
                        `• ${config.PREFIX}weather [city] - Get weather info\n\n` : '') +
                        
                        (config.ENABLE_JOKES ? 
                        `*😂 Fun*\n` +
                        `• ${config.PREFIX}joke - Get a random joke\n\n` : '') +
                        
                        (config.ENABLE_QUOTES ? 
                        `*💭 Quotes*\n` +
                        `• ${config.PREFIX}quote - Get an inspirational quote\n\n` : '') +
                        
                        (config.ENABLE_CALCULATOR ? 
                        `*🧮 Calculator*\n` +
                        `• ${config.PREFIX}calc [expression] - Calculate math\n\n` : '') +
                        
                        (config.ENABLE_ADMIN_COMMANDS && config.ADMIN_NUMBERS.length > 0 ? 
                        `*⚙️ Admin*\n` +
                        `• ${config.PREFIX}admin - Admin commands\n\n` : '') +
                        
                        `📝 *Usage:*\n` +
                        `All commands start with *${config.PREFIX}*\n` +
                        `Example: *${config.PREFIX}ping*\n\n` +
                        
                        `💡 *Tip:* Use *${config.PREFIX}help [command]* for detailed help on a specific command.\n\n` +
                        
                        `🔗 Need more help? Contact the bot owner.`;
        
        await reply(helpText);
    },
    
    async showCommandHelp(reply, commandName) {
        const commands = {
            ping: {
                description: 'Check bot response time and status',
                usage: `${config.PREFIX}ping`,
                example: `${config.PREFIX}ping`
            },
            info: {
                description: 'Show bot information and statistics',
                usage: `${config.PREFIX}info`,
                example: `${config.PREFIX}info`
            },
            weather: {
                description: 'Get current weather information for a city',
                usage: `${config.PREFIX}weather [city name]`,
                example: `${config.PREFIX}weather London`
            },
            joke: {
                description: 'Get a random joke to brighten your day',
                usage: `${config.PREFIX}joke`,
                example: `${config.PREFIX}joke`
            },
            quote: {
                description: 'Get an inspirational quote',
                usage: `${config.PREFIX}quote`,
                example: `${config.PREFIX}quote`
            },
            calc: {
                description: 'Calculate mathematical expressions',
                usage: `${config.PREFIX}calc [expression]`,
                example: `${config.PREFIX}calc 2 + 2 * 3`
            }
        };
        
        const command = commands[commandName];
        
        if (!command) {
            await reply(`❓ Command *${commandName}* not found.\n\nUse *${config.PREFIX}help* to see all available commands.`);
            return;
        }
        
        const helpText = `📖 *Help: ${commandName}*\n\n` +
                        `📝 *Description:*\n${command.description}\n\n` +
                        `💡 *Usage:*\n${command.usage}\n\n` +
                        `📋 *Example:*\n${command.example}`;
        
        await reply(helpText);
    }
};