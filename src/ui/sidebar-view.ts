import { ItemView, WorkspaceLeaf } from 'obsidian';
import type StokerPlugin from '../main';
import { FoodItem } from '../types';
import { 
    createItemRow, 
    createCategoryHeader, 
    createAddButton, 
    createEmptyState,
    createWarningBanner,
    createOutOfStockBanner 
} from './components';

export const SIDEBAR_VIEW_TYPE = 'stoker-sidebar-view';

export class StokerSidebarView extends ItemView {
    plugin: StokerPlugin;
    private inventoryContentEl: HTMLElement;
    private collapsedCategories: Set<string> = new Set();

    constructor(leaf: WorkspaceLeaf, plugin: StokerPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return SIDEBAR_VIEW_TYPE;
    }

    getDisplayText(): string {
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
        header.createEl('h4', { text: 'Food Inventory' });
        
        // Add button in header
        const addBtn = createAddButton(() => this.openAddModal());
        header.appendChild(addBtn);
        
        // Content area
        this.inventoryContentEl = container.createDiv({ cls: 'stoker-sidebar-content' });
        
        // Load collapsed state from settings
        this.collapsedCategories = new Set(this.plugin.settings.collapsedCategories);
        
        // Register for inventory changes
        this.plugin.store.onInventoryChange(() => this.refresh());
        
        // Initial render
        await this.refresh();
    }

    async onClose(): Promise<void> {
        // Save collapsed state
        this.plugin.settings.collapsedCategories = Array.from(this.collapsedCategories);
        await this.plugin.saveSettings();
    }

    async refresh(): Promise<void> {
        this.inventoryContentEl.empty();
        
        const items = this.plugin.store.getItems();
        
        if (items.length === 0) {
            const emptyState = createEmptyState(
                'Your inventory is empty',
                () => this.openAddModal()
            );
            this.inventoryContentEl.appendChild(emptyState);
            return;
        }
        
        // Warning banners
        const allItems = this.plugin.store.getItems();
        const warningCount = allItems.filter(item => 
            this.plugin.store.getStockStatus(item) === 'warning'
        ).length;
        const outOfStockCount = allItems.filter(item => 
            this.plugin.store.getStockStatus(item) === 'out'
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
        const grouped = this.plugin.store.getItemsByCategory();
        
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
                        this.plugin.store,
                        (item) => this.openEditModal(item),
                        () => this.refresh()
                    );
                    itemsContainer.appendChild(row);
                }
            }
        }
    }

    private openAddModal(): void {
        // Import dynamically to avoid circular dependency
        import('./add-item-modal').then(({ AddItemModal }) => {
            new AddItemModal(this.app, this.plugin).open();
        });
    }

    private openEditModal(item: FoodItem): void {
        import('./edit-item-modal').then(({ EditItemModal }) => {
            new EditItemModal(this.app, this.plugin, item).open();
        });
    }
}

