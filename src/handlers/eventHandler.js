import { logger } from '../utils/logger.js';
import { config } from '../config/config.js';

export class EventHandler {
    constructor(sock) {
        this.sock = sock;
    }
    
    async handleGroupUpdate(update) {
        try {
            const { id, participants, action } = update;
            
            if (!config.ENABLE_GROUP_EVENTS) return;
            
            // Welcome/goodbye messages
            for (const participant of participants) {
                if (action === 'add') {
                    await this.sendWelcomeMessage(id, participant);
                } else if (action === 'remove') {
                    await this.sendGoodbyeMessage(id, participant);
                }
            }
        } catch (error) {
            logger.error('Error handling group update:', error);
        }
    }
    
    async sendWelcomeMessage(groupId, participant) {
        try {
            const welcomeText = `👋 Welcome to the group!\n\n` +
                              `🤖 I'm ${config.BOT_NAME}, your friendly bot assistant.\n` +
                              `📝 Type *${config.PREFIX}help* to see what I can do!\n\n` +
                              `Hope you enjoy your stay! 🎉`;
            
            await this.sock.sendMessage(groupId, {
                text: welcomeText,
                mentions: [participant]
            });
        } catch (error) {
            logger.error('Error sending welcome message:', error);
        }
    }
    
    async sendGoodbyeMessage(groupId, participant) {
        try {
            const goodbyeText = `👋 Goodbye! Thanks for being part of our group.\n` +
                               `We'll miss you! 💙`;
            
            await this.sock.sendMessage(groupId, {
                text: goodbyeText,
                mentions: [participant]
            });
        } catch (error) {
            logger.error('Error sending goodbye message:', error);
        }
    }
    
    async handleReaction(reaction) {
        try {
            const { key, reaction: emoji } = reaction;
            
            // Log reactions for analytics (optional)
            logger.debug(`Reaction ${emoji} added to message ${key.id}`);
            
            // You can add custom reaction handling here
            // For example, saving reactions to database, triggering actions, etc.
            
        } catch (error) {
            logger.error('Error handling reaction:', error);
        }
    }
}