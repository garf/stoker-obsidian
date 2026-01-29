import { App, Vault, TFile } from 'obsidian';
import { InventoryStore } from './inventory-store';
import { 
    InventoryList, 
    ListEventType, 
    ListEventCallback,
    StokerSettings 
} from '../types';
import { 
    discoverInventoryFiles, 
    watchForStokerFiles, 
    DiscoveredFile 
} from '../utils/file-discovery';

/**
 * Manages multiple inventory lists
 */
export class ListManager {
    private app: App;
    private vault: Vault;
    private stores: Map<string, InventoryStore> = new Map();
    private listeners: ListEventCallback[] = [];
    private settings: StokerSettings;
    private saveSettings: () => Promise<void>;
    private unsubscribeWatcher?: () => void;

    constructor(
        app: App, 
        settings: StokerSettings, 
        saveSettings: () => Promise<void>
    ) {
        this.app = app;
        this.vault = app.vault;
        this.settings = settings;
        this.saveSettings = saveSettings;
    }

    /**
     * Generate a unique ID for new lists
     */
    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    /**
     * Initialize the list manager - discovers stoker files and loads the active list
     */
    async initialize(): Promise<void> {
        // Auto-discover inventory files from the vault
        await this.syncDiscoveredFiles();

        // Load the active list if any
        if (this.settings.activeListId) {
            const store = this.getStore(this.settings.activeListId);
            if (store) {
                await store.load();
            }
        }

        // Start watching for new stoker files
        this.startFileWatcher();
    }

    /**
     * Check if a file exists in the vault
     */
    fileExists(filePath: string): boolean {
        const file = this.vault.getAbstractFileByPath(filePath);
        return file instanceof TFile;
    }

    /**
     * Sync discovered inventory files with the settings
     * This finds all files with stoker: inventory frontmatter
     * and adds them to the lists if not already present.
     * Also removes lists whose files no longer exist.
     */
    async syncDiscoveredFiles(): Promise<void> {
        const discovered = discoverInventoryFiles(this.app);
        let hasChanges = false;

        // First, remove lists whose files no longer exist
        const listsToRemove: string[] = [];
        for (const list of this.settings.lists) {
            if (!this.fileExists(list.filePath)) {
                listsToRemove.push(list.id);
                console.debug(`Stoker: Removing list for missing file: ${list.filePath}`);
            }
        }

        if (listsToRemove.length > 0) {
            this.settings.lists = this.settings.lists.filter(
                list => !listsToRemove.includes(list.id)
            );
            
            // Clear cached stores for removed lists
            for (const id of listsToRemove) {
                this.stores.delete(id);
            }

            // If active list was removed, clear it
            if (this.settings.activeListId && listsToRemove.includes(this.settings.activeListId)) {
                this.settings.activeListId = null;
            }

            hasChanges = true;
        }

        // Add newly discovered files
        for (const item of discovered) {
            const filePath = item.file.path;
            
            // Check if this file is already in our lists
            const existingList = this.settings.lists.find(l => l.filePath === filePath);
            if (!existingList) {
                // Auto-add the discovered file as a new list
                const newList: InventoryList = {
                    id: this.generateId(),
                    name: item.file.basename, // Use filename without extension
                    filePath,
                };
                this.settings.lists.push(newList);
                hasChanges = true;

                console.debug(`Stoker: Auto-discovered inventory file: ${filePath}`);
            }
        }

        // If this is the first list and no active list, set it as active
        if (this.settings.lists.length > 0 && !this.settings.activeListId) {
            this.settings.activeListId = this.settings.lists[0]?.id ?? null;
            hasChanges = true;
        }

        if (hasChanges) {
            await this.saveSettings();
        }
    }

    /**
     * Start watching for new stoker files being created
     */
    private startFileWatcher(): void {
        this.unsubscribeWatcher = watchForStokerFiles(
            this.app,
            (discovered: DiscoveredFile) => {
                if (discovered.type === 'inventory') {
                    // Check if already tracked
                    const existing = this.settings.lists.find(
                        l => l.filePath === discovered.file.path
                    );
                    if (!existing) {
                        const newList: InventoryList = {
                            id: this.generateId(),
                            name: discovered.file.basename,
                            filePath: discovered.file.path,
                        };
                        this.settings.lists.push(newList);
                        void this.saveSettings();
                        this.notifyListeners('list-created', newList);
                        console.debug(`Stoker: New inventory file detected: ${discovered.file.path}`);
                    }
                }
            },
            (file: TFile) => {
                // File removed or no longer a stoker file
                // We don't auto-remove from settings, user must manually delete
                console.debug(`Stoker: File no longer marked as stoker file: ${file.path}`);
            }
        );
    }

    /**
     * Stop watching for file changes (call on plugin unload)
     */
    stopFileWatcher(): void {
        if (this.unsubscribeWatcher) {
            this.unsubscribeWatcher();
            this.unsubscribeWatcher = undefined;
        }
    }

    /**
     * Get all inventory lists
     */
    getLists(): InventoryList[] {
        return [...this.settings.lists];
    }

    /**
     * Get a list by ID
     */
    getList(id: string): InventoryList | undefined {
        return this.settings.lists.find(list => list.id === id);
    }

    /**
     * Get the active list metadata
     */
    getActiveList(): InventoryList | undefined {
        if (!this.settings.activeListId) return undefined;
        return this.getList(this.settings.activeListId);
    }

    /**
     * Get the store for a specific list (lazy-loads if needed)
     */
    getStore(listId: string): InventoryStore | null {
        const list = this.getList(listId);
        if (!list) return null;

        // Check cache
        if (this.stores.has(listId)) {
            return this.stores.get(listId)!;
        }

        // Create and cache store
        const store = new InventoryStore(this.vault, list.filePath);
        this.stores.set(listId, store);
        
        return store;
    }

    /**
     * Get the active store (most common operation)
     */
    getActiveStore(): InventoryStore | null {
        if (!this.settings.activeListId) return null;
        return this.getStore(this.settings.activeListId);
    }

    /**
     * Get active store synchronously (returns null if not loaded)
     * Use this in contexts where async isn't possible
     */
    getActiveStoreSync(): InventoryStore | null {
        if (!this.settings.activeListId) return null;
        return this.stores.get(this.settings.activeListId) ?? null;
    }

    /**
     * Create a new list
     */
    async createList(name: string, filePath: string): Promise<InventoryList> {
        const newList: InventoryList = {
            id: this.generateId(),
            name,
            filePath,
        };

        // Create and load the store first to validate the file can be created
        const store = new InventoryStore(this.vault, filePath);
        
        try {
            await store.load();
            // Immediately save to create the file on disk
            await store.save();
        } catch (error) {
            console.error('Stoker: Failed to create file:', error);
            throw new Error(`Could not create file: ${filePath}`);
        }

        // Only add to settings after file is successfully created
        this.settings.lists.push(newList);
        this.stores.set(newList.id, store);

        // If this is the first list, make it active
        if (this.settings.lists.length === 1) {
            this.settings.activeListId = newList.id;
        }

        await this.saveSettings();

        this.notifyListeners('list-created', newList);

        return newList;
    }

    /**
     * Delete a list
     */
    async deleteList(id: string): Promise<boolean> {
        const index = this.settings.lists.findIndex(list => list.id === id);
        if (index === -1) return false;

        const deletedList = this.settings.lists[index];
        this.settings.lists.splice(index, 1);

        // Remove from cache
        this.stores.delete(id);

        // If deleted list was active, switch to another or set to null
        if (this.settings.activeListId === id) {
            this.settings.activeListId = this.settings.lists[0]?.id ?? null;
            
            // Load the new active store if any
            if (this.settings.activeListId) {
                const store = this.getStore(this.settings.activeListId);
                if (store) {
                    await store.load();
                }
            }
        }

        await this.saveSettings();
        this.notifyListeners('list-deleted', deletedList);

        return true;
    }

    /**
     * Switch to a different list
     */
    async switchList(id: string): Promise<boolean> {
        const list = this.getList(id);
        if (!list) return false;

        if (this.settings.activeListId === id) return true; // Already active

        this.settings.activeListId = id;
        await this.saveSettings();

        // Load the store (will handle missing files gracefully)
        const store = this.getStore(id);
        if (store) {
            await store.load();
        }

        this.notifyListeners('list-switched', list);

        return true;
    }

    /**
     * Update a list's metadata (name or file path)
     */
    async updateList(id: string, updates: Partial<Omit<InventoryList, 'id'>>): Promise<InventoryList | null> {
        const list = this.getList(id);
        if (!list) return null;

        const index = this.settings.lists.findIndex(l => l.id === id);
        if (index === -1) return null;

        // Update the list
        if (updates.name !== undefined) {
            list.name = updates.name;
        }
        if (updates.filePath !== undefined) {
            list.filePath = updates.filePath;
            
            // Update the store's file path if it's cached
            const store = this.stores.get(id);
            if (store) {
                store.setFilePath(updates.filePath);
                await store.load();
            }
        }

        this.settings.lists[index] = list;
        await this.saveSettings();

        this.notifyListeners('list-updated', list);

        return list;
    }

    /**
     * Check if a file path is already used by another list
     */
    isFilePathUsed(filePath: string, excludeId?: string): boolean {
        return this.settings.lists.some(
            list => list.filePath === filePath && list.id !== excludeId
        );
    }

    /**
     * Reload the active store from file
     */
    async reloadActiveStore(): Promise<void> {
        const store = this.getActiveStore();
        if (store) {
            await store.load();
        }
    }

    /**
     * Register a listener for list changes
     */
    onListChange(callback: ListEventCallback): void {
        this.listeners.push(callback);
    }

    /**
     * Remove a listener
     */
    offListChange(callback: ListEventCallback): void {
        const index = this.listeners.indexOf(callback);
        if (index !== -1) {
            this.listeners.splice(index, 1);
        }
    }

    /**
     * Notify all listeners of a change
     */
    private notifyListeners(type: ListEventType, list?: InventoryList): void {
        for (const listener of this.listeners) {
            listener(type, list);
        }
    }

    /**
     * Get all file paths being watched
     */
    getAllFilePaths(): string[] {
        return this.settings.lists.map(list => list.filePath);
    }

    /**
     * Handle when a file is deleted from the vault
     * Removes the corresponding list from settings
     */
    async handleFileDeleted(filePath: string): Promise<boolean> {
        const list = this.settings.lists.find(l => l.filePath === filePath);
        if (!list) return false;

        console.debug(`Stoker: File deleted, removing list: ${filePath}`);
        
        // Remove from settings
        this.settings.lists = this.settings.lists.filter(l => l.id !== list.id);
        
        // Remove from cache
        this.stores.delete(list.id);

        // If this was the active list, switch to another
        if (this.settings.activeListId === list.id) {
            this.settings.activeListId = this.settings.lists[0]?.id ?? null;
            
            // Load the new active store if any
            if (this.settings.activeListId) {
                const store = this.getStore(this.settings.activeListId);
                if (store) {
                    await store.load();
                }
            }
        }

        await this.saveSettings();
        this.notifyListeners('list-deleted', list);

        return true;
    }

    /**
     * Check if the active list's file still exists
     * Returns false if no active list or file is missing
     */
    activeListFileExists(): boolean {
        const activeList = this.getActiveList();
        if (!activeList) return false;
        return this.fileExists(activeList.filePath);
    }
}

