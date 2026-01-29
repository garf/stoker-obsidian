import { setIcon } from 'obsidian';
import { InventoryItem, StockStatus } from '../types';
import { InventoryStore } from '../data/inventory-store';

/**
 * Create an item row element for the inventory list
 */
export function createItemRow(
    item: InventoryItem,
    store: InventoryStore,
    onEdit: (item: InventoryItem) => void,
    onRefresh: () => void
): HTMLElement {
    const status = store.getStockStatus(item);
    
    const row = document.createElement('div');
    row.className = `stoker-item stoker-item--${status}`;
    if (item.plannedRestock) {
        row.addClass('stoker-item--restock');
    }
    row.dataset.itemId = item.id;
    
    // Status indicator
    const statusIndicator = row.createDiv({ cls: 'stoker-item-status' });
    renderStatusIcon(statusIndicator, status, item.plannedRestock);
    
    // Item info
    const info = row.createDiv({ cls: 'stoker-item-info' });
    
    const name = info.createDiv({ cls: 'stoker-item-name' });
    name.textContent = item.name;
    
    const amount = info.createDiv({ cls: 'stoker-item-amount' });
    amount.textContent = formatAmount(item);
    
    // Progress bar for stock level visualization
    const progressData = getProgressBarData(item, status);
    if (progressData.show) {
        const progressContainer = info.createDiv({ cls: 'stoker-item-progress' });
        const progressBar = progressContainer.createDiv({ 
            cls: `stoker-item-progress-bar stoker-item-progress-bar--${progressData.color}` 
        });
        progressBar.style.width = `${progressData.percent}%`;
    }
    
    // Actions
    const actions = row.createDiv({ cls: 'stoker-item-actions' });
    
    if (item.unitType === 'boolean') {
        // Toggle button for boolean items
        const toggleBtn = actions.createEl('button', { 
            cls: 'stoker-btn stoker-btn-toggle',
            attr: { 'aria-label': 'Toggle stock status' }
        });
        setIcon(toggleBtn, item.amount ? 'check-circle' : 'circle');
        toggleBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await store.toggleStock(item.id);
            onRefresh();
        });
    } else {
        // Decrease button
        const decreaseBtn = actions.createEl('button', { 
            cls: 'stoker-btn stoker-btn-decrease',
            attr: { 'aria-label': 'Decrease amount' }
        });
        setIcon(decreaseBtn, 'minus');
        decreaseBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await store.decreaseAmount(item.id);
            onRefresh();
        });
        
        // Increase button
        const increaseBtn = actions.createEl('button', { 
            cls: 'stoker-btn stoker-btn-increase',
            attr: { 'aria-label': 'Increase amount' }
        });
        setIcon(increaseBtn, 'plus');
        increaseBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await store.increaseAmount(item.id);
            onRefresh();
        });
    }
    
    // Restock toggle button
    const restockBtn = actions.createEl('button', { 
        cls: `stoker-btn stoker-btn-restock ${item.plannedRestock ? 'stoker-btn-restock--active' : ''}`,
        attr: { 'aria-label': item.plannedRestock ? 'Remove from restock list' : 'Mark for restock' }
    });
    setIcon(restockBtn, 'shopping-cart');
    restockBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await store.togglePlannedRestock(item.id);
        onRefresh();
    });
    
    // Edit button
    const editBtn = actions.createEl('button', { 
        cls: 'stoker-btn stoker-btn-edit',
        attr: { 'aria-label': 'Edit item' }
    });
    setIcon(editBtn, 'pencil');
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onEdit(item);
    });
    
    // Click row to edit
    row.addEventListener('click', () => onEdit(item));
    
    return row;
}

/**
 * Render the status icon based on stock status
 */
function renderStatusIcon(container: HTMLElement, status: StockStatus, plannedRestock?: boolean): void {
    container.empty();
    
    // If planned for restock, show cart icon
    if (plannedRestock) {
        setIcon(container, 'shopping-cart');
        return;
    }
    
    switch (status) {
        case 'warning':
            setIcon(container, 'alert-triangle');
            break;
        case 'out':
            setIcon(container, 'x-circle');
            break;
        case 'in-stock':
            setIcon(container, 'check-circle');
            break;
        default:
            setIcon(container, 'package');
    }
}

/**
 * Progress bar data for stock level visualization
 */
interface ProgressBarData {
    show: boolean;
    percent: number;
    color: 'green' | 'yellow' | 'red';
}

/**
 * Calculate progress bar data for an item based on stock level relative to minimum threshold
 * 
 * Uses 2x minimum as the "comfortable/full" reference point so the bar shows
 * gradual depletion as stock approaches the threshold, not just at/below it.
 * 
 * Visual behavior:
 * - At 2x minimum or above: 100% green (fully stocked)
 * - At 1.5x minimum: 75% green (getting lower)
 * - At 1x minimum: 50% yellow (at threshold, warning)
 * - At 0.5x minimum: 25% yellow (below threshold)
 * - At 0: 0% red (out of stock)
 */
function getProgressBarData(item: InventoryItem, status: StockStatus): ProgressBarData {
    // Don't show for boolean items or items without minimum
    if (item.unitType === 'boolean' || item.minimum === undefined) {
        return { show: false, percent: 0, color: 'green' };
    }
    
    const amount = item.amount as number;
    const minimum = item.minimum;
    
    // Skip if minimum is not positive
    if (minimum <= 0) {
        return { show: false, percent: 0, color: 'green' };
    }
    
    // Use 2x minimum as the "comfortable/full" reference point
    // This makes the bar more useful by showing gradual depletion
    const fullLevel = minimum * 2;
    
    // Calculate percentage based on full level, capped at 100%
    const percent = Math.min((amount / fullLevel) * 100, 100);
    
    // Determine color based on stock status
    let color: 'green' | 'yellow' | 'red';
    if (status === 'out') {
        color = 'red';
    } else if (status === 'warning') {
        color = 'yellow';
    } else {
        color = 'green';
    }
    
    return { show: true, percent, color };
}

/**
 * Format a number for display, removing trailing zeros
 */
function formatNumber(value: number): string {
    if (value === Math.floor(value)) {
        return String(value);
    }
    // Remove unnecessary trailing zeros
    return parseFloat(value.toFixed(3)).toString();
}

/**
 * Format the amount display for an item
 */
export function formatAmount(item: InventoryItem): string {
    if (item.unitType === 'boolean') {
        return item.amount ? 'In stock' : 'Out of stock';
    }
    
    const amount = item.amount as number;
    let text: string;
    
    // Format amount with unit
    if (item.unit) {
        text = `${formatNumber(amount)} ${item.unit}`;
    } else {
        text = formatNumber(amount);
    }
    
    // Add minimum threshold if set
    if (item.minimum !== undefined) {
        if (item.unit) {
            text += ` (min: ${formatNumber(item.minimum)} ${item.unit})`;
        } else {
            text += ` (min: ${formatNumber(item.minimum)})`;
        }
    }
    
    if (item.plannedRestock) {
        text += ' 🛒';
    }
    
    return text;
}

/**
 * Create a category header element
 */
export function createCategoryHeader(
    categoryName: string,
    isCollapsed: boolean,
    onToggle: () => void
): HTMLElement {
    const header = document.createElement('div');
    header.className = 'stoker-category-header';
    
    const toggle = header.createDiv({ cls: 'stoker-category-toggle' });
    setIcon(toggle, isCollapsed ? 'chevron-right' : 'chevron-down');
    
    const name = header.createDiv({ cls: 'stoker-category-name' });
    name.textContent = categoryName || 'Uncategorized';
    
    header.addEventListener('click', () => {
        onToggle();
        setIcon(toggle, isCollapsed ? 'chevron-down' : 'chevron-right');
    });
    
    return header;
}

/**
 * Create the add item button
 */
export function createAddButton(onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'stoker-add-btn';
    btn.setAttribute('aria-label', 'Add new item');
    
    const iconSpan = btn.createSpan({ cls: 'stoker-add-btn-icon' });
    setIcon(iconSpan, 'plus');
    
    btn.createSpan({ text: 'Add item' });
    
    btn.addEventListener('click', onClick);
    
    return btn;
}

/**
 * Create an empty state message
 */
export function createEmptyState(message: string, onAddClick?: () => void): HTMLElement {
    const container = document.createElement('div');
    container.className = 'stoker-empty-state';
    
    const icon = container.createDiv({ cls: 'stoker-empty-icon' });
    setIcon(icon, 'package-open');
    
    container.createDiv({ cls: 'stoker-empty-message', text: message });
    
    if (onAddClick) {
        const btn = container.createEl('button', { 
            cls: 'stoker-empty-btn',
            text: 'Add your first item'
        });
        btn.addEventListener('click', onAddClick);
    }
    
    return container;
}

/**
 * Search input result with references to both container and input
 */
export interface SearchInputResult {
    container: HTMLElement;
    input: HTMLInputElement;
}

/**
 * Create a filter/search input
 */
export function createSearchInput(onSearch: (query: string) => void): SearchInputResult {
    const container = document.createElement('div');
    container.className = 'stoker-search';
    
    const iconSpan = container.createSpan({ cls: 'stoker-search-icon' });
    setIcon(iconSpan, 'search');
    
    const input = container.createEl('input', {
        type: 'text',
        cls: 'stoker-search-input',
        attr: { placeholder: 'Search items...' }
    }) as HTMLInputElement;
    
    input.addEventListener('input', () => {
        onSearch(input.value);
    });
    
    return { container, input };
}

/**
 * Create a warning banner for items almost running out (yellow)
 */
export function createWarningBanner(count: number, onClick: () => void): HTMLElement {
    const banner = document.createElement('div');
    banner.className = 'stoker-warning-banner';
    
    const icon = banner.createSpan({ cls: 'stoker-banner-icon' });
    setIcon(icon, 'alert-triangle');
    
    banner.createSpan({ 
        cls: 'stoker-banner-text',
        text: `${count} item${count !== 1 ? 's' : ''} almost running out`
    });
    
    banner.addEventListener('click', onClick);
    
    return banner;
}

/**
 * Create a danger banner for items out of stock (red)
 */
export function createOutOfStockBanner(count: number, onClick: () => void): HTMLElement {
    const banner = document.createElement('div');
    banner.className = 'stoker-danger-banner';
    
    const icon = banner.createSpan({ cls: 'stoker-banner-icon' });
    setIcon(icon, 'x-circle');
    
    banner.createSpan({ 
        cls: 'stoker-banner-text',
        text: `${count} item${count !== 1 ? 's' : ''} out of stock`
    });
    
    banner.addEventListener('click', onClick);
    
    return banner;
}

