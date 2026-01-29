import { ItemView, WorkspaceLeaf, setIcon, Notice } from 'obsidian';
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
    
    // Listener cleanup tracking
    private storeCallback: (() => void) | null = null;
    private listChangeCallback: (() => void) | null = null;

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
        
        // Header
        const header = container.createDiv({ cls: 'stoker-report-header' });
        
        const titleRow = header.createDiv({ cls: 'stoker-report-title-row' });
        titleRow.createEl('h2', { text: 'Inventory report' });
        
        // Export buttons container
        const exportBtns = titleRow.createDiv({ cls: 'stoker-export-btns' });
        
        // Copy as markdown button
        const copyMdBtn = exportBtns.createEl('button', { cls: 'stoker-export-btn' });
        const copyMdIcon = copyMdBtn.createSpan({ cls: 'stoker-export-btn-icon' });
        setIcon(copyMdIcon, 'copy');
        copyMdBtn.createSpan({ text: 'Copy MD' });
        copyMdBtn.setAttribute('aria-label', 'Copy as Markdown');
        copyMdBtn.addEventListener('click', () => this.copyAsMarkdown());
        
        // Copy as plain text button
        const copyTxtBtn = exportBtns.createEl('button', { cls: 'stoker-export-btn' });
        const copyTxtIcon = copyTxtBtn.createSpan({ cls: 'stoker-export-btn-icon' });
        setIcon(copyTxtIcon, 'file-text');
        copyTxtBtn.createSpan({ text: 'Copy text' });
        copyTxtBtn.setAttribute('aria-label', 'Copy as plain text');
        copyTxtBtn.addEventListener('click', () => this.copyAsText());
        
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
        
        // Register for changes (if there's an active store)
        this.storeCallback = () => this.renderReport();
        const store = this.plugin.store;
        if (store) {
            store.onInventoryChange(this.storeCallback);
        }
        
        // Register for list changes
        this.listChangeCallback = () => this.renderReport();
        this.plugin.listManager.onListChange(this.listChangeCallback);
        
        // Initial render
        this.renderReport();
    }

    async onClose(): Promise<void> {
        // Remove store listener
        if (this.storeCallback) {
            const store = this.plugin.store;
            if (store) {
                store.offInventoryChange(this.storeCallback);
            }
            this.storeCallback = null;
        }
        
        // Remove list change listener
        if (this.listChangeCallback) {
            this.plugin.listManager.offListChange(this.listChangeCallback);
            this.listChangeCallback = null;
        }
    }

    private renderReport(): void {
        this.reportContentEl.empty();
        
        // Check if there's an active list
        const activeList = this.plugin.listManager.getActiveList();
        if (!activeList) {
            this.renderNoListState();
            return;
        }
        
        const store = this.plugin.store;
        if (!store) {
            this.renderNoListState();
            return;
        }
        
        switch (this.currentReport) {
            case 'shopping-list':
                this.renderShoppingList(store);
                break;
            case 'low-stock':
                this.renderLowStockReport(store);
                break;
            case 'full-inventory':
                this.renderFullInventory(store);
                break;
        }
    }

    private renderShoppingList(store: import('../data/inventory-store').InventoryStore): void {
        const items = store.getItems();
        
        // Only items explicitly marked for restock
        const shoppingItems = items.filter(item => item.plannedRestock);
        
        if (shoppingItems.length === 0) {
            this.renderEmptyState('Your shopping list is empty', 'shopping-cart');
            return;
        }
        
        // Header with count
        this.reportContentEl.createEl('h3', { 
            text: `Shopping list (${shoppingItems.length} items)`,
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

    private renderLowStockReport(store: import('../data/inventory-store').InventoryStore): void {
        const items = store.getItems();
        
        // Almost running out + out of stock
        const lowStockItems = items.filter(item => {
            const status = store.getStockStatus(item);
            return status === 'warning' || status === 'out';
        });
        
        if (lowStockItems.length === 0) {
            this.renderEmptyState('All items are well stocked!', 'check-circle');
            return;
        }
        
        // Count by status
        const warningItems = lowStockItems.filter(item => 
            store.getStockStatus(item) === 'warning'
        );
        const outItems = lowStockItems.filter(item => 
            store.getStockStatus(item) === 'out'
        );
        
        // Header
        this.reportContentEl.createEl('h3', { 
            text: 'Low stock report',
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
                text: 'Out of stock',
                cls: 'stoker-report-subsection-title stoker-report-subsection--danger'
            });
            this.renderItemList(outItems);
        }
        
        // Almost running out section
        if (warningItems.length > 0) {
            this.reportContentEl.createEl('h4', { 
                text: 'Almost running out',
                cls: 'stoker-report-subsection-title stoker-report-subsection--warning'
            });
            this.renderItemList(warningItems);
        }
    }

    private renderFullInventory(store: import('../data/inventory-store').InventoryStore): void {
        const items = store.getItems();
        
        if (items.length === 0) {
            this.renderEmptyState('Your inventory is empty', 'package');
            return;
        }
        
        // Group by status
        const inStockItems = items.filter(item => {
            const status = store.getStockStatus(item);
            return status === 'normal' || status === 'in-stock';
        });
        const warningItems = items.filter(item => 
            store.getStockStatus(item) === 'warning'
        );
        const outItems = items.filter(item => 
            store.getStockStatus(item) === 'out'
        );
        
        // Header
        this.reportContentEl.createEl('h3', { 
            text: 'Full inventory',
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
                text: 'In stock',
                cls: 'stoker-report-subsection-title stoker-report-subsection--success'
            });
            this.renderItemsByCategory(inStockItems, false);
        }
        
        // Almost running out section
        if (warningItems.length > 0) {
            this.reportContentEl.createEl('h4', { 
                text: 'Almost running out',
                cls: 'stoker-report-subsection-title stoker-report-subsection--warning'
            });
            this.renderItemsByCategory(warningItems, false);
        }
        
        // Out of stock section
        if (outItems.length > 0) {
            this.reportContentEl.createEl('h4', { 
                text: 'Out of stock',
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
        
        const store = this.plugin.store;
        const status = store ? store.getStockStatus(item) : 'normal';
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
    
    /**
     * Copy the current report as Markdown
     */
    private async copyAsMarkdown(): Promise<void> {
        const store = this.plugin.store;
        if (!store) {
            new Notice('No active inventory list');
            return;
        }
        
        const activeList = this.plugin.listManager.getActiveList();
        const listName = activeList?.name || 'Inventory';
        const date = new Date().toLocaleDateString();
        
        let markdown = '';
        
        switch (this.currentReport) {
            case 'shopping-list':
                markdown = this.generateShoppingListMarkdown(store, listName, date);
                break;
            case 'low-stock':
                markdown = this.generateLowStockMarkdown(store, listName, date);
                break;
            case 'full-inventory':
                markdown = this.generateFullInventoryMarkdown(store, listName, date);
                break;
        }
        
        await navigator.clipboard.writeText(markdown);
        new Notice('Copied to clipboard as Markdown');
    }
    
    /**
     * Copy the current report as plain text
     */
    private async copyAsText(): Promise<void> {
        const store = this.plugin.store;
        if (!store) {
            new Notice('No active inventory list');
            return;
        }
        
        const activeList = this.plugin.listManager.getActiveList();
        const listName = activeList?.name || 'Inventory';
        const date = new Date().toLocaleDateString();
        
        let text = '';
        
        switch (this.currentReport) {
            case 'shopping-list':
                text = this.generateShoppingListText(store, listName, date);
                break;
            case 'low-stock':
                text = this.generateLowStockText(store, listName, date);
                break;
            case 'full-inventory':
                text = this.generateFullInventoryText(store, listName, date);
                break;
        }
        
        await navigator.clipboard.writeText(text);
        new Notice('Copied to clipboard as plain text');
    }
    
    /**
     * Generate shopping list as Markdown
     */
    private generateShoppingListMarkdown(store: import('../data/inventory-store').InventoryStore, listName: string, date: string): string {
        const items = store.getItems().filter(item => item.plannedRestock);
        
        if (items.length === 0) {
            return `# Shopping list - ${listName}\n\n*Generated: ${date}*\n\nNo items to buy.`;
        }
        
        let md = `# Shopping list - ${listName}\n\n*Generated: ${date}*\n\n`;
        
        // Group by category
        const grouped = this.groupByCategory(items);
        
        for (const [category, categoryItems] of grouped) {
            md += `## ${category}\n\n`;
            for (const item of categoryItems.sort((a, b) => a.name.localeCompare(b.name))) {
                md += `- [ ] ${item.name}`;
                if (item.unitType !== 'boolean' && item.minimum !== undefined) {
                    const amount = item.amount as number;
                    const needed = Math.max(0, item.minimum - amount);
                    if (needed > 0) {
                        md += ` (need ${needed} ${item.unit})`;
                    }
                }
                md += '\n';
            }
            md += '\n';
        }
        
        return md.trim();
    }
    
    /**
     * Generate shopping list as plain text
     */
    private generateShoppingListText(store: import('../data/inventory-store').InventoryStore, listName: string, date: string): string {
        const items = store.getItems().filter(item => item.plannedRestock);
        
        if (items.length === 0) {
            return `SHOPPING LIST - ${listName}\n${date}\n\nNo items to buy.`;
        }
        
        let text = `SHOPPING LIST - ${listName}\n${date}\n${'='.repeat(40)}\n\n`;
        
        // Group by category
        const grouped = this.groupByCategory(items);
        
        for (const [category, categoryItems] of grouped) {
            text += `${category.toUpperCase()}\n${'-'.repeat(category.length)}\n`;
            for (const item of categoryItems.sort((a, b) => a.name.localeCompare(b.name))) {
                text += `☐ ${item.name}`;
                if (item.unitType !== 'boolean' && item.minimum !== undefined) {
                    const amount = item.amount as number;
                    const needed = Math.max(0, item.minimum - amount);
                    if (needed > 0) {
                        text += ` (need ${needed} ${item.unit})`;
                    }
                }
                text += '\n';
            }
            text += '\n';
        }
        
        return text.trim();
    }
    
    /**
     * Generate low stock report as Markdown
     */
    private generateLowStockMarkdown(store: import('../data/inventory-store').InventoryStore, listName: string, date: string): string {
        const items = store.getItems();
        const outItems = items.filter(item => store.getStockStatus(item) === 'out');
        const warningItems = items.filter(item => store.getStockStatus(item) === 'warning');
        
        if (outItems.length === 0 && warningItems.length === 0) {
            return `# Low stock report - ${listName}\n\n*Generated: ${date}*\n\n✅ All items are well stocked!`;
        }
        
        let md = `# Low stock report - ${listName}\n\n*Generated: ${date}*\n\n`;
        
        if (outItems.length > 0) {
            md += `## ❌ Out of stock (${outItems.length})\n\n`;
            for (const item of outItems.sort((a, b) => a.name.localeCompare(b.name))) {
                md += `- **${item.name}**`;
                if (item.category) md += ` [${item.category}]`;
                md += '\n';
            }
            md += '\n';
        }
        
        if (warningItems.length > 0) {
            md += `## ⚠️ Running low (${warningItems.length})\n\n`;
            for (const item of warningItems.sort((a, b) => a.name.localeCompare(b.name))) {
                md += `- ${item.name}: ${formatAmount(item)}`;
                if (item.category) md += ` [${item.category}]`;
                md += '\n';
            }
            md += '\n';
        }
        
        return md.trim();
    }
    
    /**
     * Generate low stock report as plain text
     */
    private generateLowStockText(store: import('../data/inventory-store').InventoryStore, listName: string, date: string): string {
        const items = store.getItems();
        const outItems = items.filter(item => store.getStockStatus(item) === 'out');
        const warningItems = items.filter(item => store.getStockStatus(item) === 'warning');
        
        if (outItems.length === 0 && warningItems.length === 0) {
            return `LOW STOCK REPORT - ${listName}\n${date}\n\nAll items are well stocked!`;
        }
        
        let text = `LOW STOCK REPORT - ${listName}\n${date}\n${'='.repeat(40)}\n\n`;
        
        if (outItems.length > 0) {
            text += `OUT OF STOCK (${outItems.length})\n${'-'.repeat(20)}\n`;
            for (const item of outItems.sort((a, b) => a.name.localeCompare(b.name))) {
                text += `• ${item.name}`;
                if (item.category) text += ` [${item.category}]`;
                text += '\n';
            }
            text += '\n';
        }
        
        if (warningItems.length > 0) {
            text += `RUNNING LOW (${warningItems.length})\n${'-'.repeat(20)}\n`;
            for (const item of warningItems.sort((a, b) => a.name.localeCompare(b.name))) {
                text += `• ${item.name}: ${formatAmount(item)}`;
                if (item.category) text += ` [${item.category}]`;
                text += '\n';
            }
            text += '\n';
        }
        
        return text.trim();
    }
    
    /**
     * Generate full inventory as Markdown
     */
    private generateFullInventoryMarkdown(store: import('../data/inventory-store').InventoryStore, listName: string, date: string): string {
        const items = store.getItems();
        
        if (items.length === 0) {
            return `# Full inventory - ${listName}\n\n*Generated: ${date}*\n\nNo items in inventory.`;
        }
        
        let md = `# Full inventory - ${listName}\n\n*Generated: ${date}*\n\n`;
        md += `**Total items:** ${items.length}\n\n`;
        
        // Group by category
        const grouped = this.groupByCategory(items);
        
        for (const [category, categoryItems] of grouped) {
            md += `## ${category} (${categoryItems.length})\n\n`;
            md += '| Item | Amount | Status |\n';
            md += '|------|--------|--------|\n';
            
            for (const item of categoryItems.sort((a, b) => a.name.localeCompare(b.name))) {
                const status = store.getStockStatus(item);
                const statusIcon = status === 'out' ? '❌' : status === 'warning' ? '⚠️' : '✅';
                md += `| ${item.name} | ${formatAmount(item)} | ${statusIcon} |\n`;
            }
            md += '\n';
        }
        
        return md.trim();
    }
    
    /**
     * Generate full inventory as plain text
     */
    private generateFullInventoryText(store: import('../data/inventory-store').InventoryStore, listName: string, date: string): string {
        const items = store.getItems();
        
        if (items.length === 0) {
            return `FULL INVENTORY - ${listName}\n${date}\n\nNo items in inventory.`;
        }
        
        let text = `FULL INVENTORY - ${listName}\n${date}\n${'='.repeat(40)}\n\n`;
        text += `Total items: ${items.length}\n\n`;
        
        // Group by category
        const grouped = this.groupByCategory(items);
        
        for (const [category, categoryItems] of grouped) {
            text += `${category.toUpperCase()} (${categoryItems.length})\n${'-'.repeat(category.length + 5)}\n`;
            
            for (const item of categoryItems.sort((a, b) => a.name.localeCompare(b.name))) {
                const status = store.getStockStatus(item);
                const statusMark = status === 'out' ? '[X]' : status === 'warning' ? '[!]' : '[ ]';
                text += `${statusMark} ${item.name}: ${formatAmount(item)}\n`;
            }
            text += '\n';
        }
        
        return text.trim();
    }
    
    /**
     * Group items by category
     */
    private groupByCategory(items: InventoryItem[]): Map<string, InventoryItem[]> {
        const grouped = new Map<string, InventoryItem[]>();
        
        for (const item of items) {
            const cat = item.category || 'Uncategorized';
            if (!grouped.has(cat)) {
                grouped.set(cat, []);
            }
            grouped.get(cat)!.push(item);
        }
        
        // Sort categories (Uncategorized last)
        const sorted = new Map<string, InventoryItem[]>();
        const keys = Array.from(grouped.keys()).sort((a, b) => {
            if (a === 'Uncategorized') return 1;
            if (b === 'Uncategorized') return -1;
            return a.localeCompare(b);
        });
        
        for (const key of keys) {
            sorted.set(key, grouped.get(key)!);
        }
        
        return sorted;
    }
}

