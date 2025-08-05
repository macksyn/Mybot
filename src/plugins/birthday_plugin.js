import fs from 'fs';
import path from 'path';
import moment from 'moment-timezone';
import { fileURLToPath } from 'url';
import { isAdmin, isOwner } from '../utils/helpers.js';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { getAllBirthdays, getBirthdayData } from './attendance.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Database paths
const dbPath = path.join(__dirname, '../../database.json');
const settingsPath = path.join(__dirname, '../../birthday_settings.json');

// Default birthday settings
const defaultSettings = {
    enableReminders: true,
    enableAutoWishes: true,
    reminderDays: [7, 3, 1], // Days before birthday to send reminders
    reminderTime: '09:00', // Time to send reminders (24h format)
    wishTime: '00:01', // Time to send birthday wishes (just after midnight)
    enableGroupReminders: true,
    enablePrivateReminders: true,
    reminderGroups: [], // Groups to send reminders to
    adminNumbers: []
};

// Load settings
let birthdaySettings = defaultSettings;
if (fs.existsSync(settingsPath)) {
    try {
        const loadedSettings = JSON.parse(fs.readFileSync(settingsPath));
        birthdaySettings = { ...defaultSettings, ...loadedSettings };
    } catch (error) {
        logger.error('Error loading birthday settings:', error);
        birthdaySettings = defaultSettings;
    }
}

// Save settings
function saveSettings() {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(birthdaySettings, null, 2));
    } catch (error) {
        logger.error('Error saving birthday settings:', error);
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

// Check if user is authorized
function isAuthorized(senderId) {
    return birthdaySettings.adminNumbers.includes(senderId) || isAdmin(senderId) || isOwner(senderId);
}

// Get today's birthdays
function getTodaysBirthdays() {
    const today = moment.tz('Africa/Lagos');
    const todayKey = `${String(today.month() + 1).padStart(2, '0')}-${String(today.date()).padStart(2, '0')}`;
    
    const allBirthdays = getAllBirthdays();
    const todaysBirthdays = [];
    
    Object.values(allBirthdays).forEach(entry => {
        if (entry.birthday.searchKey === todayKey) {
            todaysBirthdays.push(entry);
        }
    });
    
    return todaysBirthdays;
}

// Get upcoming birthdays for reminders
function getUpcomingBirthdays(daysAhead) {
    const targetDate = moment.tz('Africa/Lagos').add(daysAhead, 'days');
    const targetKey = `${String(targetDate.month() + 1).padStart(2, '0')}-${String(targetDate.date()).padStart(2, '0')}`;
    
    const allBirthdays = getAllBirthdays();
    const upcomingBirthdays = [];
    
    Object.values(allBirthdays).forEach(entry => {
        if (entry.birthday.searchKey === targetKey) {
            upcomingBirthdays.push(entry);
        }
    });
    
    return upcomingBirthdays;
}

// Generate birthday wish message
function getBirthdayWishMessage(birthdayPerson) {
    const wishes = [
        `🎉🎂 HAPPY BIRTHDAY ${birthdayPerson.name.toUpperCase()}! 🎂🎉\n\nWishing you a day filled with happiness and a year filled with joy! 🎈✨`,
        
        `🎊 Happy Birthday to our amazing ${birthdayPerson.name}! 🎊\n\nMay your special day be surrounded with happiness, filled with laughter, wrapped with pleasure and painted with fun! 🎨🎁`,
        
        `🌟 It's ${birthdayPerson.name}'s Birthday! 🌟\n\n🎂 Another year older, another year wiser, another year more awesome! May all your dreams come true! ✨🎉`,
        
        `🎈 BIRTHDAY ALERT! 🎈\n\nIt's ${birthdayPerson.name}'s special day! 🎂 Let's celebrate this wonderful person who brings joy to our group! 🎊🎉`,
        
        `🎵 Happy Birthday to you! 🎵\n🎵 Happy Birthday to you! 🎵\n🎵 Happy Birthday dear ${birthdayPerson.name}! 🎵\n🎵 Happy Birthday to you! 🎵\n\n🎂 Hope your day is as special as you are! 🌟`
    ];
    
    const randomWish = wishes[Math.floor(Math.random() * wishes.length)];
    
    let message = randomWish;
    
    // Add age if available
    if (birthdayPerson.birthday.age !== undefined) {
        message += `\n\n🎈 Celebrating ${birthdayPerson.birthday.age} wonderful years! 🎈`;
    }
    
    message += `\n\n💝 From your friends at GIST HQ! 💝`;
    
    return message;
}

// Generate reminder message
function getReminderMessage(birthdayPerson, daysUntil) {
    let message;
    
    if (daysUntil === 1) {
        message = `🎂 *BIRTHDAY REMINDER* 🎂\n\n📅 Tomorrow is ${birthdayPerson.name}'s birthday!\n\n🎁 Don't forget to wish them well! 🎉`;
    } else {
        message = `🎂 *BIRTHDAY REMINDER* 🎂\n\n📅 ${birthdayPerson.name}'s birthday is in ${daysUntil} days!\n\n🗓️ Mark your calendar: ${birthdayPerson.birthday.displayDate} 🎉`;
    }
    
    if (birthdayPerson.birthday.age !== undefined) {
        const upcomingAge = birthdayPerson.birthday.age + 1;
        message += `\n\n🎈 They'll be turning ${upcomingAge}! 🎈`;
    }
    
    return message;
}

// Send birthday wishes
async function sendBirthdayWishes(sock) {
    if (!birthdaySettings.enableAutoWishes) {
        return;
    }
    
    const todaysBirthdays = getTodaysBirthdays();
    
    if (todaysBirthdays.length === 0) {
        return;
    }
    
    logger.info(`🎂 Found ${todaysBirthdays.length} birthday(s) today!`);
    
    const db = loadDatabase();
    
    for (const birthdayPerson of todaysBirthdays) {
        const wishMessage = getBirthdayWishMessage(birthdayPerson);
        
        try {
            // Send private wish to the birthday person
            if (birthdaySettings.enablePrivateReminders) {
                await sock.sendMessage(birthdayPerson.userId, {
                    text: `🎉 *HAPPY BIRTHDAY!* 🎉\n\n${birthdayPerson.name}, today is your special day! 🎂\n\nWishing you all the happiness in the world! ✨🎈\n\nEnjoy your celebration! 🎊`
                });
                
                logger.info(`✅ Sent private birthday wish to ${birthdayPerson.name}`);
            }
            
            // Send to configured groups
            if (birthdaySettings.enableGroupReminders && birthdaySettings.reminderGroups.length > 0) {
                for (const groupId of birthdaySettings.reminderGroups) {
                    try {
                        await sock.sendMessage(groupId, {
                            text: wishMessage,
                            mentions: [birthdayPerson.userId]
                        });
                        
                        logger.info(`✅ Sent birthday wish to group ${groupId} for ${birthdayPerson.name}`);
                    } catch (error) {
                        logger.error(`Error sending birthday wish to group ${groupId}:`, error);
                    }
                }
            }
            
            // Mark as wished for today (to avoid duplicate wishes)
            if (!db.birthdayWishes) db.birthdayWishes = {};
            const today = moment.tz('Africa/Lagos').format('YYYY-MM-DD');
            if (!db.birthdayWishes[today]) db.birthdayWishes[today] = [];
            db.birthdayWishes[today].push(birthdayPerson.userId);
            
        } catch (error) {
            logger.error(`Error sending birthday wish to ${birthdayPerson.name}:`, error);
        }
    }
    
    if (todaysBirthdays.length > 0) {
        saveDatabase(db);
    }
}

// Send birthday reminders
async function sendBirthdayReminders(sock) {
    if (!birthdaySettings.enableReminders) {
        return;
    }
    
    const db = loadDatabase();
    if (!db.birthdayReminders) db.birthdayReminders = {};
    const today = moment.tz('Africa/Lagos').format('YYYY-MM-DD');
    
    for (const daysAhead of birthdaySettings.reminderDays) {
        const upcomingBirthdays = getUpcomingBirthdays(daysAhead);
        
        if (upcomingBirthdays.length === 0) continue;
        
        logger.info(`📅 Found ${upcomingBirthdays.length} birthday(s) in ${daysAhead} days`);
        
        for (const birthdayPerson of upcomingBirthdays) {
            const reminderKey = `${today}-${birthdayPerson.userId}-${daysAhead}`;
            
            // Skip if reminder already sent today for this person and days ahead
            if (db.birthdayReminders[reminderKey]) {
                continue;
            }
            
            const reminderMessage = getReminderMessage(birthdayPerson, daysAhead);
            
            try {
                // Send to configured groups
                if (birthdaySettings.enableGroupReminders && birthdaySettings.reminderGroups.length > 0) {
                    for (const groupId of birthdaySettings.reminderGroups) {
                        try {
                            await sock.sendMessage(groupId, {
                                text: reminderMessage,
                                mentions: [birthdayPerson.userId]
                            });
                            
                            logger.info(`✅ Sent ${daysAhead}-day reminder to group ${groupId} for ${birthdayPerson.name}`);
                        } catch (error) {
                            logger.error(`Error sending reminder to group ${groupId}:`, error);
                        }
                    }
                }
                
                // Mark reminder as sent
                db.birthdayReminders[reminderKey] = true;
                
            } catch (error) {
                logger.error(`Error sending birthday reminder for ${birthdayPerson.name}:`, error);
            }
        }
    }
    
    saveDatabase(db);
}

// Clean up old reminder records (keep only last 30 days)
function cleanupReminderRecords() {
    try {
        const db = loadDatabase();
        
        if (db.birthdayWishes) {
            const cutoffDate = moment.tz('Africa/Lagos').subtract(30, 'days').format('YYYY-MM-DD');
            Object.keys(db.birthdayWishes).forEach(date => {
                if (date < cutoffDate) {
                    delete db.birthdayWishes[date];
                }
            });
        }
        
        if (db.birthdayReminders) {
            const cutoffDate = moment.tz('Africa/Lagos').subtract(30, 'days').format('YYYY-MM-DD');
            Object.keys(db.birthdayReminders).forEach(key => {
                const [date] = key.split('-');
                if (date < cutoffDate) {
                    delete db.birthdayReminders[key];
                }
            });
        }
        
        saveDatabase(db);
    } catch (error) {
        logger.error('Error cleaning up reminder records:', error);
    }
}

// Birthday scheduler class
class BirthdayScheduler {
    constructor(sock) {
        this.sock = sock;
        this.intervals = [];
        this.running = false;
    }
    
    start() {
        if (this.running) return;
        this.running = true;
        
        logger.info('🎂 Birthday scheduler started');
        
        // Check for birthdays every minute
        const birthdayInterval = setInterval(async () => {
            const now = moment.tz('Africa/Lagos');
            
            // Send birthday wishes at the specified time
            if (now.format('HH:mm') === birthdaySettings.wishTime) {
                await sendBirthdayWishes(this.sock);
            }
            
            // Send reminders at the specified time
            if (now.format('HH:mm') === birthdaySettings.reminderTime) {
                await sendBirthdayReminders(this.sock);
            }
            
            // Clean up old records once a day at midnight
            if (now.format('HH:mm') === '00:00') {
                cleanupReminderRecords();
            }
            
        }, 60000); // Check every minute
        
        this.intervals.push(birthdayInterval);
        
        // Also check immediately on start
        setTimeout(async () => {
            const now = moment.tz('Africa/Lagos');
            if (now.format('HH:mm') === birthdaySettings.wishTime) {
                await sendBirthdayWishes(this.sock);
            }
            if (now.format('HH:mm') === birthdaySettings.reminderTime) {
                await sendBirthdayReminders(this.sock);
            }
        }, 5000);
    }
    
    stop() {
        this.running = false;
        this.intervals.forEach(interval => clearInterval(interval));
        this.intervals = [];
        logger.info('🎂 Birthday scheduler stopped');
    }
    
    restart() {
        this.stop();
        setTimeout(() => this.start(), 1000);
    }
}

// Global scheduler instance
let birthdayScheduler = null;

// Initialize scheduler
function initializeBirthdayScheduler(sock) {
    if (birthdayScheduler) {
        birthdayScheduler.stop();
    }
    
    birthdayScheduler = new BirthdayScheduler(sock);
    birthdayScheduler.start();
    
    return birthdayScheduler;
}

export default {
    name: 'birthday',
    description: 'Birthday management system with automatic reminders and wishes',
    usage: `${config.PREFIX}birthday today | ${config.PREFIX}birthday upcoming | ${config.PREFIX}birthday settings`,
    category: 'birthday',
    aliases: ['bday', 'birthdays'],
    
    // Initialize scheduler when plugin loads
    async initialize(sock) {
        initializeBirthdayScheduler(sock);
    },
    
    async execute(context) {
        const { args, reply, senderId, sock, message } = context;
        
        if (args.length === 0) {
            await this.showBirthdayMenu(reply);
            return;
        }
        
        const subCommand = args[0].toLowerCase();
        const subArgs = args.slice(1);
        
        switch (subCommand) {
            case 'today':
                await this.handleToday(context);
                break;
            case 'upcoming':
                await this.handleUpcoming(context, subArgs);
                break;
            case 'this':
                if (subArgs[0] && subArgs[0].toLowerCase() === 'month') {
                    await this.handleThisMonth(context);
                } else {
                    await reply(`❓ Did you mean *${config.PREFIX}birthday thismonth*?`);
                }
                break;
            case 'thismonth':
                await this.handleThisMonth(context);
                break;
            case 'all':
                await this.handleAll(context);
                break;
            case 'settings':
                await this.handleSettings(context, subArgs);
                break;
            case 'test':
                await this.handleTest(context, subArgs);
                break;
            case 'groups':
                await this.handleGroups(context, subArgs);
                break;
            case 'help':
                await this.showBirthdayMenu(reply);
                break;
            default:
                await reply(`❓ Unknown birthday command: *${subCommand}*\n\nUse *${config.PREFIX}birthday help* to see available commands.`);
        }
    },
    
    async showBirthdayMenu(reply) {
        const menuText = `🎂 *BIRTHDAY SYSTEM* 🎂\n\n` +
                        `📅 *View Commands:*\n` +
                        `• *today* - Today's birthdays\n` +
                        `• *upcoming [days]* - Upcoming birthdays (default: 7 days)\n` +
                        `• *thismonth* - This month's birthdays\n` +
                        `• *all* - All recorded birthdays\n\n` +
                        `👑 *Admin Commands:*\n` +
                        `• *settings* - View/modify settings\n` +
                        `• *groups* - Manage reminder groups\n` +
                        `• *test* - Test birthday functions\n\n` +
                        `🤖 *Features:*\n` +
                        `• Automatic birthday wishes at midnight\n` +
                        `• Configurable reminders (7, 3, 1 days before)\n` +
                        `• Group and private notifications\n\n` +
                        `💡 *Usage:* ${config.PREFIX}birthday [command]`;
        
        await reply(menuText);
    },
    
    async handleToday(context) {
        const { reply, sock, message } = context;
        
        const todaysBirthdays = getTodaysBirthdays();
        
        if (todaysBirthdays.length === 0) {
            await reply(`🎂 *No birthdays today*\n\n📅 Check upcoming birthdays with *${config.PREFIX}birthday upcoming*`);
            return;
        }
        
        let message_text = `🎉 *TODAY'S BIRTHDAYS* 🎉\n\n`;
        
        todaysBirthdays.forEach(person => {
            message_text += `🎂 **${person.name}**\n`;
            if (person.birthday.age !== undefined) {
                message_text += `   🎈 Turning ${person.birthday.age} today!\n`;
            }
        });
        
        message_text += `\n🎊 *Let's wish them a happy birthday!* 🎊`;
        
        const mentions = todaysBirthdays.map(person => person.userId);
        
        await sock.sendMessage(message.key.remoteJid, {
            text: message_text,
            mentions: mentions
        });
    },
    
    async handleUpcoming(context, args) {
        const { reply } = context;
        
        const days = args.length > 0 ? parseInt(args[0]) : 7;
        if (isNaN(days) || days < 1 || days > 365) {
            await reply('⚠️ *Please provide a valid number of days (1-365)*');
            return;
        }
        
        const allBirthdays = getAllBirthdays();
        const birthdayEntries = Object.values(allBirthdays);
        const today = new Date();
        const upcomingBirthdays = [];
        
        birthdayEntries.forEach(entry => {
            const birthday = entry.birthday;
            const thisYear = today.getFullYear();
            const nextBirthday = new Date(thisYear, birthday.month - 1, birthday.day);
            
            if (nextBirthday < today) {
                nextBirthday.setFullYear(thisYear + 1);
            }
            
            const daysUntil = Math.ceil((nextBirthday - today) / (1000 * 60 * 60 * 24));
            
            if (daysUntil >= 0 && daysUntil <= days) {
                upcomingBirthdays.push({
                    ...entry,
                    daysUntil: daysUntil
                });
            }
        });
        
        if (upcomingBirthdays.length === 0) {
            await reply(`📅 *No birthdays in the next ${days} days*\n\nTry checking a longer period or use *${config.PREFIX}birthday thismonth*`);
            return;
        }
        
        upcomingBirthdays.sort((a, b) => a.daysUntil - b.daysUntil);
        
        let message = `📅 *UPCOMING BIRTHDAYS (Next ${days} days)* 📅\n\n`;
        
        upcomingBirthdays.forEach(upcoming => {
            if (upcoming.daysUntil === 0) {
                message += `🎊 **${upcoming.name}** - TODAY! 🎊\n`;
            } else if (upcoming.daysUntil === 1) {
                message += `🎂 **${upcoming.name}** - Tomorrow\n`;
            } else {
                message += `📌 **${upcoming.name}** - ${upcoming.daysUntil} days (${upcoming.birthday.monthName} ${upcoming.birthday.day})\n`;
            }
            
            if (upcoming.birthday.age !== undefined) {
                const upcomingAge = upcoming.birthday.age + (upcoming.daysUntil === 0 ? 0 : 1);
                message += `   🎈 ${upcoming.daysUntil === 0 ? 'Turned' : 'Turning'} ${upcomingAge}\n`;
            }
            
            message += '\n';
        });
        
        await reply(message);
    },
    
    async handleThisMonth(context) {
        const { reply } = context;
        
        const currentMonth = moment.tz('Africa/Lagos').month() + 1; // moment months are 0-indexed
        const allBirthdays = getAllBirthdays();
        const thisMonthBirthdays = [];
        
        Object.values(allBirthdays).forEach(entry => {
            if (entry.birthday.month === currentMonth) {
                thisMonthBirthdays.push(entry);
            }
        });
        
        if (thisMonthBirthdays.length === 0) {
            const monthName = moment.tz('Africa/Lagos').format('MMMM');
            await reply(`📅 *No birthdays in ${monthName}*\n\nUse *${config.PREFIX}birthday all* to see all recorded birthdays`);
            return;
        }
        
        // Sort by day
        thisMonthBirthdays.sort((a, b) => a.birthday.day - b.birthday.day);
        
        const monthName = moment.tz('Africa/Lagos').format('MMMM YYYY');
        let message = `📅 *${monthName.toUpperCase()} BIRTHDAYS* 📅\n\n`;
        
        thisMonthBirthdays.forEach(person => {
            message += `🎂 **${person.name}** - ${person.birthday.monthName} ${person.birthday.day}`;
            
            if (person.birthday.age !== undefined) {
                message += ` (${person.birthday.age} years old)`;
            }
            
            // Check if birthday has passed this month
            const today = moment.tz('Africa/Lagos');
            if (person.birthday.month === today.month() + 1) {
                if (person.birthday.day === today.date()) {
                    message += ` 🎊 TODAY!`;
                } else if (person.birthday.day < today.date()) {
                    message += ` ✅ Celebrated`;
                } else {
                    const daysLeft = person.birthday.day - today.date();
                    message += ` (${daysLeft} days left)`;
                }
            }
            
            message += '\n';
        });
        
        await reply(message);
    },
    
    async handleAll(context) {
        const { reply, senderId } = context;
        
        if (!isAuthorized(senderId)) {
            await reply('🚫 Only admins can view all birthdays.');
            return;
        }
        
        const allBirthdays = getAllBirthdays();
        const birthdayEntries = Object.values(allBirthdays);
        
        if (birthdayEntries.length === 0) {
            await reply(`🎂 *No birthdays recorded*\n\nBirthdays are automatically saved when members submit attendance forms with valid D.O.B information.`);
            return;
        }
        
        // Sort by month and day
        birthdayEntries.sort((a, b) => {
            if (a.birthday.month !== b.birthday.month) {
                return a.birthday.month - b.birthday.month;
            }
            return a.birthday.day - b.birthday.day;
        });
        
        let message = `🎂 *ALL BIRTHDAYS* 🎂\n\n📊 Total: ${birthdayEntries.length} members\n\n`;
        
        //