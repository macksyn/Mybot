import fs from 'fs';
import path from 'path';
import moment from 'moment-timezone';
import { fileURLToPath } from 'url';
import { isAdmin, isOwner } from '../utils/helpers.js';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { addMoney, getUserData, updateUserData, initUser } from './economy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set Nigeria timezone
moment.tz.setDefault('Africa/Lagos');

// Database paths
const dbPath = path.join(__dirname, '../../database.json');
const settingsPath = path.join(__dirname, '../../attendance_settings.json');

// Ensure database exists
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ users: {}, groups: {}, settings: {} }, null, 2));
}

// Default attendance settings
const defaultSettings = {
    rewardAmount: 500,
    requireImage: false,
    imageRewardBonus: 200,
    minFieldLength: 2,
    enableStreakBonus: true,
    streakBonusMultiplier: 1.5,
    adminNumbers: []
};

// Load settings
let attendanceSettings = defaultSettings;
if (fs.existsSync(settingsPath)) {
    try {
        const loadedSettings = JSON.parse(fs.readFileSync(settingsPath));
        attendanceSettings = { ...defaultSettings, ...loadedSettings };
    } catch (error) {
        logger.error('Error loading attendance settings:', error);
        attendanceSettings = defaultSettings;
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
        fs.writeFileSync(settingsPath, JSON.stringify(attendanceSettings, null, 2));
    } catch (error) {
        logger.error('Error saving attendance settings:', error);
    }
}

// =======================
// 🎂 BIRTHDAY PARSING UTILITIES
// =======================
const MONTH_NAMES = {
    // Full month names
    'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
    'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
    
    // Short month names
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6, 'jul': 7,
    'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    
    // Alternative spellings
    'sept': 9, 'janu': 1, 'febr': 2
};

function parseBirthday(dobText) {
    if (!dobText || typeof dobText !== 'string') {
        return null;
    }

    const cleaned = dobText.toLowerCase().trim();
    
    // Remove common prefixes and suffixes
    const cleanedDOB = cleaned
        .replace(/^(dob|d\.o\.b|date of birth|birthday|born)[:=\s]*/i, '')
        .replace(/[,\s]+$/, '')
        .trim();

    if (!cleanedDOB) return null;

    let day = null, month = null, year = null;

    try {
        // Pattern 1: Month Day, Year (e.g., "December 12, 1995" or "Dec 12, 1995")
        let match = cleanedDOB.match(/([a-z]+)\s+(\d{1,2}),?\s*(\d{4})?/i);
        if (match) {
            const monthName = match[1].toLowerCase();
            month = MONTH_NAMES[monthName] || MONTH_NAMES[monthName.substring(0, 3)];
            day = parseInt(match[2]);
            year = match[3] ? parseInt(match[3]) : null;
            
            if (month && day >= 1 && day <= 31) {
                return formatBirthday(day, month, year, cleanedDOB);
            }
        }

        // Pattern 2: Day Month Year (e.g., "12 December 1995" or "12 Dec 1995")
        match = cleanedDOB.match(/(\d{1,2})\s+([a-z]+)\s*(\d{4})?/i);
        if (match) {
            day = parseInt(match[1]);
            const monthName = match[2].toLowerCase();
            month = MONTH_NAMES[monthName] || MONTH_NAMES[monthName.substring(0, 3)];
            year = match[3] ? parseInt(match[3]) : null;
            
            if (month && day >= 1 && day <= 31) {
                return formatBirthday(day, month, year, cleanedDOB);
            }
        }

        // Pattern 3: MM/DD/YYYY or DD/MM/YYYY or MM/DD or DD/MM
        match = cleanedDOB.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
        if (match) {
            const num1 = parseInt(match[1]);
            const num2 = parseInt(match[2]);
            year = match[3] ? (match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3])) : null;

            // Heuristic: if first number > 12, it's likely DD/MM, otherwise MM/DD
            if (num1 > 12 && num2 <= 12) {
                day = num1;
                month = num2;
            } else if (num2 > 12 && num1 <= 12) {
                month = num1;
                day = num2;
            } else if (num1 <= 12 && num2 <= 12) {
                // Ambiguous case - assume MM/DD (common format)
                month = num1;
                day = num2;
            } else {
                return null; // Both numbers > 12, invalid
            }

            if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                return formatBirthday(day, month, year, cleanedDOB);
            }
        }

        // Pattern 4: YYYY-MM-DD or YYYY/MM/DD
        match = cleanedDOB.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (match) {
            year = parseInt(match[1]);
            month = parseInt(match[2]);
            day = parseInt(match[3]);
            
            if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                return formatBirthday(day, month, year, cleanedDOB);
            }
        }

        // Pattern 5: Just month and day (e.g., "Dec 12", "December 12")
        match = cleanedDOB.match(/([a-z]+)\s+(\d{1,2})/i);
        if (match) {
            const monthName = match[1].toLowerCase();
            month = MONTH_NAMES[monthName] || MONTH_NAMES[monthName.substring(0, 3)];
            day = parseInt(match[2]);
            
            if (month && day >= 1 && day <= 31) {
                return formatBirthday(day, month, null, cleanedDOB);
            }
        }

        return null;
    } catch (error) {
        logger.error('Error parsing birthday:', error);
        return null;
    }
}

function formatBirthday(day, month, year, originalText) {
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Validate day for the specific month
    const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day > daysInMonth[month - 1]) {
        return null; // Invalid day for the month
    }

    const formatted = {
        day: day,
        month: month,
        year: year,
        monthName: monthNames[month - 1],
        displayDate: year ? 
            `${monthNames[month - 1]} ${day}, ${year}` : 
            `${monthNames[month - 1]} ${day}`,
        searchKey: `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, // MM-DD for easy searching
        originalText: originalText,
        parsedAt: new Date().toISOString()
    };

    // Calculate age if year is provided
    if (year) {
        const today = new Date();
        let age = today.getFullYear() - year;
        const monthDiff = today.getMonth() + 1 - month;
        const dayDiff = today.getDate() - day;
        
        if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
            age--;
        }
        
        if (age >= 0 && age <= 150) { // Reasonable age range
            formatted.age = age;
        }
    }

    return formatted;
}

// =======================
// 🎂 BIRTHDAY DATABASE FUNCTIONS
// =======================
function saveBirthdayData(userId, name, birthdayData) {
    try {
        if (!birthdayData) return false;

        const db = loadDatabase();
        
        // Initialize birthday section if it doesn't exist
        if (!db.birthdays) {
            db.birthdays = {};
        }

        // Save birthday data
        db.birthdays[userId] = {
            name: name,
            birthday: birthdayData,
            lastUpdated: new Date().toISOString(),
            userId: userId
        };

        // Also save to user data
        initUser(userId);
        updateUserData(userId, { birthdayData: birthdayData });

        saveDatabase(db);
        logger.info(`✅ Birthday saved for ${name}: ${birthdayData.displayDate}`);
        return true;
    } catch (error) {
        logger.error('Error saving birthday data:', error);
        return false;
    }
}

function getBirthdayData(userId) {
    try {
        const db = loadDatabase();
        return db.birthdays?.[userId] || null;
    } catch (error) {
        logger.error('Error getting birthday data:', error);
        return null;
    }
}

function getAllBirthdays() {
    try {
        const db = loadDatabase();
        return db.birthdays || {};
    } catch (error) {
        logger.error('Error getting all birthdays:', error);
        return {};
    }
}

// =======================
// 🖼️ IMAGE DETECTION FUNCTIONS
// =======================
function hasImage(message) {
    try {
        // Check for image in current message
        if (message.message?.imageMessage) return true;
        if (message.message?.stickerMessage) return true;
        
        // Check for image in quoted message
        if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) return true;
        if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage) return true;
        
        return false;
    } catch (error) {
        logger.error('Error checking for image:', error);
        return false;
    }
}

function getImageStatus(hasImg, isRequired) {
    if (isRequired && !hasImg) {
        return "❌ Image required but not found";
    } else if (hasImg) {
        return "📸 Image detected ✅";
    } else {
        return "📸 No image (optional)";
    }
}

// =======================
// 📋 FORM VALIDATION (Enhanced with Birthday Extraction)
// =======================
const attendanceFormRegex = /GIST\s+HQ.*?Name[:*].*?Relationship[:*]/is;

function validateAttendanceForm(body, hasImg = false) {
    const validation = {
        isValidForm: false,
        missingFields: [],
        hasWakeUpMembers: false,
        hasImage: hasImg,
        imageRequired: attendanceSettings.requireImage,
        errors: [],
        extractedData: {} // New field for extracted data
    };

    // Simple check for GIST HQ text
    const hasGistHQ = /GIST\s+HQ/i.test(body);
    const hasNameField = /Name[:*]/i.test(body);
    const hasRelationshipField = /Relationship[:*]/i.test(body);

    if (!hasGistHQ || !hasNameField || !hasRelationshipField) {
        validation.errors.push("❌ Invalid attendance form format");
        return validation;
    }

    // Check image requirement
    if (attendanceSettings.requireImage && !hasImg) {
        validation.missingFields.push("📸 Image (required)");
    }

    // Define required fields with extraction
    const requiredFields = [
        { name: "Name", pattern: /Name[:*]\s*(.+)/i, fieldName: "👤 Name", extract: true },
        { name: "Location", pattern: /Location[:*]\s*(.+)/i, fieldName: "🌍 Location", extract: true },
        { name: "Time", pattern: /Time[:*]\s*(.+)/i, fieldName: "⌚ Time", extract: true },
        { name: "Weather", pattern: /Weather[:*]\s*(.+)/i, fieldName: "🌥 Weather", extract: true },
        { name: "Mood", pattern: /Mood[:*]\s*(.+)/i, fieldName: "❤️‍🔥 Mood", extract: true },
        { name: "DOB", pattern: /D\.O\.B[:*]\s*(.+)/i, fieldName: "🗓 D.O.B", extract: true, isBirthday: true },
        { name: "Relationship", pattern: /Relationship[:*]\s*(.+)/i, fieldName: "👩‍❤️‍👨 Relationship", extract: true }
    ];

    // Check each required field and extract data
    requiredFields.forEach(field => {
        const match = body.match(field.pattern);
        if (!match || !match[1] || match[1].trim() === '' || match[1].trim().length < attendanceSettings.minFieldLength) {
            validation.missingFields.push(field.fieldName);
        } else if (field.extract) {
            const extractedValue = match[1].trim();
            validation.extractedData[field.name.toLowerCase()] = extractedValue;
            
            // Special handling for birthday
            if (field.isBirthday) {
                const parsedBirthday = parseBirthday(extractedValue);
                if (parsedBirthday) {
                    validation.extractedData.parsedBirthday = parsedBirthday;
                    logger.info(`🎂 Birthday parsed successfully: ${parsedBirthday.displayDate}`);
                } else {
                    logger.info(`⚠️ Could not parse birthday: ${extractedValue}`);
                }
            }
        }
    });

    // Check wake up members section
    const wakeUpPattern1 = /1[:]\s*(.+)/i;
    const wakeUpPattern2 = /2[:]\s*(.+)/i;
    const wakeUpPattern3 = /3[:]\s*(.+)/i;

    const wakeUp1 = body.match(wakeUpPattern1);
    const wakeUp2 = body.match(wakeUpPattern2);
    const wakeUp3 = body.match(wakeUpPattern3);

    let missingWakeUps = [];
    if (!wakeUp1 || !wakeUp1[1] || wakeUp1[1].trim() === '' || wakeUp1[1].trim().length < attendanceSettings.minFieldLength) missingWakeUps.push("1:");
    if (!wakeUp2 || !wakeUp2[1] || wakeUp2[1].trim() === '' || wakeUp2[1].trim().length < attendanceSettings.minFieldLength) missingWakeUps.push("2:");
    if (!wakeUp3 || !wakeUp3[1] || wakeUp3[1].trim() === '' || wakeUp3[1].trim().length < attendanceSettings.minFieldLength) missingWakeUps.push("3:");

    if (missingWakeUps.length > 0) {
        validation.missingFields.push(`🔔 Wake up members (${missingWakeUps.join(", ")})`);
    } else {
        validation.hasWakeUpMembers = true;
        // Extract wake up members
        validation.extractedData.wakeUpMembers = [
            wakeUp1[1].trim(),
            wakeUp2[1].trim(),
            wakeUp3[1].trim()
        ];
    }

    // Check if form is complete
    if (validation.missingFields.length === 0) {
        validation.isValidForm = true;
    }

    return validation;
}

// =======================
// 📊 STREAK CALCULATION
// =======================
function updateStreak(userId) {
    const userData = getUserData(userId);
    const today = moment.tz('Africa/Lagos').format('DD-MM-YYYY');
    const yesterday = moment.tz('Africa/Lagos').subtract(1, 'day').format('DD-MM-YYYY');

    if (userData.lastAttendance === yesterday) {
        userData.streak += 1;
    } else if (userData.lastAttendance !== today) {
        userData.streak = 1;
    }

    if (userData.streak > userData.longestStreak) {
        userData.longestStreak = userData.streak;
    }

    // Update the user data
    updateUserData(userId, {
        streak: userData.streak,
        longestStreak: userData.longestStreak
    });

    return userData.streak;
}

// Check if user is authorized (admin or group admin)
async function isAuthorized(sock, from, sender) {
    // Check if user is in admin list
    if (attendanceSettings.adminNumbers.includes(sender) || isAdmin(sender) || isOwner(sender)) {
        return true;
    }
    
    // Check if user is group admin
    try {
        if (!from.endsWith('@g.us')) return false;
        
        const groupMetadata = await sock.groupMetadata(from);
        const groupAdmins = groupMetadata.participants
            .filter(participant => participant.admin === 'admin' || participant.admin === 'superadmin')
            .map(participant => participant.id);

        return groupAdmins.includes(sender);
    } catch (error) {
        logger.error('Error checking group admin:', error);
        return false;
    }
}

// Auto-detection handler for attendance forms
async function handleAutoAttendance(context) {
    const { message, sock, senderId } = context;
    const messageText = context.messageText || '';
    const from = message.key.remoteJid;
    
    // Check if message matches attendance form pattern
    if (!attendanceFormRegex.test(messageText)) {
        return false; // Not an attendance form
    }
    
    logger.info('✅ Attendance form detected!');
    
    const userId = senderId;
    const today = moment.tz('Africa/Lagos').format('DD-MM-YYYY');
    
    // Initialize user
    initUser(userId);
    const userData = getUserData(userId);
    
    // Check if already marked attendance today
    if (userData.lastAttendance === today) {
        await sock.sendMessage(from, {
            text: `📝 You've already marked your attendance today! Come back tomorrow.`
        }, { quoted: message });
        return true;
    }
    
    // Check for image
    const messageHasImage = hasImage(message);
    logger.info('Image detection result:', messageHasImage);
    
    // Validate the form completion and extract data
    const validation = validateAttendanceForm(messageText, messageHasImage);
    
    if (!validation.isValidForm) {
        let errorMessage = `📋 *INCOMPLETE ATTENDANCE FORM* 📋\n\n`;
        errorMessage += `❌ Please complete the following fields:\n\n`;
        
        validation.missingFields.forEach((field, index) => {
            errorMessage += `${index + 1}. ${field}\n`;
        });
        
        errorMessage += `\n💡 *Please fill out all required fields and try again.*\n`;
        errorMessage += `📝 Make sure to:\n`;
        errorMessage += `• Fill your personal details completely\n`;
        errorMessage += `• Wake up 3 members (1:, 2:, 3:)\n`;
        
        if (attendanceSettings.requireImage) {
            errorMessage += `• Include an image with your attendance\n`;
        }
        
        errorMessage += `• Don't leave any field empty\n\n`;
        errorMessage += `✨ *Complete the form properly to mark your attendance!*`;
        
        await sock.sendMessage(from, {
            text: errorMessage
        }, { quoted: message });
        return true;
    }
    
    // Update attendance record
    const currentStreak = updateStreak(userId);
    
    // Update user data with new attendance info
    updateUserData(userId, {
        lastAttendance: today,
        totalAttendances: userData.totalAttendances + 1
    });
    
    // Save birthday data if extracted successfully
    let birthdayMessage = '';
    if (validation.extractedData.parsedBirthday && validation.extractedData.name) {
        const birthdaySaved = saveBirthdayData(
            userId, 
            validation.extractedData.name, 
            validation.extractedData.parsedBirthday
        );
        
        if (birthdaySaved) {
            birthdayMessage = `\n🎂 Birthday saved: ${validation.extractedData.parsedBirthday.displayDate}`;
            if (validation.extractedData.parsedBirthday.age !== undefined) {
                birthdayMessage += ` (Age: ${validation.extractedData.parsedBirthday.age})`;
            }
        }
    }
    
    // Calculate reward
    let finalReward = attendanceSettings.rewardAmount;
    
    // Add image bonus if image is present
    if (messageHasImage && attendanceSettings.imageRewardBonus > 0) {
        finalReward += attendanceSettings.imageRewardBonus;
    }
    
    // Apply streak bonus
    if (attendanceSettings.enableStreakBonus && currentStreak >= 3) {
        finalReward = Math.floor(finalReward * attendanceSettings.streakBonusMultiplier);
    }
    
    // Add money to user's wallet using the unified system
    addMoney(userId, finalReward, 'Attendance reward');
    
    // Build reward message
    let rewardBreakdown = `💸 Reward: ₦${finalReward.toLocaleString()}`;
    let bonusDetails = [];
    
    if (messageHasImage && attendanceSettings.imageRewardBonus > 0) {
        bonusDetails.push(`+₦${attendanceSettings.imageRewardBonus} image bonus`);
    }
    
    if (attendanceSettings.enableStreakBonus && currentStreak >= 3) {
        bonusDetails.push(`${Math.floor((attendanceSettings.streakBonusMultiplier - 1) * 100)}% streak bonus`);
    }
    
    if (bonusDetails.length > 0) {
        rewardBreakdown += ` (${bonusDetails.join(', ')})`;
    }
    
    // Get updated user data for display
    const updatedUserData = getUserData(userId);
    
    // Success message
    let successMessage = `✅ *ATTENDANCE APPROVED!* ✅\n\n`;
    successMessage += `📋 Form completed successfully!\n`;
    successMessage += `${getImageStatus(messageHasImage, attendanceSettings.requireImage)}\n`;
    successMessage += rewardBreakdown + '\n';
    successMessage += `💰 New wallet balance: ₦${updatedUserData.balance.toLocaleString()}\n`;
    successMessage += `🔥 Current streak: ${currentStreak} days\n`;
    successMessage += `📊 Total attendances: ${updatedUserData.totalAttendances}\n`;
    successMessage += `🏆 Longest streak: ${updatedUserData.longestStreak} days`;
    successMessage += birthdayMessage; // Add birthday message if applicable
    successMessage += `\n\n🎉 *Thank you for your consistent participation!*\n`;
    successMessage += `🧾 *Keep it up!*`;
    
    await sock.sendMessage(from, {
        text: successMessage
    }, { quoted: message });
    
    return true;
}

export default {
    name: 'attendance',
    description: 'Attendance system with form validation, streaks, and birthday tracking',
    usage: `${config.PREFIX}attendance stats | ${config.PREFIX}attendance settings`,
    category: 'attendance',
    aliases: ['attend', 'att'],
    
    // Auto-detect attendance forms
    async autoDetect(context) {
        return await handleAutoAttendance(context);
    },
    
    async execute(context) {
        const { args, reply, senderId, sock, message } = context;
        
        if (args.length === 0) {
            await this.showAttendanceMenu(reply);
            return;
        }
        
        const subCommand = args[0].toLowerCase();
        const subArgs = args.slice(1);
        
        switch (subCommand) {
            case 'stats':
                await this.handleStats(context);
                break;
            case 'settings':
                await this.handleSettings(context, subArgs);
                break;
            case 'test':
                await this.handleTest(context, subArgs);
                break;
            case 'testbirthday':
                await this.handleTestBirthday(context, subArgs);
                break;
            case 'mybirthday':
                await this.handleMyBirthday(context);
                break;
            case 'allbirthdays':
                await this.handleAllBirthdays(context);
                break;
            case 'help':
                await this.showAttendanceMenu(reply);
                break;
            default:
                await reply(`❓ Unknown attendance command: *${subCommand}*\n\nUse *${config.PREFIX}attendance help* to see available commands.`);
        }
    },
    
    async showAttendanceMenu(reply) {
        const menuText = `📋 *ATTENDANCE SYSTEM* 📋\n\n` +
                        `📊 *User Commands:*\n` +
                        `• *stats* - View your attendance stats\n` +
                        `• *mybirthday* - View your birthday info\n` +
                        `• *test [form]* - Test attendance form\n` +
                        `• *testbirthday [date]* - Test birthday parsing\n\n` +
                        `👑 *Admin Commands:*\n` +
                        `• *settings* - View/modify settings\n` +
                        `• *allbirthdays* - View all member birthdays\n\n` +
                        `🤖 *Auto-Detection:*\n` +
                        `Just send your GIST HQ attendance form and it will be automatically processed!\n\n` +
                        `💡 *Usage:* ${config.PREFIX}attendance [command]`;
        
        await reply(menuText);
    },
    
    async handleStats(context) {
        const { reply, senderId } = context;
        initUser(senderId);
        const userData = getUserData(senderId);
        const birthdayData = getBirthdayData(senderId);
        const today = moment.tz('Africa/Lagos').format('DD-MM-YYYY');
        
        let statsMessage = `📊 *YOUR ATTENDANCE STATS* 📊\n\n`;
        statsMessage += `📅 Last attendance: ${userData.lastAttendance || 'Never'}\n`;
        statsMessage += `📋 Total attendances: ${userData.totalAttendances}\n`;
        statsMessage += `🔥 Current streak: ${userData.streak} days\n`;
        statsMessage += `🏆 Longest streak: ${userData.longestStreak} days\n`;
        statsMessage += `✅ Today's status: ${userData.lastAttendance === today ? 'Marked ✅' : 'Not marked ❌'}\n`;
        statsMessage += `💰 Current balance: ₦${userData.balance.toLocaleString()}\n`;
        statsMessage += `🏦 Bank balance: ₦${userData.bank.toLocaleString()}\n`;
        statsMessage += `📸 Image required: ${attendanceSettings.requireImage ? 'Yes' : 'No'}\n`;
        
        if (birthdayData) {
            statsMessage += `🎂 Birthday: ${birthdayData.birthday.displayDate}`;
            if (birthdayData.birthday.age !== undefined) {
                statsMessage += ` (Age: ${birthdayData.birthday.age})`;
            }
            statsMessage += '\n';
        } else {
            statsMessage += `🎂 Birthday: Not recorded\n`;
        }
        
        if (userData.streak >= 7) {
            statsMessage += `\n🌟 *Amazing! You're on fire with a ${userData.streak}-day streak!*`;
        } else if (userData.streak >= 3) {
            statsMessage += `\n🔥 *Great job! Keep the streak going!*`;
        } else {
            statsMessage += `\n💪 *Mark your attendance daily to build a streak!*`;
        }
        
        await reply(statsMessage);
    },
    
    async handleSettings(context, args) {
        const { reply, senderId, sock, message } = context;
        
        const isAdminUser = await isAuthorized(sock, message.key.remoteJid, senderId);
        if (!isAdminUser) {
            await reply('🚫 Only admins can use this command.');
            return;
        }
        
        if (args.length === 0) {
            let settingsMessage = `⚙️ *ATTENDANCE SETTINGS* ⚙️\n\n`;
            settingsMessage += `💰 Reward Amount: ₦${attendanceSettings.rewardAmount.toLocaleString()}\n`;
            settingsMessage += `📸 Require Image: ${attendanceSettings.requireImage ? 'Yes ✅' : 'No ❌'}\n`;
            settingsMessage += `💎 Image Bonus: ₦${attendanceSettings.imageRewardBonus.toLocaleString()}\n`;
            settingsMessage += `📏 Min Field Length: ${attendanceSettings.minFieldLength}\n`;
            settingsMessage += `🔥 Streak Bonus: ${attendanceSettings.enableStreakBonus ? 'Enabled ✅' : 'Disabled ❌'}\n`;
            settingsMessage += `📈 Streak Multiplier: ${attendanceSettings.streakBonusMultiplier}x\n\n`;
            settingsMessage += `*📋 Usage Commands:*\n`;
            settingsMessage += `• \`${config.PREFIX}attendance settings reward 1000\`\n`;
            settingsMessage += `• \`${config.PREFIX}attendance settings image on/off\`\n`;
            settingsMessage += `• \`${config.PREFIX}attendance settings imagebonus 200\`\n`;
            settingsMessage += `• \`${config.PREFIX}attendance settings streak on/off\`\n`;
            settingsMessage += `• \`${config.PREFIX}attendance settings multiplier 2.0\`\n`;
            settingsMessage += `• \`${config.PREFIX}attendance settings minlength 3\``;
            
            await reply(settingsMessage);
            return;
        }
        
        const setting = args[0].toLowerCase();
        const value = args[1];
        
        let responseText = "";
        
        switch (setting) {
            case 'reward':
                if (!value || isNaN(value)) {
                    responseText = `⚠️ Invalid reward amount. Use: ${config.PREFIX}attendance settings reward 1000`;
                } else {
                    attendanceSettings.rewardAmount = parseInt(value);
                    saveSettings();
                    responseText = `✅ Attendance reward set to ₦${parseInt(value).toLocaleString()}`;
                }
                break;
                
            case 'image':
                if (value === 'on' || value === 'true' || value === 'yes') {
                    attendanceSettings.requireImage = true;
                    saveSettings();
                    responseText = "✅ Image requirement enabled 📸\n\n*Users must now include an image with their attendance form.*";
                } else if (value === 'off' || value === 'false' || value === 'no') {
                    attendanceSettings.requireImage = false;
                    saveSettings();
                    responseText = "✅ Image requirement disabled\n\n*Images are now optional for attendance.*";
                } else {
                    responseText = `⚠️ Invalid value. Use: ${config.PREFIX}attendance settings image on/off`;
                }
                break;
                
            case 'imagebonus':
                if (!value || isNaN(value)) {
                    responseText = `⚠️ Invalid bonus amount. Use: ${config.PREFIX}attendance settings imagebonus 200`;
                } else {
                    attendanceSettings.imageRewardBonus = parseInt(value);
                    saveSettings();
                    responseText = `✅ Image bonus reward set to ₦${parseInt(value).toLocaleString()}\n\n*Users will get extra ₦${parseInt(value).toLocaleString()} when they include images.*`;
                }
                break;
                
            case 'streak':
                if (value === 'on' || value === 'true' || value === 'yes') {
                    attendanceSettings.enableStreakBonus = true;
                    saveSettings();
                    responseText = "✅ Streak bonus enabled 🔥\n\n*Users will get bonus rewards for maintaining streaks.*";
                } else if (value === 'off' || value === 'false' || value === 'no') {
                    attendanceSettings.enableStreakBonus = false;
                    saveSettings();
                    responseText = "✅ Streak bonus disabled\n\n*No more streak bonuses will be applied.*";
                } else {
                    responseText = `⚠️ Invalid value. Use: ${config.PREFIX}attendance settings streak on/off`;
                }
                break;
                
            case 'multiplier':
                if (!value || isNaN(value)) {
                    responseText = `⚠️ Invalid multiplier. Use: ${config.PREFIX}attendance settings multiplier 2.0`;
                } else {
                    attendanceSettings.streakBonusMultiplier = parseFloat(value);
                    saveSettings();
                    responseText = `✅ Streak bonus multiplier set to ${parseFloat(value)}x`;
                }
                break;
                
            case 'minlength':
                if (!value || isNaN(value)) {
                    responseText = `⚠️ Invalid field length. Use: ${config.PREFIX}attendance settings minlength 3`;
                } else {
                    attendanceSettings.minFieldLength = parseInt(value);
                    saveSettings();
                    responseText = `✅ Minimum field length set to ${parseInt(value)} characters`;
                }
                break;
                
            default:
                responseText = "⚠️ Unknown setting. Available options:\n• reward\n• image\n• imagebonus\n• streak\n• multiplier\n• minlength";
        }
        
        await reply(responseText);
    },
    
    async handleTest(context, args) {
        const { reply, message } = context;
        const testText = args.join(' ');
        
        if (!testText) {
            await reply(`🔍 *Attendance Form Test*\n\nUsage: ${config.PREFIX}attendance test [paste your attendance form]\n\nThis will validate your form without submitting it.\n\n📸 *Image Detection:* Include an image with your test message to test image detection.\n🎂 *Birthday Parsing:* The D.O.B field will be tested for birthday extraction.`);
            return;
        }
        
        const hasGistHQ = /GIST\s+HQ/i.test(testText);
        const hasNameField = /Name[:*]/i.test(testText);
        const hasRelationshipField = /Relationship[:*]/i.test(testText);
        const messageHasImage = hasImage(message);
        
        let result = `🔍 *Form Detection Results:*\n\n`;
        result += `📋 GIST HQ header: ${hasGistHQ ? '✅' : '❌'}\n`;
        result += `👤 Name field: ${hasNameField ? '✅' : '❌'}\n`;
        result += `👩‍❤️‍👨 Relationship field: ${hasRelationshipField ? '✅' : '❌'}\n`;
        result += `📸 Image detected: ${messageHasImage ? '✅' : '❌'}\n`;
        result += `📸 Image required: ${attendanceSettings.requireImage ? 'Yes' : 'No'}\n\n`;
        
        if (hasGistHQ && hasNameField && hasRelationshipField) {
            result += `🎉 *Form structure detected!*\n\n`;
            
            const validation = validateAttendanceForm(testText, messageHasImage);
            result += `📝 *Validation Results:*\n`;
            result += `✅ Form complete: ${validation.isValidForm ? 'YES' : 'NO'}\n`;
            result += `📸 Image status: ${getImageStatus(messageHasImage, attendanceSettings.requireImage)}\n`;
            
            // Test birthday parsing
            if (validation.extractedData.dob) {
                result += `\n🎂 *Birthday Parsing Test:*\n`;
                result += `📝 D.O.B Input: "${validation.extractedData.dob}"\n`;
                
                if (validation.extractedData.parsedBirthday) {
                    const birthday = validation.extractedData.parsedBirthday;
                    result += `✅ Successfully parsed!\n`;
                    result += `📅 Parsed as: ${birthday.displayDate}\n`;
                    if (birthday.age !== undefined) {
                        result += `🎈 Age: ${birthday.age} years old\n`;
                    }
                } else {
                    result += `❌ Could not parse birthday\n`;
                    result += `💡 Try formats like: Dec 12, 1995 or 12/12/1995\n`;
                }
            }
            
            if (!validation.isValidForm) {
                result += `\n❌ Missing fields (${validation.missingFields.length}):\n`;
                validation.missingFields.forEach((field, index) => {
                    result += `   ${index + 1}. ${field}\n`;
                });
            } else {
                result += `\n🎉 *Ready to submit!*`;
                let potentialReward = attendanceSettings.rewardAmount;
                if (messageHasImage && attendanceSettings.imageRewardBonus > 0) {
                    potentialReward += attendanceSettings.imageRewardBonus;
                }
                result += `\n💰 *Potential reward: ₦${potentialReward.toLocaleString()}*`;
                
                if (validation.extractedData.parsedBirthday) {
                    result += `\n🎂 *Birthday will be saved: ${validation.extractedData.parsedBirthday.displayDate}*`;
                }
            }
        } else {
            result += `❌ *Form structure not detected*\nMake sure you're using the correct GIST HQ attendance format.`;
        }
        
        await reply(result);
    },
    
    async handleTestBirthday(context, args) {
        const { reply } = context;
        const testDate = args.join(' ');
        
        if (!testDate) {
            await reply(`🎂 *Birthday Parser Test*\n\nUsage: ${config.PREFIX}attendance testbirthday [date]\n\nExamples:\n• ${config.PREFIX}attendance testbirthday December 12, 1995\n• ${config.PREFIX}attendance testbirthday Dec 12\n• ${config.PREFIX}attendance testbirthday 12/12/1995\n• ${config.PREFIX}attendance testbirthday 12 December\n• ${config.PREFIX}attendance testbirthday 2000-12-12`);
            return;
        }
        
        const parsed = parseBirthday(testDate);
        
        let result = `🎂 *Birthday Parser Results*\n\n`;
        result += `📝 Input: "${testDate}"\n\n`;
        
        if (parsed) {
            result += `✅ *Successfully Parsed!*\n\n`;
            result += `📅 Display Date: ${parsed.displayDate}\n`;
            result += `📊 Day: ${parsed.day}\n`;
            result += `📊 Month: ${parsed.month} (${parsed.monthName})\n`;
            if (parsed.year) {
                result += `📊 Year: ${parsed.year}\n`;
            }
            if (parsed.age !== undefined) {
                result += `🎈 Age: ${parsed.age} years old\n`;
            }
            result += `🔍 Search Key: ${parsed.searchKey}\n`;
            result += `⏰ Parsed At: ${new Date(parsed.parsedAt).toLocaleString()}\n\n`;
            result += `💾 *This data would be saved to the birthday database.*`;
        } else {
            result += `❌ *Could not parse the date*\n\n`;
            result += `💡 *Supported Formats:*\n`;
            result += `• Month Day, Year (December 12, 1995)\n`;
            result += `• Day Month Year (12 December 1995)\n`;
            result += `• MM/DD/YYYY or DD/MM/YYYY\n`;
            result += `• YYYY-MM-DD\n`;
            result += `• Short names (Dec, Jan, Feb, etc.)\n`;
            result += `• Just month and day (Dec 12)\n\n`;
            result += `🔧 *Try different formats or check for typos.*`;
        }
        
        await reply(result);
    },
    
    async handleMyBirthday(context) {
        const { reply, senderId } = context;
        const birthdayData = getBirthdayData(senderId);
        
        if (!birthdayData) {
            await reply(`🎂 *No Birthday Recorded*\n\nYour birthday hasn't been saved yet. It will be automatically saved when you submit your next attendance form with a valid D.O.B field.\n\n💡 *Make sure to fill your D.O.B correctly in the attendance form!*`);
            return;
        }
        
        const birthday = birthdayData.birthday;
        let message = `🎂 *Your Birthday Information* 🎂\n\n`;
        message += `👤 Name: ${birthdayData.name}\n`;
        message += `📅 Birthday: ${birthday.displayDate}\n`;
        message += `📊 Day: ${birthday.day}\n`;
        message += `📊 Month: ${birthday.monthName}\n`;
        
        if (birthday.year) {
            message += `📊 Year: ${birthday.year}\n`;
        }
        
        if (birthday.age !== undefined) {
            message += `🎈 Current Age: ${birthday.age} years old\n`;
        }
        
        message += `💾 Last Updated: ${new Date(birthdayData.lastUpdated).toLocaleString()}\n`;
        message += `📝 Original Text: "${birthday.originalText}"\n\n`;
        
        // Calculate days until next birthday
        const today = new Date();
        const thisYear = today.getFullYear();
        const nextBirthday = new Date(thisYear, birthday.month - 1, birthday.day);
        
        if (nextBirthday < today) {
            nextBirthday.setFullYear(thisYear + 1);
        }
        
        const daysUntil = Math.ceil((nextBirthday - today) / (1000 * 60 * 60 * 24));
        
        if (daysUntil === 0) {
            message += `🎉 *IT'S YOUR BIRTHDAY TODAY!* 🎉\n`;
            message += `🎊 *HAPPY BIRTHDAY!* 🎊`;
        } else if (daysUntil === 1) {
            message += `🎂 *Your birthday is TOMORROW!* 🎂`;
        } else if (daysUntil <= 7) {
            message += `🗓 *Your birthday is in ${daysUntil} days!*`;
        } else {
            message += `📅 Days until next birthday: ${daysUntil}`;
        }
        
        await reply(message);
    },
    
    async handleAllBirthdays(context) {
        const { reply, senderId, sock, message } = context;
        
        const isAdminUser = await isAuthorized(sock, message.key.remoteJid, senderId);
        if (!isAdminUser) {
            await reply('🚫 Only admins can view all birthdays.');
            return;
        }
        
        const allBirthdays = getAllBirthdays();
        const birthdayEntries = Object.values(allBirthdays);
        
        if (birthdayEntries.length === 0) {
            await reply(`🎂 *No Birthdays Recorded*\n\nNo member birthdays have been saved yet. Birthdays are automatically recorded when members submit attendance forms with valid D.O.B information.`);
            return;
        }
        
        // Sort birthdays by month and day
        birthdayEntries.sort((a, b) => {
            if (a.birthday.month !== b.birthday.month) {
                return a.birthday.month - b.birthday.month;
            }
            return a.birthday.day - b.birthday.day;
        });
        
        let messageText = `🎂 *ALL MEMBER BIRTHDAYS* 🎂\n\n`;
        messageText += `📊 Total Members: ${birthdayEntries.length}\n\n`;
        
        // Group by month
        let currentMonth = '';
        birthdayEntries.forEach((entry, index) => {
            const birthday = entry.birthday;
            
            if (currentMonth !== birthday.monthName) {
                currentMonth = birthday.monthName;
                messageText += `\n📅 *${currentMonth}*\n`;
            }
            
            messageText += `• ${entry.name} - ${birthday.monthName} ${birthday.day}`;
            
            if (birthday.age !== undefined) {
                messageText += ` (${birthday.age} yrs)`;
            }
            
            messageText += '\n';
        });
        
        // Find upcoming birthdays (next 30 days)
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
            
            if (daysUntil <= 30) {
                upcomingBirthdays.push({
                    name: entry.name,
                    birthday: birthday,
                    daysUntil: daysUntil
                });
            }
        });
        
        if (upcomingBirthdays.length > 0) {
            upcomingBirthdays.sort((a, b) => a.daysUntil - b.daysUntil);
            
            messageText += `\n\n🎉 *UPCOMING BIRTHDAYS (Next 30 Days)*\n`;
            upcomingBirthdays.forEach(upcoming => {
                if (upcoming.daysUntil === 0) {
                    messageText += `🎊 ${upcoming.name} - TODAY! 🎊\n`;
                } else if (upcoming.daysUntil === 1) {
                    messageText += `🎂 ${upcoming.name} - Tomorrow\n`;
                } else {
                    messageText += `📅 ${upcoming.name} - ${upcoming.daysUntil} days\n`;
                }
            });
        }
        
        messageText += `\n\n💡 *Use ${config.PREFIX}attendance mybirthday to check your own birthday info*`;
        
        await reply(messageText);
    }
};

// Export functions for use by birthday plugin
export { parseBirthday, saveBirthdayData, getBirthdayData, getAllBirthdays, attendanceSettings };
