import type StokerPlugin from '../main';
import { INVENTORY_VIEW_TYPE } from '../ui/inventory-leaf-view';
import { SIDEBAR_VIEW_TYPE } from '../ui/sidebar-view';
import { REPORT_VIEW_TYPE } from '../ui/report-view';
import { AddItemModal } from '../ui/add-item-modal';

/**
 * Register all plugin commands
 */
export function registerCommands(plugin: StokerPlugin): void {
    // Open inventory view
    plugin.addCommand({
        id: 'open-inventory',
        name: 'Open food inventory',
        callback: async () => {
            const { workspace } = plugin.app;
            
            // Check if view already exists
            const existing = workspace.getLeavesOfType(INVENTORY_VIEW_TYPE);
            if (existing.length > 0 && existing[0]) {
                workspace.revealLeaf(existing[0]);
                return;
            }
            
            // Create new view
            const leaf = workspace.getLeaf('tab');
            if (leaf) {
                await leaf.setViewState({
                    type: INVENTORY_VIEW_TYPE,
                    active: true,
                });
                workspace.revealLeaf(leaf);
            }
        },
    });

    // Quick add item
    plugin.addCommand({
        id: 'add-item',
        name: 'Add new item to inventory',
        callback: () => {
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
                    workspace.revealLeaf(leaf);
                }
            }
        },
    });

    // Show low stock items
    plugin.addCommand({
        id: 'show-low-stock',
        name: 'Show low stock items',
        callback: async () => {
            const lowStock = plugin.store.getLowStockItems();
            
            if (lowStock.length === 0) {
                const { Notice } = await import('obsidian');
                new Notice('All items are well stocked!');
                return;
            }
            
            // Open inventory view with filter
            const { workspace } = plugin.app;
            const existing = workspace.getLeavesOfType(INVENTORY_VIEW_TYPE);
            
            if (existing.length > 0 && existing[0]) {
                workspace.revealLeaf(existing[0]);
            } else {
                const leaf = workspace.getLeaf('tab');
                if (leaf) {
                    await leaf.setViewState({
                        type: INVENTORY_VIEW_TYPE,
                        active: true,
                    });
                    workspace.revealLeaf(leaf);
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
                workspace.revealLeaf(existing[0]);
                return;
            }
            
            // Create new view
            const leaf = workspace.getLeaf('tab');
            if (leaf) {
                await leaf.setViewState({
                    type: REPORT_VIEW_TYPE,
                    active: true,
                });
                workspace.revealLeaf(leaf);
            }
        },
    });
}

/**
 * Register the ribbon icon
 */
export function registerRibbonIcon(plugin: StokerPlugin): void {
    plugin.addRibbonIcon('package', 'Open Stoker inventory', async () => {
        const { workspace } = plugin.app;
        
        // Check if view already exists
        const existing = workspace.getLeavesOfType(INVENTORY_VIEW_TYPE);
        if (existing.length > 0 && existing[0]) {
            workspace.revealLeaf(existing[0]);
            return;
        }
        
        // Create new view
        const leaf = workspace.getLeaf('tab');
        if (leaf) {
            await leaf.setViewState({
                type: INVENTORY_VIEW_TYPE,
                active: true,
            });
            workspace.revealLeaf(leaf);
        }
    });
}

