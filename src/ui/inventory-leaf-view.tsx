import { ItemView, WorkspaceLeaf } from 'obsidian';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AppContext } from './context/AppContext';
import { InventoryView } from './views/InventoryView';
import type StokerPlugin from '../main';
import type { ListEventCallback } from '../types';

export const INVENTORY_VIEW_TYPE = 'stoker-inventory-view';

/**
 * ItemView shell that mounts the React InventoryView component
 */
export class InventoryLeafView extends ItemView {
    private root: Root | null = null;
    private plugin: StokerPlugin;
    private listChangeHandler: ListEventCallback | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: StokerPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return INVENTORY_VIEW_TYPE;
    }

    getDisplayText(): string {
        const activeList = this.plugin.listManager.getActiveList();
        if (activeList) {
            return `Inventory: ${activeList.name}`;
        }
        return 'Inventory';
    }

    getIcon(): string {
        return 'package';
    }

    onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('stoker-inventory-view');

        this.root = createRoot(container);
        this.root.render(
            <StrictMode>
                <AppContext.Provider value={{ app: this.app, plugin: this.plugin }}>
                    <InventoryView />
                </AppContext.Provider>
            </StrictMode>
        );

        // Subscribe to list changes to update tab title
        this.listChangeHandler = () => {
            // Update the tab header text directly (cast to access internal Obsidian property)
            const displayText = this.getDisplayText();
            const leaf = this.leaf as WorkspaceLeaf & { tabHeaderInnerTitleEl?: HTMLElement };
            if (leaf.tabHeaderInnerTitleEl) {
                leaf.tabHeaderInnerTitleEl.textContent = displayText;
            }
        };
        this.plugin.listManager.onListChange(this.listChangeHandler);
        return Promise.resolve();
    }

    onClose(): Promise<void> {
        // Unsubscribe from list changes
        if (this.listChangeHandler) {
            this.plugin.listManager.offListChange(this.listChangeHandler);
            this.listChangeHandler = null;
        }

        this.root?.unmount();
        this.root = null;
        return Promise.resolve();
    }
}
