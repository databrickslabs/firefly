import crypto from "crypto";

// Encryption key from environment (must be 32 bytes = 64 hex characters)
const getEncryptionKey = (): Buffer => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is required");
  }

  const keyBuffer = Buffer.from(key, "hex");
  if (keyBuffer.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes (64 hex characters)");
  }

  return keyBuffer;
};

/**
 * Encrypts a plain text token using AES-256-GCM
 * Returns URL-safe base64 encoded ciphertext
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();

  // Generate a random 12-byte nonce (GCM standard)
  const nonce = crypto.randomBytes(12);

  // Create cipher
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);

  // Encrypt
  let encrypted = cipher.update(plaintext, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  // Get auth tag
  const authTag = cipher.getAuthTag();

  // Combine nonce + encrypted + authTag
  const combined = Buffer.concat([nonce, encrypted, authTag]);

  // Return URL-safe base64 (remove padding for cleaner URLs)
  return combined.toString("base64url").replace(/=/g, "");
}

/**
 * Decrypts a URL-safe base64 encoded ciphertext using AES-256-GCM
 * Returns the original plain text token
 */
export function decryptToken(ciphertext: string): string {
  const key = getEncryptionKey();

  // Add back padding if needed
  const paddingLength = (4 - (ciphertext.length % 4)) % 4;
  const paddedCiphertext = ciphertext + "=".repeat(paddingLength);

  // Decode from base64
  const combined = Buffer.from(paddedCiphertext, "base64url");

  // Extract components
  const nonce = combined.subarray(0, 12);
  const authTag = combined.subarray(combined.length - 16);
  const encrypted = combined.subarray(12, combined.length - 16);

  // Create decipher
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(authTag);

  // Decrypt
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

/**
 * Generates a proxy URL with encrypted token
 * Pattern: /app-proxy/{encrypted_token}/{provider}/{domain}/{app_name}/...
 */
export function generateProxyUrl(
  token: string,
  appUrl: string,
  path: string = "/"
): string {
  // Parse the app URL to extract components
  // Expected format: https://{app_name}.{provider}.{domain}.{suffix}
  const url = new URL(appUrl);
  const hostParts = url.hostname.split(".");

  if (hostParts.length < 3) {
    throw new Error(`Invalid app URL format: ${appUrl}`);
  }

  const appName = hostParts[0];
  const provider = hostParts[1];
  // Remove the suffix (last part) and join remaining parts as domain
  const domain = hostParts.slice(2, -1).join(".");

  // Encrypt the token
  const encryptedToken = encryptToken(token);

  // Build the proxy URL
  const proxyPath = `/app-proxy/${encryptedToken}/${provider}/${domain}/${appName}${path}`;

  return proxyPath;
}

/**
 * Parses a proxy URL and returns the decrypted token and original app URL
 */
export function parseProxyUrl(proxyUrl: string): {
  token: string;
  appUrl: string;
  path: string;
} {
  // Pattern: /app-proxy/{encrypted_token}/{provider}/{domain}/{app_name}/...
  const regex = /^\/app-proxy\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)(\/.*)?$/;
  const matches = proxyUrl.match(regex);

  if (!matches) {
    throw new Error(`Invalid proxy URL format: ${proxyUrl}`);
  }

  const encryptedToken = matches[1];
  const provider = matches[2];
  const domain = matches[3];
  const appName = matches[4];
  const path = matches[5] || "/";

  // Decrypt the token
  const token = decryptToken(encryptedToken);

  // Get domain suffix from environment (default: com)
  const domainSuffix = process.env.APP_DOMAIN_SUFFIX || "com";

  // Reconstruct the app URL
  const appUrl = `https://${appName}.${provider}.${domain}.${domainSuffix}`;

  return { token, appUrl, path };
}
