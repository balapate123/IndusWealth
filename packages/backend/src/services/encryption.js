const crypto = require('crypto');
const { createLogger } = require('./logger');

const logger = createLogger('ENCRYPTION');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = 'enc:';

/**
 * Get the encryption key from environment variable.
 * Must be 64 hex characters (32 bytes).
 */
const getEncryptionKey = () => {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('ENCRYPTION_KEY environment variable is required in production');
        }
        logger.warn('ENCRYPTION_KEY not set - Plaid tokens will be stored unencrypted');
        return null;
    }
    if (key.length !== 64 || !/^[0-9a-fA-F]+$/.test(key)) {
        throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
    }
    return Buffer.from(key, 'hex');
};

let encryptionKey = null;
try {
    encryptionKey = getEncryptionKey();
} catch (error) {
    logger.error('Encryption key initialization failed', { error: error.message });
    if (process.env.NODE_ENV === 'production') {
        throw error;
    }
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a prefixed base64 string: "enc:<base64([iv][authTag][ciphertext])>"
 * @param {string} plaintext
 * @returns {string} Encrypted string or original if no key
 */
const encrypt = (plaintext) => {
    if (!plaintext) return plaintext;
    if (!encryptionKey) return plaintext;

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);

    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Format: [iv 12B][authTag 16B][ciphertext]
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return ENCRYPTED_PREFIX + combined.toString('base64');
};

/**
 * Decrypt an encrypted string produced by encrypt().
 * @param {string} ciphertext - The "enc:<base64>" string
 * @returns {string} Decrypted plaintext
 */
const decrypt = (ciphertext) => {
    if (!ciphertext) return ciphertext;
    if (!isEncrypted(ciphertext)) return ciphertext;
    if (!encryptionKey) {
        logger.warn('Cannot decrypt - no encryption key available');
        return ciphertext;
    }

    const data = Buffer.from(ciphertext.slice(ENCRYPTED_PREFIX.length), 'base64');

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
    ]);

    return decrypted.toString('utf8');
};

/**
 * Check if a value is already encrypted (has the "enc:" prefix).
 * @param {string} value
 * @returns {boolean}
 */
const isEncrypted = (value) => {
    if (!value || typeof value !== 'string') return false;
    return value.startsWith(ENCRYPTED_PREFIX);
};

/**
 * Check if encryption is available (key is configured).
 * @returns {boolean}
 */
const isEncryptionAvailable = () => {
    return encryptionKey !== null;
};

module.exports = {
    encrypt,
    decrypt,
    isEncrypted,
    isEncryptionAvailable,
};
