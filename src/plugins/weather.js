import axios from 'axios';
import { config } from '../config/config.js';

export default {
    name: 'weather',
    description: 'Get current weather information for a city',
    usage: '!weather [city name]',
    category: 'utility',
    
    async execute(context) {
        const { reply, args, react } = context;
        
        if (!config.OPENWEATHER_API_KEY) {
            await reply('❌ Weather service is not configured. Please contact the bot administrator.');
            return;
        }
        
        if (args.length === 0) {
            await reply(`❓ Please provide a city name.\n\nExample: *${config.PREFIX}weather London*`);
            return;
        }
        
        const city = args.join(' ');
        await react('🌤️');
        
        try {
            const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
                params: {
                    q: city,
                    appid: config.OPENWEATHER_API_KEY,
                    units: 'metric'
                },
                timeout: 10000
            });
            
            const data = response.data;
            
            // Format weather data
            const weatherText = `🌤️ *Weather Report*\n\n` +
                              `📍 *Location:* ${data.name}, ${data.sys.country}\n` +
                              `🌡️ *Temperature:* ${Math.round(data.main.temp)}°C\n` +
                              `🌡️ *Feels Like:* ${Math.round(data.main.feels_like)}°C\n` +
                              `📊 *Condition:* ${data.weather[0].description}\n` +
                              `💧 *Humidity:* ${data.main.humidity}%\n` +
                              `🌪️ *Wind Speed:* ${data.wind.speed} m/s\n` +
                              `👁️ *Visibility:* ${(data.visibility / 1000).toFixed(1)} km\n` +
                              `🔆 *UV Index:* ${data.uvi || 'N/A'}\n\n` +
                              `📅 *Updated:* ${new Date().toLocaleString()}`;
            
            await reply(weatherText);
            
        } catch (error) {
            if (error.response?.status === 404) {
                await reply(`❌ City "${city}" not found. Please check the spelling and try again.`);
            } else if (error.response?.status === 401) {
                await reply('❌ Weather service authentication failed. Please contact the administrator.');
            } else {
                await reply('❌ Unable to fetch weather data. Please try again later.');
            }
        }
    }
};