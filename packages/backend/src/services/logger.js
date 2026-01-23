/**
 * Lightweight structured logger for production-ready logging
 * No external dependencies - wraps console with structured JSON output
 */

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

const CURRENT_LEVEL = process.env.LOG_LEVEL
    ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] || LOG_LEVELS.INFO
    : LOG_LEVELS.INFO;

class Logger {
    constructor(context = 'APP') {
        this.context = context;
    }

    _formatMessage(level, message, meta = {}) {
        const { error, ...restMeta } = meta;

        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            context: this.context,
            message,
            ...restMeta
        };

        // Handle error objects specially
        if (error instanceof Error) {
            logEntry.errorMessage = error.message;
            logEntry.errorCode = error.code;
            if (level === 'ERROR') {
                logEntry.stack = error.stack;
            }
        } else if (error) {
            logEntry.errorDetails = error;
        }

        return JSON.stringify(logEntry);
    }

    debug(message, meta = {}) {
        if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
            console.log(this._formatMessage('DEBUG', message, meta));
        }
    }

    info(message, meta = {}) {
        if (CURRENT_LEVEL <= LOG_LEVELS.INFO) {
            console.log(this._formatMessage('INFO', message, meta));
        }
    }

    warn(message, meta = {}) {
        if (CURRENT_LEVEL <= LOG_LEVELS.WARN) {
            console.warn(this._formatMessage('WARN', message, meta));
        }
    }

    error(message, meta = {}) {
        if (CURRENT_LEVEL <= LOG_LEVELS.ERROR) {
            console.error(this._formatMessage('ERROR', message, meta));
        }
    }

    /**
     * Create a child logger with extended context
     * @param {string} subContext - Additional context to append
     * @returns {Logger} New logger instance
     */
    child(subContext) {
        return new Logger(`${this.context}:${subContext}`);
    }
}

/**
 * Factory function for creating route-specific loggers
 * @param {string} context - Logger context (e.g., 'TRANSACTIONS', 'AUTH')
 * @returns {Logger} Logger instance
 */
const createLogger = (context) => new Logger(context);

module.exports = { Logger, createLogger, LOG_LEVELS };
