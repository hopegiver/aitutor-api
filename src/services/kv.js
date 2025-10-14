/**
 * Generic Key-Value Service
 * Simple wrapper around Cloudflare KV with JSON serialization
 */
export class KVService {
  constructor(kv) {
    this.kv = kv;
  }

  /**
   * Get value by key
   */
  async get(key) {
    const value = await this.kv.get(key);
    return value ? JSON.parse(value) : null;
  }

  /**
   * Set value by key
   */
  async set(key, value) {
    await this.kv.put(key, JSON.stringify(value));
  }

  /**
   * Delete value by key
   */
  async delete(key) {
    await this.kv.delete(key);
  }

  /**
   * List keys with optional prefix
   */
  async list(options = {}) {
    const { keys } = await this.kv.list(options);
    return keys.map(key => key.name);
  }

  /**
   * Get multiple values by keys
   */
  async getMany(keys) {
    const results = {};
    for (const key of keys) {
      results[key] = await this.get(key);
    }
    return results;
  }

  /**
   * Set multiple key-value pairs
   */
  async setMany(keyValuePairs) {
    for (const [key, value] of Object.entries(keyValuePairs)) {
      await this.set(key, value);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    const value = await this.kv.get(key);
    return value !== null;
  }

  /**
   * Get keys with prefix and return their values
   */
  async getAllWithPrefix(prefix, limit = 100) {
    const keys = await this.list({ prefix, limit });
    const results = {};

    for (const key of keys) {
      results[key] = await this.get(key);
    }

    return results;
  }

  /**
   * Utility: Build content key
   */
  static contentKey(type, contentId) {
    return `content:${type}:${contentId}`;
  }

  /**
   * Utility: Build auth key
   */
  static authKey(domain) {
    return `auth:${domain}`;
  }

  /**
   * Utility: Build config key
   */
  static configKey(name) {
    return `config:${name}`;
  }

}