import { useState, useCallback, useMemo, useEffect } from 'react';
import { Menu, setIcon } from 'obsidian';
import { useApp, usePlugin } from '../context/AppContext';
import { useInventoryStore } from '../hooks/useInventoryStore';
import { useListManager } from '../hooks/useListManager';
import type { InventoryItem, StockStatus } from '../../types';
import { LIST_MANAGER_VIEW_TYPE } from '../list-manager-view';
import { REPORT_VIEW_TYPE } from '../report-view';

type SortOption = 'name' | 'category' | 'amount' | 'status';
type FilterOption = 'all' | 'in-stock-enough' | 'almost-running-out' | 'not-in-stock' | 'any-in-stock' | 'planned-restock';

const FILTER_LABELS: Record<FilterOption, string> = {
    'all': 'All items',
    'in-stock-enough': 'In stock enough',
    'almost-running-out': 'Almost running out',
    'not-in-stock': 'Not in stock',
    'any-in-stock': 'Any in stock',
    'planned-restock': 'Planned restock',
};

const SORT_LABELS: Record<SortOption, string> = {
    'name': 'Name',
    'category': 'Category',
    'amount': 'Amount',
    'status': 'Status',
};

/**
 * Format a number for display, removing trailing zeros
 */
function formatNumber(value: number): string {
    if (value === Math.floor(value)) {
        return String(value);
    }
    return parseFloat(value.toFixed(3)).toString();
}

/**
 * Format the amount display for an item
 */
function formatAmount(item: InventoryItem): string {
    if (item.unitType === 'boolean') {
        return item.amount ? 'In stock' : 'Out of stock';
    }
    
    const amount = item.amount as number;
    let text: string;
    
    if (item.unit) {
        text = `${formatNumber(amount)} ${item.unit}`;
    } else {
        text = formatNumber(amount);
    }
    
    if (item.minimum !== undefined) {
        if (item.unit) {
            text += ` (minimum: ${formatNumber(item.minimum)} ${item.unit})`;
        } else {
            text += ` (minimum: ${formatNumber(item.minimum)})`;
        }
    }
    
    if (item.plannedRestock) {
        text += ' 🛒';
    }
    
    return text;
}

/**
 * Calculate progress bar data for stock level visualization
 */
function getProgressBarData(item: InventoryItem, status: StockStatus): { show: boolean; percent: number; color: string } {
    if (item.unitType === 'boolean' || item.minimum === undefined) {
        return { show: false, percent: 0, color: 'green' };
    }
    
    const amount = item.amount as number;
    const minimum = item.minimum;
    
    if (minimum <= 0) {
        return { show: false, percent: 0, color: 'green' };
    }
    
    const fullLevel = minimum * 2;
    const percent = Math.min((amount / fullLevel) * 100, 100);
    
    let color: string;
    if (status === 'out') {
        color = 'red';
    } else if (status === 'warning') {
        color = 'yellow';
    } else {
        color = 'green';
    }
    
    return { show: true, percent, color };
}

// Icon component that uses Obsidian's setIcon
function Icon({ name, className }: { name: string; className?: string }) {
    const ref = useCallback((el: HTMLSpanElement | null) => {
        if (el) {
            el.empty();
            setIcon(el, name);
        }
    }, [name]);
    
    return <span ref={ref} className={className} />;
}

// Item Row Component
interface ItemRowProps {
    item: InventoryItem;
    status: StockStatus;
    onEdit: () => void;
    onIncrease: () => void;
    onDecrease: () => void;
    onToggleStock: () => void;
    onToggleRestock: () => void;
}

function ItemRow({ item, status, onEdit, onIncrease, onDecrease, onToggleStock, onToggleRestock }: ItemRowProps) {
    const progressData = getProgressBarData(item, status);
    
    const statusIcon = item.plannedRestock 
        ? 'shopping-cart' 
        : status === 'warning' ? 'alert-triangle'
        : status === 'out' ? 'x-circle'
        : status === 'in-stock' ? 'check-circle'
        : 'package';
    
    const handleRowClick = () => onEdit();
    
    return (
        <div 
            className={`stoker-item stoker-item--${status}${item.plannedRestock ? ' stoker-item--restock' : ''}`}
            data-item-id={item.id}
            onClick={handleRowClick}
        >
            <div className="stoker-item-status">
                <Icon name={statusIcon} />
            </div>
            
            <div className="stoker-item-info">
                <div className="stoker-item-name">{item.name}</div>
                <div className="stoker-item-amount">{formatAmount(item)}</div>
                
                {progressData.show && (
                    <div className="stoker-item-progress">
                        <div 
                            className={`stoker-item-progress-bar stoker-item-progress-bar--${progressData.color}`}
                            style={{ width: `${progressData.percent}%` }}
                        />
                    </div>
                )}
            </div>
            
            <div className="stoker-item-actions">
                {item.unitType === 'boolean' ? (
                    <button 
                        className="stoker-btn stoker-btn-toggle"
                        aria-label="Toggle stock status"
                        onClick={(e) => { e.stopPropagation(); onToggleStock(); }}
                    >
                        <Icon name={item.amount ? 'check-circle' : 'circle'} />
                    </button>
                ) : (
                    <>
                        <button 
                            className="stoker-btn stoker-btn-decrease"
                            aria-label="Decrease amount"
                            onClick={(e) => { e.stopPropagation(); onDecrease(); }}
                        >
                            <Icon name="minus" />
                        </button>
                        <button 
                            className="stoker-btn stoker-btn-increase"
                            aria-label="Increase amount"
                            onClick={(e) => { e.stopPropagation(); onIncrease(); }}
                        >
                            <Icon name="plus" />
                        </button>
                    </>
                )}
                
                <button 
                    className={`stoker-btn stoker-btn-restock${item.plannedRestock ? ' stoker-btn-restock--active' : ''}`}
                    aria-label={item.plannedRestock ? 'Remove from restock list' : 'Mark for restock'}
                    onClick={(e) => { e.stopPropagation(); onToggleRestock(); }}
                >
                    <Icon name="shopping-cart" />
                </button>
                
                <button 
                    className="stoker-btn stoker-btn-edit"
                    aria-label="Edit item"
                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                >
                    <Icon name="pencil" />
                </button>
            </div>
        </div>
    );
}

// Category Section Component
interface CategorySectionProps {
    name: string;
    items: InventoryItem[];
    isCollapsed: boolean;
    onToggle: () => void;
    getStockStatus: (item: InventoryItem) => StockStatus;
    onEditItem: (item: InventoryItem) => void;
    onIncreaseAmount: (id: string) => void;
    onDecreaseAmount: (id: string) => void;
    onToggleStock: (id: string) => void;
    onToggleRestock: (id: string) => void;
}

function CategorySection({ 
    name, 
    items, 
    isCollapsed, 
    onToggle,
    getStockStatus,
    onEditItem,
    onIncreaseAmount,
    onDecreaseAmount,
    onToggleStock,
    onToggleRestock,
}: CategorySectionProps) {
    const sortedItems = useMemo(() => 
        [...items].sort((a, b) => a.name.localeCompare(b.name)),
        [items]
    );
    
    return (
        <div className="stoker-category">
            <div className="stoker-category-header" onClick={onToggle}>
                <div className="stoker-category-toggle">
                    <Icon name={isCollapsed ? 'chevron-right' : 'chevron-down'} />
                </div>
                <div className="stoker-category-name">
                    {name || 'Uncategorized'} ({items.length})
                </div>
            </div>
            
            {!isCollapsed && (
                <div className="stoker-category-items">
                    {sortedItems.map(item => (
                        <ItemRow
                            key={item.id}
                            item={item}
                            status={getStockStatus(item)}
                            onEdit={() => onEditItem(item)}
                            onIncrease={() => onIncreaseAmount(item.id)}
                            onDecrease={() => onDecreaseAmount(item.id)}
                            onToggleStock={() => onToggleStock(item.id)}
                            onToggleRestock={() => onToggleRestock(item.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// Warning Banner Component
interface WarningBannerProps {
    count: number;
    type: 'warning' | 'danger';
    onClick: () => void;
}

function WarningBanner({ count, type, onClick }: WarningBannerProps) {
    const icon = type === 'warning' ? 'alert-triangle' : 'x-circle';
    const text = type === 'warning' 
        ? `${count} item${count !== 1 ? 's' : ''} almost running out`
        : `${count} item${count !== 1 ? 's' : ''} out of stock`;
    
    return (
        <div className={`stoker-${type}-banner`} onClick={onClick}>
            <span className="stoker-banner-icon">
                <Icon name={icon} />
            </span>
            <span className="stoker-banner-text">{text}</span>
        </div>
    );
}

// Empty State Component
interface EmptyStateProps {
    message: string;
    icon?: string;
    title?: string;
    buttonText?: string;
    buttonIcon?: string;
    onButtonClick?: () => void;
}

function EmptyState({ message, icon = 'package-open', title, buttonText, buttonIcon, onButtonClick }: EmptyStateProps) {
    return (
        <div className="stoker-empty-state">
            <div className="stoker-empty-icon">
                <Icon name={icon} />
            </div>
            {title && <h3>{title}</h3>}
            <div className="stoker-empty-message">{message}</div>
            {onButtonClick && buttonText && (
                <button className="stoker-btn mod-cta" onClick={onButtonClick}>
                    {buttonIcon && <span className="stoker-btn-icon"><Icon name={buttonIcon} /></span>}
                    <span>{buttonText}</span>
                </button>
            )}
        </div>
    );
}

// Stats Bar Component
interface StatsBarProps {
    total: number;
    lowStock: number;
    outOfStock: number;
}

function StatsBar({ total, lowStock, outOfStock }: StatsBarProps) {
    return (
        <div className="stoker-stats">
            <span className="stoker-stat">{total} items</span>
            {lowStock > 0 && <span className="stoker-stat stoker-stat--warning">{lowStock} low</span>}
            {outOfStock > 0 && <span className="stoker-stat stoker-stat--danger">{outOfStock} out</span>}
        </div>
    );
}

// Search Input Component
interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
}

function SearchInput({ value, onChange }: SearchInputProps) {
    const [localValue, setLocalValue] = useState(value);
    
    useEffect(() => {
        const timer = setTimeout(() => {
            onChange(localValue);
        }, 150);
        return () => clearTimeout(timer);
    }, [localValue, onChange]);
    
    return (
        <div className="stoker-search">
            <span className="stoker-search-icon">
                <Icon name="search" />
            </span>
            <input
                type="text"
                className="stoker-search-input"
                placeholder="Search items..."
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
            />
        </div>
    );
}

// Dropdown Button Component
interface DropdownButtonProps {
    label: string;
    value: string;
    onClick: (e: React.MouseEvent) => void;
}

function DropdownButton({ label, value, onClick }: DropdownButtonProps) {
    return (
        <div className="stoker-control-group">
            <span className="stoker-control-label">{label}:</span>
            <button className="stoker-dropdown-btn" onClick={onClick}>
                <span>{value}</span>
                <span className="stoker-dropdown-icon">
                    <Icon name="chevron-down" />
                </span>
            </button>
        </div>
    );
}

// Main Inventory View Component
export function InventoryView() {
    const { app } = useApp();
    const plugin = usePlugin();
    const { 
        items, 
        loading, 
        store, 
        getStockStatus, 
        increaseAmount, 
        decreaseAmount, 
        toggleStock, 
        togglePlannedRestock 
    } = useInventoryStore();
    const { activeList } = useListManager();
    
    // View state
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<SortOption>('category');
    const [filterBy, setFilterBy] = useState<FilterOption>('all');
    const [filterByCategory, setFilterByCategory] = useState<string>('__all__');
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => 
        new Set(plugin.settings.collapsedCategories)
    );
    
    // Save collapsed state on change
    useEffect(() => {
        plugin.settings.collapsedCategories = Array.from(collapsedCategories);
        void plugin.saveSettings();
    }, [collapsedCategories, plugin]);
    
    // Reset filters when list changes
    useEffect(() => {
        setSearchQuery('');
        setFilterBy('all');
        setFilterByCategory('__all__');
    }, [activeList?.id]);
    
    // Get categories
    const categories = useMemo(() => {
        const cats = new Set<string>();
        for (const item of items) {
            if (item.category) {
                cats.add(item.category);
            }
        }
        return Array.from(cats).sort();
    }, [items]);
    
    // Apply filters
    const filteredItems = useMemo(() => {
        let result = items;
        
        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(item => item.name.toLowerCase().includes(query));
        }
        
        // Category filter
        if (filterByCategory !== '__all__') {
            result = result.filter(item => item.category === filterByCategory);
        }
        
        // Status filter
        if (filterBy !== 'all' && store) {
            result = result.filter(item => {
                const status = store.getStockStatus(item);
                switch (filterBy) {
                    case 'in-stock-enough':
                        return status === 'normal' || status === 'in-stock';
                    case 'almost-running-out':
                        return status === 'warning';
                    case 'not-in-stock':
                        return status === 'out';
                    case 'any-in-stock':
                        return status !== 'out';
                    case 'planned-restock':
                        return item.plannedRestock;
                    default:
                        return true;
                }
            });
        }
        
        return result;
    }, [items, searchQuery, filterByCategory, filterBy, store]);
    
    // Stats
    const stats = useMemo(() => {
        if (!store) return { total: 0, lowStock: 0, outOfStock: 0 };
        
        let lowStock = 0;
        let outOfStock = 0;
        
        for (const item of filteredItems) {
            const status = store.getStockStatus(item);
            if (status === 'warning') lowStock++;
            if (status === 'out') outOfStock++;
        }
        
        return { total: filteredItems.length, lowStock, outOfStock };
    }, [filteredItems, store]);
    
    // Warning counts (from all items, not filtered)
    const warningCounts = useMemo(() => {
        if (!store) return { warning: 0, out: 0 };
        
        let warning = 0;
        let out = 0;
        
        for (const item of items) {
            const status = store.getStockStatus(item);
            if (status === 'warning') warning++;
            if (status === 'out') out++;
        }
        
        return { warning, out };
    }, [items, store]);
    
    // Group items by category
    const itemsByCategory = useMemo(() => {
        const grouped = new Map<string, InventoryItem[]>();
        
        for (const item of filteredItems) {
            const cat = item.category || '';
            if (!grouped.has(cat)) {
                grouped.set(cat, []);
            }
            grouped.get(cat)!.push(item);
        }
        
        // Sort categories (empty last)
        const sortedCategories = Array.from(grouped.keys()).sort((a, b) => {
            if (a === '') return 1;
            if (b === '') return -1;
            return a.localeCompare(b);
        });
        
        return { grouped, sortedCategories };
    }, [filteredItems]);
    
    // Sort items for flat view
    const sortedItems = useMemo(() => {
        if (sortBy === 'category') return filteredItems;
        
        return [...filteredItems].sort((a, b) => {
            switch (sortBy) {
                case 'name':
                    return a.name.localeCompare(b.name);
                case 'amount': {
                    const aAmount = typeof a.amount === 'number' ? a.amount : (a.amount ? 1 : 0);
                    const bAmount = typeof b.amount === 'number' ? b.amount : (b.amount ? 1 : 0);
                    return bAmount - aAmount;
                }
                case 'status': {
                    if (!store) return 0;
                    const statusOrder = { 'out': 0, 'warning': 1, 'normal': 2, 'in-stock': 3 };
                    const aStatus = store.getStockStatus(a);
                    const bStatus = store.getStockStatus(b);
                    return statusOrder[aStatus] - statusOrder[bStatus];
                }
                default:
                    return 0;
            }
        });
    }, [filteredItems, sortBy, store]);
    
    // Handlers
    const toggleCategory = useCallback((name: string) => {
        setCollapsedCategories(prev => {
            const next = new Set(prev);
            if (next.has(name)) {
                next.delete(name);
            } else {
                next.add(name);
            }
            return next;
        });
    }, []);
    
    const openAddModal = useCallback(() => {
        void import('../add-item-modal').then(({ AddItemModal }) => {
            new AddItemModal(app, plugin).open();
        });
    }, [app, plugin]);
    
    const openEditModal = useCallback((item: InventoryItem) => {
        void import('../edit-item-modal').then(({ EditItemModal }) => {
            new EditItemModal(app, plugin, item).open();
        });
    }, [app, plugin]);
    
    const openCategoryModal = useCallback(() => {
        void import('../category-modal').then(({ CategoryManageModal }) => {
            new CategoryManageModal(app, plugin).open();
        });
    }, [app, plugin]);
    
    const openReportView = useCallback(() => {
        const doOpen = async () => {
            const { workspace } = app;
            const existing = workspace.getLeavesOfType(REPORT_VIEW_TYPE);
            if (existing.length > 0 && existing[0]) {
                void workspace.revealLeaf(existing[0]);
                return;
            }
            
            const leaf = workspace.getLeaf('tab');
            if (leaf) {
                await leaf.setViewState({ type: REPORT_VIEW_TYPE, active: true });
                void workspace.revealLeaf(leaf);
            }
        };
        void doOpen();
    }, [app]);
    
    const openListManager = useCallback(() => {
        const doOpen = async () => {
            const { workspace } = app;
            const existing = workspace.getLeavesOfType(LIST_MANAGER_VIEW_TYPE);
            if (existing.length > 0 && existing[0]) {
                void workspace.revealLeaf(existing[0]);
                return;
            }
            
            const leaf = workspace.getLeaf('tab');
            if (leaf) {
                await leaf.setViewState({ type: LIST_MANAGER_VIEW_TYPE, active: true });
                void workspace.revealLeaf(leaf);
            }
        };
        void doOpen();
    }, [app]);
    
    const showSortMenu = useCallback((e: React.MouseEvent) => {
        const menu = new Menu();
        
        const options: SortOption[] = ['category', 'name', 'amount', 'status'];
        for (const opt of options) {
            menu.addItem((item) => {
                item.setTitle(SORT_LABELS[opt]);
                if (sortBy === opt) item.setIcon('check');
                item.onClick(() => setSortBy(opt));
            });
        }
        
        menu.showAtMouseEvent(e.nativeEvent);
    }, [sortBy]);
    
    const showFilterMenu = useCallback((e: React.MouseEvent) => {
        const menu = new Menu();
        
        const options: FilterOption[] = ['all', 'in-stock-enough', 'almost-running-out', 'not-in-stock', 'any-in-stock', 'planned-restock'];
        for (const opt of options) {
            menu.addItem((item) => {
                item.setTitle(FILTER_LABELS[opt]);
                if (filterBy === opt) item.setIcon('check');
                item.onClick(() => setFilterBy(opt));
            });
        }
        
        menu.showAtMouseEvent(e.nativeEvent);
    }, [filterBy]);
    
    const showCategoryMenu = useCallback((e: React.MouseEvent) => {
        const menu = new Menu();
        
        menu.addItem((item) => {
            item.setTitle('All categories');
            if (filterByCategory === '__all__') item.setIcon('check');
            item.onClick(() => setFilterByCategory('__all__'));
        });
        
        menu.addSeparator();
        
        menu.addItem((item) => {
            item.setTitle('Uncategorized');
            if (filterByCategory === '') item.setIcon('check');
            item.onClick(() => setFilterByCategory(''));
        });
        
        for (const cat of categories) {
            menu.addItem((item) => {
                item.setTitle(cat);
                if (filterByCategory === cat) item.setIcon('check');
                item.onClick(() => setFilterByCategory(cat));
            });
        }
        
        menu.showAtMouseEvent(e.nativeEvent);
    }, [filterByCategory, categories]);
    
    const resetFilters = useCallback(() => {
        setSearchQuery('');
        setFilterBy('all');
        setFilterByCategory('__all__');
    }, []);
    
    const toggleShoppingList = useCallback(() => {
        setFilterBy(prev => prev === 'planned-restock' ? 'all' : 'planned-restock');
    }, []);
    
    // Handle actions
    const handleIncrease = useCallback((id: string) => {
        void increaseAmount(id);
    }, [increaseAmount]);
    
    const handleDecrease = useCallback((id: string) => {
        void decreaseAmount(id);
    }, [decreaseAmount]);
    
    const handleToggleStock = useCallback((id: string) => {
        void toggleStock(id);
    }, [toggleStock]);
    
    const handleToggleRestock = useCallback((id: string) => {
        void togglePlannedRestock(id);
    }, [togglePlannedRestock]);
    
    // No active list state
    if (!activeList || !store) {
        return (
            <EmptyState
                icon="inbox"
                title="No active list"
                message="Create or select an inventory list to start tracking items."
                buttonText="Open list manager"
                buttonIcon="list"
                onButtonClick={openListManager}
            />
        );
    }
    
    // Loading state
    if (loading) {
        return <div className="stoker-loading">Loading...</div>;
    }
    
    // Category label for display
    const categoryLabel = filterByCategory === '__all__' 
        ? 'All categories' 
        : filterByCategory === '' 
            ? 'Uncategorized' 
            : filterByCategory;
    
    return (
        <>
            {/* Header */}
            <div className="stoker-view-header">
                <div className="stoker-title-row">
                    <h2>Inventory</h2>
                    
                    <button 
                        className={`stoker-shopping-btn${filterBy === 'planned-restock' ? ' stoker-shopping-btn--active' : ''}`}
                        onClick={toggleShoppingList}
                    >
                        <span className="stoker-shopping-btn-icon">
                            <Icon name="shopping-cart" />
                        </span>
                        <span>Shopping list</span>
                    </button>
                    
                    <button className="stoker-report-btn" onClick={openReportView}>
                        <span className="stoker-report-btn-icon">
                            <Icon name="file-text" />
                        </span>
                        <span>Report</span>
                    </button>
                    
                    <button className="stoker-add-btn" onClick={openAddModal}>
                        <span className="stoker-add-btn-icon">
                            <Icon name="plus" />
                        </span>
                        <span>Add item</span>
                    </button>
                </div>
                
                <div className="stoker-controls-row">
                    <SearchInput value={searchQuery} onChange={setSearchQuery} />
                    
                    <DropdownButton label="Sort" value={SORT_LABELS[sortBy]} onClick={showSortMenu} />
                    <DropdownButton label="Status" value={FILTER_LABELS[filterBy]} onClick={showFilterMenu} />
                    
                    <div className="stoker-control-group">
                        <span className="stoker-control-label">Category:</span>
                        <button className="stoker-dropdown-btn" onClick={showCategoryMenu}>
                            <span>{categoryLabel}</span>
                            <span className="stoker-dropdown-icon">
                                <Icon name="chevron-down" />
                            </span>
                        </button>
                        <button 
                            className="stoker-btn stoker-manage-cat-btn"
                            aria-label="Manage categories"
                            onClick={openCategoryModal}
                        >
                            <Icon name="settings" />
                        </button>
                    </div>
                    
                    <button className="stoker-reset-btn" onClick={resetFilters}>
                        <span className="stoker-reset-btn-icon">
                            <Icon name="x" />
                        </span>
                        <span>Reset</span>
                    </button>
                </div>
            </div>
            
            {/* Content */}
            <div className="stoker-view-content">
                {/* Warning banners */}
                {filterBy === 'all' && !searchQuery && (
                    <>
                        {warningCounts.warning > 0 && (
                            <WarningBanner 
                                count={warningCounts.warning} 
                                type="warning" 
                                onClick={() => setFilterBy('almost-running-out')} 
                            />
                        )}
                        {warningCounts.out > 0 && (
                            <WarningBanner 
                                count={warningCounts.out} 
                                type="danger" 
                                onClick={() => setFilterBy('not-in-stock')} 
                            />
                        )}
                    </>
                )}
                
                {/* Empty states */}
                {filteredItems.length === 0 && !searchQuery && filterBy === 'all' && (
                    <EmptyState
                        message="Your inventory is empty"
                        buttonText="Add your first item"
                        onButtonClick={openAddModal}
                    />
                )}
                
                {filteredItems.length === 0 && (searchQuery || filterBy !== 'all') && (
                    <EmptyState
                        message={searchQuery ? `No items matching "${searchQuery}"` : 'No items match the current filter'}
                    />
                )}
                
                {/* Stats and items */}
                {filteredItems.length > 0 && (
                    <>
                        <StatsBar {...stats} />
                        
                        {sortBy === 'category' ? (
                            // Category view
                            itemsByCategory.sortedCategories.map(category => (
                                <CategorySection
                                    key={category || '__uncategorized__'}
                                    name={category || 'Uncategorized'}
                                    items={itemsByCategory.grouped.get(category)!}
                                    isCollapsed={collapsedCategories.has(category || 'Uncategorized')}
                                    onToggle={() => toggleCategory(category || 'Uncategorized')}
                                    getStockStatus={getStockStatus}
                                    onEditItem={openEditModal}
                                    onIncreaseAmount={handleIncrease}
                                    onDecreaseAmount={handleDecrease}
                                    onToggleStock={handleToggleStock}
                                    onToggleRestock={handleToggleRestock}
                                />
                            ))
                        ) : (
                            // Flat view
                            <div className="stoker-items-list">
                                {sortedItems.map(item => (
                                    <ItemRow
                                        key={item.id}
                                        item={item}
                                        status={getStockStatus(item)}
                                        onEdit={() => openEditModal(item)}
                                        onIncrease={() => handleIncrease(item.id)}
                                        onDecrease={() => handleDecrease(item.id)}
                                        onToggleStock={() => handleToggleStock(item.id)}
                                        onToggleRestock={() => handleToggleRestock(item.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    );
}
