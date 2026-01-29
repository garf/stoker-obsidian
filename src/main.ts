import { Plugin } from 'obsidian';
import { StokerSettings, DEFAULT_SETTINGS, StokerSettingTab } from './settings';
import { InventoryStore } from './data/inventory-store';
import { StokerSidebarView, SIDEBAR_VIEW_TYPE } from './ui/sidebar-view';
import { InventoryLeafView, INVENTORY_VIEW_TYPE } from './ui/inventory-leaf-view';
import { ReportView, REPORT_VIEW_TYPE } from './ui/report-view';
import { registerCommands, registerRibbonIcon } from './commands';

export default class StokerPlugin extends Plugin {
    settings: StokerSettings;
    store: InventoryStore;

    async onload(): Promise<void> {
        // Load settings
        await this.loadSettings();

        // Initialize inventory store
        this.store = new InventoryStore(this.app.vault, this.settings.inventoryFilePath);
        await this.store.load();

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

        // Watch for file changes to the inventory file
        this.registerEvent(
            this.app.vault.on('modify', async (file) => {
                if (file.path === this.settings.inventoryFilePath) {
                    // Reload data when file is modified externally
                    await this.store.load();
                }
            })
        );
    }

    onunload(): void {
        // Clean up views
        this.app.workspace.detachLeavesOfType(SIDEBAR_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(INVENTORY_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(REPORT_VIEW_TYPE);
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
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
