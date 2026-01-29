import { ItemView, WorkspaceLeaf, Menu, setIcon } from 'obsidian';
import type StokerPlugin from '../main';
import { FoodItem } from '../types';
import { 
    createItemRow, 
    createCategoryHeader, 
    createAddButton, 
    createEmptyState,
    createSearchInput,
    createWarningBanner,
    createOutOfStockBanner 
} from './components';
import { LIST_MANAGER_VIEW_TYPE } from './list-manager-view';

export const INVENTORY_VIEW_TYPE = 'stoker-inventory-view';

type SortOption = 'name' | 'category' | 'amount' | 'status';
type FilterOption = 'all' | 'in-stock-enough' | 'almost-running-out' | 'not-in-stock' | 'any-in-stock' | 'planned-restock';

export class InventoryLeafView extends ItemView {
    plugin: StokerPlugin;
    private inventoryContentEl: HTMLElement;
    private collapsedCategories: Set<string> = new Set();
    private searchQuery = '';
    private sortBy: SortOption = 'category';
    private filterBy: FilterOption = 'all';
    private filterByCategory: string = '__all__'; // '__all__' means all categories, '' means uncategorized
    
    // UI element references for proper state sync
    private filterBtnLabel: HTMLSpanElement;
    private shoppingBtn: HTMLButtonElement;
    private categoryBtnLabel: HTMLSpanElement;
    private searchInput: HTMLInputElement;

    constructor(leaf: WorkspaceLeaf, plugin: StokerPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return INVENTORY_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Food Inventory';
    }

    getIcon(): string {
        return 'package';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('stoker-inventory-view');
        
        // Header with title and controls
        const header = container.createDiv({ cls: 'stoker-view-header' });
        
        const titleRow = header.createDiv({ cls: 'stoker-title-row' });
        titleRow.createEl('h2', { text: 'Food Inventory' });
        
        // Shopping list button (toggles filter)
        this.shoppingBtn = titleRow.createEl('button', { cls: 'stoker-shopping-btn' });
        const shoppingIcon = this.shoppingBtn.createSpan({ cls: 'stoker-shopping-btn-icon' });
        setIcon(shoppingIcon, 'shopping-cart');
        this.shoppingBtn.createSpan({ text: 'Shopping list' });
        this.shoppingBtn.addEventListener('click', () => {
            if (this.filterBy === 'planned-restock') {
                // Toggle off - show all items
                this.setStatusFilter('all');
            } else {
                // Toggle on - show only planned restock
                this.setStatusFilter('planned-restock');
            }
        });
        
        // Report button
        const reportBtn = titleRow.createEl('button', { cls: 'stoker-report-btn' });
        const reportIcon = reportBtn.createSpan({ cls: 'stoker-report-btn-icon' });
        setIcon(reportIcon, 'file-text');
        reportBtn.createSpan({ text: 'Report' });
        reportBtn.addEventListener('click', () => this.openReportView());
        
        // Add button
        const addBtn = createAddButton(() => this.openAddModal());
        titleRow.appendChild(addBtn);
        
        // Controls row (search, sort, filter)
        const controlsRow = header.createDiv({ cls: 'stoker-controls-row' });
        
        // Search
        const searchResult = createSearchInput((query) => {
            this.searchQuery = query.toLowerCase();
            this.refresh();
        });
        this.searchInput = searchResult.input;
        controlsRow.appendChild(searchResult.container);
        
        // Sort dropdown
        const sortContainer = controlsRow.createDiv({ cls: 'stoker-control-group' });
        sortContainer.createSpan({ text: 'Sort:', cls: 'stoker-control-label' });
        const sortBtn = sortContainer.createEl('button', { cls: 'stoker-dropdown-btn' });
        sortBtn.createSpan({ text: 'Category' });
        const sortIcon = sortBtn.createSpan({ cls: 'stoker-dropdown-icon' });
        setIcon(sortIcon, 'chevron-down');
        sortBtn.addEventListener('click', (e) => this.showSortMenu(e, sortBtn));
        
        // Status filter dropdown
        const filterContainer = controlsRow.createDiv({ cls: 'stoker-control-group' });
        filterContainer.createSpan({ text: 'Status:', cls: 'stoker-control-label' });
        const filterBtn = filterContainer.createEl('button', { cls: 'stoker-dropdown-btn stoker-status-filter-btn' });
        this.filterBtnLabel = filterBtn.createSpan({ text: 'All items' });
        const filterIcon = filterBtn.createSpan({ cls: 'stoker-dropdown-icon' });
        setIcon(filterIcon, 'chevron-down');
        filterBtn.addEventListener('click', (e) => this.showFilterMenu(e));
        
        // Category filter dropdown
        const categoryContainer = controlsRow.createDiv({ cls: 'stoker-control-group' });
        categoryContainer.createSpan({ text: 'Category:', cls: 'stoker-control-label' });
        const categoryBtn = categoryContainer.createEl('button', { cls: 'stoker-dropdown-btn stoker-category-filter-btn' });
        this.categoryBtnLabel = categoryBtn.createSpan({ text: 'All categories' });
        const categoryIcon = categoryBtn.createSpan({ cls: 'stoker-dropdown-icon' });
        setIcon(categoryIcon, 'chevron-down');
        categoryBtn.addEventListener('click', (e) => this.showCategoryMenu(e));
        
        // Manage categories button
        const manageCatBtn = categoryContainer.createEl('button', { 
            cls: 'stoker-btn stoker-manage-cat-btn',
            attr: { 'aria-label': 'Manage categories' }
        });
        setIcon(manageCatBtn, 'settings');
        manageCatBtn.addEventListener('click', () => this.openCategoryModal());
        
        // Reset filters button
        const resetBtn = controlsRow.createEl('button', { 
            cls: 'stoker-reset-btn',
            attr: { 'aria-label': 'Reset all filters' }
        });
        const resetIcon = resetBtn.createSpan({ cls: 'stoker-reset-btn-icon' });
        setIcon(resetIcon, 'x');
        resetBtn.createSpan({ text: 'Reset' });
        resetBtn.addEventListener('click', () => this.resetAllFilters());
        
        // Content area
        this.inventoryContentEl = container.createDiv({ cls: 'stoker-view-content' });
        
        // Load collapsed state
        this.collapsedCategories = new Set(this.plugin.settings.collapsedCategories);
        
        // Register for inventory changes
        this.plugin.store.onInventoryChange(() => this.refresh());
        
        // Register for list changes (when switching lists)
        this.plugin.listManager.onListChange(() => this.refresh());
        
        // Initial render
        await this.refresh();
    }

    async onClose(): Promise<void> {
        // Save collapsed state
        this.plugin.settings.collapsedCategories = Array.from(this.collapsedCategories);
        await this.plugin.saveSettings();
    }

    private showSortMenu(e: MouseEvent, btn: HTMLElement): void {
        const menu = new Menu();
        
        const options: { value: SortOption; label: string }[] = [
            { value: 'category', label: 'Category' },
            { value: 'name', label: 'Name' },
            { value: 'amount', label: 'Amount' },
            { value: 'status', label: 'Status' },
        ];
        
        for (const opt of options) {
            menu.addItem((item) => {
                item.setTitle(opt.label);
                if (this.sortBy === opt.value) {
                    item.setIcon('check');
                }
                item.onClick(() => {
                    this.sortBy = opt.value;
                    btn.querySelector('span')!.textContent = opt.label;
                    this.refresh();
                });
            });
        }
        
        menu.showAtMouseEvent(e);
    }

    private showFilterMenu(e: MouseEvent): void {
        const menu = new Menu();
        
        const options: { value: FilterOption; label: string }[] = [
            { value: 'all', label: 'All items' },
            { value: 'in-stock-enough', label: 'In stock enough' },
            { value: 'almost-running-out', label: 'Almost running out' },
            { value: 'not-in-stock', label: 'Not in stock' },
            { value: 'any-in-stock', label: 'Any in stock' },
            { value: 'planned-restock', label: 'Planned restock' },
        ];
        
        for (const opt of options) {
            menu.addItem((item) => {
                item.setTitle(opt.label);
                if (this.filterBy === opt.value) {
                    item.setIcon('check');
                }
                item.onClick(() => {
                    this.setStatusFilter(opt.value);
                });
            });
        }
        
        menu.showAtMouseEvent(e);
    }

    /**
     * Set the status filter and update all related UI elements
     */
    private setStatusFilter(filter: FilterOption): void {
        this.filterBy = filter;
        
        // Update filter button label
        const labels: Record<FilterOption, string> = {
            'all': 'All items',
            'in-stock-enough': 'In stock enough',
            'almost-running-out': 'Almost running out',
            'not-in-stock': 'Not in stock',
            'any-in-stock': 'Any in stock',
            'planned-restock': 'Planned restock',
        };
        this.filterBtnLabel.textContent = labels[filter];
        
        // Update shopping button active state
        if (filter === 'planned-restock') {
            this.shoppingBtn.addClass('stoker-shopping-btn--active');
        } else {
            this.shoppingBtn.removeClass('stoker-shopping-btn--active');
        }
        
        this.refresh();
    }

    private showCategoryMenu(e: MouseEvent): void {
        const menu = new Menu();
        
        // Get all categories from the store
        const categories = this.plugin.store.getCategories();
        
        // Add "All categories" option
        menu.addItem((item) => {
            item.setTitle('All categories');
            if (this.filterByCategory === '__all__') {
                item.setIcon('check');
            }
            item.onClick(() => {
                this.setCategoryFilter('__all__');
            });
        });
        
        menu.addSeparator();
        
        // Add "Uncategorized" option
        menu.addItem((item) => {
            item.setTitle('Uncategorized');
            if (this.filterByCategory === '') {
                item.setIcon('check');
            }
            item.onClick(() => {
                this.setCategoryFilter('');
            });
        });
        
        // Add each category
        for (const cat of categories) {
            menu.addItem((item) => {
                item.setTitle(cat);
                if (this.filterByCategory === cat) {
                    item.setIcon('check');
                }
                item.onClick(() => {
                    this.setCategoryFilter(cat);
                });
            });
        }
        
        menu.showAtMouseEvent(e);
    }

    /**
     * Set the category filter and update the UI
     */
    private setCategoryFilter(category: string): void {
        this.filterByCategory = category;
        
        // Update category button label
        if (category === '__all__') {
            this.categoryBtnLabel.textContent = 'All categories';
        } else if (category === '') {
            this.categoryBtnLabel.textContent = 'Uncategorized';
        } else {
            this.categoryBtnLabel.textContent = category;
        }
        
        this.refresh();
    }

    /**
     * Reset all filters to their default state
     */
    private resetAllFilters(): void {
        // Clear search
        this.searchQuery = '';
        this.searchInput.value = '';
        
        // Reset status filter
        this.filterBy = 'all';
        this.filterBtnLabel.textContent = 'All items';
        
        // Reset category filter
        this.filterByCategory = '__all__';
        this.categoryBtnLabel.textContent = 'All categories';
        
        // Reset shopping button
        this.shoppingBtn.removeClass('stoker-shopping-btn--active');
        
        this.refresh();
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
        
        let items = this.plugin.store.getItems();
        
        // Apply search filter (search by name only)
        if (this.searchQuery) {
            items = items.filter(item => 
                item.name.toLowerCase().includes(this.searchQuery)
            );
        }
        
        // Apply category filter
        if (this.filterByCategory !== '__all__') {
            items = items.filter(item => item.category === this.filterByCategory);
        }
        
        // Apply status filter
        items = this.applyFilter(items);
        
        if (items.length === 0 && !this.searchQuery && this.filterBy === 'all') {
            const emptyState = createEmptyState(
                'Your inventory is empty',
                () => this.openAddModal()
            );
            this.inventoryContentEl.appendChild(emptyState);
            return;
        }
        
        if (items.length === 0) {
            const emptyState = createEmptyState(
                this.searchQuery 
                    ? `No items matching "${this.searchQuery}"`
                    : 'No items match the current filter'
            );
            this.inventoryContentEl.appendChild(emptyState);
            return;
        }
        
        // Warning banners (only when showing all)
        if (this.filterBy === 'all' && !this.searchQuery) {
            // Count items by status
            const allItems = this.plugin.store.getItems();
            const warningCount = allItems.filter(item => 
                this.plugin.store.getStockStatus(item) === 'warning'
            ).length;
            const outOfStockCount = allItems.filter(item => 
                this.plugin.store.getStockStatus(item) === 'out'
            ).length;
            
            // Warning banner (almost running out - yellow)
            if (warningCount > 0) {
                const warningBanner = createWarningBanner(warningCount, () => {
                    this.setStatusFilter('almost-running-out');
                });
                this.inventoryContentEl.appendChild(warningBanner);
            }
            
            // Danger banner (out of stock - red)
            if (outOfStockCount > 0) {
                const dangerBanner = createOutOfStockBanner(outOfStockCount, () => {
                    this.setStatusFilter('not-in-stock');
                });
                this.inventoryContentEl.appendChild(dangerBanner);
            }
        }
        
        // Stats bar
        this.renderStats(items);
        
        // Render based on sort mode
        if (this.sortBy === 'category') {
            this.renderByCategory(items);
        } else {
            this.renderFlat(items);
        }
    }

    private applyFilter(items: FoodItem[]): FoodItem[] {
        switch (this.filterBy) {
            case 'in-stock-enough':
                // Items with normal stock levels (above minimum or no minimum set)
                return items.filter(item => {
                    const status = this.plugin.store.getStockStatus(item);
                    return status === 'normal' || status === 'in-stock';
                });
            case 'almost-running-out':
                // Items below minimum threshold but not yet out
                return items.filter(item => {
                    const status = this.plugin.store.getStockStatus(item);
                    return status === 'warning';
                });
            case 'not-in-stock':
                // Items completely out of stock
                return items.filter(item => {
                    const status = this.plugin.store.getStockStatus(item);
                    return status === 'out';
                });
            case 'any-in-stock':
                // Any item that has some stock (normal, in-stock, or warning)
                return items.filter(item => {
                    const status = this.plugin.store.getStockStatus(item);
                    return status !== 'out';
                });
            case 'planned-restock':
                // Items marked for planned restock
                return items.filter(item => item.plannedRestock);
            default:
                return items;
        }
    }

    private renderStats(items: FoodItem[]): void {
        const stats = this.inventoryContentEl.createDiv({ cls: 'stoker-stats' });
        
        const total = items.length;
        const lowStock = items.filter(i => {
            const s = this.plugin.store.getStockStatus(i);
            return s === 'warning';
        }).length;
        const outOfStock = items.filter(i => {
            const s = this.plugin.store.getStockStatus(i);
            return s === 'out';
        }).length;
        
        stats.createSpan({ text: `${total} items`, cls: 'stoker-stat' });
        if (lowStock > 0) {
            stats.createSpan({ text: `${lowStock} low`, cls: 'stoker-stat stoker-stat--warning' });
        }
        if (outOfStock > 0) {
            stats.createSpan({ text: `${outOfStock} out`, cls: 'stoker-stat stoker-stat--danger' });
        }
    }

    private renderByCategory(items: FoodItem[]): void {
        // Group items by category
        const grouped = new Map<string, FoodItem[]>();
        
        for (const item of items) {
            const cat = item.category || '';
            if (!grouped.has(cat)) {
                grouped.set(cat, []);
            }
            grouped.get(cat)!.push(item);
        }
        
        // Sort categories
        const sortedCategories = Array.from(grouped.keys()).sort((a, b) => {
            if (a === '') return 1;
            if (b === '') return -1;
            return a.localeCompare(b);
        });
        
        for (const category of sortedCategories) {
            const categoryItems = grouped.get(category)!;
            const displayName = category || 'Uncategorized';
            const isCollapsed = this.collapsedCategories.has(displayName);
            
            const section = this.inventoryContentEl.createDiv({ cls: 'stoker-category' });
            
            // Header with item count
            const header = createCategoryHeader(
                `${displayName} (${categoryItems.length})`, 
                isCollapsed, 
                () => {
                    if (this.collapsedCategories.has(displayName)) {
                        this.collapsedCategories.delete(displayName);
                    } else {
                        this.collapsedCategories.add(displayName);
                    }
                    this.refresh();
                }
            );
            section.appendChild(header);
            
            if (!isCollapsed) {
                const itemsContainer = section.createDiv({ cls: 'stoker-category-items' });
                
                // Sort items within category
                categoryItems.sort((a, b) => a.name.localeCompare(b.name));
                
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

    private renderFlat(items: FoodItem[]): void {
        // Sort items based on sort option
        const sorted = [...items].sort((a, b) => {
            switch (this.sortBy) {
                case 'name':
                    return a.name.localeCompare(b.name);
                case 'amount': {
                    const aAmount = typeof a.amount === 'number' ? a.amount : (a.amount ? 1 : 0);
                    const bAmount = typeof b.amount === 'number' ? b.amount : (b.amount ? 1 : 0);
                    return bAmount - aAmount;
                }
                case 'status': {
                    const statusOrder = { 'out': 0, 'warning': 1, 'normal': 2, 'in-stock': 3 };
                    const aStatus = this.plugin.store.getStockStatus(a);
                    const bStatus = this.plugin.store.getStockStatus(b);
                    return statusOrder[aStatus] - statusOrder[bStatus];
                }
                default:
                    return a.name.localeCompare(b.name);
            }
        });
        
        const container = this.inventoryContentEl.createDiv({ cls: 'stoker-items-list' });
        
        for (const item of sorted) {
            const row = createItemRow(
                item,
                this.plugin.store,
                (item) => this.openEditModal(item),
                () => this.refresh()
            );
            container.appendChild(row);
        }
    }

    private openAddModal(): void {
        import('./add-item-modal').then(({ AddItemModal }) => {
            new AddItemModal(this.app, this.plugin).open();
        });
    }

    private openEditModal(item: FoodItem): void {
        import('./edit-item-modal').then(({ EditItemModal }) => {
            new EditItemModal(this.app, this.plugin, item).open();
        });
    }

    private openCategoryModal(): void {
        import('./category-modal').then(({ CategoryManageModal }) => {
            new CategoryManageModal(this.app, this.plugin).open();
        });
    }

    private async openReportView(): Promise<void> {
        const { REPORT_VIEW_TYPE } = await import('./report-view');
        const { workspace } = this.app;
        
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
}

