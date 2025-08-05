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
import { db } from '../database/postgresql.js';

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
        const currencySetting = await db.getSetting('economy', 'currency');
        if (currencySetting) {
            ecoSettings.currency = currencySetting;
        }

        const dailyMinSetting = await db.getSetting('economy', 'dailyMinAmount');
        if (dailyMinSetting) {
            ecoSettings.dailyMinAmount = parseInt(dailyMinSetting);
        }

        const dailyMaxSetting = await db.getSetting('economy', 'dailyMaxAmount');
        if (dailyMaxSetting) {
            ecoSettings.dailyMaxAmount = parseInt(dailyMaxSetting);
        }

        const workCooldownSetting = await db.getSetting('economy', 'workCooldownMinutes');
        if (workCooldownSetting) {
            ecoSettings.workCooldownMinutes = parseInt(workCooldownSetting);
        }

        logger.info('⚙️  Economy settings loaded from database');
    } catch (error) {
        logger.error('❌ Failed to load economy settings:', error);
    }
}

// Initialize or get user from database
async function initUser(userId) {
    try {
        let user = await db.getUser(userId);
        
        if (!user) {
            user = await db.createUser(userId, {
                balance: ecoSettings.startingBalance,
                bank: ecoSettings.startingBankBalance,
                total_earned: 0,
                total_spent: 0,
                work_count: 0,
                rob_count: 0,
                last_daily: null,
                rank: 'Newbie'
            });
            
            logger.info(`👤 New user initialized: ${userId.split('@')[0]}`);
        }
        
        // Update last seen
        await db.updateUser(userId, { 
            last_seen: new Date(),
            commands_used: user.commands_used + 1
        });
        
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

// Plugin execution function
const execute = async (context) => {
    try {
        // Check if database is connected
        const isHealthy = await db.healthCheck();
        if (!isHealthy) {
            return context.reply('❌ Database not connected. Please try again later.');
        }

        const { command, args, senderId, reply, message } = context;
        
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
        if (ecoSettings.currency === '₦') {
            await loadEconomySettings();
        }

        const user = await initUser(senderId);

        switch (command) {
            case 'balance':
            case 'bal':
            case 'wallet': {
                const totalWealth = user.balance + user.bank;
                const rank = getUserRank(totalWealth);
                
                await reply(`💰 *YOUR WALLET* 💰

👤 *User:* @${senderId.split('@')[0]}
🏅 *Rank:* ${rank}

💵 *Wallet:* ${formatCurrency(user.balance)}
🏦 *Bank:* ${formatCurrency(user.bank)}
💎 *Total Wealth:* ${formatCurrency(totalWealth)}

📊 *Statistics:*
💰 *Total Earned:* ${formatCurrency(user.total_earned)}
💸 *Total Spent:* ${formatCurrency(user.total_spent)}
⚡ *Work Count:* ${user.work_count}

🕒 *Last Seen:* ${user.last_seen ? new Date(user.last_seen).toLocaleString() : 'Just now'}`, {
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

                await db.updateUser(senderId, {
                    balance: user.balance + earnings,
                    total_earned: user.total_earned + earnings,
                    work_count: user.work_count + 1
                });

                setCooldown(senderId, 'work');
                
                await db.logTransaction(senderId, 'work', earnings, { job: job.name });

                await reply(`💼 *WORK COMPLETED* 💼

🔨 *Job:* ${job.name}
💰 *Earned:* ${formatCurrency(earnings)}
💵 *New Balance:* ${formatCurrency(user.balance + earnings)}

⏱️ *Next work available in ${ecoSettings.workCooldownMinutes} minutes*`);
                break;
            }

            case 'daily': {
                const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
                
                if (user.last_daily === today) {
                    return reply('⏰ *You have already claimed your daily reward today!*\n\nCome back tomorrow for another reward.');
                }

                const dailyAmount = Math.floor(Math.random() * (ecoSettings.dailyMaxAmount - ecoSettings.dailyMinAmount + 1)) + ecoSettings.dailyMinAmount;
                
                await db.updateUser(senderId, {
                    balance: user.balance + dailyAmount,
                    total_earned: user.total_earned + dailyAmount,
                    last_daily: today,
                    total_attendances: user.total_attendances + 1,
                    last_attendance: today
                });

                // Update streak logic
                const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                let newStreak = 1;
                
                if (user.last_attendance === yesterday) {
                    newStreak = user.streak + 1;
                }
                
                if (newStreak > user.longest_streak) {
                    await db.updateUser(senderId, {
                        streak: newStreak,
                        longest_streak: newStreak
                    });
                } else {
                    await db.updateUser(senderId, { streak: newStreak });
                }
                
                await db.logTransaction(senderId, 'daily', dailyAmount);

                await reply(`🎁 *DAILY REWARD CLAIMED* 🎁

💰 *Received:* ${formatCurrency(dailyAmount)}
💵 *New Balance:* ${formatCurrency(user.balance + dailyAmount)}
🔥 *Current Streak:* ${newStreak} days

✨ *Come back tomorrow for another reward!*`);
                break;
            }

            case 'send':
            case 'transfer':
            case 'pay': {
                if (args.length < 2) {
                    return reply(`❓ *Usage:* ${config.PREFIX}${command} <amount> <@user or reply to message>\n\n*Example:* ${config.PREFIX}send 500 @user`);
                }

                const amount = parseInt(args[0]);
                if (isNaN(amount) || amount <= 0) {
                    return reply('❌ *Please enter a valid amount greater than 0*');
                }

                if (user.balance < amount) {
                    return reply(`❌ *Insufficient balance!*\n\n💵 Your balance: ${formatCurrency(user.balance)}\n💸 Amount needed: ${formatCurrency(amount)}`);
                }

                const targetUserId = getTargetUser(message, args.join(' '));
                if (!targetUserId || targetUserId === senderId) {
                    return reply('❌ *Please mention a user or reply to their message*');
                }

                const targetUser = await initUser(targetUserId);

                // Perform transaction
                await db.updateUser(senderId, {
                    balance: user.balance - amount,
                    total_spent: user.total_spent + amount
                });

                await db.updateUser(targetUserId, {
                    balance: targetUser.balance + amount,
                    total_earned: targetUser.total_earned + amount
                });

                await db.logTransaction(senderId, 'transfer_out', amount, { recipient: targetUserId });
                await db.logTransaction(targetUserId, 'transfer_in', amount, { sender: senderId });

                await reply(`✅ *TRANSFER SUCCESSFUL* ✅

💸 *Sent:* ${formatCurrency(amount)}
👤 *To:* @${targetUserId.split('@')[0]}
💵 *Your new balance:* ${formatCurrency(user.balance - amount)}

💝 *Transfer completed successfully!*`, {
                    mentions: [targetUserId]
                });
                break;
            }

            case 'leaderboard':
            case 'lb':
            case 'top': {
                const leaderboardData = await db.getLeaderboard(10);

                if (leaderboardData.length === 0) {
                    return reply('📊 *No users found in the economy system*');
                }

                let leaderboard = '🏆 *ECONOMY LEADERBOARD* 🏆\n\n';
                
                leaderboardData.forEach((userEntry, index) => {
                    const wealth = userEntry.total_wealth;
                    const rank = index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                    const displayName = userEntry.display_name || userEntry.username || userEntry.user_id.split('@')[0];
                    
                    leaderboard += `${rank} ${displayName}\n`;
                    leaderboard += `   💎 ${formatCurrency(wealth)}\n\n`;
                });

                await reply(leaderboard, {
                    mentions: leaderboardData.map(u => u.user_id)
                });
                break;
            }

            case 'profile':
            case 'stats': {
                let targetUserId = senderId;
                let targetUser = user;

                // Check if user wants to view someone else's profile
                if (args.length > 0 || message.mentionedJid?.length > 0) {
                    targetUserId = getTargetUser(message, args.join(' ')) || senderId;
                    if (targetUserId !== senderId) {
                        targetUser = await initUser(targetUserId);
                    }
                }

                const totalWealth = targetUser.balance + targetUser.bank;
                const rank = getUserRank(totalWealth);
                const displayName = targetUser.display_name || targetUser.username || targetUserId.split('@')[0];

                await reply(`👤 *USER PROFILE* 👤

🏷️  *Name:* ${displayName}
🏅 *Rank:* ${rank}
💎 *Total Wealth:* ${formatCurrency(totalWealth)}

💰 *ECONOMY STATS:*
💵 Wallet: ${formatCurrency(targetUser.balance)}
🏦 Bank: ${formatCurrency(targetUser.bank)}
📈 Total Earned: ${formatCurrency(targetUser.total_earned)}
📉 Total Spent: ${formatCurrency(targetUser.total_spent)}

⚡ *ACTIVITY STATS:*
🔨 Work Count: ${targetUser.work_count}
🎁 Daily Streak: ${targetUser.streak || 0} days
🏆 Longest Streak: ${targetUser.longest_streak || 0} days
📋 Commands Used: ${targetUser.commands_used || 0}

📅 *DATES:*
🗓️  First Seen: ${targetUser.first_seen ? new Date(targetUser.first_seen).toLocaleDateString() : 'Unknown'}
🕒 Last Seen: ${targetUser.last_seen ? new Date(targetUser.last_seen).toLocaleString() : 'Just now'}`, {
                    mentions: [targetUserId]
                });
                break;
            }

            case 'rob': {
                if (!checkCooldown(senderId, 'rob', ecoSettings.robCooldownMinutes)) {
                    const remaining = getRemainingTime(senderId, 'rob', ecoSettings.robCooldownMinutes);
                    return reply(`⏱️ *You're in hiding! Wait ${remaining} minutes before attempting another robbery.*`);
                }

                if (user.balance < ecoSettings.robMinRobberBalance) {
                    return reply(`❌ *You need at least ${formatCurrency(ecoSettings.robMinRobberBalance)} to attempt a robbery!*`);
                }

                const targetUserId = getTargetUser(message, args.join(' '));
                if (!targetUserId || targetUserId === senderId) {
                    return reply('❌ *Please mention a user to rob or reply to their message*');
                }

                const targetUser = await initUser(targetUserId);

                if (targetUser.balance < ecoSettings.robMinTargetBalance) {
                    return reply(`❌ *Target doesn't have enough money to rob! They need at least ${formatCurrency(ecoSettings.robMinTargetBalance)}*`);
                }

                setCooldown(senderId, 'rob');

                // Calculate success based on rob success rate
                const isSuccess = Math.random() < ecoSettings.robSuccessRate;

                if (isSuccess) {
                    const maxSteal = Math.floor(targetUser.balance * ecoSettings.robMaxStealPercent);
                    const stolenAmount = Math.floor(Math.random() * maxSteal) + 100;

                    await db.updateUser(senderId, {
                        balance: user.balance + stolenAmount,
                        total_earned: user.total_earned + stolenAmount,
                        rob_count: user.rob_count + 1
                    });

                    await db.updateUser(targetUserId, {
                        balance: targetUser.balance - stolenAmount
                    });

                    await db.logTransaction(senderId, 'rob_success', stolenAmount, { victim: targetUserId });
                    await db.logTransaction(targetUserId, 'robbed', -stolenAmount, { robber: senderId });

                    await reply(`🦹‍♀️ *ROBBERY SUCCESSFUL* 🦹‍♀️

💰 *Stolen:* ${formatCurrency(stolenAmount)}
👤 *From:* @${targetUserId.split('@')[0]}
💵 *Your new balance:* ${formatCurrency(user.balance + stolenAmount)}

🎭 *You successfully robbed them and got away!*`, {
                        mentions: [targetUserId]
                    });
                } else {
                    const penalty = ecoSettings.robFailPenalty;
                    const actualPenalty = Math.min(penalty, user.balance);

                    await db.updateUser(senderId, {
                        balance: user.balance - actualPenalty
                    });

                    await db.logTransaction(senderId, 'rob_fail', -actualPenalty, { target: targetUserId });

                    await reply(`🚨 *ROBBERY FAILED* 🚨

❌ *You got caught trying to rob @${targetUserId.split('@')[0]}!*
💸 *Fine:* ${formatCurrency(actualPenalty)}
💵 *Your new balance:* ${formatCurrency(user.balance - actualPenalty)}

🚔 *Better luck next time, criminal!*`, {
                        mentions: [targetUserId]
                    });
                }
                break;
            }

            case 'gamble':
            case 'bet': {
                if (args.length < 1) {
                    return reply(`❓ *Usage:* ${config.PREFIX}${command} <amount>\n\n*Example:* ${config.PREFIX}gamble 500`);
                }

                const betAmount = parseInt(args[0]);
                if (isNaN(betAmount) || betAmount <= 0) {
                    return reply('❌ *Please enter a valid bet amount greater than 0*');
                }

                if (betAmount < ecoSettings.gamblingMinBet) {
                    return reply(`❌ *Minimum bet is ${formatCurrency(ecoSettings.gamblingMinBet)}*`);
                }

                if (betAmount > ecoSettings.gamblingMaxBet) {
                    return reply(`❌ *Maximum bet is ${formatCurrency(ecoSettings.gamblingMaxBet)}*`);
                }

                if (user.balance < betAmount) {
                    return reply(`❌ *Insufficient balance!*\n\n💵 Your balance: ${formatCurrency(user.balance)}\n💸 Bet amount: ${formatCurrency(betAmount)}`);
                }

                const winChance = 0.45; // 45% win chance
                const isWin = Math.random() < winChance;

                if (isWin) {
                    const winMultiplier = 1.8;
                    const winnings = Math.floor(betAmount * winMultiplier);
                    const profit = winnings - betAmount;

                    await db.updateUser(senderId, {
                        balance: user.balance + profit,
                        total_earned: user.total_earned + profit
                    });

                    await db.logTransaction(senderId, 'gamble_win', profit, { betAmount, winnings });

                    await reply(`🎰 *GAMBLING WIN!* 🎰

🎲 *Bet Amount:* ${formatCurrency(betAmount)}
💰 *Won:* ${formatCurrency(winnings)}
📈 *Profit:* ${formatCurrency(profit)}
💵 *New Balance:* ${formatCurrency(user.balance + profit)}

🍀 *Lady luck is on your side!*`);
                } else {
                    await db.updateUser(senderId, {
                        balance: user.balance - betAmount,
                        total_spent: user.total_spent + betAmount
                    });

                    await db.logTransaction(senderId, 'gamble_loss', -betAmount, { betAmount });

                    await reply(`🎰 *GAMBLING LOSS!* 🎰

🎲 *Bet Amount:* ${formatCurrency(betAmount)}
💸 *Lost:* ${formatCurrency(betAmount)}
💵 *New Balance:* ${formatCurrency(user.balance - betAmount)}

😢 *Better luck next time!*`);
                }
                break;
            }

            case 'deposit':
            case 'dep': {
                if (args.length < 1) {
                    return reply(`❓ *Usage:* ${config.PREFIX}${command} <amount|all>\n\n*Example:* ${config.PREFIX}deposit 1000`);
                }

                let amount;
                if (args[0].toLowerCase() === 'all') {
                    amount = user.balance;
                } else {
                    amount = parseInt(args[0]);
                }

                if (isNaN(amount) || amount <= 0) {
                    return reply('❌ *Please enter a valid amount greater than 0 or "all"*');
                }

                if (user.balance < amount) {
                    return reply(`❌ *Insufficient wallet balance!*\n\n💵 Your wallet: ${formatCurrency(user.balance)}`);
                }

                await db.updateUser(senderId, {
                    balance: user.balance - amount,
                    bank: user.bank + amount
                });

                await db.logTransaction(senderId, 'deposit', amount);

                await reply(`🏦 *DEPOSIT SUCCESSFUL* 🏦

💰 *Deposited:* ${formatCurrency(amount)}
💵 *Wallet Balance:* ${formatCurrency(user.balance - amount)}
🏦 *Bank Balance:* ${formatCurrency(user.bank + amount)}

✅ *Your money is now safely stored in the bank!*`);
                break;
            }

            case 'withdraw':
            case 'wd': {
                if (args.length < 1) {
                    return reply(`❓ *Usage:* ${config.PREFIX}${command} <amount|all>\n\n*Example:* ${config.PREFIX}withdraw 1000`);
                }

                let amount;
                if (args[0].toLowerCase() === 'all') {
                    amount = user.bank;
                } else {
                    amount = parseInt(args[0]);
                }

                if (isNaN(amount) || amount <= 0) {
                    return reply('❌ *Please enter a valid amount greater than 0 or "all"*');
                }

                if (user.bank < amount) {
                    return reply(`❌ *Insufficient bank balance!*\n\n🏦 Your bank: ${formatCurrency(user.bank)}`);
                }

                await db.updateUser(senderId, {
                    balance: user.balance + amount,
                    bank: user.bank - amount
                });

                await db.logTransaction(senderId, 'withdrawal', amount);

                await reply(`🏦 *WITHDRAWAL SUCCESSFUL* 🏦

💰 *Withdrawn:* ${formatCurrency(amount)}
💵 *Wallet Balance:* ${formatCurrency(user.balance + amount)}
🏦 *Bank Balance:* ${formatCurrency(user.bank - amount)}

✅ *Money transferred to your wallet!*`);
                break;
            }

            case 'ecosettings': {
                if (!isOwner(senderId) && !isAdmin(senderId)) {
                    return reply('🚫 *Only admins can view economy settings*');
                }

                const stats = await db.getStats();

                await reply(`🔧 *ECONOMY SYSTEM STATS* 🔧

👥 *Total Users:* ${stats.users}
📋 *Total Groups:* ${stats.groups}
💰 *Total Wealth in Circulation:* ${formatCurrency(stats.totalWealth)}

📊 *Economy Settings:*
💵 *Currency:* ${ecoSettings.currency}
🎁 *Daily Rewards:* ${formatCurrency(ecoSettings.dailyMinAmount)} - ${formatCurrency(ecoSettings.dailyMaxAmount)}
💼 *Work Cooldown:* ${ecoSettings.workCooldownMinutes} minutes
🦹 *Rob Success Rate:* ${(ecoSettings.robSuccessRate * 100)}%
🎰 *Gambling Limits:* ${formatCurrency(ecoSettings.gamblingMinBet)} - ${formatCurrency(ecoSettings.gamblingMaxBet)}

🗄️ *Database:* PostgreSQL Connected ✅
🏠 *Host:* ${db.getConnectionInfo().host}
📊 *Database:* ${db.getConnectionInfo().database}`);
                break;
            }

            default:
                // For other economy commands, show coming soon message
                await reply(`🚧 *${command.toUpperCase()} - COMING SOON!* 🚧

💡 *Available Commands:*
• \`${config.PREFIX}balance\` - Check your wallet
• \`${config.PREFIX}work\` - Earn money by working
• \`${config.PREFIX}daily\` - Claim daily reward
• \`${config.PREFIX}send <amount> @user\` - Send money
• \`${config.PREFIX}deposit <amount>\` - Deposit to bank
• \`${config.PREFIX}withdraw <amount>\` - Withdraw from bank
• \`${config.PREFIX}rob @user\` - Rob another user
• \`${config.PREFIX}gamble <amount>\` - Gamble your money
• \`${config.PREFIX}leaderboard\` - View top users
• \`${config.PREFIX}profile\` - View your profile

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
    description: 'Economy system with balance, work, daily rewards, transfers, gambling, and more',
    usage: [
        'balance - Check your wallet balance',
        'work - Work to earn money',
        'daily - Claim daily reward',
        'send <amount> @user - Send money to another user',
        'deposit <amount> - Deposit money to bank',
        'withdraw <amount> - Withdraw money from bank',
        'rob @user - Rob another user',
        'gamble <amount> - Gamble your money',
        'leaderboard - View top users',
        'profile - View your profile'
    ],
    category: 'economy',
    execute
};

export default economyPlugin;
