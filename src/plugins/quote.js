import axios from 'axios';

export default {
    name: 'quote',
    description: 'Get an inspirational quote',
    usage: '!quote',
    category: 'inspiration',
    
    async execute(context) {
        const { reply, react } = context;
        
        await react('💭');
        
        try {
            // Try to get quote from API first
            const response = await axios.get('https://api.quotable.io/random', {
                timeout: 5000
            });
            
            const quote = response.data;
            const quoteText = `💭 *Inspirational Quote*\n\n` +
                            `"${quote.content}"\n\n` +
                            `— *${quote.author}*`;
            
            await reply(quoteText);
            
        } catch (error) {
            // Fallback to local quotes if API fails
            const localQuotes = [
                {
                    content: "The only way to do great work is to love what you do.",
                    author: "Steve Jobs"
                },
                {
                    content: "Life is what happens to you while you're busy making other plans.",
                    author: "John Lennon"
                },
                {
                    content: "The future belongs to those who believe in the beauty of their dreams.",
                    author: "Eleanor Roosevelt"
                },
                {
                    content: "It is during our darkest moments that we must focus to see the light.",
                    author: "Aristotle"
                },
                {
                    content: "The only impossible journey is the one you never begin.",
                    author: "Tony Robbins"
                },
                {
                    content: "Success is not final, failure is not fatal: it is the courage to continue that counts.",
                    author: "Winston Churchill"
                },
                {
                    content: "The way to get started is to quit talking and begin doing.",
                    author: "Walt Disney"
                },
                {
                    content: "Don't let yesterday take up too much of today.",
                    author: "Will Rogers"
                },
                {
                    content: "You learn more from failure than from success. Don't let it stop you. Failure builds character.",
                    author: "Unknown"
                },
                {
                    content: "If you are working on something that you really care about, you don't have to be pushed. The vision pulls you.",
                    author: "Steve Jobs"
                },
                {
                    content: "Believe you can and you're halfway there.",
                    author: "Theodore Roosevelt"
                },
                {
                    content: "The only person you are destined to become is the person you decide to be.",
                    author: "Ralph Waldo Emerson"
                }
            ];
            
            const randomQuote = localQuotes[Math.floor(Math.random() * localQuotes.length)];
            
            const quoteText = `💭 *Inspirational Quote*\n\n` +
                            `"${randomQuote.content}"\n\n` +
                            `— *${randomQuote.author}*`;
            
            await reply(quoteText);
        }
    }
};