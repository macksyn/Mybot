import { isOwner } from '../utils/helpers.js';
import { db } from '../utils/database.js';
import { config } from '../config/config.js';
import fs from 'fs/promises';

export default {
    name: 'migrate',
    description: 'Data migration and backup management commands',
    usage: '!migrate [backup|restore|export|import|status]',
    category: 'admin',
    
    async execute(context) {
        const { reply, args, senderId } = context;
        
        // Only owner can use migration commands
        if (!isOwner(senderId)) {
            await reply('❌ Only the bot owner can use migration commands.');
            return;
        }
        
        if (args.length === 0) {
            await this.showMigrationMenu(reply);
            return;
        }
        
        const subcommand = args[0].toLowerCase();
        const subArgs = args.slice(1);
        
        switch (subcommand) {
            case 'backup':
                await this.createBackup(reply);
                break;
            case 'restore':
                await this.restoreBackup(reply, subArgs);
                break;
            case 'export':
                await this.exportData(reply);
                break;
            case 'import':
                await this.importData(reply, subArgs);
                break;
            case 'status':
                await this.showStatus(reply);
                break;
            case 'list':
                await this.listBackups(reply);
                break;
            case 'clean':
                await this.cleanOldData(reply);
                break;
            default:
                await reply(`❌ Unknown migration command: *${subcommand}*\n\nUse *${config.PREFIX}migrate* to see available commands.`);
        }
    },
    
    async showMigrationMenu(reply) {
        const menuText = `🔄 *Data Migration & Backup*\n\n` +
                        `📋 *Available Commands:*\n\n` +
                        `• *backup* - Create manual backup\n` +
                        `• *restore [filename]* - Restore from backup\n` +
                        `• *export* - Export all data to file\n` +
                        `• *import [data]* - Import data from JSON\n` +
                        `• *status* - Show database status\n` +
                        `• *list* - List available backups\n` +
                        `• *clean* - Clean old/unused data\n\n` +
                        `💡 *Usage:* ${config.PREFIX}migrate [command]\n\n` +
                        `⚠️ *Note:* These commands are for data management and should be used carefully.`;
        
        await reply(menuText);
    },
    
    async createBackup(reply) {
        try {
            await reply('📦 Creating backup...');
            
            // Use the database's built-in backup function
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `manual-backup-${timestamp}.json`;
            
            // Export current data
            const data = await db.exportData();
            const backupPath = `./backups/${backupName}`;
            
            await fs.writeFile(backupPath, JSON.stringify(data, null, 2));
            
            const stats = await db.getStats();
            
            const backupText = `✅ *Backup Created Successfully!*\n\n` +
                              `📁 *File:* \`${backupName}\`\n` +
                              `📊 *Data Backed Up:*\n` +
                              `• Users: ${stats.totalUsers}\n` +
                              `• Economy Profiles: ${stats.totalEconomyProfiles}\n` +
                              `• Groups: ${stats.totalGroups}\n` +
                              `• Commands Executed: ${stats.commandsExecuted}\n\n` +
                              `💾 Backup saved to: \`./backups/\``;
            
            await reply(backupText);
            
        } catch (error) {
            await reply(`❌ Error creating backup: ${error.message}`);
        }
    },
    
    async listBackups(reply) {
        try {
            const backups = await db.listBackups();
            
            if (backups.length === 0) {
                await reply('📁 No backups found.');
                return;
            }
            
            let backupText = `📁 *Available Backups* (${backups.length})\n\n`;
            
            backups.slice(0, 10).forEach((backup, index) => {
                const size = (backup.size / 1024).toFixed(2);
                const date = backup.created.toLocaleString();
                backupText += `${index + 1}. \`${backup.name}\`\n`;
                backupText += `   📅 ${date}\n`;
                backupText += `   📊 ${size} KB\n\n`;
            });
            
            if (backups.length > 10) {
                backupText += `... and ${backups.length - 10} more backups\n\n`;
            }
            
            backupText += `💡 Use *${config.PREFIX}migrate restore [filename]* to restore a backup`;
            
            await reply(backupText);
            
        } catch (error) {
            await reply(`❌ Error listing backups: ${error.message}`);
        }
    },
    
    async restoreBackup(reply, args) {
        if (args.length === 0) {
            await reply(`❓ Please specify a backup filename.\n\nExample: *${config.PREFIX}migrate restore backup-2024-01-01T12-00-00-000Z.json*\n\nUse *${config.PREFIX}migrate list* to see available backups.`);
            return;
        }
        
        const backupName = args.join(' ');
        
        try {
            await reply('🔄 Restoring from backup...');
            
            const success = await db.restoreFromBackup(backupName);
            
            if (success) {
                const stats = await db.getStats();
                
                const restoreText = `✅ *Backup Restored Successfully!*\n\n` +
                                   `📁 *Restored from:* \`${backupName}\`\n` +
                                   `📊 *Data Restored:*\n` +
                                   `• Users: ${stats.totalUsers}\n` +
                                   `• Economy Profiles: ${stats.totalEconomyProfiles}\n` +
                                   `• Groups: ${stats.totalGroups}\n\n` +
                                   `⚠️ *Note:* Current data was backed up before restore.`;
                
                await reply(restoreText);
            } else {
                await reply('❌ Failed to restore backup. Please check the filename and try again.');
            }
            
        } catch (error) {
            await reply(`❌ Error restoring backup: ${error.message}`);
        }
    },
    
    async exportData(reply) {
        try {
            await reply('📤 Exporting data...');
            
            const data = await db.exportData();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const exportName = `export-${timestamp}.json`;
            const exportPath = `./exports/${exportName}`;
            
            // Ensure exports directory exists
            await fs.mkdir('./exports', { recursive: true });
            
            await fs.writeFile(exportPath, JSON.stringify(data, null, 2));
            
            const stats = await db.getStats();
            const fileSize = JSON.stringify(data).length;
            
            const exportText = `✅ *Data Exported Successfully!*\n\n` +
                              `📁 *File:* \`${exportName}\`\n` +
                              `📊 *Size:* ${(fileSize / 1024).toFixed(2)} KB\n` +
                              `📈 *Exported Data:*\n` +
                              `• Users: ${stats.totalUsers}\n` +
                              `• Economy Profiles: ${stats.totalEconomyProfiles}\n` +
                              `• Groups: ${stats.totalGroups}\n` +
                              `• Settings: ${Object.keys(await db.getAllSettings()).length}\n\n` +
                              `💾 Export saved to: \`./exports/\`\n\n` +
                              `💡 You can use this file to migrate data to another bot instance.`;
            
            await reply(exportText);
            
        } catch (error) {
            await reply(`❌ Error exporting data: ${error.message}`);
        }
    },
    
    async showStatus(reply) {
        try {
            const stats = await db.getStats();
            const settings = await db.getAllSettings();
            const uptime = Math.floor(stats.uptime / 1000);
            
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = uptime % 60;
            
            const statusText = `📊 *Database Status*\n\n` +
                              `🏪 *Storage Info:*\n` +
                              `• Type: File-based JSON\n` +
                              `• Auto-save: Every 30s\n` +
                              `• Auto-backup: Every 5min\n` +
                              `• Data directory: \`./data/\`\n` +
                              `• Backup directory: \`./backups/\`\n\n` +
                              `📈 *Data Summary:*\n` +
                              `• Total Users: ${stats.totalUsers}\n` +
                              `• Economy Profiles: ${stats.totalEconomyProfiles}\n` +
                              `• Active Groups: ${stats.totalGroups}\n` +
                              `• Commands Executed: ${stats.commandsExecuted}\n` +
                              `• Messages Processed: ${stats.messagesReceived}\n` +
                              `• Users Served: ${stats.usersServed}\n\n` +
                              `⏱️ *Runtime:*\n` +
                              `• Uptime: ${hours}h ${minutes}m ${seconds}s\n` +
                              `• Started: ${new Date(stats.startTime).toLocaleString()}\n\n` +
                              `⚙️ *Settings:* ${Object.keys(settings).length} configured`;
            
            await reply(statusText);
            
        } catch (error) {
            await reply(`