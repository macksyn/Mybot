import { models } from '../database/mongodb.js';
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

// Main economy plugin
const economy = async (sock, message) => {
    try {
        const messageContent = getMessageContent(message.message);
        if (!messageContent) return;

        const parsedCommand = parseCommand(messageContent);
        if (!parsedCommand) return;

        const { command, args } = parsedCommand;
        const senderId = getSenderId(message);
        const chatId = message.key.remoteJid;
        
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

        // Load settings if not loaded
        if (!ecoSettings.currency) {
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
                
                await sock.sendMessage(chatId, {
                    text: `💰 *YOUR WALLET* 💰

👤 *User:* @${senderId.split('@')[0]}
🏅 *Rank:* ${rank}

💵 *Wallet:* ${formatCurrency(user.economy.balance)}
🏦 *Bank:* ${formatCurrency(user.economy.bank)}
💎 *Total Wealth:* ${formatCurrency(totalWealth)}

📊 *Statistics:*
💰 *Total Earned:* ${formatCurrency(user.economy.totalEarned)}
💸 *Total Spent:* ${formatCurrency(user.economy.totalSpent)}
⚡ *Work Count:* ${user.economy.workCount}

🕒 *Last Seen:* ${user.stats.lastSeen.toLocaleString()}`,
                    mentions: [senderId]
                });
                break;
            }

            case 'send':
            case 'transfer':
            case 'pay': {
                const target = getTargetUser(message, args.join(' '));
                const amount = parseInt(args.find(arg => !isNaN(parseInt(arg))));

                if (!target) {
                    return sock.sendMessage(chatId, {
                        text: `⚠️ *Usage Examples:*
• Reply to someone: *.send 1000*
• Mention someone: *.send @user 1000*
• Use number: *.send 1234567890 1000*`
                    });
                }

                if (!amount || amount <= 0) {
                    return sock.sendMessage(chatId, {
                        text: '⚠️ *Please provide a valid amount*'
                    });
                }

                if (target === senderId) {
                    return sock.sendMessage(chatId, {
                        text: '🤔 *You cannot send money to yourself!*'
                    });
                }

                if (user.economy.balance < amount) {
                    return sock.sendMessage(chatId, {
                        text: `🚫 *Insufficient Balance*

💵 *Your Balance:* ${formatCurrency(user.economy.balance)}
💸 *Required:* ${formatCurrency(amount)}`
                    });
                }

                const targetUser = await initUser(target);
                
                // Transfer money
                user.economy.balance -= amount;
                targetUser.economy.balance += amount;
                user.economy.totalSpent += amount;
                targetUser.economy.totalEarned += amount;
                
                await user.save();
                await targetUser.save();
                
                // Log transaction
                await logTransaction(senderId, 'send', amount, { recipient: target });

                await sock.sendMessage(chatId, {
                    text: `✅ *TRANSFER SUCCESSFUL* ✅

💸 *From:* @${senderId.split('@')[0]}
💰 *To:* @${target.split('@')[0]}
💵 *Amount:* ${formatCurrency(amount)}

📊 *New Balances:*
• Sender: ${formatCurrency(user.economy.balance)}
• Receiver: ${formatCurrency(targetUser.economy.balance)}`,
                    mentions: [senderId, target]
                });
                break;
            }

            case 'deposit':
            case 'dep': {
                const amount = parseInt(args[0]);
                
                if (!amount || amount <= 0) {
                    return sock.sendMessage(chatId, {
                        text: '⚠️ *Please provide a valid amount to deposit*'
                    });
                }

                if (user.economy.balance < amount) {
                    return sock.sendMessage(chatId, {
                        text: `🚫 *Insufficient wallet balance*

💵 *Your Balance:* ${formatCurrency(user.economy.balance)}`
                    });
                }

                user.economy.balance -= amount;
                user.economy.bank += amount;
                await user.save();
                
                await logTransaction(senderId, 'deposit', amount);

                await sock.sendMessage(chatId, {
                    text: `🏦 *DEPOSIT SUCCESSFUL* 🏦

💰 *Deposited:* ${formatCurrency(amount)}

📊 *New Balances:*
💵 *Wallet:* ${formatCurrency(user.economy.balance)}
🏦 *Bank:* ${formatCurrency(user.economy.bank)}`
                });
                break;
            }

            case 'withdraw':
            case 'wd': {
                const amount = parseInt(args[0]);
                
                if (!amount || amount <= 0) {
                    return sock.sendMessage(chatId, {
                        text: '⚠️ *Please provide a valid amount to withdraw*'
                    });
                }

                if (user.economy.bank < amount) {
                    return sock.sendMessage(chatId, {
                        text: `🚫 *Insufficient bank balance*

🏦 *Your Bank:* ${formatCurrency(user.economy.bank)}`
                    });
                }

                user.economy.bank -= amount;
                user.economy.balance += amount;
                await user.save();
                
                await logTransaction(senderId, 'withdraw', amount);

                await sock.sendMessage(chatId, {
                    text: `💵 *WITHDRAWAL SUCCESSFUL* 💵

💰 *Withdrawn:* ${formatCurrency(amount)}

📊 *New Balances:*
💵 *Wallet:* ${formatCurrency(user.economy.balance)}
🏦 *Bank:* ${formatCurrency(user.economy.bank)}`
                });
                break;
            }

            case 'work': {
                if (!checkCooldown(senderId, 'work', ecoSettings.workCooldownMinutes)) {
                    const remaining = getRemainingTime(senderId, 'work', ecoSettings.workCooldownMinutes);
                    return sock.sendMessage(chatId, {
                        text: `⏱️ *You're tired! Rest for ${remaining} minutes before working again.*`
                    });
                }

                const job = ecoSettings.workJobs[Math.floor(Math.random() * ecoSettings.workJobs.length)];
                const earnings = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;

                user.economy.balance += earnings;
                user.economy.totalEarned += earnings;
                user.economy.workCount += 1;
                setCooldown(senderId, 'work');
                await user.save();
                
                await logTransaction(senderId, 'work', earnings, { job: job.name });

                await sock.sendMessage(chatId, {
                    text: `💼 *WORK COMPLETED* 💼

🔨 *Job:* ${job.name}
💰 *Earned:* ${formatCurrency(earnings)}
💵 *New Balance:* ${formatCurrency(user.economy.balance)}

⏱️ *Next work available in ${ecoSettings.workCooldownMinutes} minutes*`
                });
                break;
            }

            case 'daily': {
                const today = new Date().toDateString();
                
                if (user.economy.lastDaily === today) {
                    return sock.sendMessage(chatId, {
                        text: '⏰ *You have already claimed your daily reward today!*\n\nCome back tomorrow for another reward.'
                    });
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

                await sock.sendMessage(chatId, {
                    text: `🎁 *DAILY REWARD CLAIMED* 🎁

💰 *Received:* ${formatCurrency(dailyAmount)}
💵 *New Balance:* ${formatCurrency(user.economy.balance)}
🔥 *Current Streak:* ${user.attendance.streak} days

✨ *Come back tomorrow for another reward!*`
                });
                break;
            }

            case 'rob': {
                const target = getTargetUser(message, args.join(' '));
                
                if (!target) {
                    return sock.sendMessage(chatId, {
                        text: `⚠️ *Usage Examples:*
• Reply to someone: *.rob*
• Mention someone: *.rob @user*
• Use number: *.rob 1234567890*`
                    });
                }

                if (target === senderId) {
                    return sock.sendMessage(chatId, {
                        text: '🤔 *You cannot rob yourself!*'
                    });
                }

                if (!checkCooldown(senderId, 'rob', ecoSettings.robCooldownMinutes)) {
                    const remaining = getRemainingTime(senderId, 'rob', ecoSettings.robCooldownMinutes);
                    return sock.sendMessage(chatId, {
                        text: `⏱️ *Robbery cooldown active! Wait ${remaining} minutes.*`
                    });
                }

                const targetUser = await initUser(target);

                if (targetUser.economy.balance < ecoSettings.robMinTargetBalance) {
                    return sock.sendMessage(chatId, {
                        text: `👀 *Target is too broke to rob!*

💸 *@${target.split('@')[0]}* only has ${formatCurrency(targetUser.economy.balance)}
🚫 *Minimum required: ${formatCurrency(ecoSettings.robMinTargetBalance)}*`,
                        mentions: [target]
                    });
                }

                if (user.economy.balance < ecoSettings.robMinRobberBalance) {
                    return sock.sendMessage(chatId, {
                        text: `💸 *You need at least ${formatCurrency(ecoSettings.robMinRobberBalance)} to attempt a robbery*

💰 *Your balance:* ${formatCurrency(user.economy.balance)}`
                    });
                }

                setCooldown(senderId, 'rob');
                const success = Math.random() < ecoSettings.robSuccessRate;

                if (success) {
                    const maxSteal = Math.floor(targetUser.economy.balance * ecoSettings.robMaxStealPercent);
                    const stolen = Math.floor(Math.random() * maxSteal) + 50;

                    targetUser.economy.balance -= stolen;
                    user.economy.balance += stolen;
                    user.economy.totalEarned += stolen;
                    user.economy.robCount += 1;
                    
                    await user.save();
                    await targetUser.save();
                    
                    await logTransaction(senderId, 'rob_success', stolen, { victim: target });

                    await sock.sendMessage(chatId, {
                        text: `🦹‍♂️ *ROBBERY SUCCESS!* 🦹‍♂️

💰 *@${senderId.split('@')[0]}* successfully robbed *${formatCurrency(stolen)}* from *@${target.split('@')[0]}*

📊 *New Balances:*
🤑 *Robber:* ${formatCurrency(user.economy.balance)}
😭 *Victim:* ${formatCurrency(targetUser.economy.balance)}

⏱️ *Cooldown:* ${ecoSettings.robCooldownMinutes} minutes`,
                        mentions: [senderId, target]
                    });
                } else {
                    user.economy.balance -= ecoSettings.robFailPenalty;
                    targetUser.economy.balance += ecoSettings.robFailPenalty;
                    
                    await user.save();
                    await targetUser.save();
                    
                    await logTransaction(senderId, 'rob_fail', ecoSettings.robFailPenalty, { victim: target });

                    await sock.sendMessage(chatId, {
                        text: `🚨 *ROBBERY FAILED!* 🚨

❌ *@${senderId.split('@')[0]}* got caught and paid a fine of ${formatCurrency(ecoSettings.robFailPenalty)}*

📊 *New Balances:*
😔 *Robber:* ${formatCurrency(user.economy.balance)}
😊 *Victim:* ${formatCurrency(targetUser.economy.balance)}

⏱️ *Cooldown:* ${ecoSettings.robCooldownMinutes} minutes`,
                        mentions: [senderId, target]
                    });
                }
                break;
            }

            case 'gamble':
            case 'bet':
            case 'flip': {
                const amount = parseInt(args[0]);
                
                if (!amount || amount < ecoSettings.gamblingMinBet || amount > ecoSettings.gamblingMaxBet) {
                    return sock.sendMessage(chatId, {
                        text: `🎰 *GAMBLING RULES* 🎰

💰 *Min Bet:* ${formatCurrency(ecoSettings.gamblingMinBet)}
💎 *Max Bet:* ${formatCurrency(ecoSettings.gamblingMaxBet)}

⚠️ *Usage:* .gamble [amount]
💡 *Example:* .gamble 1000`
                    });
                }

                if (user.economy.balance < amount) {
                    return sock.sendMessage(chatId, {
                        text: `🚫 *Insufficient balance for gambling*

💵 *Your Balance:* ${formatCurrency(user.economy.balance)}`
                    });
                }

                const win = Math.random() < 0.45; // 45% win rate
                
                if (win) {
                    const winnings = Math.floor(amount * 1.8); // 80% profit
                    user.economy.balance += winnings;
                    user.economy.totalEarned += winnings;
                    
                    await user.save();
                    await logTransaction(senderId, 'gamble_win', winnings);
                    
                    await sock.sendMessage(chatId, {
                        text: `🎰 *GAMBLING WIN!* 🎰

🎉 *Congratulations!* You won ${formatCurrency(winnings)}!
💵 *New Balance:* ${formatCurrency(user.economy.balance)}`
                    });
                } else {
                    user.economy.balance -= amount;
                    user.economy.totalSpent += amount;
                    
                    await user.save();
                    await logTransaction(senderId, 'gamble_lose', amount);
                    
                    await sock.sendMessage(chatId, {
                        text: `🎰 *GAMBLING LOSS!* 🎰

😔 *You lost ${formatCurrency(amount)}*
💵 *New Balance:* ${formatCurrency(user.economy.balance)}

💡 *Better luck next time!*`
                    });
                }
                break;
            }

            case 'leaderboard':
            case 'lb':
            case 'top': {
                const users = await models.User.find({})
                    .sort({ 
                        $expr: { 
                            $add: ['$economy.balance', '$economy.bank'] 
                        } 
                    })
                    .limit(10)
                    .lean();

                if (users.length === 0) {
                    return sock.sendMessage(chatId, {
                        text: '📊 *No users found in the economy system*'
                    });
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

                await sock.sendMessage(chatId, {
                    text: leaderboard,
                    mentions: users.map(u => u.userId)
                });
                break;
            }

            case 'profile':
            case 'stats': {
                const target = getTargetUser(message, args.join(' ')) || senderId;
                const targetUser = await initUser(target);
                const totalWealth = targetUser.economy.balance + targetUser.economy.bank;
                const rank = getUserRank(totalWealth);

                await sock.sendMessage(chatId, {
                    text: `👤 *USER PROFILE* 👤

📱 *User:* @${target.split('@')[0]}
🏅 *Rank:* ${rank}
📅 *Joined:* ${targetUser.createdAt.toLocaleDateString()}

💰 *WEALTH*
💵 *Wallet:* ${formatCurrency(targetUser.economy.balance)}
🏦 *Bank:* ${formatCurrency(targetUser.economy.bank)}
💎 *Total:* ${formatCurrency(totalWealth)}

📊 *STATISTICS*
💰 *Total Earned:* ${formatCurrency(targetUser.economy.totalEarned)}
💸 *Total Spent:* ${formatCurrency(targetUser.economy.totalSpent)}
⚡ *Work Count:* ${targetUser.economy.workCount}
🦹 *Rob Count:* ${targetUser.economy.robCount}

🎯 *ATTENDANCE*
📋 *Total Days:* ${targetUser.attendance.totalAttendances}
🔥 *Current Streak:* ${targetUser.attendance.streak}
🏆 *Best Streak:* ${targetUser.attendance.longestStreak}

📈 *ACTIVITY*
💬 *Commands Used:* ${targetUser.stats.commandsUsed}
🕒 *Last Seen:* ${targetUser.stats.lastSeen.toLocaleString()}`,
                    mentions: [target]
                });
                break;
            }

            case 'shop': {
                await sock.sendMessage(chatId, {
                    text: `🛍️ *ECONOMY SHOP* 🛍️

🚧 *Coming Soon!* 🚧

💡 *Planned Items:*
• 🛡️ Protection from robberies
• 💎 VIP status upgrades
• 🎁 Special rewards
• ⚡ Gambling multipliers
• 🏆 Custom ranks

💰 *Save your ${ecoSettings.currency} for amazing items!*`
                });
                break;
            }

            case 'ecosettings': {
                if (!isOwner(senderId) && !isAdmin(senderId)) {
                    return sock.sendMessage(chatId, {
                        text: '🚫 *Only admins can view economy settings*'
                    });
                }

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

                await sock.sendMessage(chatId, {
                    text: `🔧 *ECONOMY SYSTEM STATS* 🔧

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

🗄️ *Database:* MongoDB Connected ✅`
                });
                break;
            }
        }

    } catch (error) {
        logger.error('Economy plugin error:', error);
        await sock.sendMessage(message.key.remoteJid, {
            text: '❌ *An error occurred while processing the economy command*'
        });
    }
};

// Load settings on module initialization
loadEconomySettings();

export default economy;
