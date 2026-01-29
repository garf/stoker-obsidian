import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type StokerPlugin from '../main';
import { InventoryItem, StockStatus } from '../types';
import { formatAmount } from './components';
import { LIST_MANAGER_VIEW_TYPE } from './list-manager-view';

export const REPORT_VIEW_TYPE = 'stoker-report-view';

type ReportType = 'shopping-list' | 'low-stock' | 'full-inventory';

export class ReportView extends ItemView {
    plugin: StokerPlugin;
    private reportContentEl: HTMLElement;
    private currentReport: ReportType = 'shopping-list';

    constructor(leaf: WorkspaceLeaf, plugin: StokerPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return REPORT_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Inventory Report';
    }

    getIcon(): string {
        return 'file-text';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('stoker-report-view');
        
        // Header
        const header = container.createDiv({ cls: 'stoker-report-header' });
        
        const titleRow = header.createDiv({ cls: 'stoker-report-title-row' });
        titleRow.createEl('h2', { text: 'Inventory Report' });
        
        // Print button
        const printBtn = titleRow.createEl('button', { cls: 'stoker-print-btn' });
        const printIcon = printBtn.createSpan({ cls: 'stoker-print-btn-icon' });
        setIcon(printIcon, 'printer');
        printBtn.createSpan({ text: 'Print' });
        printBtn.addEventListener('click', () => window.print());
        
        // Report type selector
        const selectorRow = header.createDiv({ cls: 'stoker-report-selector' });
        
        const reports: { type: ReportType; label: string; icon: string }[] = [
            { type: 'shopping-list', label: 'Shopping list', icon: 'shopping-cart' },
            { type: 'low-stock', label: 'Low stock report', icon: 'alert-triangle' },
            { type: 'full-inventory', label: 'Full inventory', icon: 'package' },
        ];
        
        for (const report of reports) {
            const btn = selectorRow.createEl('button', { 
                cls: `stoker-report-type-btn ${this.currentReport === report.type ? 'stoker-report-type-btn--active' : ''}`,
            });
            const icon = btn.createSpan({ cls: 'stoker-report-type-icon' });
            setIcon(icon, report.icon);
            btn.createSpan({ text: report.label });
            btn.addEventListener('click', () => {
                this.currentReport = report.type;
                // Update active state
                selectorRow.querySelectorAll('.stoker-report-type-btn').forEach(b => 
                    b.removeClass('stoker-report-type-btn--active')
                );
                btn.addClass('stoker-report-type-btn--active');
                this.renderReport();
            });
        }
        
        // Report content
        this.reportContentEl = container.createDiv({ cls: 'stoker-report-content' });
        
        // Register for changes
        this.plugin.store.onInventoryChange(() => this.renderReport());
        
        // Register for list changes
        this.plugin.listManager.onListChange(() => this.renderReport());
        
        // Initial render
        this.renderReport();
    }

    async onClose(): Promise<void> {
        // Cleanup
    }

    private renderReport(): void {
        this.reportContentEl.empty();
        
        // Check if there's an active list
        const activeList = this.plugin.listManager.getActiveList();
        if (!activeList) {
            this.renderNoListState();
            return;
        }
        
        switch (this.currentReport) {
            case 'shopping-list':
                this.renderShoppingList();
                break;
            case 'low-stock':
                this.renderLowStockReport();
                break;
            case 'full-inventory':
                this.renderFullInventory();
                break;
        }
    }

    private renderShoppingList(): void {
        const items = this.plugin.store.getItems();
        
        // Items marked for restock OR out of stock
        const shoppingItems = items.filter(item => {
            const status = this.plugin.store.getStockStatus(item);
            return item.plannedRestock || status === 'out';
        });
        
        if (shoppingItems.length === 0) {
            this.renderEmptyState('Your shopping list is empty', 'shopping-cart');
            return;
        }
        
        // Header with count
        this.reportContentEl.createEl('h3', { 
            text: `Shopping List (${shoppingItems.length} items)`,
            cls: 'stoker-report-section-title'
        });
        
        // Date
        this.reportContentEl.createDiv({ 
            cls: 'stoker-report-date',
            text: `Generated: ${new Date().toLocaleDateString()}`
        });
        
        // Group by category
        this.renderItemsByCategory(shoppingItems, true);
    }

    private renderLowStockReport(): void {
        const items = this.plugin.store.getItems();
        
        // Almost running out + out of stock
        const lowStockItems = items.filter(item => {
            const status = this.plugin.store.getStockStatus(item);
            return status === 'warning' || status === 'out';
        });
        
        if (lowStockItems.length === 0) {
            this.renderEmptyState('All items are well stocked!', 'check-circle');
            return;
        }
        
        // Count by status
        const warningItems = lowStockItems.filter(item => 
            this.plugin.store.getStockStatus(item) === 'warning'
        );
        const outItems = lowStockItems.filter(item => 
            this.plugin.store.getStockStatus(item) === 'out'
        );
        
        // Header
        this.reportContentEl.createEl('h3', { 
            text: 'Low Stock Report',
            cls: 'stoker-report-section-title'
        });
        
        // Date
        this.reportContentEl.createDiv({ 
            cls: 'stoker-report-date',
            text: `Generated: ${new Date().toLocaleDateString()}`
        });
        
        // Summary
        const summary = this.reportContentEl.createDiv({ cls: 'stoker-report-summary' });
        if (warningItems.length > 0) {
            summary.createSpan({ 
                cls: 'stoker-report-stat stoker-report-stat--warning',
                text: `${warningItems.length} almost running out`
            });
        }
        if (outItems.length > 0) {
            summary.createSpan({ 
                cls: 'stoker-report-stat stoker-report-stat--danger',
                text: `${outItems.length} out of stock`
            });
        }
        
        // Out of stock section
        if (outItems.length > 0) {
            this.reportContentEl.createEl('h4', { 
                text: 'Out of Stock',
                cls: 'stoker-report-subsection-title stoker-report-subsection--danger'
            });
            this.renderItemList(outItems);
        }
        
        // Almost running out section
        if (warningItems.length > 0) {
            this.reportContentEl.createEl('h4', { 
                text: 'Almost Running Out',
                cls: 'stoker-report-subsection-title stoker-report-subsection--warning'
            });
            this.renderItemList(warningItems);
        }
    }

    private renderFullInventory(): void {
        const items = this.plugin.store.getItems();
        
        if (items.length === 0) {
            this.renderEmptyState('Your inventory is empty', 'package');
            return;
        }
        
        // Group by status
        const inStockItems = items.filter(item => {
            const status = this.plugin.store.getStockStatus(item);
            return status === 'normal' || status === 'in-stock';
        });
        const warningItems = items.filter(item => 
            this.plugin.store.getStockStatus(item) === 'warning'
        );
        const outItems = items.filter(item => 
            this.plugin.store.getStockStatus(item) === 'out'
        );
        
        // Header
        this.reportContentEl.createEl('h3', { 
            text: 'Full Inventory',
            cls: 'stoker-report-section-title'
        });
        
        // Date
        this.reportContentEl.createDiv({ 
            cls: 'stoker-report-date',
            text: `Generated: ${new Date().toLocaleDateString()}`
        });
        
        // Summary
        const summary = this.reportContentEl.createDiv({ cls: 'stoker-report-summary' });
        summary.createSpan({ 
            cls: 'stoker-report-stat',
            text: `${items.length} total items`
        });
        if (inStockItems.length > 0) {
            summary.createSpan({ 
                cls: 'stoker-report-stat stoker-report-stat--success',
                text: `${inStockItems.length} in stock`
            });
        }
        if (warningItems.length > 0) {
            summary.createSpan({ 
                cls: 'stoker-report-stat stoker-report-stat--warning',
                text: `${warningItems.length} low`
            });
        }
        if (outItems.length > 0) {
            summary.createSpan({ 
                cls: 'stoker-report-stat stoker-report-stat--danger',
                text: `${outItems.length} out`
            });
        }
        
        // In stock section
        if (inStockItems.length > 0) {
            this.reportContentEl.createEl('h4', { 
                text: 'In Stock',
                cls: 'stoker-report-subsection-title stoker-report-subsection--success'
            });
            this.renderItemsByCategory(inStockItems, false);
        }
        
        // Almost running out section
        if (warningItems.length > 0) {
            this.reportContentEl.createEl('h4', { 
                text: 'Almost Running Out',
                cls: 'stoker-report-subsection-title stoker-report-subsection--warning'
            });
            this.renderItemsByCategory(warningItems, false);
        }
        
        // Out of stock section
        if (outItems.length > 0) {
            this.reportContentEl.createEl('h4', { 
                text: 'Out of Stock',
                cls: 'stoker-report-subsection-title stoker-report-subsection--danger'
            });
            this.renderItemsByCategory(outItems, false);
        }
    }

    private renderEmptyState(message: string, iconName: string): void {
        const empty = this.reportContentEl.createDiv({ cls: 'stoker-report-empty' });
        const icon = empty.createDiv({ cls: 'stoker-report-empty-icon' });
        setIcon(icon, iconName);
        empty.createDiv({ cls: 'stoker-report-empty-text', text: message });
    }

    private renderItemsByCategory(items: InventoryItem[], showCheckbox: boolean): void {
        // Group by category
        const grouped = new Map<string, InventoryItem[]>();
        for (const item of items) {
            const cat = item.category || 'Uncategorized';
            if (!grouped.has(cat)) {
                grouped.set(cat, []);
            }
            grouped.get(cat)!.push(item);
        }
        
        // Sort categories
        const sortedCategories = Array.from(grouped.keys()).sort((a, b) => {
            if (a === 'Uncategorized') return 1;
            if (b === 'Uncategorized') return -1;
            return a.localeCompare(b);
        });
        
        for (const category of sortedCategories) {
            const categoryItems = grouped.get(category)!;
            
            // Category header
            this.reportContentEl.createDiv({ 
                cls: 'stoker-report-category',
                text: category
            });
            
            // Items
            const list = this.reportContentEl.createEl('ul', { cls: 'stoker-report-list' });
            for (const item of categoryItems.sort((a, b) => a.name.localeCompare(b.name))) {
                this.renderListItem(list, item, showCheckbox);
            }
        }
    }

    private renderItemList(items: InventoryItem[]): void {
        const list = this.reportContentEl.createEl('ul', { cls: 'stoker-report-list' });
        for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
            this.renderListItem(list, item, false);
        }
    }

    private renderListItem(list: HTMLUListElement, item: InventoryItem, showCheckbox: boolean): void {
        const li = list.createEl('li', { cls: 'stoker-report-item' });
        
        if (showCheckbox) {
            li.createEl('span', { cls: 'stoker-report-checkbox', text: '☐' });
        }
        
        const status = this.plugin.store.getStockStatus(item);
        const statusClass = status === 'out' ? 'stoker-report-item--out' : 
                           status === 'warning' ? 'stoker-report-item--warning' : '';
        if (statusClass) {
            li.addClass(statusClass);
        }
        
        li.createSpan({ cls: 'stoker-report-item-name', text: item.name });
        
        if (item.category) {
            li.createSpan({ cls: 'stoker-report-item-category', text: `[${item.category}]` });
        }
        
        li.createSpan({ cls: 'stoker-report-item-amount', text: formatAmount(item) });
        
        if (item.plannedRestock) {
            li.createSpan({ cls: 'stoker-report-item-restock', text: '🛒' });
        }
    }

    private renderNoListState(): void {
        const emptyState = this.reportContentEl.createDiv({ cls: 'stoker-report-empty' });
        
        const icon = emptyState.createDiv({ cls: 'stoker-report-empty-icon' });
        setIcon(icon, 'inbox');
        
        emptyState.createEl('h3', { text: 'No active list' });
        emptyState.createEl('p', { 
            cls: 'stoker-report-empty-text', 
            text: 'Create or select an inventory list to generate reports.' 
        });
        
        const btn = emptyState.createEl('button', { cls: 'stoker-btn mod-cta' });
        const btnIcon = btn.createSpan({ cls: 'stoker-btn-icon' });
        setIcon(btnIcon, 'list');
        btn.createSpan({ text: 'Open list manager' });
        btn.addEventListener('click', () => this.openListManager());
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

