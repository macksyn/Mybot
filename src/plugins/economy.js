import { config } from '../config/config.js';
import { 
    parseCommand, 
    getSenderId, 
    getMessageContent, 
    isAdmin, 
    isOwner,
    delay
} from '../utils/helpers.js';
import { logger } from '../utils/logger.js';
import mongoose from 'mongoose';

// 🔧 DYNAMIC MODEL ACCESS - This prevents the import error
const getModels = () => {
    // Only access models after mongoose connection is established
    if (mongoose.connection.readyState !== 1) {
        throw new Error('Database not connected');
    }
    
    // Return models from mongoose connection
    return {
        User: mongoose.models.User || mongoose.model('User'),
        Settings: mongoose.models.Settings || mongoose.model('Settings'),
        Log: mongoose.models.Log || mongoose.model('Log'),
        Clan: mongoose.models.Clan || mongoose.model('Clan')
    };
};

// Cooldown storage (in-memory for performance)
const cooldowns = {
    work: new Map(),
    rob: new Map(),
    daily: new Map(),
    gamble: new Map()
};

// Economy settings (cached from database)
let ecoSettings = {
    currency: '₦',
    startingBalance: 1000,
    startingBankBalance: 0,
    dailyMinAmount: 500,
    dailyMaxAmount: 1500,
    workCooldownMinutes: 60,
    workJobs: [
        { name: 'Uber Driver', min: 200, max: 800 },
        { name: 'Food Delivery', min: 150, max: 600 },
        { name: 'Freelancer', min: 300, max: 1200 },
        { name: 'Content Creator', min: 250, max: 900 },
        { name: 'Tech Support', min: 180, max: 700 },
        { name: 'Online Tutor', min: 400, max: 1000 }
    ],
    robCooldownMinutes: 120,
    robSuccessRate: 0.7,
    robMaxStealPercent: 0.3,
    robMinTargetBalance: 500,
    robMinRobberBalance: 200,
    robFailPenalty: 150,
    gamblingMinBet: 100,
    gamblingMaxBet: 10000,
};

// Load settings from database on startup
async function loadEconomySettings() {
    try {
        const models = getModels();
        const settings = await models.Settings.find({ category: 'economy' });
        settings.forEach(setting => {
            const keys = setting.key.split('.');
            if (keys[0] === 'economy' && keys[1]) {
                ecoSettings[keys[1]] = setting.value;
            }
        });
        logger.info('⚙️  Economy settings loaded from database');
    } catch (error) {
        logger.error('❌ Failed to load economy settings:', error);
    }
}

// Initialize or get user from database
async function initUser(userId) {
    try {
        const models = getModels();
        let user = await models.User.findOne({ userId });
        
        if (!user) {
            user = new models.User({
                userId,
                economy: {
                    balance: ecoSettings.startingBalance,
                    bank: ecoSettings.startingBankBalance,
                    totalEarned: 0,
                    totalSpent: 0,
                    workCount: 0,
                    robCount: 0,
                    lastDaily: null,
                    rank: 'Newbie',
                    inventory: [],
                    clan: null,
                    bounty: 0
                },
                attendance: {
                    lastAttendance: null,
                    totalAttendances: 0,
                    streak: 0,
                    longestStreak: 0,
                    birthdayData: null
                },
                stats: {
                    commandsUsed: 0,
                    messagesReceived: 0,
                    firstSeen: new Date(),
                    lastSeen: new Date(),
                    isBlocked: false,
                    warningCount: 0
                }
            });
            
            await user.save();
            logger.info(`👤 New user initialized: ${userId.split('@')[0]}`);
        }
        
        // Update last seen
        user.stats.lastSeen = new Date();
        await user.save();
        
        return user;
    } catch (error) {
        logger.error('❌ Failed to initialize user:', error);
        throw error;
    }
}

// Get user rank based on total wealth
const getUserRank = (totalWealth) => {
    if (totalWealth >= 1000000) return '👑 Millionaire';
    if (totalWealth >= 500000) return '💎 Diamond';
    if (totalWealth >= 100000) return '🏆 Gold';
    if (totalWealth >= 50000) return '🥈 Silver';
    if (totalWealth >= 10000) return '🥉 Bronze';
    if (totalWealth >= 5000) return '⭐ Rising';
    return '🌱 Newbie';
};

// Check cooldown
const checkCooldown = (userId, type, minutes) => {
    const lastUsed = cooldowns[type].get(userId);
    if (!lastUsed) return true;
    
    const timePassed = (Date.now() - lastUsed) / (1000 * 60);
    return timePassed >= minutes;
};

// Set cooldown
const setCooldown = (userId, type) => {
    cooldowns[type].set(userId, Date.now());
};

// Get remaining cooldown time
const getRemainingTime = (userId, type, minutes) => {
    const lastUsed = cooldowns[type].get(userId);
    if (!lastUsed) return 0;
    
    const timePassed = (Date.now() - lastUsed) / (1000 * 60);
    return Math.max(0, Math.ceil(minutes - timePassed));
};

// Format currency
const formatCurrency = (amount) => {
    return `${ecoSettings.currency}${amount.toLocaleString()}`;
};

// Get target user from message
const getTargetUser = (message, text) => {
    if (message.mentionedJid && message.mentionedJid.length > 0) {
        return message.mentionedJid[0];
    }
    
    if (message.quoted && message.quoted.participant) {
        return message.quoted.participant;
    }
    
    const numbers = text.replace(/[^0-9]/g, '');
    if (numbers.length >= 10) {
        return numbers + '@s.whatsapp.net';
    }
    
    return null;
};

// Log economy transaction
async function logTransaction(userId, type, amount, details = {}) {
    try {
        const models = getModels();
        await models.Log.create({
            level: 'info',
            message: `Economy transaction: ${type}`,
            meta: {
                userId,
                transactionType: type,
                amount,
                ...details
            },
            userId,
            command: type
        });
    } catch (error) {
        logger.error('Failed to log transaction:', error);
    }
}

// Plugin execution function
const execute = async (context) => {
    try {
        // Check if database is connected
        if (mongoose.connection.readyState !== 1) {
            return context.reply('❌ Database not connected. Please try again later.');
        }

        const { command, args, senderId, reply } = context;
        
        // Economy commands
        const economyCommands = [
            'balance', 'bal', 'wallet',
            'send', 'transfer', 'pay',
            'deposit', 'dep', 'withdraw', 'wd',
            'work', 'daily', 'rob',
            'gamble', 'bet', 'flip',
            'leaderboard', 'lb', 'top',
            'profile', 'stats',
            'shop', 'buy', 'inventory', 'inv',
            'clan', 'ecosettings'
        ];
        
        if (!economyCommands.includes(command)) return;

        // Load settings if not loaded and database is available
        if (!ecoSettings.currency || ecoSettings.currency === '₦') {
            await loadEconomySettings();
        }

        const user = await initUser(senderId);
        user.stats.commandsUsed += 1;
        await user.save();

        switch (command) {
            case 'balance':
            case 'bal':
            case 'wallet': {
                const totalWealth = user.economy.balance + user.economy.bank;
                const rank = getUserRank(totalWealth);
                
                await reply(`💰 *YOUR WALLET* 💰

👤 *User:* @${senderId.split('@')[0]}
🏅 *Rank:* ${rank}

💵 *Wallet:* ${formatCurrency(user.economy.balance)}
🏦 *Bank:* ${formatCurrency(user.economy.bank)}
💎 *Total Wealth:* ${formatCurrency(totalWealth)}

📊 *Statistics:*
💰 *Total Earned:* ${formatCurrency(user.economy.totalEarned)}
💸 *Total Spent:* ${formatCurrency(user.economy.totalSpent)}
⚡ *Work Count:* ${user.economy.workCount}

🕒 *Last Seen:* ${user.stats.lastSeen.toLocaleString()}`, {
                    mentions: [senderId]
                });
                break;
            }

            case 'work': {
                if (!checkCooldown(senderId, 'work', ecoSettings.workCooldownMinutes)) {
                    const remaining = getRemainingTime(senderId, 'work', ecoSettings.workCooldownMinutes);
                    return reply(`⏱️ *You're tired! Rest for ${remaining} minutes before working again.*`);
                }

                const job = ecoSettings.workJobs[Math.floor(Math.random() * ecoSettings.workJobs.length)];
                const earnings = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;

                user.economy.balance += earnings;
                user.economy.totalEarned += earnings;
                user.economy.workCount += 1;
                setCooldown(senderId, 'work');
                await user.save();
                
                await logTransaction(senderId, 'work', earnings, { job: job.name });

                await reply(`💼 *WORK COMPLETED* 💼

🔨 *Job:* ${job.name}
💰 *Earned:* ${formatCurrency(earnings)}
💵 *New Balance:* ${formatCurrency(user.economy.balance)}

⏱️ *Next work available in ${ecoSettings.workCooldownMinutes} minutes*`);
                break;
            }

            case 'daily': {
                const today = new Date().toDateString();
                
                if (user.economy.lastDaily === today) {
                    return reply('⏰ *You have already claimed your daily reward today!*\n\nCome back tomorrow for another reward.');
                }

                const dailyAmount = Math.floor(Math.random() * (ecoSettings.dailyMaxAmount - ecoSettings.dailyMinAmount + 1)) + ecoSettings.dailyMinAmount;
                
                user.economy.balance += dailyAmount;
                user.economy.totalEarned += dailyAmount;
                user.economy.lastDaily = today;
                
                // Update attendance
                user.attendance.lastAttendance = today;
                user.attendance.totalAttendances += 1;
                
                // Update streak
                const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();
                if (user.attendance.lastAttendance === yesterday) {
                    user.attendance.streak += 1;
                } else {
                    user.attendance.streak = 1;
                }
                
                if (user.attendance.streak > user.attendance.longestStreak) {
                    user.attendance.longestStreak = user.attendance.streak;
                }
                
                await user.save();
                
                await logTransaction(senderId, 'daily', dailyAmount);

                await reply(`🎁 *DAILY REWARD CLAIMED* 🎁

💰 *Received:* ${formatCurrency(dailyAmount)}
💵 *New Balance:* ${formatCurrency(user.economy.balance)}
🔥 *Current Streak:* ${user.attendance.streak} days

✨ *Come back tomorrow for another reward!*`);
                break;
            }

            case 'leaderboard':
            case 'lb':
            case 'top': {
                const models = getModels();
                const users = await models.User.find({})
                    .sort({ 
                        $expr: { 
                            $add: ['$economy.balance', '$economy.bank'] 
                        } 
                    })
                    .limit(10)
                    .lean();

                if (users.length === 0) {
                    return reply('📊 *No users found in the economy system*');
                }

                // Sort by total wealth (balance + bank)
                users.sort((a, b) => {
                    const wealthA = a.economy.balance + a.economy.bank;
                    const wealthB = b.economy.balance + b.economy.bank;
                    return wealthB - wealthA;
                });

                let leaderboard = '🏆 *ECONOMY LEADERBOARD* 🏆\n\n';
                
                users.forEach((userEntry, index) => {
                    const wealth = userEntry.economy.balance + userEntry.economy.bank;
                    const rank = index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                    leaderboard += `${rank} @${userEntry.userId.split('@')[0]}\n`;
                    leaderboard += `   💎 ${formatCurrency(wealth)}\n\n`;
                });

                await reply(leaderboard, {
                    mentions: users.map(u => u.userId)
                });
                break;
            }

            case 'ecosettings': {
                if (!isOwner(senderId) && !isAdmin(senderId)) {
                    return reply('🚫 *Only admins can view economy settings*');
                }

                const models = getModels();
                const dbStats = await models.User.countDocuments();
                const totalWealth = await models.User.aggregate([
                    {
                        $group: {
                            _id: null,
                            totalBalance: { $sum: '$economy.balance' },
                            totalBank: { $sum: '$economy.bank' },
                            totalEarned: { $sum: '$economy.totalEarned' }
                        }
                    }
                ]);

                const stats = totalWealth[0] || { totalBalance: 0, totalBank: 0, totalEarned: 0 };

                await reply(`🔧 *ECONOMY SYSTEM STATS* 🔧

👥 *Total Users:* ${dbStats}
💰 *Total in Circulation:*
   • Wallets: ${formatCurrency(stats.totalBalance)}
   • Banks: ${formatCurrency(stats.totalBank)}
   • Total: ${formatCurrency(stats.totalBalance + stats.totalBank)}

📊 *Economy Settings:*
💵 *Currency:* ${ecoSettings.currency}
🎁 *Daily Rewards:* ${formatCurrency(ecoSettings.dailyMinAmount)} - ${formatCurrency(ecoSettings.dailyMaxAmount)}
💼 *Work Cooldown:* ${ecoSettings.workCooldownMinutes} minutes
🦹 *Rob Success Rate:* ${(ecoSettings.robSuccessRate * 100)}%
🎰 *Gambling Limits:* ${formatCurrency(ecoSettings.gamblingMinBet)} - ${formatCurrency(ecoSettings.gamblingMaxBet)}

🗄️ *Database:* MongoDB Connected ✅`);
                break;
            }

            default:
                // For other economy commands, show coming soon message
                await reply(`🚧 *${command.toUpperCase()} - COMING SOON!* 🚧

💡 *Available Commands:*
• \`${config.PREFIX}balance\` - Check your wallet
• \`${config.PREFIX}work\` - Earn money by working
• \`${config.PREFIX}daily\` - Claim daily reward
• \`${config.PREFIX}leaderboard\` - View top users

🔜 *More features coming soon!*`);
                break;
        }

    } catch (error) {
        logger.error('Economy plugin error:', error);
        
        // Better error messages for users
        if (error.message.includes('Database not connected')) {
            await context.reply('❌ *Database connection lost. Please try again in a moment.*');
        } else {
            await context.reply('❌ *An error occurred while processing the economy command*');
        }
    }
};

// Plugin metadata and export
const economyPlugin = {
    name: 'economy',
    description: 'Economy system with balance, work, daily rewards, and more',
    usage: [
        'balance - Check your wallet balance',
        'work - Work to earn money',
        'daily - Claim daily reward',
        'leaderboard - View top users'
    ],
    category: 'economy',
    execute
};

export default economyPlugin;
