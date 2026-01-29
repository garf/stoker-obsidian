import { ItemView, WorkspaceLeaf, setIcon, Menu } from 'obsidian';
import type StokerPlugin from '../main';
import { InventoryList } from '../types';
import { CreateListModal } from './create-list-modal';
import { INVENTORY_VIEW_TYPE } from './inventory-leaf-view';

export const LIST_MANAGER_VIEW_TYPE = 'stoker-list-manager-view';

export class ListManagerView extends ItemView {
    plugin: StokerPlugin;
    private listContentEl: HTMLElement;
    private fileModifyHandler: ((file: any) => void) | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: StokerPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return LIST_MANAGER_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Inventory Lists';
    }

    getIcon(): string {
        return 'list';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('stoker-list-manager-view');
        
        // Header
        const header = container.createDiv({ cls: 'stoker-list-manager-header' });
        header.createEl('h2', { text: 'Inventory Lists' });
        
        // Create new list button
        const createBtn = header.createEl('button', { cls: 'stoker-btn mod-cta' });
        const createIcon = createBtn.createSpan({ cls: 'stoker-btn-icon' });
        setIcon(createIcon, 'plus');
        createBtn.createSpan({ text: 'New list' });
        createBtn.addEventListener('click', () => this.openCreateModal());
        
        // Description
        const desc = container.createEl('p', { 
            text: 'Manage your inventory lists. Each list is stored in a separate markdown file.',
            cls: 'stoker-list-manager-desc'
        });
        
        // Content area
        this.listContentEl = container.createDiv({ cls: 'stoker-list-manager-content' });
        
        // Register for list changes
        this.plugin.listManager.onListChange(() => this.refresh());
        
        // Watch for file modifications to any inventory file
        this.fileModifyHandler = (file: any) => {
            const filePaths = this.plugin.listManager.getAllFilePaths();
            if (filePaths.includes(file.path)) {
                // Debounce refresh to avoid too many updates
                setTimeout(() => this.refresh(), 100);
            }
        };
        this.registerEvent(this.app.vault.on('modify', this.fileModifyHandler));
        
        // Initial render
        await this.refresh();
    }

    async onClose(): Promise<void> {
        // Event listeners are automatically cleaned up by registerEvent
    }

    async refresh(): Promise<void> {
        this.listContentEl.empty();
        
        const lists = this.plugin.listManager.getLists();
        const activeList = this.plugin.listManager.getActiveList();
        
        if (lists.length === 0) {
            this.renderEmptyState();
            return;
        }
        
        // Render list of lists
        const listContainer = this.listContentEl.createDiv({ cls: 'stoker-lists-container' });
        
        // Render all list items (can be done in parallel)
        await Promise.all(
            lists.map(list => this.renderListItem(listContainer, list, list.id === activeList?.id))
        );
    }

    private renderEmptyState(): void {
        const emptyState = this.listContentEl.createDiv({ cls: 'stoker-empty-state' });
        
        const icon = emptyState.createDiv({ cls: 'stoker-empty-icon' });
        setIcon(icon, 'inbox');
        
        emptyState.createEl('h3', { text: 'No inventory lists' });
        emptyState.createEl('p', { text: 'Create your first inventory list to start tracking items.' });
        
        const createBtn = emptyState.createEl('button', { cls: 'stoker-btn mod-cta' });
        const createIcon = createBtn.createSpan({ cls: 'stoker-btn-icon' });
        setIcon(createIcon, 'plus');
        createBtn.createSpan({ text: 'Create first list' });
        createBtn.addEventListener('click', () => this.openCreateModal());
    }

    private async renderListItem(container: HTMLElement, list: InventoryList, isActive: boolean): Promise<void> {
        const item = container.createDiv({ 
            cls: `stoker-list-item ${isActive ? 'stoker-list-item--active' : ''}` 
        });
        
        // Click to select
        item.addEventListener('click', async () => {
            if (!isActive) {
                await this.plugin.listManager.switchList(list.id);
                await this.refresh();
            }
        });
        
        // Left side: icon and info
        const leftSide = item.createDiv({ cls: 'stoker-list-item-left' });
        
        const iconWrapper = leftSide.createDiv({ cls: 'stoker-list-item-icon' });
        setIcon(iconWrapper, isActive ? 'check-circle' : 'circle');
        
        const info = leftSide.createDiv({ cls: 'stoker-list-item-info' });
        info.createDiv({ text: list.name, cls: 'stoker-list-item-name' });
        info.createDiv({ text: list.filePath, cls: 'stoker-list-item-path' });

        // Stats row
        const stats = await this.getListStats(list);
        const statsRow = info.createDiv({ cls: 'stoker-list-item-stats' });
        
        // Total items
        const totalBadge = statsRow.createSpan({ cls: 'stoker-list-stat' });
        totalBadge.setText(`${stats.total} items`);
        
        // Warning count (low stock)
        if (stats.warning > 0) {
            const warningBadge = statsRow.createSpan({ cls: 'stoker-list-stat stoker-list-stat--warning' });
            const warningIcon = warningBadge.createSpan({ cls: 'stoker-list-stat-icon' });
            setIcon(warningIcon, 'alert-triangle');
            warningBadge.createSpan({ text: `${stats.warning}` });
        }
        
        // Out of stock count
        if (stats.outOfStock > 0) {
            const outBadge = statsRow.createSpan({ cls: 'stoker-list-stat stoker-list-stat--danger' });
            const outIcon = outBadge.createSpan({ cls: 'stoker-list-stat-icon' });
            setIcon(outIcon, 'x-circle');
            outBadge.createSpan({ text: `${stats.outOfStock}` });
        }
        
        // Right side: actions
        const actions = item.createDiv({ cls: 'stoker-list-item-actions' });
        
        // Open inventory button
        const openBtn = actions.createEl('button', { 
            cls: 'stoker-list-action-btn',
            attr: { 'aria-label': 'Open inventory' }
        });
        setIcon(openBtn, 'package');
        openBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.openListFile(list);
        });
        
        // More options menu
        const moreBtn = actions.createEl('button', { 
            cls: 'stoker-list-action-btn',
            attr: { 'aria-label': 'More options' }
        });
        setIcon(moreBtn, 'more-vertical');
        moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showListMenu(e, list, isActive);
        });
    }

    /**
     * Get statistics for a list (total items, warning count, out of stock count)
     */
    private async getListStats(list: InventoryList): Promise<{ total: number; warning: number; outOfStock: number }> {
        try {
            // Check if file exists first
            if (!this.plugin.listManager.fileExists(list.filePath)) {
                return { total: 0, warning: 0, outOfStock: 0 };
            }

            const store = await this.plugin.listManager.getStore(list.id);
            if (!store) {
                return { total: 0, warning: 0, outOfStock: 0 };
            }
            
            // Always reload from file to get fresh data
            await store.load();
            
            const items = store.getItems();
            let warning = 0;
            let outOfStock = 0;
            
            for (const item of items) {
                const status = store.getStockStatus(item);
                if (status === 'warning') {
                    warning++;
                } else if (status === 'out') {
                    outOfStock++;
                }
            }
            
            return { total: items.length, warning, outOfStock };
        } catch (error) {
            console.error('Stoker: Failed to get list stats:', error);
            return { total: 0, warning: 0, outOfStock: 0 };
        }
    }

    private showListMenu(e: MouseEvent, list: InventoryList, isActive: boolean): void {
        const menu = new Menu();
        
        if (!isActive) {
            menu.addItem((item) => {
                item.setTitle('Set as active')
                    .setIcon('check')
                    .onClick(async () => {
                        await this.plugin.listManager.switchList(list.id);
                        await this.refresh();
                    });
            });
        }
        
        menu.addItem((item) => {
            item.setTitle('Open inventory')
                .setIcon('package')
                .onClick(async () => {
                    await this.openListFile(list);
                });
        });

        menu.addItem((item) => {
            item.setTitle('View source file')
                .setIcon('file-text')
                .onClick(async () => {
                    await this.openRawFile(list);
                });
        });
        
        menu.addSeparator();
        
        menu.addItem((item) => {
            item.setTitle('Delete list')
                .setIcon('trash')
                .onClick(() => {
                    this.confirmDeleteList(list);
                });
        });
        
        menu.showAtMouseEvent(e);
    }

    private async openListFile(list: InventoryList): Promise<void> {
        // Switch to this list first
        await this.plugin.listManager.switchList(list.id);
        
        // Open the Stoker inventory view
        const { workspace } = this.app;
        
        // Check if inventory view already exists
        const existing = workspace.getLeavesOfType(INVENTORY_VIEW_TYPE);
        if (existing.length > 0 && existing[0]) {
            workspace.revealLeaf(existing[0]);
            return;
        }
        
        // Create new inventory view in a tab
        const leaf = workspace.getLeaf('tab');
        if (leaf) {
            await leaf.setViewState({
                type: INVENTORY_VIEW_TYPE,
                active: true,
            });
            workspace.revealLeaf(leaf);
        }
    }

    private async openRawFile(list: InventoryList): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(list.filePath);
        if (file) {
            const leaf = this.app.workspace.getLeaf('tab');
            if (leaf) {
                await leaf.openFile(file as any);
            }
        }
    }

    private confirmDeleteList(list: InventoryList): void {
        const modal = new ConfirmDeleteModal(this.app, list, async () => {
            await this.plugin.listManager.deleteList(list.id);
            await this.refresh();
        });
        modal.open();
    }

    private openCreateModal(): void {
        new CreateListModal(this.app, this.plugin, () => this.refresh()).open();
    }
}

/**
 * Confirmation modal for deleting a list
 */
import { Modal, App } from 'obsidian';

class ConfirmDeleteModal extends Modal {
    private list: InventoryList;
    private onConfirm: () => void;

    constructor(app: App, list: InventoryList, onConfirm: () => void) {
        super(app);
        this.list = list;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('stoker-modal');
        
        contentEl.createEl('h2', { text: 'Delete list?' });
        
        contentEl.createEl('p', { 
            text: `Are you sure you want to delete "${this.list.name}"?`
        });
        
        contentEl.createEl('p', { 
            text: 'This will remove the list from Stoker but will NOT delete the markdown file.',
            cls: 'stoker-modal-info'
        });
        
        const buttonContainer = contentEl.createDiv({ cls: 'stoker-modal-buttons' });
        
        buttonContainer.createEl('button', { text: 'Cancel' })
            .addEventListener('click', () => this.close());
        
        const deleteBtn = buttonContainer.createEl('button', { 
            text: 'Delete list',
            cls: 'mod-warning'
        });
        deleteBtn.addEventListener('click', () => {
            this.onConfirm();
            this.close();
        });
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}

