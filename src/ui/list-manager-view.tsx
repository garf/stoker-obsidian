import { ItemView, WorkspaceLeaf } from 'obsidian';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AppContext } from './context/AppContext';
import { ListManagerView as ListManagerViewComponent } from './views/ListManagerView';
import type StokerPlugin from '../main';
import type { ListEventCallback } from '../types';

export const LIST_MANAGER_VIEW_TYPE = 'stoker-list-manager-view';

/**
 * ItemView shell that mounts the React ListManagerView component
 */
export class ListManagerView extends ItemView {
    private root: Root | null = null;
    private plugin: StokerPlugin;
    private listChangeHandler: ListEventCallback | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: StokerPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return LIST_MANAGER_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Inventory lists';
    }

    getIcon(): string {
        return 'list';
    }

    onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('stoker-list-manager-view');

        this.root = createRoot(container);
        this.root.render(
            <StrictMode>
                <AppContext.Provider value={{ app: this.app, plugin: this.plugin }}>
                    <ListManagerViewComponent />
                </AppContext.Provider>
            </StrictMode>
        );

        // Subscribe to list changes to update tab title (for consistency with other views)
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
