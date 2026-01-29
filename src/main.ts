import { Plugin } from 'obsidian';
import { StokerSettings, DEFAULT_SETTINGS, StokerSettingTab } from './settings';
import { InventoryStore } from './data/inventory-store';
import { ListManager } from './data/list-manager';
import { StokerSidebarView, SIDEBAR_VIEW_TYPE } from './ui/sidebar-view';
import { InventoryLeafView, INVENTORY_VIEW_TYPE } from './ui/inventory-leaf-view';
import { ReportView, REPORT_VIEW_TYPE } from './ui/report-view';
import { ListManagerView, LIST_MANAGER_VIEW_TYPE } from './ui/list-manager-view';
import { registerCommands, registerRibbonIcon } from './commands';

export default class StokerPlugin extends Plugin {
    settings: StokerSettings;
    listManager: ListManager;
    
    // Cached reference to active store for synchronous access
    private _activeStore: InventoryStore | null = null;

    /**
     * Get the active inventory store
     * Returns null if no list is active - callers should check before using
     */
    get store(): InventoryStore | null {
        if (!this._activeStore) {
            // Try to get from list manager synchronously
            this._activeStore = this.listManager?.getActiveStoreSync() ?? null;
        }
        return this._activeStore;
    }
    
    /**
     * Check if there's an active store available
     */
    hasActiveStore(): boolean {
        return this.store !== null;
    }

    async onload(): Promise<void> {
        // Load settings
        await this.loadSettings();

        // Migrate from single file to lists if needed
        await this.migrateToMultipleLists();

        // Initialize list manager (with full app for metadata cache access)
        this.listManager = new ListManager(
            this.app,
            this.settings,
            () => this.saveSettings()
        );
        await this.listManager.initialize();
        
        // Update cached store reference
        this._activeStore = this.listManager.getActiveStoreSync();
        
        // Listen for list changes to update cached store synchronously
        this.listManager.onListChange((type) => {
            if (type === 'list-switched' || type === 'list-deleted' || type === 'list-created' || type === 'list-updated') {
                // Update synchronously for immediate access - avoids race conditions
                this._activeStore = this.listManager.getActiveStoreSync();
            }
        });

        // Register views
        this.registerView(
            SIDEBAR_VIEW_TYPE,
            (leaf) => new StokerSidebarView(leaf, this)
        );

        this.registerView(
            INVENTORY_VIEW_TYPE,
            (leaf) => new InventoryLeafView(leaf, this)
        );

        this.registerView(
            REPORT_VIEW_TYPE,
            (leaf) => new ReportView(leaf, this)
        );

        this.registerView(
            LIST_MANAGER_VIEW_TYPE,
            (leaf) => new ListManagerView(leaf, this)
        );

        // Register commands
        registerCommands(this);

        // Register ribbon icon
        registerRibbonIcon(this);

        // Register settings tab
        this.addSettingTab(new StokerSettingTab(this.app, this));

        // Show sidebar on startup if enabled
        if (this.settings.showSidebarOnStartup) {
            this.app.workspace.onLayoutReady(async () => {
                await this.activateSidebarView();
            });
        }

        // Watch for file changes to any inventory file
        this.registerEvent(
            this.app.vault.on('modify', async (file) => {
                const filePaths = this.listManager.getAllFilePaths();
                if (filePaths.includes(file.path)) {
                    // Check if this is the active list
                    const activeList = this.listManager.getActiveList();
                    if (activeList && activeList.filePath === file.path) {
                        // Reload the active store
                        await this.listManager.reloadActiveStore();
                    }
                }
            })
        );

        // Watch for file deletions
        this.registerEvent(
            this.app.vault.on('delete', async (file) => {
                const filePaths = this.listManager.getAllFilePaths();
                if (filePaths.includes(file.path)) {
                    // Handle the deletion - remove from lists
                    await this.listManager.handleFileDeleted(file.path);
                    // Update cached store reference
                    this._activeStore = this.listManager.getActiveStore();
                }
            })
        );

        // Watch for file renames (moving files)
        this.registerEvent(
            this.app.vault.on('rename', async (file, oldPath) => {
                const filePaths = this.listManager.getAllFilePaths();
                if (filePaths.includes(oldPath)) {
                    // Update the list's file path to the new location
                    const list = this.listManager.getLists().find(l => l.filePath === oldPath);
                    if (list) {
                        await this.listManager.updateList(list.id, { filePath: file.path });
                        console.debug(`Stoker: File renamed from ${oldPath} to ${file.path}`);
                    }
                }
            })
        );
    }

    onunload(): void {
        // Stop watching for stoker files
        this.listManager?.stopFileWatcher();
        // Views are automatically cleaned up by Obsidian
    }

    async loadSettings(): Promise<void> {
        const data = await this.loadData() as Partial<StokerSettings> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    /**
     * Migrate from single inventoryFilePath to lists array
     * This handles users upgrading from the old single-file version
     */
    private async migrateToMultipleLists(): Promise<void> {
        // Check if migration is needed
        if (this.settings.lists.length > 0) {
            // Already has lists, no migration needed
            return;
        }

        // Check if there's an old inventory file path (legacy migration)
        // Access via indexing to avoid deprecated property warning during migration
        const legacyPath = (this.settings as unknown as Record<string, unknown>)['inventoryFilePath'];
        if (legacyPath && typeof legacyPath === 'string') {
            // Create a default list from the old file path
            const defaultList = {
                id: Date.now().toString(36) + Math.random().toString(36).substring(2),
                name: 'Default',
                filePath: legacyPath,
            };
            
            this.settings.lists = [defaultList];
            this.settings.activeListId = defaultList.id;
            
            await this.saveSettings();
            
            console.debug('Stoker: Migrated to multi-list format with default list');
        }
    }

    private async activateSidebarView(): Promise<void> {
        const { workspace } = this.app;
        
        // Check if sidebar already exists
        const existing = workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
        if (existing.length > 0) {
            return;
        }

        // Create sidebar in left panel
        const leaf = workspace.getLeftLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: SIDEBAR_VIEW_TYPE,
                active: true,
            });
        }
    }
}
