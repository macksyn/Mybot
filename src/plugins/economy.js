import fs from 'fs';
import path from 'path';
import moment from 'moment-timezone';
import { fileURLToPath } from 'url';
import { isAdmin, isOwner } from '../utils/helpers.js';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Database paths
const dbPath = path.join(__dirname, '../../database.json');
const settingsPath = path.join(__dirname, '../../economy_settings.json');

// Ensure database exists
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ users: {}, groups: {}, settings: {} }, null, 2));
}

// Default economy settings
const defaultSettings = {
    startingBalance: 0,
    startingBankBalance: 0,
    dailyMinAmount: 500,
    dailyMaxAmount: 1000,
    workCooldownMinutes: 60,
    workJobs: [
        { name: 'Uber Driver', min: 200, max: 800 },
        { name: 'Food Delivery', min: 150, max: 600 },
        { name: 'Freelancer', min: 300, max: 1200 },
        { name: 'Tutor', min: 250, max: 900 },
        { name: 'Cleaner', min: 180, max: 500 },
        { name: 'Mechanic', min: 400, max: 1000 }
    ],
    robCooldownMinutes: 1,
    robSuccessRate: 0.9,
    robMaxStealPercent: 0.5,
    robMinTargetBalance: 0,
    robMinRobberBalance: 100,
    robMinSteal: 10,
    robFailPenalty: 100,
    clanCreationCost: 5000,
    currency: '₦',
    timezone: 'Africa/Lagos'
};

// Load settings
let ecoSettings = defaultSettings;
if (fs.existsSync(settingsPath)) {
    try {
        const loadedSettings = JSON.parse(fs.readFileSync(settingsPath));
        ecoSettings = { ...defaultSettings, ...loadedSettings };
    } catch (error) {
        logger.error('Error loading economy settings:', error);
        ecoSettings = defaultSettings;
    }
}

// Load database
function loadDatabase() {
    try {
        return JSON.parse(fs.readFileSync(dbPath));
    } catch (error) {
        logger.error('Error loading database:', error);
        return { users: {}, groups: {}, settings: {} };
    }
}

// Save database
function saveDatabase(data) {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    } catch (error) {
        logger.error('Error saving database:', error);
    }
}

// Save settings
function saveSettings() {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(ecoSettings, null, 2));
    } catch (error) {
        logger.error('Error saving economy settings:', error);
    }
}

// Initialize user - UNIFIED VERSION
function initUser(userId) {
    const db = loadDatabase();
    
    if (!db.users[userId]) {
        db.users[userId] = {
            // Economy fields
            balance: ecoSettings.startingBalance,
            bank: ecoSettings.startingBankBalance,
            inventory: [],
            clan: null,
            bounty: 0,
            rank: 'Newbie',
            
            // Attendance fields
            lastAttendance: null,
            totalAttendances: 0,
            streak: 0,
            longestStreak: 0,
            
            // Birthday fields
            birthdayData: null,
            
            // Cooldowns
            lastDaily: null,
            lastWork: null,
            lastRob: null,
            
            // Timestamps
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        saveDatabase(db);
    } else {
        // Ensure all fields exist for existing users (backward compatibility)
        let updated = false;
        const user = db.users[userId];
        
        // Add missing economy fields
        if (user.balance === undefined) { user.balance = ecoSettings.startingBalance; updated = true; }
        if (user.bank === undefined) { user.bank = ecoSettings.startingBankBalance; updated = true; }
        if (user.inventory === undefined) { user.inventory = []; updated = true; }
        if (user.clan === undefined) { user.clan = null; updated = true; }
        if (user.bounty === undefined) { user.bounty = 0; updated = true; }
        if (user.rank === undefined) { user.rank = 'Newbie'; updated = true; }
        
        // Add missing attendance fields
        if (user.totalAttendances === undefined) { user.totalAttendances = 0; updated = true; }
        if (user.streak === undefined) { user.streak = 0; updated = true; }
        if (user.longestStreak === undefined) { user.longestStreak = 0; updated = true; }
        
        // Add missing birthday fields
        if (user.birthdayData === undefined) { user.birthdayData = null; updated = true; }
        
        // Add missing cooldown fields
        if (user.lastDaily === undefined) { user.lastDaily = null; updated = true; }
        if (user.lastWork === undefined) { user.lastWork = null; updated = true; }
        if (user.lastRob === undefined) { user.lastRob = null; updated = true; }
        
        // Add timestamps if missing
        if (user.createdAt === undefined) { user.createdAt = Date.now(); updated = true; }
        if (user.updatedAt === undefined) { user.updatedAt = Date.now(); updated = true; }
        
        if (updated) {
            user.updatedAt = Date.now();
            saveDatabase(db);
        }
    }
    
    return db.users[userId];
}

// Get user data
function getUserData(userId) {
    const db = loadDatabase();
    initUser(userId);
    return db.users[userId];
}

// Update user data
function updateUserData(userId, data) {
    const db = loadDatabase();
    initUser(userId);
    db.users[userId] = { ...db.users[userId], ...data, updatedAt: Date.now() };
    saveDatabase(db);
    return db.users[userId];
}

// Add money to user balance
function addMoney(userId, amount, reason = 'Unknown') {
    const db = loadDatabase();
    initUser(userId);
    db.users[userId].balance += amount;
    db.users[userId].updatedAt = Date.now();
    saveDatabase(db);
    logger.info(`💰 Added ${ecoSettings.currency}${amount} to ${userId.split('@')[0]} (${reason})`);
    return db.users[userId].balance;
}

// Remove money from user balance
function removeMoney(userId, amount, reason = 'Unknown') {
    const db = loadDatabase();
    initUser(userId);
    if (db.users[userId].balance >= amount) {
        db.users[userId].balance -= amount;
        db.users[userId].updatedAt = Date.now();
        saveDatabase(db);
        logger.info(`💸 Removed ${ecoSettings.currency}${amount} from ${userId.split('@')[0]} (${reason})`);
        return true;
    }
    return false;
}

// Get current Nigeria time
function getNigeriaTime() {
    return moment.tz('Africa/Lagos');
}

// Get current date in Nigeria timezone
function getCurrentDate() {
    return getNigeriaTime().format('DD-MM-YYYY');
}

// Get target user from mentions, quoted message, or text input
function getTargetUser(context, text) {
    const { message } = context;
    
    // Check for mentions
    if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
        return message.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }
    
    // Check for quoted message
    if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        return message.message.extendedTextMessage.contextInfo.participant;
    }
    
    // Extract from text input
    const phoneNumber = text.replace(/[^0-9]/g, '');
    if (phoneNumber.length >= 10) {
        return phoneNumber + '@s.whatsapp.net';
    }
    
    return null;
}

// Cooldown storage
const cooldowns = {
    rob: new Map(),
    work: new Map()
};

export default {
    name: 'economy',
    description: 'Complete economy system with wallet, bank, work, rob, clans and more',
    usage: `${config.PREFIX}bal | ${config.PREFIX}work | ${config.PREFIX}daily | ${config.PREFIX}send @user amount`,
    category: 'economy',
    aliases: ['eco', 'money', 'wallet'],
    
    async execute(context) {
        const { args, reply, senderId, sock, message, command } = context;
        
        // Initialize user
        initUser(senderId);
        
        // Handle subcommands or standalone commands
        if (command === 'balance' || command === 'bal' || command === 'wallet') {
            await this.handleBalance(context);
        } else if (command === 'economy' || command === 'eco') {
            if (args.length === 0) {
                await this.showEconomyMenu(reply);
                return;
            }
            
            const subCommand = args[0].toLowerCase();
            const subArgs = args.slice(1);
            
            switch (subCommand) {
                case 'balance':
                case 'bal':
                case 'wallet':
                    await this.handleBalance(context);
                    break;
                case 'send':
                case 'transfer':
                case 'pay':
                    await this.handleSend(context, subArgs);
                    break;
                case 'deposit':
                case 'dep':
                    await this.handleDeposit(context, subArgs);
                    break;
                case 'withdraw':
                case 'wd':
                    await this.handleWithdraw(context, subArgs);
                    break;
                case 'work':
                    await this.handleWork(context);
                    break;
                case 'rob':
                    await this.handleRob(context, subArgs);
                    break;
                case 'daily':
                    await this.handleDaily(context);
                    break;
                case 'profile':
                    await this.handleProfile(context, subArgs);
                    break;
                case 'leaderboard':
                case 'lb':
                    await this.handleLeaderboard(context);
                    break;
                case 'clan':
                    await this.handleClan(context, subArgs);
                    break;
                case 'shop':
                    await this.handleShop(context);
                    break;
                case 'inventory':
                case 'inv':
                    await this.handleInventory(context);
                    break;
                case 'settings':
                    await this.handleSettings(context, subArgs);
                    break;
                default:
                    await reply(`❓ Unknown economy command: *${subCommand}*\n\nUse *${config.PREFIX}economy help* to see available commands.`);
            }
        } else {
            // Handle direct commands
            switch (command) {
                case 'send':
                case 'transfer':
                case 'pay':
                    await this.handleSend(context, args);
                    break;
                case 'deposit':
                case 'dep':
                    await this.handleDeposit(context, args);
                    break;
                case 'withdraw':
                case 'wd':
                    await this.handleWithdraw(context, args);
                    break;
                case 'work':
                    await this.handleWork(context);
                    break;
                case 'rob':
                    await this.handleRob(context, args);
                    break;
                case 'daily':
                    await this.handleDaily(context);
                    break;
                case 'profile':
                    await this.handleProfile(context, args);
                    break;
                case 'leaderboard':
                case 'lb':
                    await this.handleLeaderboard(context);
                    break;
                case 'clan':
                    await this.handleClan(context, args);
                    break;
                case 'shop':
                    await this.handleShop(context);
                    break;
                case 'inventory':
                case 'inv':
                    await this.handleInventory(context);
                    break;
            }
        }
    },
    
    async showEconomyMenu(reply) {
        const menuText = `💰 *ECONOMY SYSTEM* 💰\n\n` +
                        `💵 *Wallet Commands:*\n` +
                        `• *balance/bal* - Check your balance\n` +
                        `• *send @user amount* - Send money\n` +
                        `• *deposit amount* - Deposit to bank\n` +
                        `• *withdraw amount* - Withdraw from bank\n\n` +
                        `💼 *Earning Commands:*\n` +
                        `• *work* - Work to earn money\n` +
                        `• *daily* - Claim daily reward\n` +
                        `• *rob @user* - Rob someone (risky!)\n\n` +
                        `👥 *Social Commands:*\n` +
                        `• *profile [@user]* - View profile\n` +
                        `• *leaderboard* - Top users\n` +
                        `• *clan* - Clan system\n\n` +
                        `🛍️ *Shop Commands:*\n` +
                        `• *shop* - Browse items\n` +
                        `• *inventory* - View your items\n\n` +
                        `💡 *Usage:* ${config.PREFIX}economy [command] or ${config.PREFIX}[command]`;
        
        await reply(menuText);
    },
    
    async handleBalance(context) {
        const { reply, senderId, args } = context;
        const targetUser = args.length > 0 ? getTargetUser(context, args.join(' ')) : senderId;
        
        if (targetUser && targetUser !== senderId) {
            initUser(targetUser);
            const targetData = getUserData(targetUser);
            const targetNumber = targetUser.split('@')[0];
            
            await reply(`💰 *@${targetNumber}'s Balance*\n\n` +
                       `💵 *Wallet:* ${ecoSettings.currency}${targetData.balance.toLocaleString()}\n` +
                       `🏦 *Bank:* ${ecoSettings.currency}${targetData.bank.toLocaleString()}\n` +
                       `💎 *Total Wealth:* ${ecoSettings.currency}${(targetData.balance + targetData.bank).toLocaleString()}`);
        } else {
            const userData = getUserData(senderId);
            await reply(`💰 *YOUR BALANCE* 💰\n\n` +
                       `💵 *Wallet:* ${ecoSettings.currency}${userData.balance.toLocaleString()}\n` +
                       `🏦 *Bank:* ${ecoSettings.currency}${userData.bank.toLocaleString()}\n` +
                       `💎 *Total Wealth:* ${ecoSettings.currency}${(userData.balance + userData.bank).toLocaleString()}\n\n` +
                       `💡 *Use ${config.PREFIX}profile for detailed stats*`);
        }
    },
    
    async handleSend(context, args) {
        const { reply, senderId, sock, message } = context;
        
        if (args.length < 2) {
            await reply(`⚠️ *Usage:*\n• Reply to someone: *${config.PREFIX}send amount*\n• Mention someone: *${config.PREFIX}send @user amount*\n• Use number: *${config.PREFIX}send 1234567890 amount*\n\n💡 *Example: ${config.PREFIX}send @user 1000*`);
            return;
        }
        
        const targetUser = getTargetUser(context, args[0]);
        let amount = parseInt(args[args.length - 1]); // Amount is usually the last argument
        
        // Try to find amount in args if not last
        if (isNaN(amount)) {
            for (const arg of args) {
                const potentialAmount = parseInt(arg);
                if (!isNaN(potentialAmount) && potentialAmount > 0) {
                    amount = potentialAmount;
                    break;
                }
            }
        }
        
        if (!targetUser) {
            await reply('⚠️ *Please specify a valid recipient*');
            return;
        }
        
        if (isNaN(amount) || amount <= 0) {
            await reply('⚠️ *Please provide a valid amount*');
            return;
        }
        
        if (targetUser === senderId) {
            await reply('🧠 *You cannot send money to yourself!*');
            return;
        }
        
        const senderData = getUserData(senderId);
        if (senderData.balance < amount) {
            await reply(`🚫 *Insufficient balance*\n\n💵 *Your Balance:* ${ecoSettings.currency}${senderData.balance.toLocaleString()}\n💸 *Required:* ${ecoSettings.currency}${amount.toLocaleString()}`);
            return;
        }
        
        // Process transaction
        initUser(targetUser);
        removeMoney(senderId, amount, 'Transfer sent');
        addMoney(targetUser, amount, 'Transfer received');
        
        const updatedSender = getUserData(senderId);
        const updatedTarget = getUserData(targetUser);
        
        await sock.sendMessage(message.key.remoteJid, {
            text: `✅ *TRANSFER SUCCESSFUL* ✅\n\n💸 *@${senderId.split('@')[0]}* sent *${ecoSettings.currency}${amount.toLocaleString()}* to *@${targetUser.split('@')[0]}*\n\n💵 *Sender's new balance:* ${ecoSettings.currency}${updatedSender.balance.toLocaleString()}\n💰 *Receiver's new balance:* ${ecoSettings.currency}${updatedTarget.balance.toLocaleString()}`,
            mentions: [senderId, targetUser]
        });
    },
    
    async handleDeposit(context, args) {
        const { reply, senderId } = context;
        
        if (args.length === 0) {
            await reply(`⚠️ *Usage:* ${config.PREFIX}deposit [amount]\n\n💡 *Example:* ${config.PREFIX}deposit 1000`);
            return;
        }
        
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount <= 0) {
            await reply('⚠️ *Please provide a valid amount to deposit*');
            return;
        }
        
        const userData = getUserData(senderId);
        if (userData.balance < amount) {
            await reply('🚫 *Insufficient wallet balance*');
            return;
        }
        
        updateUserData(senderId, {
            balance: userData.balance - amount,
            bank: userData.bank + amount
        });
        
        const updatedData = getUserData(senderId);
        await reply(`🏦 *Successfully deposited ${ecoSettings.currency}${amount.toLocaleString()} to your bank*\n\n💵 *New Wallet Balance:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}\n🏦 *New Bank Balance:* ${ecoSettings.currency}${updatedData.bank.toLocaleString()}`);
    },
    
    async handleWithdraw(context, args) {
        const { reply, senderId } = context;
        
        if (args.length === 0) {
            await reply(`⚠️ *Usage:* ${config.PREFIX}withdraw [amount]\n\n💡 *Example:* ${config.PREFIX}withdraw 1000`);
            return;
        }
        
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount <= 0) {
            await reply('⚠️ *Please provide a valid amount to withdraw*');
            return;
        }
        
        const userData = getUserData(senderId);
        if (userData.bank < amount) {
            await reply('🚫 *Insufficient bank balance*');
            return;
        }
        
        updateUserData(senderId, {
            balance: userData.balance + amount,
            bank: userData.bank - amount
        });
        
        const updatedData = getUserData(senderId);
        await reply(`💵 *Successfully withdrew ${ecoSettings.currency}${amount.toLocaleString()} from your bank*\n\n💵 *New Wallet Balance:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}\n🏦 *New Bank Balance:* ${ecoSettings.currency}${updatedData.bank.toLocaleString()}`);
    },
    
    async handleWork(context) {
        const { reply, senderId } = context;
        const now = Date.now();
        
        // Check cooldown
        const userData = getUserData(senderId);
        if (userData.lastWork && now - userData.lastWork < ecoSettings.workCooldownMinutes * 60 * 1000) {
            const remaining = Math.ceil((ecoSettings.workCooldownMinutes * 60 * 1000 - (now - userData.lastWork)) / 60000);
            await reply(`⏱️ *You're tired! Rest for ${remaining} minutes before working again.*`);
            return;
        }
        
        const randomJob = ecoSettings.workJobs[Math.floor(Math.random() * ecoSettings.workJobs.length)];
        const earnings = Math.floor(Math.random() * (randomJob.max - randomJob.min + 1)) + randomJob.min;
        
        updateUserData(senderId, {
            balance: userData.balance + earnings,
            lastWork: now
        });
        
        const updatedData = getUserData(senderId);
        await reply(`💼 *Work Complete!*\n\n🔨 *Job:* ${randomJob.name}\n💰 *Earned:* ${ecoSettings.currency}${earnings.toLocaleString()}\n💵 *New Balance:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}\n\n⏱️ *Next work available in ${ecoSettings.workCooldownMinutes} minutes*`);
    },
    
    async handleRob(context, args) {
        const { reply, senderId, sock, message } = context;
        
        if (args.length === 0) {
            await reply(`⚠️ *Usage:*\n• Reply to someone: *${config.PREFIX}rob*\n• Mention someone: *${config.PREFIX}rob @user*\n• Use number: *${config.PREFIX}rob 1234567890*\n\n💡 *Example: ${config.PREFIX}rob @username*`);
            return;
        }
        
        const targetUser = getTargetUser(context, args[0]);
        if (!targetUser) {
            await reply('⚠️ *Please specify a valid target*');
            return;
        }
        
        if (targetUser === senderId) {
            await reply('🧠 *You cannot rob yourself!*');
            return;
        }
        
        const now = Date.now();
        const robberData = getUserData(senderId);
        
        // Check cooldown
        if (robberData.lastRob && now - robberData.lastRob < ecoSettings.robCooldownMinutes * 60 * 1000) {
            const remaining = Math.ceil((ecoSettings.robCooldownMinutes * 60 * 1000 - (now - robberData.lastRob)) / 60000);
            await reply(`⏱️ *You're on cooldown. Try again in ${remaining} minutes.*`);
            return;
        }
        
        initUser(targetUser);
        const targetData = getUserData(targetUser);
        
        // Validation checks
        if (targetData.balance < ecoSettings.robMinTargetBalance) {
            await reply(`👀 *Target is too broke to rob*\n\n💸 *@${targetUser.split('@')[0]}* only has ${ecoSettings.currency}${targetData.balance.toLocaleString()}\n🚫 *Minimum required: ${ecoSettings.currency}${ecoSettings.robMinTargetBalance}*`);
            return;
        }
        
        if (robberData.balance < ecoSettings.robMinRobberBalance) {
            await reply(`💸 *Your balance is too low to attempt a robbery*\n\n💰 *Your balance:* ${ecoSettings.currency}${robberData.balance.toLocaleString()}\n⚠️ _You need at least ${ecoSettings.currency}${ecoSettings.robMinRobberBalance} in your wallet to bail yourself in case you get caught and arrested._`);
            return;
        }
        
        // Process robbery attempt
        const success = Math.random() < ecoSettings.robSuccessRate;
        
        updateUserData(senderId, { lastRob: now });
        
        if (success) {
            const maxSteal = Math.floor(targetData.balance * ecoSettings.robMaxStealPercent);
            const stolen = Math.floor(Math.random() * maxSteal) + ecoSettings.robMinSteal;
            
            updateUserData(targetUser, { balance: targetData.balance - stolen });
            updateUserData(senderId, { balance: robberData.balance + stolen });
            
            const updatedRobber = getUserData(senderId);
            const updatedTarget = getUserData(targetUser);
            
            await sock.sendMessage(message.key.remoteJid, {
                text: `🦹‍♂️ *ROBBERY SUCCESS!* 🦹‍♂️\n\n💰 *@${senderId.split('@')[0]}* successfully robbed *${ecoSettings.currency}${stolen.toLocaleString()}* from *@${targetUser.split('@')[0]}*\n\n🤑 *Robber's new balance:* ${ecoSettings.currency}${updatedRobber.balance.toLocaleString()}\n😭 *Victim's new balance:* ${ecoSettings.currency}${updatedTarget.balance.toLocaleString()}\n\n⏱️ *Cooldown:* ${ecoSettings.robCooldownMinutes} minutes`,
                mentions: [senderId, targetUser]
            });
        } else {
            updateUserData(senderId, { balance: robberData.balance - ecoSettings.robFailPenalty });
            updateUserData(targetUser, { balance: targetData.balance + ecoSettings.robFailPenalty });
            
            const updatedRobber = getUserData(senderId);
            const updatedTarget = getUserData(targetUser);
            
            await sock.sendMessage(message.key.remoteJid, {
                text: `🚨 *ROBBERY FAILED!* 🚨\n\n❌ *@${senderId.split('@')[0]}* got caught trying to rob *@${targetUser.split('@')[0]}* and has been arrested.\n\n💸 *Bail paid:* ${ecoSettings.currency}${ecoSettings.robFailPenalty.toLocaleString()}\n😔 *Robber's new balance:* ${ecoSettings.currency}${updatedRobber.balance.toLocaleString()}\n😊 *Victim's new balance:* ${ecoSettings.currency}${updatedTarget.balance.toLocaleString()}\n\n⏱️ *Cooldown:* ${ecoSettings.robCooldownMinutes} minutes`,
                mentions: [senderId, targetUser]
            });
        }
    },
    
    async handleDaily(context) {
        const { reply, senderId } = context;
        
        const currentDate = getCurrentDate();
        const userData = getUserData(senderId);
        
        if (userData.lastDaily === currentDate) {
            await reply('⏰ *You have already claimed your daily reward today! Come back tomorrow.*');
            return;
        }
        
        const dailyAmount = Math.floor(Math.random() * (ecoSettings.dailyMaxAmount - ecoSettings.dailyMinAmount + 1)) + ecoSettings.dailyMinAmount;
        
        // Calculate streak
        const yesterday = getNigeriaTime().subtract(1, 'day').format('DD-MM-YYYY');
        let newStreak = 1;
        
        if (userData.lastDaily === yesterday) {
            newStreak = (userData.streak || 0) + 1;
        }
        
        const newLongestStreak = Math.max(userData.longestStreak || 0, newStreak);
        
        updateUserData(senderId, {
            balance: userData.balance + dailyAmount,
            lastDaily: currentDate,
            streak: newStreak,
            longestStreak: newLongestStreak,
            totalAttendances: (userData.totalAttendances || 0) + 1
        });
        
        const updatedData = getUserData(senderId);
        
        await reply(`🎁 *Daily Reward Claimed!*\n\n💰 *Received:* ${ecoSettings.currency}${dailyAmount.toLocaleString()}\n💵 *New Balance:* ${ecoSettings.currency}${updatedData.balance.toLocaleString()}\n🔥 *Current Streak:* ${newStreak} days\n\n✨ *Come back tomorrow for another reward!*\n⏰ *Nigeria Time:* ${getNigeriaTime().format('DD/MM/YYYY HH:mm:ss')}`);
    },
    
    async handleProfile(context, args) {
        const { reply, senderId, sock, message } = context;
        const targetUser = args.length > 0 ? getTargetUser(context, args.join(' ')) : senderId;
        
        initUser(targetUser);
        const profileData = getUserData(targetUser);
        const profileWealth = profileData.balance + profileData.bank;
        const today = getCurrentDate();
        
        await sock.sendMessage(message.key.remoteJid, {
            text: `👤 *USER PROFILE* 👤\n\n📱 *User:* @${targetUser.split('@')[0]}\n🏅 *Rank:* ${profileData.rank}\n💰 *Total Wealth:* ${ecoSettings.currency}${profileWealth.toLocaleString()}\n💵 *Wallet:* ${ecoSettings.currency}${profileData.balance.toLocaleString()}\n🏦 *Bank:* ${ecoSettings.currency}${profileData.bank.toLocaleString()}\n🎯 *Bounty:* ${ecoSettings.currency}${profileData.bounty.toLocaleString()}\n🛡️ *Clan:* ${profileData.clan || 'None'}\n\n📊 *ATTENDANCE RECORD*\n📅 *Last Attendance:* ${profileData.lastAttendance || 'Never'}\n✅ *Today's Status:* ${profileData.lastAttendance === today ? 'Marked ✅' : 'Not marked ❌'}\n📋 *Total Attendances:* ${profileData.totalAttendances}\n🔥 *Current Streak:* ${profileData.streak} days\n🏆 *Longest Streak:* ${profileData.longestStreak} days\n\n⏰ *Current Nigeria Time:* ${getNigeriaTime().format('DD/MM/YYYY HH:mm:ss')}`,
            mentions: [targetUser]
        });
    },
    
    async handleLeaderboard(context) {
        const { reply, sock, message } = context;
        const db = loadDatabase();
        
        const users = Object.entries(db.users)
            .map(([id, data]) => ({ 
                id, 
                wealth: data.balance + data.bank, 
                attendances: data.totalAttendances || 0, 
                streak: data.streak || 0 
            }))
            .sort((a, b) => b.wealth - a.wealth)
            .slice(0, 10);
        
        let lb = '🏆 *ECONOMY LEADERBOARD* 🏆\n\n';
        users.forEach((userEntry, index) => {
            const rank = index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            lb += `${rank} @${userEntry.id.split('@')[0]}\n`;
            lb += `   💰 ${ecoSettings.currency}${userEntry.wealth.toLocaleString()} | 📋 ${userEntry.attendances} | 🔥 ${userEntry.streak}\n\n`;
        });
        
        await sock.sendMessage(message.key.remoteJid, {
            text: lb,
            mentions: users.map(u => u.id)
        });
    },
    
    async handleClan(context, args) {
        const { reply, senderId, sock, message } = context;
        
        if (args.length === 0) {
            await reply(`🛡️ *Clan Commands:*\n\n• *${config.PREFIX}clan create [name]* - Create a clan\n• *${config.PREFIX}clan join [name]* - Join a clan\n• *${config.PREFIX}clan leave* - Leave your clan\n• *${config.PREFIX}clan disband* - Disband your clan (leader only)\n• *${config.PREFIX}clan info* - View clan information\n• *${config.PREFIX}clan list* - View all clans\n• *${config.PREFIX}clan members* - View clan members`);
            return;
        }
        
        const subcmd = args[0].toLowerCase();
        const clanName = args.slice(1).join(' ');
        const db = loadDatabase();
        
        // Initialize clans object if it doesn't exist
        if (!db.clans) {
            db.clans = {};
        }
        
        const userData = getUserData(senderId);
        
        switch (subcmd) {
            case 'create':
                if (!clanName) {
                    await reply('⚠️ *Please provide a clan name*');
                    return;
                }
                if (userData.clan) {
                    await reply('🚫 *You are already in a clan*');
                    return;
                }
                if (db.clans[clanName]) {
                    await reply('⚠️ *Clan name already exists*');
                    return;
                }
                if (userData.balance < ecoSettings.clanCreationCost) {
                    await reply(`💸 *You need ${ecoSettings.currency}${ecoSettings.clanCreationCost.toLocaleString()} to create a clan*`);
                    return;
                }
                
                db.clans[clanName] = {
                    name: clanName,
                    leader: senderId,
                    members: [senderId],
                    level: 1,
                    bank: 0,
                    created: getNigeriaTime().toISOString()
                };
                
                updateUserData(senderId, {
                    clan: clanName,
                    balance: userData.balance - ecoSettings.clanCreationCost
                });
                
                saveDatabase(db);
                
                await reply(`✅ *Clan "${clanName}" created successfully!*\n\n👑 *You are now the clan leader*\n💰 *${ecoSettings.currency}${ecoSettings.clanCreationCost.toLocaleString()} deducted as creation fee*`);
                break;
                
            case 'join':
                if (!clanName || !db.clans[clanName]) {
                    await reply('❌ *Clan not found*');
                    return;
                }
                if (userData.clan) {
                    await reply('🚫 *You are already in a clan*');
                    return;
                }
                
                db.clans[clanName].members.push(senderId);
                updateUserData(senderId, { clan: clanName });
                saveDatabase(db);
                
                await reply(`✅ *You have joined clan "${clanName}"!*`);
                break;
                
            case 'leave':
                if (!userData.clan || !db.clans[userData.clan]) {
                    await reply('⚠️ *You are not in any clan*');
                    return;
                }
                if (db.clans[userData.clan].leader === senderId) {
                    await reply('🚫 *Clan leaders cannot leave. Use clan disband instead*');
                    return;
                }
                
                db.clans[userData.clan].members = db.clans[userData.clan].members.filter(u => u !== senderId);
                updateUserData(senderId, { clan: null });
                saveDatabase(db);
                
                await reply(`✅ *You have left clan "${userData.clan}"*`);
                break;
                
            case 'disband':
                if (!userData.clan || !db.clans[userData.clan]) {
                    await reply('❌ *You are not in any clan*');
                    return;
                }
                if (db.clans[userData.clan].leader !== senderId) {
                    await reply('🚫 *Only the clan leader can disband the clan*');
                    return;
                }
                
                const clanToDisband = userData.clan;
                db.clans[clanToDisband].members.forEach(member => {
                    if (db.users[member]) {
                        db.users[member].clan = null;
                    }
                });
                
                delete db.clans[clanToDisband];
                saveDatabase(db);
                
                await reply(`💥 *Clan "${clanToDisband}" has been disbanded*`);
                break;
                
            case 'info':
                if (!userData.clan || !db.clans[userData.clan]) {
                    await reply('⚠️ *You are not in any clan*');
                    return;
                }
                
                const clan = db.clans[userData.clan];
                await sock.sendMessage(message.key.remoteJid, {
                    text: `🏰 *Clan Information*\n\n🛡️ *Name:* ${clan.name}\n👑 *Leader:* @${clan.leader.split('@')[0]}\n👥 *Members:* ${clan.members.length}\n🏅 *Level:* ${clan.level}\n💰 *Clan Bank:* ${ecoSettings.currency}${clan.bank.toLocaleString()}\n📅 *Created:* ${getNigeriaTime(clan.created).format('DD/MM/YYYY')}`,
                    mentions: [clan.leader]
                });
                break;
                
            case 'members':
                if (!userData.clan || !db.clans[userData.clan]) {
                    await reply('⚠️ *You are not in any clan*');
                    return;
                }
                
                const clanData = db.clans[userData.clan];
                let membersList = `👥 *${clanData.name} MEMBERS* 👥\n\n👑 *Leader:* @${clanData.leader.split('@')[0]}\n\n👤 *Members:*\n`;
                
                clanData.members.forEach((member, index) => {
                    if (member !== clanData.leader) {
                        membersList += `${index}. @${member.split('@')[0]}\n`;
                    }
                });
                
                await sock.sendMessage(message.key.remoteJid, {
                    text: membersList,
                    mentions: clanData.members
                });
                break;
                
            case 'list':
                if (Object.keys(db.clans).length === 0) {
                    await reply('📜 *No clans exist yet*');
                    return;
                }
                
                let clanList = '🏰 *ALL CLANS* 🏰\n\n';
                Object.values(db.clans).forEach((clanEntry, index) => {
                    clanList += `${index + 1}. *${clanEntry.name}*\n`;
                    clanList += `   👑 ${clanEntry.leader.split('@')[0]} | 👥 ${clanEntry.members.length} members\n\n`;
                });
                
                await reply(clanList);
                break;
                
            default:
                await reply('⚠️ *Unknown clan command. Use clan for help*');
        }
    },
    
    async handleShop(context) {
        const { reply } = context;
        
        await reply(`🛍️ *ECONOMY SHOP* 🛍️\n\n🚧 *Coming Soon!* 🚧\n\nStay tuned for items you can buy with your hard-earned ${ecoSettings.currency}!\n\n💡 *Suggestions for shop items:*\n• 🛡️ Protection items\n• 💎 Premium roles\n• 🎁 Special rewards\n• ⚡ Power-ups`);
    },
    
    async handleInventory(context) {
        const { reply, senderId } = context;
        const userData = getUserData(senderId);
        
        if (!userData.inventory || userData.inventory.length === 0) {
            await reply('📦 *Your inventory is empty*\n\n🛍️ Visit the shop to buy items!');
            return;
        }
        
        let invText = '📦 *YOUR INVENTORY* 📦\n\n';
        userData.inventory.forEach((item, index) => {
            invText += `${index + 1}. ${item.name} x${item.quantity}\n`;
        });
        
        await reply(invText);
    },
    
    async handleSettings(context, args) {
        const { reply, senderId } = context;
        
        if (!isAdmin(senderId) && !isOwner(senderId)) {
            await reply('🚫 *Only admins can access economy settings*');
            return;
        }
        
        if (args.length === 0) {
            let settingsText = `⚙️ *ECONOMY SETTINGS* ⚙️\n\n`;
            settingsText += `💰 *Economy:*\n`;
            settingsText += `• Starting Balance: ${ecoSettings.currency}${ecoSettings.startingBalance}\n`;
            settingsText += `• Starting Bank: ${ecoSettings.currency}${ecoSettings.startingBankBalance}\n`;
            settingsText += `• Currency: ${ecoSettings.currency}\n\n`;
            settingsText += `🎁 *Daily Rewards:*\n`;
            settingsText += `• Min Amount: ${ecoSettings.currency}${ecoSettings.dailyMinAmount}\n`;
            settingsText += `• Max Amount: ${ecoSettings.currency}${ecoSettings.dailyMaxAmount}\n\n`;
            settingsText += `💼 *Work:*\n`;
            settingsText += `• Cooldown: ${ecoSettings.workCooldownMinutes} minutes\n`;
            settingsText += `• Jobs: ${ecoSettings.workJobs.length} available\n\n`;
            settingsText += `🦹 *Robbery:*\n`;
            settingsText += `• Success Rate: ${(ecoSettings.robSuccessRate * 100)}%\n`;
            settingsText += `• Cooldown: ${ecoSettings.robCooldownMinutes} minutes\n`;
            settingsText += `• Max Steal: ${(ecoSettings.robMaxStealPercent * 100)}%\n\n`;
            settingsText += `💡 *Use:* ${config.PREFIX}economy settings set [setting] [value]`;
            
            await reply(settingsText);
            return;
        }
        
        if (args[0] === 'set' && args.length >= 3) {
            const setting = args[1];
            const value = args[2];
            
            // Handle different setting types
            let newValue = value;
            if (['startingBalance', 'dailyMinAmount', 'dailyMaxAmount', 'workCooldownMinutes', 'robCooldownMinutes'].includes(setting)) {
                newValue = parseInt(value);
                if (isNaN(newValue)) {
                    await reply('⚠️ *Value must be a number*');
                    return;
                }
            } else if (['robSuccessRate', 'robMaxStealPercent'].includes(setting)) {
                newValue = parseFloat(value);
                if (isNaN(newValue) || newValue < 0 || newValue > 1) {
                    await reply('⚠️ *Rate must be between 0 and 1 (e.g., 0.4 for 40%)*');
                    return;
                }
            }
            
            if (ecoSettings.hasOwnProperty(setting)) {
                ecoSettings[setting] = newValue;
                saveSettings();
                await reply(`✅ *Setting updated successfully!*\n\n📝 *${setting}* = ${newValue}`);
            } else {
                await reply('❌ *Invalid setting name*');
            }
        } else {
            await reply(`⚠️ *Usage:* ${config.PREFIX}economy settings set [setting] [value]`);
        }
    }
};

// Export functions for use by other plugins
export { addMoney, removeMoney, getUserData, updateUserData, initUser, ecoSettings };
