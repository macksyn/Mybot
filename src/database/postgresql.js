import pg from 'pg';
import { logger } from '../utils/logger.js';
import { config } from '../config/config.js';

const { Pool } = pg;

class PostgreSQLDatabase {
    constructor() {
        this.pool = null;
        this.isConnected = false;
        this.connectionInfo = {};
        this.retryCount = 0;
        this.maxRetries = 5;
    }

    async connect() {
        try {
            // Parse DATABASE_URL or use individual config
            const connectionConfig = this.parseConnectionConfig();
            
            this.pool = new Pool({
                ...connectionConfig,
                max: config.MAX_DB_CONNECTIONS || 20,
                idleTimeoutMillis: config.DB_IDLE_TIMEOUT || 10000,
                connectionTimeoutMillis: 5000,
                statement_timeout: 30000,
                query_timeout: 30000,
                application_name: config.BOT_NAME || 'Groq Bot'
            });

            // Test connection
            const client = await this.pool.connect();
            const result = await client.query('SELECT NOW()');
            client.release();

            this.isConnected = true;
            this.retryCount = 0;
            
            // Store connection info
            this.connectionInfo = {
                host: connectionConfig.host,
                port: connectionConfig.port,
                database: connectionConfig.database,
                user: connectionConfig.user,
                connected: true,
                connectedAt: new Date().toISOString()
            };

            logger.info('✅ PostgreSQL connected successfully');
            logger.info(`📊 Database: ${connectionConfig.database}`);
            logger.info(`🏠 Host: ${connectionConfig.host}:${connectionConfig.port}`);
            logger.info(`👤 User: ${connectionConfig.user}`);

            // Initialize database schema
            await this.initializeSchema();

            return true;

        } catch (error) {
            this.isConnected = false;
            this.retryCount++;
            
            logger.error('❌ PostgreSQL connection failed:', error.message);
            
            if (this.retryCount < this.maxRetries) {
                const delay = Math.min(this.retryCount * 2000, 10000);
                logger.info(`🔄 Retrying connection in ${delay/1000}s... (${this.retryCount}/${this.maxRetries})`);
                
                setTimeout(() => this.connect(), delay);
                return false;
            } else {
                logger.error('❌ Max database connection retries reached');
                throw error;
            }
        }
    }

    parseConnectionConfig() {
        if (config.DATABASE_URL) {
            // Parse DATABASE_URL format: postgresql://user:password@host:port/database
            const url = new URL(config.DATABASE_URL);
            return {
                host: url.hostname,
                port: parseInt(url.port) || 5432,
                database: url.pathname.slice(1),
                user: url.username,
                password: url.password,
                ssl: url.searchParams.get('ssl') === 'require' ? { rejectUnauthorized: false } : false
            };
        } else {
            // Use individual environment variables
            return {
                host: process.env.PG_HOST || 'localhost',
                port: parseInt(process.env.PG_PORT) || 5432,
                database: process.env.PG_DATABASE || config.DATABASE_NAME,
                user: process.env.PG_USER || 'postgres',
                password: process.env.PG_PASSWORD,
                ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false
            };
        }
    }

    async initializeSchema() {
        try {
            logger.info('🏗️  Initializing database schema...');

            // Create tables
            await this.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(50) UNIQUE NOT NULL,
                    username VARCHAR(100),
                    display_name VARCHAR(100),
                    
                    -- Economy fields
                    balance BIGINT DEFAULT 1000,
                    bank BIGINT DEFAULT 0,
                    total_earned BIGINT DEFAULT 0,
                    total_spent BIGINT DEFAULT 0,
                    work_count INTEGER DEFAULT 0,
                    rob_count INTEGER DEFAULT 0,
                    last_daily DATE,
                    rank VARCHAR(50) DEFAULT 'Newbie',
                    bounty BIGINT DEFAULT 0,
                    
                    -- Attendance fields
                    last_attendance DATE,
                    total_attendances INTEGER DEFAULT 0,
                    streak INTEGER DEFAULT 0,
                    longest_streak INTEGER DEFAULT 0,
                    
                    -- Stats fields
                    commands_used INTEGER DEFAULT 0,
                    messages_received INTEGER DEFAULT 0,
                    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_blocked BOOLEAN DEFAULT FALSE,
                    warning_count INTEGER DEFAULT 0,
                    
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            await this.query(`
                CREATE TABLE IF NOT EXISTS user_inventory (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(50) REFERENCES users(user_id) ON DELETE CASCADE,
                    item_name VARCHAR(100) NOT NULL,
                    quantity INTEGER DEFAULT 1,
                    item_data JSONB DEFAULT '{}',
                    acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            await this.query(`
                CREATE TABLE IF NOT EXISTS clans (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) UNIQUE NOT NULL,
                    description TEXT,
                    owner_id VARCHAR(50) REFERENCES users(user_id),
                    total_members INTEGER DEFAULT 1,
                    total_wealth BIGINT DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            await this.query(`
                CREATE TABLE IF NOT EXISTS clan_members (
                    id SERIAL PRIMARY KEY,
                    clan_id INTEGER REFERENCES clans(id) ON DELETE CASCADE,
                    user_id VARCHAR(50) REFERENCES users(user_id) ON DELETE CASCADE,
                    role VARCHAR(20) DEFAULT 'member',
                    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id)
                );
            `);

            await this.query(`
                CREATE TABLE IF NOT EXISTS settings (
                    id SERIAL PRIMARY KEY,
                    category VARCHAR(50) NOT NULL,
                    key VARCHAR(100) NOT NULL,
                    value JSONB NOT NULL,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(category, key)
                );
            `);

            await this.query(`
                CREATE TABLE IF NOT EXISTS logs (
                    id SERIAL PRIMARY KEY,
                    level VARCHAR(20) NOT NULL,
                    message TEXT NOT NULL,
                    meta JSONB DEFAULT '{}',
                    user_id VARCHAR(50),
                    command VARCHAR(50),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            await this.query(`
                CREATE TABLE IF NOT EXISTS groups (
                    id SERIAL PRIMARY KEY,
                    group_id VARCHAR(100) UNIQUE NOT NULL,
                    name VARCHAR(200),
                    description TEXT,
                    settings JSONB DEFAULT '{}',
                    member_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Create indexes for better performance
            await this.query(`CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);`);
            await this.query(`CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen);`);
            await this.query(`CREATE INDEX IF NOT EXISTS idx_users_balance ON users(balance);`);
            await this.query(`CREATE INDEX IF NOT EXISTS idx_inventory_user_id ON user_inventory(user_id);`);
            await this.query(`CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id);`);
            await this.query(`CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);`);
            await this.query(`CREATE INDEX IF NOT EXISTS idx_settings_category_key ON settings(category, key);`);

            // Create trigger for updating updated_at timestamps
            await this.query(`
                CREATE OR REPLACE FUNCTION update_updated_at_column()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = CURRENT_TIMESTAMP;
                    RETURN NEW;
                END;
                $$ language 'plpgsql';
            `);

            await this.query(`
                DROP TRIGGER IF EXISTS update_users_updated_at ON users CASCADE;
                CREATE TRIGGER update_users_updated_at 
                    BEFORE UPDATE ON users 
                    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
            `);

            await this.query(`
                DROP TRIGGER IF EXISTS update_settings_updated_at ON settings CASCADE;
                CREATE TRIGGER update_settings_updated_at 
                    BEFORE UPDATE ON settings 
                    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
            `);

            // Insert default economy settings
            await this.insertDefaultSettings();

            logger.info('✅ Database schema initialized successfully');
            
            // Get and display stats
            const stats = await this.getStats();
            logger.info(`📊 Database Statistics:`);
            logger.info(`   Users: ${stats.users}`);
            logger.info(`   Groups: ${stats.groups}`);
            logger.info(`   Settings: ${stats.settings}`);

        } catch (error) {
            logger.error('❌ Failed to initialize database schema:', error);
            throw error;
        }
    }

    async insertDefaultSettings() {
        try {
            const defaultSettings = [
                { category: 'economy', key: 'currency', value: '"₦"', description: 'Currency symbol' },
                { category: 'economy', key: 'startingBalance', value: '1000', description: 'Starting wallet balance' },
                { category: 'economy', key: 'startingBankBalance', value: '0', description: 'Starting bank balance' },
                { category: 'economy', key: 'dailyMinAmount', value: '500', description: 'Minimum daily reward' },
                { category: 'economy', key: 'dailyMaxAmount', value: '1500', description: 'Maximum daily reward' },
                { category: 'economy', key: 'workCooldownMinutes', value: '60', description: 'Work command cooldown in minutes' },
                { category: 'economy', key: 'robCooldownMinutes', value: '120', description: 'Rob command cooldown in minutes' },
                { category: 'economy', key: 'robSuccessRate', value: '0.7', description: 'Rob success rate (0-1)' },
                { category: 'bot', key: 'prefix', value: `"${config.PREFIX}"`, description: 'Bot command prefix' },
                { category: 'bot', key: 'name', value: `"${config.BOT_NAME}"`, description: 'Bot name' }
            ];

            for (const setting of defaultSettings) {
                await this.query(`
                    INSERT INTO settings (category, key, value, description)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (category, key) 
                    DO NOTHING
                `, [setting.category, setting.key, setting.value, setting.description]);
            }

            logger.info('📝 Default settings inserted');
        } catch (error) {
            logger.error('Failed to insert default settings:', error);
        }
    }

    async query(text, params = []) {
        if (!this.isConnected || !this.pool) {
            throw new Error('Database not connected');
        }

        try {
            const start = Date.now();
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;
            
            if (duration > 1000) {
                logger.warn(`Slow query (${duration}ms): ${text.substring(0, 100)}...`);
            }
            
            return result;
        } catch (error) {
            logger.error('Database query error:', error);
            logger.error('Query:', text.substring(0, 200));
            throw error;
        }
    }

    async getUser(userId) {
        try {
            const result = await this.query(
                'SELECT * FROM users WHERE user_id = $1',
                [userId]
            );
            return result.rows[0] || null;
        } catch (error) {
            logger.error('Error getting user:', error);
            return null;
        }
    }

    async createUser(userId, userData = {}) {
        try {
            const result = await this.query(`
                INSERT INTO users (
                    user_id, username, display_name,
                    balance, bank, total_earned, total_spent
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `, [
                userId,
                userData.username || null,
                userData.display_name || null,
                userData.balance || 1000,
                userData.bank || 0,
                userData.total_earned || 0,
                userData.total_spent || 0
            ]);
            
            return result.rows[0];
        } catch (error) {
            logger.error('Error creating user:', error);
            throw error;
        }
    }

    async updateUser(userId, updates) {
        try {
            const setClause = [];
            const values = [];
            let paramIndex = 1;

            // Dynamically build SET clause
            for (const [key, value] of Object.entries(updates)) {
                setClause.push(`${key} = $${paramIndex}`); // ✅ Fixed: Added $ before paramIndex
                values.push(value);
                paramIndex++;
            }

            values.push(userId); // Add userId for WHERE clause

            const result = await this.query(`
                UPDATE users 
                SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $${paramIndex}
                RETURNING *
            `, values);

            return result.rows[0];
        } catch (error) {
            logger.error('Error updating user:', error);
            throw error;
        }
    }

    async getUserInventory(userId) {
        try {
            const result = await this.query(
                'SELECT * FROM user_inventory WHERE user_id = $1 ORDER BY acquired_at DESC',
                [userId]
            );
            return result.rows;
        } catch (error) {
            logger.error('Error getting user inventory:', error);
            return [];
        }
    }

    async addToInventory(userId, itemName, quantity = 1, itemData = {}) {
        try {
            const result = await this.query(`
                INSERT INTO user_inventory (user_id, item_name, quantity, item_data)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (user_id, item_name) 
                DO UPDATE SET quantity = user_inventory.quantity + $3
                RETURNING *
            `, [userId, itemName, quantity, JSON.stringify(itemData)]);
            
            return result.rows[0];
        } catch (error) {
            logger.error('Error adding to inventory:', error);
            throw error;
        }
    }

    async getSetting(category, key) {
        try {
            const result = await this.query(
                'SELECT value FROM settings WHERE category = $1 AND key = $2',
                [category, key]
            );
            
            if (result.rows.length > 0) {
                return result.rows[0].value;
            }
            return null;
        } catch (error) {
            logger.error('Error getting setting:', error);
            return null;
        }
    }

    async setSetting(category, key, value, description = '') {
        try {
            const result = await this.query(`
                INSERT INTO settings (category, key, value, description)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (category, key) 
                DO UPDATE SET value = $3, description = $4
                RETURNING *
            `, [category, key, JSON.stringify(value), description]);
            
            return result.rows[0];
        } catch (error) {
            logger.error('Error setting setting:', error);
            throw error;
        }
    }

    async logTransaction(userId, type, amount, details = {}) {
        try {
            await this.query(`
                INSERT INTO logs (level, message, meta, user_id, command)
                VALUES ('info', $1, $2, $3, $4)
            `, [
                `Economy transaction: ${type}`,
                JSON.stringify({ transactionType: type, amount, ...details }),
                userId,
                type
            ]);
        } catch (error) {
            logger.error('Error logging transaction:', error);
        }
    }

    async getLeaderboard(limit = 10) {
        try {
            const result = await this.query(`
                SELECT 
                    user_id,
                    username,
                    display_name,
                    balance,
                    bank,
                    (balance + bank) as total_wealth,
                    work_count,
                    total_earned
                FROM users 
                WHERE balance > 0 OR bank > 0
                ORDER BY (balance + bank) DESC 
                LIMIT $1
            `, [limit]);
            
            return result.rows;
        } catch (error) {
            logger.error('Error getting leaderboard:', error);
            return [];
        }
    }

    async getStats() {
        try {
            const [userCount, groupCount, settingCount, totalWealth] = await Promise.all([
                this.query('SELECT COUNT(*) as count FROM users'),
                this.query('SELECT COUNT(*) as count FROM groups'),
                this.query('SELECT COUNT(*) as count FROM settings'),
                this.query('SELECT SUM(balance + bank) as total FROM users')
            ]);

            return {
                users: parseInt(userCount.rows[0].count),
                groups: parseInt(groupCount.rows[0].count),
                settings: parseInt(settingCount.rows[0].count),
                totalWealth: parseInt(totalWealth.rows[0].total || 0),
                connected: this.isConnected,
                connectionInfo: this.connectionInfo
            };
        } catch (error) {
            logger.error('Error getting stats:', error);
            return {
                users: 0,
                groups: 0,
                settings: 0,
                totalWealth: 0,
                connected: false,
                connectionInfo: {}
            };
        }
    }

    getConnectionInfo() {
        return {
            ...this.connectionInfo,
            connected: this.isConnected,
            readyState: this.isConnected ? 'connected' : 'disconnected'
        };
    }

    async disconnect() {
        try {
            if (this.pool) {
                await this.pool.end();
                this.isConnected = false;
                logger.info('PostgreSQL connection closed');
            }
        } catch (error) {
            logger.error('Error closing database connection:', error);
        }
    }

    // Health check method
    async healthCheck() {
        try {
            const result = await this.query('SELECT 1 as health');
            return result.rows[0].health === 1;
        } catch (error) {
            logger.error('Database health check failed:', error);
            this.isConnected = false;
            return false;
        }
    }
}

// Create singleton instance
const db = new PostgreSQLDatabase();

// Connect to database
export default async function connectToPostgreSQL() {
    try {
        await db.connect();
        return true;
    } catch (error) {
        logger.error('Failed to connect to PostgreSQL:', error);
        return false;
    }
}

// Export database instance
export { db };
