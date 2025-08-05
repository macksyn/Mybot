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

// Command locks to prevent concurrent execution
const commandLocks = new Map();

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

// Database Transaction Class
class DatabaseTransaction {
    constructor(dbConnection) {
        this.db = dbConnection;
        this.client = null;
    }

    async begin() {
        this.client = await this.db.pool.connect();
        await this.client.query('BEGIN');
    }

    async commit() {
        if (this.client) {
            await this.client.query('COMMIT');
            this.client.release();
            this.client = null;
        }
    }

    async rollback() {
        if (this.client) {
            await this.client.query('ROLLBACK');
            this.client.release();
            this.client = null;
        }
    }

    async query(text, params = []) {
        if (!this.client) {
            throw new Error('Transaction not started');
        }
        return await this.client.query(text, params);
    }
}

// Command execution wrapper with locking
async function executeWithLock(userId, commandType, callback) {
    const lockKey = `${userId}_${commandType}`;
    
    if (commandLocks.has(lockKey)) {
        throw new Error('⏳ Command already in progress. Please wait a moment.');
    }
    
    commandLocks.set(lockKey, Date.now());
    
    try {
        const result = await callback();
        return result;
    } finally {
        commandLocks.delete(lockKey);
    }
}

// Load settings from database on startup
async function loadEconomySettings() {
    try {
        const settings = await db.getAllSettings('economy');
        
        if (settings.currency) ecoSettings.currency = settings.currency;
        if (settings.dailyMinAmount) ecoSettings.dailyMinAmount = parseInt(settings.dailyMinAmount);
        if (settings.dailyMaxAmount) ecoSettings.dailyMaxAmount = parseInt(settings.dailyMaxAmount);
        if (settings.workCooldownMinutes) ecoSettings.workCooldownMinutes = parseInt(settings.workCooldownMinutes);

        logger.info('⚙️  Economy settings loaded from database');
    } catch (error) {
        logger.error('❌ Failed to load economy settings:', error);
    }
}

// Safe user initialization with UPSERT
async function initUser(userId) {
    const transaction = new DatabaseTransaction(db);
    
    try {
        await transaction.begin();
        
        // Use UPSERT to prevent race conditions
        const result = await transaction.query(`
            INSERT INTO users (
                user_id, balance, bank, total_earned, total_spent, 
                work_count, rob_count, last_daily, rank, 
                first_seen, last_seen, commands_used, streak, 
                longest_streak, total_attendances
            )
            VALUES ($1, $2, $3, 0, 0, 0, 0, NULL, 'Newbie', NOW(), NOW(), 1, 0, 0, 0)
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                last_seen = NOW(),
                commands_used = users.commands_used + 1
            RETURNING *;
        `, [userId, ecoSettings.startingBalance, ecoSettings.startingBankBalance]);
        
        await transaction.commit();
        return result.rows[0];
        
    } catch (error) {
        await transaction.rollback();
        logger.error('❌ Failed to initialize user:', error);
        throw error;
    }
}

// Check cooldown from database
async function checkCooldown(userId, actionType, cooldownMinutes) {
    try {
        const result = await db.query(`
            SELECT ${actionType}_at FROM users 
            WHERE user_id = $1
        `, [userId]);
        
        if (result.rows.length === 0 || !result.rows[0][`${actionType}_at`]) {
            return { canUse: true, remainingMinutes: 0 };
        }
        
        const lastUsed = new Date(result.rows[0][`${actionType}_at`]);
        const timePassed = (Date.now() - lastUsed.getTime()) / (1000 * 60);
        const remainingMinutes = Math.max(0, Math.ceil(cooldownMinutes - timePassed));
        
        return {
            canUse: timePassed >= cooldownMinutes,
            remainingMinutes
        };
    } catch (error) {
        logger.error(`Error checking ${actionType} cooldown:`, error);
        return { canUse: false, remainingMinutes: cooldownMinutes };
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
            'clan', 'ecosettings', 'ecoaddmoney', 'ecogive',
            'ecosetbalance', 'ecoreset'
        ];
        
        if (!economyCommands.includes(command)) return;

        // Load settings if not loaded
        if (!ecoSettings.loaded) {
            await loadEconomySettings();
            ecoSettings.loaded = true;
        }

        // Initialize user
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
                await executeWithLock(senderId, 'work', async () => {
                    const cooldownCheck = await checkCooldown(senderId, 'last_work', ecoSettings.workCooldownMinutes);
                    
                    if (!cooldownCheck.canUse) {
                        return reply(`⏱️ *You're tired! Rest for ${cooldownCheck.remainingMinutes} minutes before working again.*`);
                    }

                    const job = ecoSettings.workJobs[Math.floor(Math.random() * ecoSettings.workJobs.length)];
                    const earnings = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;

                    const transaction = new DatabaseTransaction(db);
                    
                    try {
                        await transaction.begin();
                        
                        // Get fresh user data with lock
                        const freshUser = await transaction.query(
                            'SELECT * FROM users WHERE user_id = $1 FOR UPDATE', 
                            [senderId]
                        );
                        
                        if (freshUser.rows.length === 0) {
                            throw new Error('User not found');
                        }
                        
                        const currentBalance = freshUser.rows[0].balance;
                        
                        // Update user atomically
                        await transaction.query(`
                            UPDATE users 
                            SET balance = $1, 
                                total_earned = total_earned + $2, 
                                work_count = work_count + 1,
                                last_work_at = NOW()
                            WHERE user_id = $3
                        `, [currentBalance + earnings, earnings, senderId]);
                        
                        // Log transaction
                        await transaction.query(`
                            INSERT INTO transactions (user_id, type, amount, details, created_at)
                            VALUES ($1, 'work', $2, $3, NOW())
                        `, [senderId, earnings, JSON.stringify({ job: job.name })]);
                        
                        await transaction.commit();
                        
                        await reply(`💼 *WORK COMPLETED* 💼

🔨 *Job:* ${job.name}
💰 *Earned:* ${formatCurrency(earnings)}
💵 *New Balance:* ${formatCurrency(currentBalance + earnings)}

⏱️ *Next work available in ${ecoSettings.workCooldownMinutes} minutes*`);
                        
                    } catch (error) {
                        await transaction.rollback();
                        throw error;
                    }
                });
                break;
            }

            case 'daily': {
                await executeWithLock(senderId, 'daily', async () => {
                    const today = new Date().toISOString().split('T')[0];
                    
                    if (user.last_daily === today) {
                        return reply('⏰ *You have already claimed your daily reward today!*\n\nCome back tomorrow for another reward.');
                    }

                    const dailyAmount = Math.floor(Math.random() * (ecoSettings.dailyMaxAmount - ecoSettings.dailyMinAmount + 1)) + ecoSettings.dailyMinAmount;
                    
                    const transaction = new DatabaseTransaction(db);
                    
                    try {
                        await transaction.begin();
                        
                        // Get fresh user data with lock
                        const freshUser = await transaction.query(
                            'SELECT * FROM users WHERE user_id = $1 FOR UPDATE', 
                            [senderId]
                        );
                        
                        const currentBalance = freshUser.rows[0].balance;
                        const currentStreak = freshUser.rows[0].streak || 0;
                        const longestStreak = freshUser.rows[0].longest_streak || 0;
                        
                        // Calculate streak
                        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                        let newStreak = 1;
                        
                        if (freshUser.rows[0].last_attendance === yesterday) {
                            newStreak = currentStreak + 1;
                        }
                        
                        const newLongestStreak = Math.max(longestStreak, newStreak);
                        
                        // Update user atomically
                        await transaction.query(`
                            UPDATE users 
                            SET balance = $1,
                                total_earned = total_earned + $2,
                                last_daily = $3,
                                last_attendance = $3,
                                streak = $4,
                                longest_streak = $5,
                                total_attendances = total_attendances + 1
                            WHERE user_id = $6
                        `, [currentBalance + dailyAmount, dailyAmount, today, newStreak, newLongestStreak, senderId]);
                        
                        // Log transaction
                        await transaction.query(`
                            INSERT INTO transactions (user_id, type, amount, details, created_at)
                            VALUES ($1, 'daily', $2, $3, NOW())
                        `, [senderId, dailyAmount, JSON.stringify({ streak: newStreak })]);
                        
                        await transaction.commit();
                        
                        await reply(`🎁 *DAILY REWARD CLAIMED* 🎁

💰 *Received:* ${formatCurrency(dailyAmount)}
💵 *New Balance:* ${formatCurrency(currentBalance + dailyAmount)}
🔥 *Current Streak:* ${newStreak} days

✨ *Come back tomorrow for another reward!*`);
                        
                    } catch (error) {
                        await transaction.rollback();
                        throw error;
                    }
                });
                break;
            }

            case 'send':
            case 'transfer':
            case 'pay': {
                await executeWithLock(senderId, 'transfer', async () => {
                    if (args.length < 2) {
                        return reply(`❓ *Usage:* ${config.PREFIX}${command} <amount> <@user or reply to message>\n\n*Example:* ${config.PREFIX}send 500 @user`);
                    }

                    const amount = parseInt(args[0]);
                    if (isNaN(amount) || amount <= 0) {
                        return reply('❌ *Please enter a valid amount greater than 0*');
                    }

                    const targetUserId = getTargetUser(message, args.join(' '));
                    if (!targetUserId || targetUserId === senderId) {
                        return reply('❌ *Please mention a user or reply to their message*');
                    }

                    // Initialize target user
                    await initUser(targetUserId);

                    const transaction = new DatabaseTransaction(db);
                    
                    try {
                        await transaction.begin();
                        
                        // Lock both users for update (order by user_id to prevent deadlocks)
                        const userIds = [senderId, targetUserId].sort();
                        const users = {};
                        
                        for (const userId of userIds) {
                            const result = await transaction.query(
                                'SELECT * FROM users WHERE user_id = $1 FOR UPDATE', 
                                [userId]
                            );
                            if (result.rows.length === 0) {
                                throw new Error(`User ${userId} not found`);
                            }
                            users[userId] = result.rows[0];
                        }
                        
                        const senderBalance = users[senderId].balance;
                        const targetBalance = users[targetUserId].balance;
                        
                        if (senderBalance < amount) {
                            await transaction.rollback();
                            return reply(`❌ *Insufficient balance!*\n\n💵 Your balance: ${formatCurrency(senderBalance)}\n💸 Amount needed: ${formatCurrency(amount)}`);
                        }
                        
                        // Update both balances atomically
                        await transaction.query(`
                            UPDATE users 
                            SET balance = $1, total_spent = total_spent + $2 
                            WHERE user_id = $3
                        `, [senderBalance - amount, amount, senderId]);
                        
                        await transaction.query(`
                            UPDATE users 
                            SET balance = $1, total_earned = total_earned + $2 
                            WHERE user_id = $3
                        `, [targetBalance + amount, amount, targetUserId]);
                        
                        // Log both transactions
                        await transaction.query(`
                            INSERT INTO transactions (user_id, type, amount, details, created_at)
                            VALUES 
                            ($1, 'transfer_out', $2, $3, NOW()),
                            ($4, 'transfer_in', $5, $6, NOW())
                        `, [
                            senderId, -amount, JSON.stringify({ recipient: targetUserId }),
                            targetUserId, amount, JSON.stringify({ sender: senderId })
                        ]);
                        
                        await transaction.commit();
                        
                        await reply(`✅ *TRANSFER SUCCESSFUL* ✅

💸 *Sent:* ${formatCurrency(amount)}
👤 *To:* @${targetUserId.split('@')[0]}
💵 *Your new balance:* ${formatCurrency(senderBalance - amount)}

💝 *Transfer completed successfully!*`, {
                            mentions: [targetUserId]
                        });
                        
                    } catch (error) {
                        await transaction.rollback();
                        throw error;
                    }
                });
                break;
            }

            case 'gamble':
            case 'bet': {
                await executeWithLock(senderId, 'gamble', async () => {
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

                    const transaction = new DatabaseTransaction(db);
                    
                    try {
                        await transaction.begin();
                        
                        // Get fresh user data with lock
                        const freshUser = await transaction.query(
                            'SELECT * FROM users WHERE user_id = $1 FOR UPDATE', 
                            [senderId]
                        );
                        
                        const currentBalance = freshUser.rows[0].balance;
                        
                        if (currentBalance < betAmount) {
                            await transaction.rollback();
                            return reply(`❌ *Insufficient balance!*\n\n💵 Your balance: ${formatCurrency(currentBalance)}\n💸 Bet amount: ${formatCurrency(betAmount)}`);
                        }

                        const winChance = 0.45; // 45% win chance
                        const isWin = Math.random() < winChance;

                        if (isWin) {
                            const winMultiplier = 1.8;
                            const winnings = Math.floor(betAmount * winMultiplier);
                            const profit = winnings - betAmount;

                            await transaction.query(`
                                UPDATE users 
                                SET balance = $1, total_earned = total_earned + $2
                                WHERE user_id = $3
                            `, [currentBalance + profit, profit, senderId]);

                            await transaction.query(`
                                INSERT INTO transactions (user_id, type, amount, details, created_at)
                                VALUES ($1, 'gamble_win', $2, $3, NOW())
                            `, [senderId, profit, JSON.stringify({ betAmount, winnings })]);

                            await transaction.commit();

                            await reply(`🎰 *GAMBLING WIN!* 🎰

🎲 *Bet Amount:* ${formatCurrency(betAmount)}
💰 *Won:* ${formatCurrency(winnings)}
📈 *Profit:* ${formatCurrency(profit)}
💵 *New Balance:* ${formatCurrency(currentBalance + profit)}

🍀 *Lady luck is on your side!*`);
                        } else {
                            await transaction.query(`
                                UPDATE users 
                                SET balance = $1, total_spent = total_spent + $2
                                WHERE user_id = $3
                            `, [currentBalance - betAmount, betAmount, senderId]);

                            await transaction.query(`
                                INSERT INTO transactions (user_id, type, amount, details, created_at)
                                VALUES ($1, 'gamble_loss', $2, $3, NOW())
                            `, [senderId, -betAmount, JSON.stringify({ betAmount })]);

                            await transaction.commit();

                            await reply(`🎰 *GAMBLING LOSS!* 🎰

🎲 *Bet Amount:* ${formatCurrency(betAmount)}
💸 *Lost:* ${formatCurrency(betAmount)}
💵 *New Balance:* ${formatCurrency(currentBalance - betAmount)}

😢 *Better luck next time!*`);
                        }
                        
                    } catch (error) {
                        await transaction.rollback();
                        throw error;
                    }
                });
                break;
            }

            case 'deposit':
            case 'dep': {
                await executeWithLock(senderId, 'deposit', async () => {
                    if (args.length < 1) {
                        return reply(`❓ *Usage:* ${config.PREFIX}${command} <amount|all>\n\n*Example:* ${config.PREFIX}deposit 1000`);
                    }

                    const transaction = new DatabaseTransaction(db);
                    
                    try {
                        await transaction.begin();
                        
                        // Get fresh user data with lock
                        const freshUser = await transaction.query(
                            'SELECT * FROM users WHERE user_id = $1 FOR UPDATE', 
                            [senderId]
                        );
                        
                        const currentBalance = freshUser.rows[0].balance;
                        const currentBank = freshUser.rows[0].bank;
                        
                        let amount;
                        if (args[0].toLowerCase() === 'all') {
                            amount = currentBalance;
                        } else {
                            amount = parseInt(args[0]);
                        }

                        if (isNaN(amount) || amount <= 0) {
                            await transaction.rollback();
                            return reply('❌ *Please enter a valid amount greater than 0 or "all"*');
                        }

                        if (currentBalance < amount) {
                            await transaction.rollback();
                            return reply(`❌ *Insufficient wallet balance!*\n\n💵 Your wallet: ${formatCurrency(currentBalance)}`);
                        }

                        await transaction.query(`
                            UPDATE users 
                            SET balance = $1, bank = $2
                            WHERE user_id = $3
                        `, [currentBalance - amount, currentBank + amount, senderId]);

                        await transaction.query(`
                            INSERT INTO transactions (user_id, type, amount, details, created_at)
                            VALUES ($1, 'deposit', $2, $3, NOW())
                        `, [senderId, amount, JSON.stringify({})]);

                        await transaction.commit();

                        await reply(`🏦 *DEPOSIT SUCCESSFUL* 🏦

💰 *Deposited:* ${formatCurrency(amount)}
💵 *Wallet Balance:* ${formatCurrency(currentBalance - amount)}
🏦 *Bank Balance:* ${formatCurrency(currentBank + amount)}

✅ *Your money is now safely stored in the bank!*`);
                        
                    } catch (error) {
                        await transaction.rollback();
                        throw error;
                    }
                });
                break;
            }

            case 'withdraw':
            case 'wd': {
                await executeWithLock(senderId, 'withdraw', async () => {
                    if (args.length < 1) {
                        return reply(`❓ *Usage:* ${config.PREFIX}${command} <amount|all>\n\n*Example:* ${config.PREFIX}withdraw 1000`);
                    }

                    const transaction = new DatabaseTransaction(db);
                    
                    try {
                        await transaction.begin();
                        
                        // Get fresh user data with lock
                        const freshUser = await transaction.query(
                            'SELECT * FROM users WHERE user_id = $1 FOR UPDATE', 
                            [senderId]
                        );
                        
                        const currentBalance = freshUser.rows[0].balance;
                        const currentBank = freshUser.rows[0].bank;
                        
                        let amount;
                        if (args[0].toLowerCase() === 'all') {
                            amount = currentBank;
                        } else {
                            amount = parseInt(args[0]);
                        }

                        if (isNaN(amount) || amount <= 0) {
                            await transaction.rollback();
                            return reply('❌ *Please enter a valid amount greater than 0 or "all"*');
                        }

                        if (currentBank < amount) {
                            await transaction.rollback();
                            return reply(`❌ *Insufficient bank balance!*\n\n🏦 Your bank: ${formatCurrency(currentBank)}`);
                        }

                        await transaction.query(`
                            UPDATE users 
                            SET balance = $1, bank = $2
                            WHERE user_id = $3
                        `, [currentBalance + amount, currentBank - amount, senderId]);

                        await transaction.query(`
                            INSERT INTO transactions (user_id, type, amount, details, created_at)
                            VALUES ($1, 'withdrawal', $2, $3, NOW())
                        `, [senderId, amount, JSON.stringify({})]);

                        await transaction.commit();

                        await reply(`🏦 *WITHDRAWAL SUCCESSFUL* 🏦

💰 *Withdrawn:* ${formatCurrency(amount)}
💵 *Wallet Balance:* ${formatCurrency(currentBalance + amount)}
🏦 *Bank Balance:* ${formatCurrency(currentBank - amount)}

✅ *Money transferred to your wallet!*`);
                        
                    } catch (error) {
                        await transaction.rollback();
                        throw error;
                    }
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
                await executeWithLock(senderId, 'rob', async () => {
                    const cooldownCheck = await checkCooldown(senderId, 'last_rob', ecoSettings.robCooldownMinutes);
                    
                    if (!cooldownCheck.canUse) {
                        return reply(`⏱️ *You're in hiding! Wait ${cooldownCheck.remainingMinutes} minutes before attempting another robbery.*`);
                    }

                    const targetUserId = getTargetUser(message, args.join(' '));
                    if (!targetUserId || targetUserId === senderId) {
                        return reply('❌ *Please mention a user to rob or reply to their message*');
                    }

                    // Initialize target user
                    await initUser(targetUserId);

                    const transaction = new DatabaseTransaction(db);
                    
                    try {
                        await transaction.begin();
                        
                        // Lock both users for update (order by user_id to prevent deadlocks)
                        const userIds = [senderId, targetUserId].sort();
                        const users = {};
                        
                        for (const userId of userIds) {
                            const result = await transaction.query(
                                'SELECT * FROM users WHERE user_id = $1 FOR UPDATE', 
                                [userId]
                            );
                            if (result.rows.length === 0) {
                                throw new Error(`User ${userId} not found`);
                            }
                            users[userId] = result.rows[0];
                        }
                        
                        const robberBalance = users[senderId].balance;
                        const targetBalance = users[targetUserId].balance;

                        if (robberBalance < ecoSettings.robMinRobberBalance) {
                            await transaction.rollback();
                            return reply(`❌ *You need at least ${formatCurrency(ecoSettings.robMinRobberBalance)} to attempt a robbery!*`);
                        }

                        if (targetBalance < ecoSettings.robMinTargetBalance) {
                            await transaction.rollback();
                            return reply(`❌ *Target doesn't have enough money to rob! They need at least ${formatCurrency(ecoSettings.robMinTargetBalance)}*`);
                        }

                        // Update cooldown
                        await transaction.query(`
                            UPDATE users 
                            SET last_rob_at = NOW()
                            WHERE user_id = $1
                        `, [senderId]);

                        // Calculate success based on rob success rate
                        const isSuccess = Math.random() < ecoSettings.robSuccessRate;

                        if (isSuccess) {
                            const maxSteal = Math.floor(targetBalance * ecoSettings.robMaxStealPercent);
                            const stolenAmount = Math.floor(Math.random() * maxSteal) + 100;

                            await transaction.query(`
                                UPDATE users 
                                SET balance = $1, total_earned = total_earned + $2, rob_count = rob_count + 1
                                WHERE user_id = $3
                            `, [robberBalance + stolenAmount, stolenAmount, senderId]);

                            await transaction.query(`
                                UPDATE users 
                                SET balance = $1
                                WHERE user_id = $2
                            `, [targetBalance - stolenAmount, targetUserId]);

                            await transaction.query(`
                                INSERT INTO transactions (user_id, type, amount, details, created_at)
                                VALUES 
                                ($1, 'rob_success', $2, $3, NOW()),
                                ($4, 'robbed', $5, $6, NOW())
                            `, [
                                senderId, stolenAmount, JSON.stringify({ victim: targetUserId }),
                                targetUserId, -stolenAmount, JSON.stringify({ robber: senderId })
                            ]);

                            await transaction.commit();

                            await reply(`🦹‍♀️ *ROBBERY SUCCESSFUL* 🦹‍♀️

💰 *Stolen:* ${formatCurrency(stolenAmount)}
👤 *From:* @${targetUserId.split('@')[0]}
💵 *Your new balance:* ${formatCurrency(robberBalance + stolenAmount)}

🎭 *You successfully robbed them and got away!*`, {
                                mentions: [targetUserId]
                            });
                        } else {
                            const penalty = ecoSettings.robFailPenalty;
                            const actualPenalty = Math.min(penalty, robberBalance);

                            await transaction.query(`
                                UPDATE users 
                                SET balance = $1
                                WHERE user_id = $2
                            `, [robberBalance - actualPenalty, senderId]);

                            await transaction.query(`
                                INSERT INTO transactions (user_id, type, amount, details, created_at)
                                VALUES ($1, 'rob_fail', $2, $3, NOW())
                            `, [senderId, -actualPenalty, JSON.stringify({ target: targetUserId })]);

                            await transaction.commit();

                            await reply(`🚨 *ROBBERY FAILED* 🚨

❌ *You got caught trying to rob @${targetUserId.split('@')[0]}!*
💸 *Fine:* ${formatCurrency(actualPenalty)}
💵 *Your new balance:* ${formatCurrency(robberBalance - actualPenalty)}

🚔 *Better luck next time, criminal!*`, {
                                mentions: [targetUserId]
                            });
                        }
                        
                    } catch (error) {
                        await transaction.rollback();
                        throw error;
                    }
                });
                break;
            }

            case 'ecosettings': {
                if (!isOwner(senderId) && !isAdmin(senderId)) {
                    return reply('🚫 *Only admins can view economy settings*');
                }

                if (args.length === 0) {
                    // Show current settings
                    const stats = await db.getStats();

                    await reply(`🔧 *ECONOMY SYSTEM SETTINGS* 🔧

👥 *Total Users:* ${stats.users || 0}
📋 *Total Groups:* ${stats.groups || 0}
💰 *Total Wealth in Circulation:* ${formatCurrency(stats.totalWealth || 0)}

📊 *Current Settings:*
💵 *Currency:* ${ecoSettings.currency}
🎁 *Daily Min:* ${formatCurrency(ecoSettings.dailyMinAmount)}
🎁 *Daily Max:* ${formatCurrency(ecoSettings.dailyMaxAmount)}
💼 *Work Cooldown:* ${ecoSettings.workCooldownMinutes} minutes
🦹 *Rob Cooldown:* ${ecoSettings.robCooldownMinutes} minutes
🎯 *Rob Success Rate:* ${(ecoSettings.robSuccessRate * 100)}%
📊 *Rob Max Steal:* ${(ecoSettings.robMaxStealPercent * 100)}%
💸 *Rob Fail Penalty:* ${formatCurrency(ecoSettings.robFailPenalty)}
🎰 *Gamble Min Bet:* ${formatCurrency(ecoSettings.gamblingMinBet)}
🎰 *Gamble Max Bet:* ${formatCurrency(ecoSettings.gamblingMaxBet)}
💰 *Starting Balance:* ${formatCurrency(ecoSettings.startingBalance)}

🗄️ *Database:* PostgreSQL Connected ✅
🔒 *Command Locks:* ${commandLocks.size} active locks

*Usage:* \`${config.PREFIX}ecosettings <setting> <value>\`
*Available settings:* currency, dailymin, dailymax, workcooldown, robcooldown, robsuccess, robsteal, robpenalty, gamblemin, gamblemax, startbalance`);
                } else if (args.length >= 2) {
                    // Update setting
                    const setting = args[0].toLowerCase();
                    const value = args.slice(1).join(' ');

                    try {
                        let updateKey = '';
                        let updateValue = value;
                        let displayValue = value;

                        switch (setting) {
                            case 'currency':
                                updateKey = 'currency';
                                ecoSettings.currency = value;
                                displayValue = value;
                                break;

                            case 'dailymin':
                                const dailyMin = parseInt(value);
                                if (isNaN(dailyMin) || dailyMin < 0) {
                                    return reply('❌ *Daily minimum must be a positive number*');
                                }
                                if (dailyMin >= ecoSettings.dailyMaxAmount) {
                                    return reply('❌ *Daily minimum must be less than daily maximum*');
                                }
                                updateKey = 'dailyMinAmount';
                                updateValue = dailyMin.toString();
                                ecoSettings.dailyMinAmount = dailyMin;
                                displayValue = formatCurrency(dailyMin);
                                break;

                            case 'dailymax':
                                const dailyMax = parseInt(value);
                                if (isNaN(dailyMax) || dailyMax < 0) {
                                    return reply('❌ *Daily maximum must be a positive number*');
                                }
                                if (dailyMax <= ecoSettings.dailyMinAmount) {
                                    return reply('❌ *Daily maximum must be greater than daily minimum*');
                                }
                                updateKey = 'dailyMaxAmount';
                                updateValue = dailyMax.toString();
                                ecoSettings.dailyMaxAmount = dailyMax;
                                displayValue = formatCurrency(dailyMax);
                                break;

                            case 'workcooldown':
                                const workCooldown = parseInt(value);
                                if (isNaN(workCooldown) || workCooldown < 1 || workCooldown > 1440) {
                                    return reply('❌ *Work cooldown must be between 1 and 1440 minutes*');
                                }
                                updateKey = 'workCooldownMinutes';
                                updateValue = workCooldown.toString();
                                ecoSettings.workCooldownMinutes = workCooldown;
                                displayValue = `${workCooldown} minutes`;
                                break;

                            case 'robcooldown':
                                const robCooldown = parseInt(value);
                                if (isNaN(robCooldown) || robCooldown < 1 || robCooldown > 1440) {
                                    return reply('❌ *Rob cooldown must be between 1 and 1440 minutes*');
                                }
                                updateKey = 'robCooldownMinutes';
                                updateValue = robCooldown.toString();
                                ecoSettings.robCooldownMinutes = robCooldown;
                                displayValue = `${robCooldown} minutes`;
                                break;

                            case 'robsuccess':
                                const robSuccess = parseFloat(value);
                                if (isNaN(robSuccess) || robSuccess < 0 || robSuccess > 1) {
                                    return reply('❌ *Rob success rate must be between 0 and 1 (e.g., 0.7 for 70%)*');
                                }
                                updateKey = 'robSuccessRate';
                                updateValue = robSuccess.toString();
                                ecoSettings.robSuccessRate = robSuccess;
                                displayValue = `${(robSuccess * 100)}%`;
                                break;

                            case 'robsteal':
                                const robSteal = parseFloat(value);
                                if (isNaN(robSteal) || robSteal < 0 || robSteal > 1) {
                                    return reply('❌ *Rob max steal percentage must be between 0 and 1 (e.g., 0.3 for 30%)*');
                                }
                                updateKey = 'robMaxStealPercent';
                                updateValue = robSteal.toString();
                                ecoSettings.robMaxStealPercent = robSteal;
                                displayValue = `${(robSteal * 100)}%`;
                                break;

                            case 'robpenalty':
                                const robPenalty = parseInt(value);
                                if (isNaN(robPenalty) || robPenalty < 0) {
                                    return reply('❌ *Rob fail penalty must be a positive number*');
                                }
                                updateKey = 'robFailPenalty';
                                updateValue = robPenalty.toString();
                                ecoSettings.robFailPenalty = robPenalty;
                                displayValue = formatCurrency(robPenalty);
                                break;

                            case 'gamblemin':
                                const gambleMin = parseInt(value);
                                if (isNaN(gambleMin) || gambleMin < 1) {
                                    return reply('❌ *Minimum gambling bet must be at least 1*');
                                }
                                if (gambleMin >= ecoSettings.gamblingMaxBet) {
                                    return reply('❌ *Minimum bet must be less than maximum bet*');
                                }
                                updateKey = 'gamblingMinBet';
                                updateValue = gambleMin.toString();
                                ecoSettings.gamblingMinBet = gambleMin;
                                displayValue = formatCurrency(gambleMin);
                                break;

                            case 'gamblemax':
                                const gambleMax = parseInt(value);
                                if (isNaN(gambleMax) || gambleMax < 1) {
                                    return reply('❌ *Maximum gambling bet must be at least 1*');
                                }
                                if (gambleMax <= ecoSettings.gamblingMinBet) {
                                    return reply('❌ *Maximum bet must be greater than minimum bet*');
                                }
                                updateKey = 'gamblingMaxBet';
                                updateValue = gambleMax.toString();
                                ecoSettings.gamblingMaxBet = gambleMax;
                                displayValue = formatCurrency(gambleMax);
                                break;

                            case 'startbalance':
                                const startBalance = parseInt(value);
                                if (isNaN(startBalance) || startBalance < 0) {
                                    return reply('❌ *Starting balance must be a positive number*');
                                }
                                updateKey = 'startingBalance';
                                updateValue = startBalance.toString();
                                ecoSettings.startingBalance = startBalance;
                                displayValue = formatCurrency(startBalance);
                                break;

                            default:
                                return reply(`❌ *Unknown setting: ${setting}*\n\n*Available settings:* currency, dailymin, dailymax, workcooldown, robcooldown, robsuccess, robsteal, robpenalty, gamblemin, gamblemax, startbalance`);
                        }

                        // Save to database
                        await db.setSetting('economy', updateKey, updateValue);

                        await reply(`✅ *SETTING UPDATED* ✅

🔧 *Setting:* ${setting}
💫 *New Value:* ${displayValue}
👤 *Updated by:* @${senderId.split('@')[0]}

*Settings updated successfully!*`, {
                            mentions: [senderId]
                        });

                    } catch (error) {
                        logger.error('Error updating economy setting:', error);
                        await reply('❌ *Failed to update setting. Please check the database connection.*');
                    }
                } else {
                    await reply(`❓ *Usage:* ${config.PREFIX}ecosettings [setting] [value]

*Examples:*
• \`${config.PREFIX}ecosettings\` - View current settings
• \`${config.PREFIX}ecosettings currency $\` - Change currency symbol
• \`${config.PREFIX}ecosettings dailymin 1000\` - Set daily minimum reward
• \`${config.PREFIX}ecosettings workcooldown 30\` - Set work cooldown to 30 minutes
• \`${config.PREFIX}ecosettings robsuccess 0.6\` - Set rob success rate to 60%`);
                }
                break;
            }

            case 'ecoaddmoney':
            case 'ecogive': {
                if (!isOwner(senderId) && !isAdmin(senderId)) {
                    return reply('🚫 *Only admins can add money to accounts*');
                }

                if (args.length < 2) {
                    return reply(`❓ *Usage:* ${config.PREFIX}${command} <amount> <@user or reply to message>\n\n*Example:* ${config.PREFIX}ecoaddmoney 5000 @user`);
                }

                const amount = parseInt(args[0]);
                if (isNaN(amount) || amount === 0) {
                    return reply('❌ *Please enter a valid amount (can be negative to remove money)*');
                }

                const targetUserId = getTargetUser(message, args.slice(1).join(' '));
                if (!targetUserId) {
                    return reply('❌ *Please mention a user or reply to their message*');
                }

                await executeWithLock(`${senderId}_admin`, 'admin_money', async () => {
                    // Initialize target user
                    await initUser(targetUserId);

                    const transaction = new DatabaseTransaction(db);
                    
                    try {
                        await transaction.begin();
                        
                        // Get fresh user data with lock
                        const freshUser = await transaction.query(
                            'SELECT * FROM users WHERE user_id = $1 FOR UPDATE', 
                            [targetUserId]
                        );
                        
                        const currentBalance = freshUser.rows[0].balance;
                        const newBalance = Math.max(0, currentBalance + amount); // Prevent negative balance
                        
                        // Update user balance
                        await transaction.query(`
                            UPDATE users 
                            SET balance = $1,
                                ${amount > 0 ? 'total_earned = total_earned + $2' : 'total_spent = total_spent + $3'}
                            WHERE user_id = $4
                        `, amount > 0 ? [newBalance, amount, targetUserId] : [newBalance, Math.abs(amount), targetUserId]);
                        
                        // Log admin transaction
                        await transaction.query(`
                            INSERT INTO transactions (user_id, type, amount, details, created_at)
                            VALUES ($1, 'admin_${amount > 0 ? 'add' : 'remove'}', $2, $3, NOW())
                        `, [targetUserId, amount, JSON.stringify({ admin: senderId, reason: 'Admin adjustment' })]);
                        
                        await transaction.commit();
                        
                        await reply(`${amount > 0 ? '💰' : '💸'} *ADMIN ${amount > 0 ? 'MONEY ADDED' : 'MONEY REMOVED'}* ${amount > 0 ? '💰' : '💸'}

👤 *Target:* @${targetUserId.split('@')[0]}
${amount > 0 ? '➕' : '➖'} *Amount:* ${formatCurrency(Math.abs(amount))}
💵 *Previous Balance:* ${formatCurrency(currentBalance)}
💵 *New Balance:* ${formatCurrency(newBalance)}
👨‍💼 *Admin:* @${senderId.split('@')[0]}

✅ *Balance updated successfully!*`, {
                            mentions: [targetUserId, senderId]
                        });
                        
                    } catch (error) {
                        await transaction.rollback();
                        throw error;
                    }
                });
                break;
            }

            case 'ecosetbalance': {
                if (!isOwner(senderId) && !isAdmin(senderId)) {
                    return reply('🚫 *Only admins can set user balances*');
                }

                if (args.length < 2) {
                    return reply(`❓ *Usage:* ${config.PREFIX}${command} <amount> <@user or reply to message>\n\n*Example:* ${config.PREFIX}ecosetbalance 10000 @user`);
                }

                const amount = parseInt(args[0]);
                if (isNaN(amount) || amount < 0) {
                    return reply('❌ *Please enter a valid positive amount*');
                }

                const targetUserId = getTargetUser(message, args.slice(1).join(' '));
                if (!targetUserId) {
                    return reply('❌ *Please mention a user or reply to their message*');
                }

                await executeWithLock(`${senderId}_admin`, 'admin_setbalance', async () => {
                    // Initialize target user
                    await initUser(targetUserId);

                    const transaction = new DatabaseTransaction(db);
                    
                    try {
                        await transaction.begin();
                        
                        // Get fresh user data with lock
                        const freshUser = await transaction.query(
                            'SELECT * FROM users WHERE user_id = $1 FOR UPDATE', 
                            [targetUserId]
                        );
                        
                        const currentBalance = freshUser.rows[0].balance;
                        
                        // Set new balance
                        await transaction.query(`
                            UPDATE users 
                            SET balance = $1
                            WHERE user_id = $2
                        `, [amount, targetUserId]);
                        
                        // Log admin transaction
                        await transaction.query(`
                            INSERT INTO transactions (user_id, type, amount, details, created_at)
                            VALUES ($1, 'admin_setbalance', $2, $3, NOW())
                        `, [targetUserId, amount - currentBalance, JSON.stringify({ 
                            admin: senderId, 
                            previousBalance: currentBalance, 
                            newBalance: amount 
                        })]);
                        
                        await transaction.commit();
                        
                        await reply(`🎯 *ADMIN BALANCE SET* 🎯

👤 *Target:* @${targetUserId.split('@')[0]}
💵 *Previous Balance:* ${formatCurrency(currentBalance)}
💵 *New Balance:* ${formatCurrency(amount)}
👨‍💼 *Admin:* @${senderId.split('@')[0]}

✅ *Balance set successfully!*`, {
                            mentions: [targetUserId, senderId]
                        });
                        
                    } catch (error) {
                        await transaction.rollback();
                        throw error;
                    }
                });
                break;
            }

            case 'ecoreset': {
                if (!isOwner(senderId)) {
                    return reply('🚫 *Only the bot owner can reset the economy*');
                }

                if (args.length === 0 || args[0].toLowerCase() !== 'confirm') {
                    return reply(`⚠️ *ECONOMY RESET WARNING* ⚠️

This will completely reset the economy system:
• All user balances will be set to ${formatCurrency(ecoSettings.startingBalance)}
• All bank balances will be set to ${formatCurrency(ecoSettings.startingBankBalance)}
• All transaction history will be cleared
• All statistics will be reset

*This action cannot be undone!*

To confirm, use: \`${config.PREFIX}ecoreset confirm\``);
                }

                await executeWithLock(`${senderId}_admin`, 'admin_reset', async () => {
                    const transaction = new DatabaseTransaction(db);
                    
                    try {
                        await transaction.begin();
                        
                        // Reset all users
                        await transaction.query(`
                            UPDATE users 
                            SET balance = $1,
                                bank = $2,
                                total_earned = 0,
                                total_spent = 0,
                                work_count = 0,
                                rob_count = 0,
                                streak = 0,
                                longest_streak = 0,
                                total_attendances = 0,
                                last_daily = NULL,
                                last_work_at = NULL,
                                last_rob_at = NULL,
                                last_gamble_at = NULL,
                                last_attendance = NULL
                        `, [ecoSettings.startingBalance, ecoSettings.startingBankBalance]);
                        
                        // Clear transaction history
                        await transaction.query('DELETE FROM transactions');
                        
                        await transaction.commit();
                        
                        await reply(`💥 *ECONOMY SYSTEM RESET* 💥

🔄 *All user data has been reset*
💰 *All balances set to:* ${formatCurrency(ecoSettings.startingBalance)}
🏦 *All bank balances set to:* ${formatCurrency(ecoSettings.startingBankBalance)}
📊 *All statistics cleared*
📜 *Transaction history cleared*
👨‍💼 *Reset by:* @${senderId.split('@')[0]}

✅ *Economy system has been completely reset!*`, {
                            mentions: [senderId]
                        });
                        
                    } catch (error) {
                        await transaction.rollback();
                        throw error;
                    }
                });
                break;
            }

            default:
                // For other economy commands, show coming soon message
                await reply(`🚧 *${command.toUpperCase()} - COMING SOON!* 🚧

💡 *User Commands:*
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

🔧 *Admin Commands:*
• \`${config.PREFIX}ecosettings\` - View/edit economy settings
• \`${config.PREFIX}ecoaddmoney <amount> @user\` - Add/remove money
• \`${config.PREFIX}ecosetbalance <amount> @user\` - Set user balance
• \`${config.PREFIX}ecoreset confirm\` - Reset entire economy (owner only)

🔜 *More features coming soon!*`);
                break;
        }

    } catch (error) {
        logger.error('Economy plugin error:', error);
        
        // Clean up any locks for this user
        for (const [lockKey, timestamp] of commandLocks.entries()) {
            if (lockKey.startsWith(senderId) && (Date.now() - timestamp) > 30000) {
                commandLocks.delete(lockKey);
            }
        }
        
        // Better error messages for users
        if (error.message.includes('Database not connected')) {
            await context.reply('❌ *Database connection lost. Please try again in a moment.*');
        } else if (error.message.includes('Command already in progress')) {
            await context.reply(error.message);
        } else if (error.message.includes('User not found')) {
            await context.reply('❌ *User data error. Please try the command again.*');
        } else {
            await context.reply('❌ *An error occurred while processing the economy command. Please try again.*');
        }
    }
};

// Cleanup function to remove old locks
setInterval(() => {
    const now = Date.now();
    for (const [lockKey, timestamp] of commandLocks.entries()) {
        if (now - timestamp > 30000) { // Remove locks older than 30 seconds
            commandLocks.delete(lockKey);
        }
    }
}, 60000); // Run cleanup every minute

// Plugin metadata and export
const economyPlugin = {
    name: 'economy',
    description: 'Complete economy system with atomic transactions, admin controls, and race condition prevention',
    usage: [
        'balance - Check your wallet balance',
        'work - Work to earn money (with proper cooldown)',
        'daily - Claim daily reward (streak system)',
        'send <amount> @user - Send money to another user (atomic transfer)',
        'deposit <amount> - Deposit money to bank',
        'withdraw <amount> - Withdraw money from bank',
        'rob @user - Rob another user (with cooldown)',
        'gamble <amount> - Gamble your money',
        'leaderboard - View top users',
        'profile - View your profile',
        '--- ADMIN COMMANDS ---',
        'ecosettings - View/edit economy settings',
        'ecoaddmoney <amount> @user - Add/remove money from user',
        'ecosetbalance <amount> @user - Set user balance',
        'ecoreset confirm - Reset entire economy (owner only)'
    ],
    category: 'economy',
    execute
};

export default economyPlugin;