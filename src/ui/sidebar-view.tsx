import { ItemView, WorkspaceLeaf } from 'obsidian';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AppContext } from './context/AppContext';
import { SidebarView } from './views/SidebarView';
import type StokerPlugin from '../main';
import type { ListEventCallback } from '../types';

export const SIDEBAR_VIEW_TYPE = 'stoker-sidebar-view';

/**
 * ItemView shell that mounts the React SidebarView component
 */
export class StokerSidebarView extends ItemView {
    private root: Root | null = null;
    private plugin: StokerPlugin;
    private listChangeHandler: ListEventCallback | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: StokerPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return SIDEBAR_VIEW_TYPE;
    }

    getDisplayText(): string {
        const activeList = this.plugin.listManager.getActiveList();
        if (activeList) {
            return `Stoker: ${activeList.name}`;
        }
        return 'Stoker inventory';
    }

    getIcon(): string {
        return 'package';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('stoker-sidebar');

        this.root = createRoot(container);
        this.root.render(
            <StrictMode>
                <AppContext.Provider value={{ app: this.app, plugin: this.plugin }}>
                    <SidebarView />
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
    }

    async onClose(): Promise<void> {
        // Unsubscribe from list changes
        if (this.listChangeHandler) {
            this.plugin.listManager.offListChange(this.listChangeHandler);
            this.listChangeHandler = null;
        }

        this.root?.unmount();
        this.root = null;
    }
}
