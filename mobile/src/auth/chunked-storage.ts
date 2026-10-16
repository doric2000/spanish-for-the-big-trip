// Stores a value in the iOS Keychain (expo-secure-store) in small pieces.
// Some iOS versions reject Keychain values above ~2048 bytes, and a Supabase
// session is larger than that. 500 characters is at most 2000 UTF-8 bytes.
export const CHUNK_CHARS = 500;

export type KeyValueStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

// The shape supabase-js expects for `auth.storage`.
export type SessionStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const countKey = (key: string) => `${key}.count`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

export function createChunkedStorage(store: KeyValueStore): SessionStorage {
  async function readCount(key: string): Promise<number> {
    const raw = await store.getItemAsync(countKey(key));
    const count = raw === null ? 0 : Number(raw);
    return Number.isInteger(count) && count >= 0 ? count : 0;
  }

  async function removeItem(key: string): Promise<void> {
    const count = await readCount(key);
    // Remove the count first: a half-removed value then reads as "no session".
    await store.deleteItemAsync(countKey(key));
    for (let index = 0; index < count; index += 1) await store.deleteItemAsync(chunkKey(key, index));
  }

  return {
    async getItem(key) {
      const count = await readCount(key);
      if (count === 0) return null;
      const parts: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const part = await store.getItemAsync(chunkKey(key, index));
        // A missing piece means a broken value; treat it as signed out.
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join('');
    },

    async setItem(key, value) {
      await removeItem(key);
      const parts: string[] = [];
      for (let start = 0; start < value.length; start += CHUNK_CHARS) parts.push(value.slice(start, start + CHUNK_CHARS));
      for (const [index, part] of parts.entries()) await store.setItemAsync(chunkKey(key, index), part);
      // Written last, so the value only becomes readable once every piece exists.
      await store.setItemAsync(countKey(key), String(parts.length));
    },

    removeItem,
  };
}
