import { FuzzySuggestModal, Notice } from 'obsidian';
import type StokerPlugin from '../main';
import { INVENTORY_VIEW_TYPE } from '../ui/inventory-leaf-view';
import { SIDEBAR_VIEW_TYPE } from '../ui/sidebar-view';
import { REPORT_VIEW_TYPE } from '../ui/report-view';
import { LIST_MANAGER_VIEW_TYPE } from '../ui/list-manager-view';
import { AddItemModal } from '../ui/add-item-modal';
import { CreateListModal } from '../ui/create-list-modal';
import { InventoryList } from '../types';

/**
 * Register all plugin commands
 */
export function registerCommands(plugin: StokerPlugin): void {
    // Open inventory view
    plugin.addCommand({
        id: 'open-inventory',
        name: 'Open inventory',
        callback: async () => {
            const { workspace } = plugin.app;
            
            // Check if view already exists
            const existing = workspace.getLeavesOfType(INVENTORY_VIEW_TYPE);
            if (existing.length > 0 && existing[0]) {
                void workspace.revealLeaf(existing[0]);
                return;
            }
            
            // Create new view
            const leaf = workspace.getLeaf('tab');
            if (leaf) {
                await leaf.setViewState({
                    type: INVENTORY_VIEW_TYPE,
                    active: true,
                });
                void workspace.revealLeaf(leaf);
            }
        },
    });

    // Quick add item
    plugin.addCommand({
        id: 'add-item',
        name: 'Add new item to inventory',
        callback: () => {
            // Check if there's an active list
            const activeList = plugin.listManager.getActiveList();
            if (!activeList) {
                new Notice('No active inventory list. Please create or select a list first.');
                return;
            }
            new AddItemModal(plugin.app, plugin).open();
        },
    });

    // Toggle sidebar
    plugin.addCommand({
        id: 'toggle-sidebar',
        name: 'Toggle inventory sidebar',
        callback: async () => {
            const { workspace } = plugin.app;
            const existing = workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
            
            if (existing.length > 0 && existing[0]) {
                // Close existing sidebar
                existing[0].detach();
            } else {
                // Open sidebar
                const leaf = workspace.getLeftLeaf(false);
                if (leaf) {
                    await leaf.setViewState({
                        type: SIDEBAR_VIEW_TYPE,
                        active: true,
                    });
                    void workspace.revealLeaf(leaf);
                }
            }
        },
    });

    // Show low stock items
    plugin.addCommand({
        id: 'show-low-stock',
        name: 'Show low stock items',
        callback: async () => {
            const activeList = plugin.listManager.getActiveList();
            if (!activeList) {
                new Notice('No active inventory list.');
                return;
            }
            
            const store = plugin.store;
            if (!store) {
                new Notice('No active inventory list.');
                return;
            }
            
            const lowStock = store.getLowStockItems();
            
            if (lowStock.length === 0) {
                new Notice('All items are well stocked!');
                return;
            }
            
            // Open inventory view with filter
            const { workspace } = plugin.app;
            const existing = workspace.getLeavesOfType(INVENTORY_VIEW_TYPE);
            
            if (existing.length > 0 && existing[0]) {
                void workspace.revealLeaf(existing[0]);
            } else {
                const leaf = workspace.getLeaf('tab');
                if (leaf) {
                    await leaf.setViewState({
                        type: INVENTORY_VIEW_TYPE,
                        active: true,
                    });
                    void workspace.revealLeaf(leaf);
                }
            }
        },
    });

    // Open report view
    plugin.addCommand({
        id: 'open-report',
        name: 'Open inventory report',
        callback: async () => {
            const { workspace } = plugin.app;
            
            // Check if view already exists
            const existing = workspace.getLeavesOfType(REPORT_VIEW_TYPE);
            if (existing.length > 0 && existing[0]) {
                void workspace.revealLeaf(existing[0]);
                return;
            }
            
            // Create new view
            const leaf = workspace.getLeaf('tab');
            if (leaf) {
                await leaf.setViewState({
                    type: REPORT_VIEW_TYPE,
                    active: true,
                });
                void workspace.revealLeaf(leaf);
            }
        },
    });

    // Open list manager
    plugin.addCommand({
        id: 'open-list-manager',
        name: 'Open inventory list manager',
        callback: async () => {
            const { workspace } = plugin.app;
            
            // Check if view already exists
            const existing = workspace.getLeavesOfType(LIST_MANAGER_VIEW_TYPE);
            if (existing.length > 0 && existing[0]) {
                void workspace.revealLeaf(existing[0]);
                return;
            }
            
            // Create new view
            const leaf = workspace.getLeaf('tab');
            if (leaf) {
                await leaf.setViewState({
                    type: LIST_MANAGER_VIEW_TYPE,
                    active: true,
                });
                void workspace.revealLeaf(leaf);
            }
        },
    });

    // Quick switch list
    plugin.addCommand({
        id: 'switch-list',
        name: 'Switch to inventory list...',
        callback: () => {
            const lists = plugin.listManager.getLists();
            
            if (lists.length === 0) {
                new Notice('No inventory lists. Create one first.');
                return;
            }
            
            if (lists.length === 1) {
                new Notice(`Only one list available: ${lists[0]?.name}`);
                return;
            }
            
            new ListSwitcherModal(plugin).open();
        },
    });

    // Create new list
    plugin.addCommand({
        id: 'create-list',
        name: 'Create new inventory list',
        callback: () => {
            new CreateListModal(plugin.app, plugin).open();
        },
    });
}

/**
 * Register the ribbon icon
 */
export function registerRibbonIcon(plugin: StokerPlugin): void {
    // eslint-disable-next-line obsidianmd/ui/sentence-case
    plugin.addRibbonIcon('package', 'Open Stoker', async () => {
        const { workspace } = plugin.app;
        
        // Check if view already exists
        const existing = workspace.getLeavesOfType(INVENTORY_VIEW_TYPE);
        if (existing.length > 0 && existing[0]) {
            void workspace.revealLeaf(existing[0]);
            return;
        }
        
        // Create new view
        const leaf = workspace.getLeaf('tab');
        if (leaf) {
            await leaf.setViewState({
                type: INVENTORY_VIEW_TYPE,
                active: true,
            });
            void workspace.revealLeaf(leaf);
        }
    });
}

/**
 * Fuzzy suggester modal for switching between lists
 */
class ListSwitcherModal extends FuzzySuggestModal<InventoryList> {
    plugin: StokerPlugin;

    constructor(plugin: StokerPlugin) {
        super(plugin.app);
        this.plugin = plugin;
        this.setPlaceholder('Select an inventory list...');
    }

    getItems(): InventoryList[] {
        return this.plugin.listManager.getLists();
    }

    getItemText(list: InventoryList): string {
        const activeList = this.plugin.listManager.getActiveList();
        const isActive = activeList?.id === list.id;
        return isActive ? `${list.name} (active)` : list.name;
    }

    onChooseItem(list: InventoryList): void {
        void this.plugin.listManager.switchList(list.id).then(() => {
            new Notice(`Switched to: ${list.name}`);
        });
    }
}
