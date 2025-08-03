import axios from 'axios';

export default {
    name: 'joke',
    description: 'Get a random joke to brighten your day',
    usage: '!joke',
    category: 'fun',
    
    async execute(context) {
        const { reply, react } = context;
        
        await react('😂');
        
        try {
            // Try to get joke from API first
            const response = await axios.get('https://official-joke-api.appspot.com/random_joke', {
                timeout: 5000
            });
            
            const joke = response.data;
            const jokeText = `😂 *Random Joke*\n\n` +
                           `${joke.setup}\n\n` +
                           `*${joke.punchline}* 🤣`;
            
            await reply(jokeText);
            
        } catch (error) {
            // Fallback to local jokes if API fails
            const localJokes = [
                {
                    setup: "Why don't scientists trust atoms?",
                    punchline: "Because they make up everything!"
                },
                {
                    setup: "Why did the scarecrow win an award?",
                    punchline: "He was outstanding in his field!"
                },
                {
                    setup: "Why don't eggs tell jokes?",
                    punchline: "They'd crack each other up!"
                },
                {
                    setup: "What do you call a fake noodle?",
                    punchline: "An impasta!"
                },
                {
                    setup: "Why did the math book look so sad?",
                    punchline: "Because it was full of problems!"
                },
                {
                    setup: "What do you call a bear with no teeth?",
                    punchline: "A gummy bear!"
                },
                {
                    setup: "Why can't a bicycle stand up by itself?",
                    punchline: "It's two tired!"
                },
                {
                    setup: "What do you call a sleeping bull?",
                    punchline: "A bulldozer!"
                },
                {
                    setup: "Why don't skeletons fight each other?",
                    punchline: "They don't have the guts!"
                },
                {
                    setup: "What's orange and sounds like a parrot?",
                    punchline: "A carrot!"
                }
            ];
            
            const randomJoke = localJokes[Math.floor(Math.random() * localJokes.length)];
            
            const jokeText = `😂 *Random Joke*\n\n` +
                           `${randomJoke.setup}\n\n` +
                           `*${randomJoke.punchline}* 🤣`;
            
            await reply(jokeText);
        }
    }
};