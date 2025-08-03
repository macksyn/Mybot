# 🤖 WhatsApp Bot

A modern, feature-rich WhatsApp bot built with Node.js and Baileys. Clean architecture, modular plugins, and ready for cloud deployment.

## ✨ Features

- 🔥 **Modern Architecture** - Clean, modular, and maintainable code
- 🚀 **Easy Deployment** - Ready for Koyeb, Heroku, and other cloud platforms
- 📱 **Pairing Code Auth** - No QR scanning needed - perfect for cloud deployment
- 🔌 **Plugin System** - Easily extensible with custom plugins
- 📊 **Admin Panel** - Built-in admin commands for bot management
- 🌡️ **Weather Updates** - Real-time weather information
- 😂 **Entertainment** - Jokes, quotes, and fun commands
- 🧮 **Calculator** - Advanced mathematical calculations
- 📝 **Rate Limiting** - Built-in spam protection
- 🔒 **Security** - Input validation and secure command execution
- 📱 **Multi-platform** - Works on all platforms with Docker support

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- WhatsApp account

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/whatsapp-bot.git
   cd whatsapp-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start the bot**
   ```bash
   npm start
   ```

5. **Scan QR Code**
   - Open WhatsApp on your phone
   - Go to Settings > Linked Devices
   - Scan the QR code displayed in terminal

## 🌩️ Koyeb Deployment

### Method 1: GitHub Integration (Recommended)

1. **Fork this repository**

2. **Create Koyeb account** at [koyeb.com](https://koyeb.com)

3. **Deploy from GitHub**:
   - Click "Create Web Service"
   - Connect your GitHub account
   - Select your forked repository
   - Configure environment variables:
     ```
     BOT_NAME=My WhatsApp Bot
     PREFIX=!
     OWNER_NUMBER=1234567890
     USE_PAIRING_CODE=true
     OPENWEATHER_API_KEY=your_api_key
     NODE_ENV=production
     PORT=8000
     ```

4. **Deploy & Authenticate**
   - Click "Deploy"
   - Wait for deployment to complete
   - Check logs for pairing code
   - Enter the pairing code in WhatsApp > Linked Devices
   
   **No QR scanning needed!** 📱

### Method 2: Docker Deployment

1. **Build and push Docker image**:
   ```bash
   docker build -t yourusername/whatsapp-bot .
   docker push yourusername/whatsapp-bot
   ```

2. **Deploy on Koyeb**:
   - Create service from Docker image
   - Use image: `yourusername/whatsapp-bot`
   - Set environment variables
   - Deploy

## 📋 Available Commands

### 🔧 Utility Commands
- `!ping` - Check bot status and response time
- `!info` - Show bot information and statistics  
- `!help [command]` - Display help information

### 🌤️ Weather Commands
- `!weather [city]` - Get current weather for a city

### 😂 Fun Commands
- `!joke` - Get a random joke
- `!quote` - Get an inspirational quote

### 🧮 Calculator
- `!calc [expression]` - Calculate mathematical expressions
- Supports: `+`, `-`, `*`, `/`, `%`, `^`, `sqrt()`, `sin()`, `cos()`, etc.

### ⚙️ Admin Commands (Admin/Owner only)
- `!admin status` - Show bot status
- `!admin stats` - Show detailed statistics
- `!admin restart` - Restart the bot (owner only)
- `!admin broadcast [message]` - Send broadcast message (owner only)
- `!pair [phone_number]` - Generate new pairing code (owner only)

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `BOT_NAME` | Name of your bot | WhatsApp Bot | ✅ |
| `PREFIX` | Command prefix | ! | ✅ |
| `OWNER_NUMBER` | Owner's phone number | - | ⚠️ |
| `USE_PAIRING_CODE` | Use pairing code instead of QR | false | ❌ |
| `SEND_STARTUP_MESSAGE` | Send startup notification | true | ❌ |
| `AUTO_RESTART_ON_LOGOUT` | Auto-restart on logout | false | ❌ |
| `TIMEZONE` | Bot timezone | UTC | ❌ |
| `OPENWEATHER_API_KEY` | OpenWeather API key | - | ❌ |
| `WEBHOOK_URL` | Webhook for notifications | - | ❌ |
| `NODE_ENV` | Environment | development | ❌ |
| `PORT` | Server port | 3000 | ❌ |
| `MAX_COMMANDS_PER_MINUTE` | Rate limit | 10 | ❌ |
| `ADMIN_NUMBERS` | Admin phone numbers (comma-separated) | - | ❌ |

⚠️ **OWNER_NUMBER is required when USE_PAIRING_CODE=true**

### Feature Toggles

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_WEATHER` | Enable weather commands | true |
| `ENABLE_JOKES` | Enable joke commands | true |
| `ENABLE_QUOTES` | Enable quote commands | true |
| `ENABLE_CALCULATOR` | Enable calculator | true |
| `ENABLE_ADMIN_COMMANDS` | Enable admin panel | true |

## 🔌 Plugin Development

Create custom plugins easily:

```javascript
// src/plugins/myPlugin.js
export default {
    name: 'mycommand',
    description: 'My custom command',
    usage: '!mycommand [args]',
    category: 'custom',
    
    async execute(context) {
        const { reply, args, react } = context;
        
        await react('✨');
        await reply('Hello from my custom plugin!');
    }
};
```

Register in `src/handlers/messageHandler.js`:
```javascript
import myPlugin from '../plugins/myPlugin.js';
// ...
this.plugins.set('mycommand', myPlugin);
```

## 🐳 Docker Support

### Build Image
```bash
docker build -t whatsapp-bot .
```

### Run Container
```bash
docker run -d \
  --name whatsapp-bot \
  -e BOT_NAME="My Bot" \
  -e PREFIX="!" \
  -e OWNER_NUMBER="1234567890" \
  -v $(pwd)/sessions:/app/sessions \
  whatsapp-bot
```

### Docker Compose
```yaml
version: '3.8'
services:
  whatsapp-bot:
    build: .
    environment:
      - BOT_NAME=My WhatsApp Bot
      - PREFIX=!
      - OWNER_NUMBER=1234567890
      - NODE_ENV=production
    volumes:
      - ./sessions:/app/sessions
    restart: unless-stopped
```

## 🔒 Security Features

- **Input Validation** - All user inputs are validated and sanitized
- **Rate Limiting** - Prevents spam and abuse
- **Admin Controls** - Role-based access control
- **Safe Math Evaluation** - Calculator uses safe expression evaluation
- **Error Handling** - Comprehensive error handling and logging

## 📊 Monitoring & Logging

- **Winston Logger** - Structured logging with multiple levels
- **Health Checks** - Built-in health check endpoint
- **Performance Metrics** - Memory usage and uptime tracking
- **Error Tracking** - Detailed error logging and reporting

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This bot is for educational purposes. Make sure to comply with WhatsApp's Terms of Service and local laws.

## 📞 Support

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/yourusername/whatsapp-bot/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/yourusername/whatsapp-bot/discussions)
- 📧 **Email**: your.email@example.com

## 🌟 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=yourusername/whatsapp-bot&type=Date)](https://star-history.com/#yourusername/whatsapp-bot&Date)

---

Made with ❤️ by [Your Name](https://github.com/yourusername)
