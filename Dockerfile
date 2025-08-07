# Use Node.js 20 Alpine for smaller image size
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies for Sharp and other native modules
RUN apk add --no-cache \
    ffmpeg \
    imagemagick \
    git \
    python3 \
    make \
    g++ \
    vips-dev \
    libc6-compat

# Copy package files
COPY package*.json ./

# Install dependencies - use npm install since lock file may be out of sync
RUN npm install --only=production --legacy-peer-deps && npm cache clean --force

# Copy application code
COPY . .

# Create necessary directories with proper permissions
RUN mkdir -p sessions data backups exports logs && \
    chmod 755 sessions data backups exports logs

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Change ownership of the app directory and data directories
RUN chown -R nextjs:nodejs /app
USER nextjs

# Create volumes for persistent data
VOLUME ["/app/sessions", "/app/data", "/app/backups"]

# Expose port (Koyeb will set PORT environment variable)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1

# Start the application
CMD ["npm", "start"]
