import { ItemView, WorkspaceLeaf, setIcon, Menu } from 'obsidian';
import type StokerPlugin from '../main';
import { InventoryItem, InventoryList } from '../types';
import { 
    createItemRow, 
    createCategoryHeader, 
    createAddButton, 
    createEmptyState,
    createWarningBanner,
    createOutOfStockBanner 
} from './components';
import { LIST_MANAGER_VIEW_TYPE } from './list-manager-view';

export const SIDEBAR_VIEW_TYPE = 'stoker-sidebar-view';

export class StokerSidebarView extends ItemView {
    plugin: StokerPlugin;
    private inventoryContentEl: HTMLElement;
    private listNameEl: HTMLElement;
    private collapsedCategories: Set<string> = new Set();
    private currentStoreCallback: (() => void) | null = null;
    private listChangeCallback: ((type: any) => void) | null = null;
    private currentStore: import('../data/inventory-store').InventoryStore | null = null;

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
        return 'Stoker Inventory';
    }

    getIcon(): string {
        return 'package';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('stoker-sidebar');
        
        // Header
        const header = container.createDiv({ cls: 'stoker-sidebar-header' });
        
        // Title row with list name
        const titleRow = header.createDiv({ cls: 'stoker-sidebar-title-row' });
        titleRow.createEl('h4', { text: 'Inventory' });
        
        // Add button in header
        const addBtn = createAddButton(() => this.openAddModal());
        titleRow.appendChild(addBtn);
        
        // List selector row
        const listRow = header.createDiv({ cls: 'stoker-sidebar-list-row' });
        
        // List dropdown selector
        const listSelector = listRow.createDiv({ cls: 'stoker-list-selector' });
        const listIcon = listSelector.createSpan({ cls: 'stoker-list-selector-icon' });
        setIcon(listIcon, 'list');
        
        this.listNameEl = listSelector.createSpan({ cls: 'stoker-list-selector-name' });
        this.updateListName();
        
        const chevron = listSelector.createSpan({ cls: 'stoker-list-selector-chevron' });
        setIcon(chevron, 'chevron-down');
        
        // Click to show dropdown menu
        listSelector.addEventListener('click', (e) => this.showListDropdown(e));

        // Manage lists button (separate from dropdown)
        const manageBtn = listRow.createDiv({ cls: 'stoker-manage-lists-btn' });
        manageBtn.setAttribute('aria-label', 'Manage lists');
        setIcon(manageBtn, 'settings');
        manageBtn.addEventListener('click', () => this.openListManager());
        
        // Content area
        this.inventoryContentEl = container.createDiv({ cls: 'stoker-sidebar-content' });
        
        // Load collapsed state from settings
        this.collapsedCategories = new Set(this.plugin.settings.collapsedCategories);
        
        // Register for inventory changes on current store
        this.registerStoreListener();
        
        // Register for list changes - re-register store listener when list switches
        this.listChangeCallback = async (type) => {
            this.updateListName();
            
            // When list switches, we need to listen to the new store
            if (type === 'list-switched' || type === 'list-created') {
                this.registerStoreListener();
            }
            
            await this.refresh();
        };
        this.plugin.listManager.onListChange(this.listChangeCallback);
        
        // Initial render
        await this.refresh();
    }

    /**
     * Register listener on the current active store
     * Removes old listener if any
     */
    private registerStoreListener(): void {
        // Remove old listener from the OLD store if exists
        if (this.currentStoreCallback && this.currentStore) {
            this.currentStore.offInventoryChange(this.currentStoreCallback);
        }
        
        // Track the new store instance
        this.currentStore = this.plugin.store;
        
        // Only register if there's an active store
        if (this.currentStore) {
            // Create new listener
            this.currentStoreCallback = () => this.refresh();
            this.currentStore.onInventoryChange(this.currentStoreCallback);
        } else {
            this.currentStoreCallback = null;
        }
    }

    async onClose(): Promise<void> {
        // Remove store listener
        if (this.currentStoreCallback && this.currentStore) {
            this.currentStore.offInventoryChange(this.currentStoreCallback);
            this.currentStoreCallback = null;
        }
        
        // Remove list change listener
        if (this.listChangeCallback) {
            this.plugin.listManager.offListChange(this.listChangeCallback);
            this.listChangeCallback = null;
        }
        
        // Save collapsed state
        this.plugin.settings.collapsedCategories = Array.from(this.collapsedCategories);
        await this.plugin.saveSettings();
    }

    private updateListName(): void {
        const activeList = this.plugin.listManager.getActiveList();
        const lists = this.plugin.listManager.getLists();
        
        if (activeList) {
            const displayName = this.getListDisplayName(activeList, lists);
            this.listNameEl.setText(displayName);
            this.listNameEl.title = activeList.filePath;
        } else if (lists.length === 0) {
            this.listNameEl.setText('No lists');
            this.listNameEl.title = 'Select to create a list';
        } else {
            this.listNameEl.setText('Select list');
            this.listNameEl.title = 'Select to choose a list';
        }
    }

    /**
     * Get a display name for a list, adding path disambiguation if needed
     */
    private getListDisplayName(list: InventoryList, allLists: InventoryList[]): string {
        // Find lists with the same name
        const sameNameLists = allLists.filter(l => l.name === list.name);
        
        if (sameNameLists.length <= 1) {
            // No disambiguation needed
            return list.name;
        }
        
        // Need to add path info to disambiguate
        const disambiguator = this.getPathDisambiguator(list.filePath, sameNameLists.map(l => l.filePath));
        return `${list.name} (${disambiguator})`;
    }

    /**
     * Get the minimal path segment needed to disambiguate a file path
     */
    private getPathDisambiguator(filePath: string, allPaths: string[]): string {
        const parts = filePath.split('/');
        
        // Start with just the filename (without .md)
        const filename = parts[parts.length - 1]?.replace('.md', '') || '';
        
        // If only one path, just use filename
        if (allPaths.length <= 1) {
            return filename;
        }
        
        // Build up path from right to left until unique
        let result = filename;
        for (let i = parts.length - 2; i >= 0; i--) {
            const segment = parts[i];
            if (!segment) continue;
            
            result = `${segment}/${result}`;
            
            // Check if this is enough to disambiguate
            const matchingPaths = allPaths.filter(p => p.endsWith(result + '.md') || p.endsWith(result));
            if (matchingPaths.length === 1) {
                break;
            }
        }
        
        // Remove filename from result (we already show the list name)
        const resultParts = result.split('/');
        if (resultParts.length > 1) {
            resultParts.pop(); // Remove filename
            return resultParts.join('/');
        }
        
        // If no parent folder difference, show full path without extension
        return filePath.replace('.md', '');
    }

    /**
     * Show a dropdown menu with all available lists
     */
    private showListDropdown(e: MouseEvent): void {
        const lists = this.plugin.listManager.getLists();
        const activeList = this.plugin.listManager.getActiveList();
        
        const menu = new Menu();
        
        if (lists.length === 0) {
            menu.addItem((item) => {
                item.setTitle('No lists available')
                    .setDisabled(true);
            });
            menu.addSeparator();
            menu.addItem((item) => {
                item.setTitle('Create new list')
                    .setIcon('plus')
                    .onClick(() => this.openCreateListModal());
            });
        } else {
            // Add each list as a menu item
            for (const list of lists) {
                const isActive = list.id === activeList?.id;
                const displayName = this.getListDisplayName(list, lists);
                
                menu.addItem((item) => {
                    item.setTitle(displayName)
                        .setIcon(isActive ? 'check' : 'file-text')
                        .setChecked(isActive)
                        .onClick(async () => {
                            if (!isActive) {
                                await this.plugin.listManager.switchList(list.id);
                            }
                        });
                });
            }
            
            menu.addSeparator();
            
            menu.addItem((item) => {
                item.setTitle('Create new list')
                    .setIcon('plus')
                    .onClick(() => this.openCreateListModal());
            });
        }
        
        menu.showAtMouseEvent(e);
    }

    private openCreateListModal(): void {
        import('./create-list-modal').then(({ CreateListModal }) => {
            new CreateListModal(this.app, this.plugin).open();
        });
    }

    async refresh(): Promise<void> {
        this.inventoryContentEl.empty();
        
        // Check if there's an active list
        const activeList = this.plugin.listManager.getActiveList();
        if (!activeList) {
            const emptyState = this.createNoListState();
            this.inventoryContentEl.appendChild(emptyState);
            return;
        }

        // Check if the file still exists
        if (!this.plugin.listManager.activeListFileExists()) {
            const missingState = this.createMissingFileState(activeList.filePath);
            this.inventoryContentEl.appendChild(missingState);
            return;
        }
        
        const store = this.plugin.store;
        if (!store) {
            const emptyState = this.createNoListState();
            this.inventoryContentEl.appendChild(emptyState);
            return;
        }
        
        const items = store.getItems();
        
        if (items.length === 0) {
            const emptyState = createEmptyState(
                'Your inventory is empty',
                () => this.openAddModal()
            );
            this.inventoryContentEl.appendChild(emptyState);
            return;
        }
        
        // Warning banners
        const allItems = store.getItems();
        const warningCount = allItems.filter(item => 
            store.getStockStatus(item) === 'warning'
        ).length;
        const outOfStockCount = allItems.filter(item => 
            store.getStockStatus(item) === 'out'
        ).length;
        
        if (warningCount > 0) {
            const warningBanner = createWarningBanner(warningCount, () => {
                const firstWarning = this.inventoryContentEl.querySelector('.stoker-item--warning');
                if (firstWarning) {
                    firstWarning.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    (firstWarning as HTMLElement).addClass('stoker-item--highlight');
                    setTimeout(() => (firstWarning as HTMLElement).removeClass('stoker-item--highlight'), 1500);
                }
            });
            this.inventoryContentEl.appendChild(warningBanner);
        }
        
        if (outOfStockCount > 0) {
            const dangerBanner = createOutOfStockBanner(outOfStockCount, () => {
                const firstOut = this.inventoryContentEl.querySelector('.stoker-item--out');
                if (firstOut) {
                    firstOut.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    (firstOut as HTMLElement).addClass('stoker-item--highlight');
                    setTimeout(() => (firstOut as HTMLElement).removeClass('stoker-item--highlight'), 1500);
                }
            });
            this.inventoryContentEl.appendChild(dangerBanner);
        }
        
        // Group items by category
        const grouped = store.getItemsByCategory();
        
        // Sort categories (empty/uncategorized last)
        const sortedCategories = Array.from(grouped.keys()).sort((a, b) => {
            if (a === '') return 1;
            if (b === '') return -1;
            return a.localeCompare(b);
        });
        
        for (const category of sortedCategories) {
            const categoryItems = grouped.get(category)!;
            const displayName = category || 'Uncategorized';
            const isCollapsed = this.collapsedCategories.has(displayName);
            
            // Category section
            const section = this.inventoryContentEl.createDiv({ cls: 'stoker-category' });
            
            // Header
            const header = createCategoryHeader(displayName, isCollapsed, () => {
                if (this.collapsedCategories.has(displayName)) {
                    this.collapsedCategories.delete(displayName);
                } else {
                    this.collapsedCategories.add(displayName);
                }
                this.refresh();
            });
            section.appendChild(header);
            
            // Items container
            if (!isCollapsed) {
                const itemsContainer = section.createDiv({ cls: 'stoker-category-items' });
                
                for (const item of categoryItems) {
                    const row = createItemRow(
                        item,
                        store,
                        (item) => this.openEditModal(item),
                        () => this.refresh()
                    );
                    itemsContainer.appendChild(row);
                }
            }
        }
    }

    private createNoListState(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'stoker-empty-state';
        
        const icon = container.createDiv({ cls: 'stoker-empty-icon' });
        setIcon(icon, 'inbox');
        
        container.createEl('h3', { text: 'No active list' });
        container.createEl('p', { text: 'Create or select an inventory list to start tracking items.' });
        
        const createBtn = container.createEl('button', { cls: 'stoker-btn mod-cta' });
        const createIcon = createBtn.createSpan({ cls: 'stoker-btn-icon' });
        setIcon(createIcon, 'list');
        createBtn.createSpan({ text: 'Open list manager' });
        createBtn.addEventListener('click', () => this.openListManager());
        
        return container;
    }

    private createMissingFileState(filePath: string): HTMLElement {
        const container = document.createElement('div');
        container.className = 'stoker-empty-state stoker-missing-file';
        
        const icon = container.createDiv({ cls: 'stoker-empty-icon stoker-warning-icon' });
        setIcon(icon, 'alert-triangle');
        
        container.createEl('h3', { text: 'File not found' });
        container.createEl('p', { 
            text: `The inventory file "${filePath}" no longer exists.`,
            cls: 'stoker-missing-file-path'
        });
        container.createEl('p', { 
            text: 'Select a different list or create a new one.',
            cls: 'stoker-missing-file-hint'
        });
        
        const btnContainer = container.createDiv({ cls: 'stoker-missing-file-actions' });
        
        const selectBtn = btnContainer.createEl('button', { cls: 'stoker-btn mod-cta' });
        const selectIcon = selectBtn.createSpan({ cls: 'stoker-btn-icon' });
        setIcon(selectIcon, 'list');
        selectBtn.createSpan({ text: 'Open list manager' });
        selectBtn.addEventListener('click', () => this.openListManager());

        const removeBtn = btnContainer.createEl('button', { cls: 'stoker-btn' });
        const removeIcon = removeBtn.createSpan({ cls: 'stoker-btn-icon' });
        setIcon(removeIcon, 'trash-2');
        removeBtn.createSpan({ text: 'Remove from list' });
        removeBtn.addEventListener('click', async () => {
            const activeList = this.plugin.listManager.getActiveList();
            if (activeList) {
                await this.plugin.listManager.deleteList(activeList.id);
            }
        });
        
        return container;
    }

    private async openListManager(): Promise<void> {
        const { workspace } = this.app;
        
        // Check if view already exists
        const existing = workspace.getLeavesOfType(LIST_MANAGER_VIEW_TYPE);
        if (existing.length > 0 && existing[0]) {
            workspace.revealLeaf(existing[0]);
            return;
        }
        
        // Create new view in a tab
        const leaf = workspace.getLeaf('tab');
        if (leaf) {
            await leaf.setViewState({
                type: LIST_MANAGER_VIEW_TYPE,
                active: true,
            });
            workspace.revealLeaf(leaf);
        }
    }

    private openAddModal(): void {
        // Import dynamically to avoid circular dependency
        import('./add-item-modal').then(({ AddItemModal }) => {
            new AddItemModal(this.app, this.plugin).open();
        });
    }

    private openEditModal(item: InventoryItem): void {
        import('./edit-item-modal').then(({ EditItemModal }) => {
            new EditItemModal(this.app, this.plugin, item).open();
        });
    }
}
