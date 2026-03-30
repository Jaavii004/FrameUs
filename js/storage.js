/**
 * FrameUs Storage Utility
 * Uses IndexedDB to provide robust persistence for high-resolution images
 * that would exceed LocalStorage limits (~5MB).
 */

class FrameUsStorage {
    constructor() {
        this.dbName = 'FrameUsDB';
        this.dbVersion = 1;
        this.storeName = 'projectState';
        this.db = null;
        this.saveTimeout = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('FrameUs Storage: IndexedDB Initialized');
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error('FrameUs Storage: Error initializing IndexedDB', event);
                reject(event);
            };
        });
    }

    /**
     * Saves the current project state (canvas JSON and gallery images)
     * @param {string} canvasJson - Result of canvas.toJSON()
     * @param {string[]} galleryImages - Array of dataURLs for the sidebar grid
     * @param {object} meta - Additional metadata (text, font, etc.)
     */
    async saveProject(canvasJson, galleryImages = [], meta = {}) {
        if (!this.db) await this.init();

        // Debounce to prevent heavy I/O on every micro-move
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        
        return new Promise((resolve) => {
            this.saveTimeout = setTimeout(async () => {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                
                const data = {
                    canvasJson,
                    galleryImages,
                    meta,
                    timestamp: Date.now()
                };

                store.put(data, 'currentProject');
                
                transaction.oncomplete = () => {
                    console.log('FrameUs Storage: Project saved successfully');
                    resolve(true);
                };
            }, 500); // 500ms debounce
        });
    }

    /**
     * Loads the last saved project state
     * @returns {Promise<object|null>}
     */
    async loadProject() {
        if (!this.db) await this.init();

        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get('currentProject');

            request.onsuccess = () => {
                resolve(request.result || null);
            };

            request.onerror = () => {
                resolve(null);
            };
        });
    }

    /**
     * Clears all stored project data
     */
    async clearProject() {
        if (!this.db) await this.init();

        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            store.delete('currentProject');

            transaction.oncomplete = () => {
                console.log('FrameUs Storage: Project cleared');
                resolve(true);
            };
        });
    }
}

// Global instance
const storage = new FrameUsStorage();
window.storage = storage;
