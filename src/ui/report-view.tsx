import { ItemView, WorkspaceLeaf } from 'obsidian';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AppContext } from './context/AppContext';
import { ReportView as ReportViewComponent } from './views/ReportView';
import type StokerPlugin from '../main';
import type { ListEventCallback } from '../types';

export const REPORT_VIEW_TYPE = 'stoker-report-view';

/**
 * ItemView shell that mounts the React ReportView component
 */
export class ReportView extends ItemView {
    private root: Root | null = null;
    private plugin: StokerPlugin;
    private listChangeHandler: ListEventCallback | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: StokerPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return REPORT_VIEW_TYPE;
    }

    getDisplayText(): string {
        const activeList = this.plugin.listManager.getActiveList();
        if (activeList) {
            return `Report: ${activeList.name}`;
        }
        return 'Inventory report';
    }

    getIcon(): string {
        return 'file-text';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('stoker-report-view');

        this.root = createRoot(container);
        this.root.render(
            <StrictMode>
                <AppContext.Provider value={{ app: this.app, plugin: this.plugin }}>
                    <ReportViewComponent />
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
