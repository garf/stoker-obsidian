import { useState, useCallback, useMemo, useEffect } from 'react';
import { Menu, setIcon } from 'obsidian';
import { useApp, usePlugin } from '../context/AppContext';
import { useInventoryStore } from '../hooks/useInventoryStore';
import { useListManager } from '../hooks/useListManager';
import type { InventoryItem, InventoryList, StockStatus } from '../../types';
import { LIST_MANAGER_VIEW_TYPE } from '../list-manager-view';

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
    
    return (
        <div 
            className={`stoker-item stoker-item--${status}${item.plannedRestock ? ' stoker-item--restock' : ''}`}
            data-item-id={item.id}
            onClick={onEdit}
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
    return (
        <div className="stoker-category">
            <div className="stoker-category-header" onClick={onToggle}>
                <div className="stoker-category-toggle">
                    <Icon name={isCollapsed ? 'chevron-right' : 'chevron-down'} />
                </div>
                <div className="stoker-category-name">{name || 'Uncategorized'}</div>
            </div>
            
            {!isCollapsed && (
                <div className="stoker-category-items">
                    {items.map(item => (
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
    secondaryButtonText?: string;
    secondaryButtonIcon?: string;
    onSecondaryButtonClick?: () => void;
}

function EmptyState({ 
    message, 
    icon = 'package-open', 
    title, 
    buttonText, 
    buttonIcon, 
    onButtonClick,
    secondaryButtonText,
    secondaryButtonIcon,
    onSecondaryButtonClick,
}: EmptyStateProps) {
    return (
        <div className="stoker-empty-state">
            <div className="stoker-empty-icon">
                <Icon name={icon} />
            </div>
            {title && <h3>{title}</h3>}
            <p>{message}</p>
            {onButtonClick && buttonText && (
                <button className="stoker-btn mod-cta" onClick={onButtonClick}>
                    {buttonIcon && <span className="stoker-btn-icon"><Icon name={buttonIcon} /></span>}
                    <span>{buttonText}</span>
                </button>
            )}
            {onSecondaryButtonClick && secondaryButtonText && (
                <button className="stoker-btn" onClick={onSecondaryButtonClick} style={{ marginTop: '8px' }}>
                    {secondaryButtonIcon && <span className="stoker-btn-icon"><Icon name={secondaryButtonIcon} /></span>}
                    <span>{secondaryButtonText}</span>
                </button>
            )}
        </div>
    );
}

/**
 * Get a display name for a list, adding path disambiguation if needed
 */
function getListDisplayName(list: InventoryList, allLists: InventoryList[]): string {
    const sameNameLists = allLists.filter(l => l.name === list.name);
    
    if (sameNameLists.length <= 1) {
        return list.name;
    }
    
    // Get minimal path segment for disambiguation
    const parts = list.filePath.split('/');
    const resultParts = parts.slice(0, -1);
    if (resultParts.length > 0) {
        return `${list.name} (${resultParts.join('/')})`;
    }
    
    return `${list.name} (${list.filePath.replace('.md', '')})`;
}

// Main Sidebar View Component
export function SidebarView() {
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
    const { lists, activeList, deleteList } = useListManager();
    
    // Check if file exists
    const fileExists = useMemo(() => {
        if (!activeList) return false;
        return plugin.listManager.activeListFileExists();
    }, [activeList, plugin.listManager]);
    
    // View state
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => 
        new Set(plugin.settings.collapsedCategories)
    );
    const [, setHighlightedItem] = useState<string | null>(null);
    
    // Save collapsed state on change
    useEffect(() => {
        plugin.settings.collapsedCategories = Array.from(collapsedCategories);
        void plugin.saveSettings();
    }, [collapsedCategories, plugin]);
    
    // Warning counts
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
        
        for (const item of items) {
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
    }, [items]);
    
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
    
    const openCreateListModal = useCallback(() => {
        void import('../create-list-modal').then(({ CreateListModal }) => {
            new CreateListModal(app, plugin).open();
        });
    }, [app, plugin]);
    
    const showListDropdown = useCallback((e: React.MouseEvent) => {
        const menu = new Menu();
        
        if (lists.length === 0) {
            menu.addItem((item) => {
                item.setTitle('No lists available').setDisabled(true);
            });
            menu.addSeparator();
            menu.addItem((item) => {
                item.setTitle('Create new list')
                    .setIcon('plus')
                    .onClick(() => openCreateListModal());
            });
        } else {
            for (const list of lists) {
                const isActive = list.id === activeList?.id;
                const displayName = getListDisplayName(list, lists);
                
                menu.addItem((item) => {
                    item.setTitle(displayName)
                        .setIcon(isActive ? 'check' : 'file-text')
                        .setChecked(isActive)
                        .onClick(() => {
                            if (!isActive) {
                                void plugin.listManager.switchList(list.id);
                            }
                        });
                });
            }
            
            menu.addSeparator();
            menu.addItem((item) => {
                item.setTitle('Create new list')
                    .setIcon('plus')
                    .onClick(() => openCreateListModal());
            });
        }
        
        menu.showAtMouseEvent(e.nativeEvent);
    }, [lists, activeList, plugin.listManager, openCreateListModal]);
    
    const scrollToFirstItem = useCallback((status: 'warning' | 'out') => {
        const item = items.find(i => store?.getStockStatus(i) === status);
        if (item) {
            setHighlightedItem(item.id);
            setTimeout(() => setHighlightedItem(null), 1500);
            
            const el = document.querySelector(`[data-item-id="${item.id}"]`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [items, store]);
    
    const handleDeleteActiveList = useCallback(() => {
        if (activeList) {
            void deleteList(activeList.id);
        }
    }, [activeList, deleteList]);
    
    // Get list display name
    const listDisplayName = useMemo(() => {
        if (activeList) {
            return getListDisplayName(activeList, lists);
        }
        if (lists.length === 0) {
            return 'No lists';
        }
        return 'Select list';
    }, [activeList, lists]);
    
    // Loading state
    if (loading) {
        return <div className="stoker-loading">Loading...</div>;
    }
    
    // No active list state
    if (!activeList || !store) {
        return (
            <>
                <Header 
                    listDisplayName={listDisplayName}
                    listTitle={activeList?.filePath || 'Select to create a list'}
                    onAddClick={openAddModal}
                    onListSelectorClick={showListDropdown}
                    onManageListsClick={openListManager}
                />
                <div className="stoker-sidebar-content">
                    <EmptyState
                        icon="inbox"
                        title="No active list"
                        message="Create or select an inventory list to start tracking items."
                        buttonText="Open list manager"
                        buttonIcon="list"
                        onButtonClick={openListManager}
                    />
                </div>
            </>
        );
    }
    
    // Missing file state
    if (!fileExists) {
        return (
            <>
                <Header 
                    listDisplayName={listDisplayName}
                    listTitle={activeList.filePath}
                    onAddClick={openAddModal}
                    onListSelectorClick={showListDropdown}
                    onManageListsClick={openListManager}
                />
                <div className="stoker-sidebar-content">
                    <div className="stoker-empty-state stoker-missing-file">
                        <div className="stoker-empty-icon stoker-warning-icon">
                            <Icon name="alert-triangle" />
                        </div>
                        <h3>File not found</h3>
                        <p className="stoker-missing-file-path">
                            The inventory file "{activeList.filePath}" no longer exists.
                        </p>
                        <p className="stoker-missing-file-hint">
                            Select a different list or create a new one.
                        </p>
                        <div className="stoker-missing-file-actions">
                            <button className="stoker-btn mod-cta" onClick={openListManager}>
                                <span className="stoker-btn-icon"><Icon name="list" /></span>
                                <span>Open list manager</span>
                            </button>
                            <button className="stoker-btn" onClick={handleDeleteActiveList}>
                                <span className="stoker-btn-icon"><Icon name="trash-2" /></span>
                                <span>Remove from list</span>
                            </button>
                        </div>
                    </div>
                </div>
            </>
        );
    }
    
    // Empty inventory state
    if (items.length === 0) {
        return (
            <>
                <Header 
                    listDisplayName={listDisplayName}
                    listTitle={activeList.filePath}
                    onAddClick={openAddModal}
                    onListSelectorClick={showListDropdown}
                    onManageListsClick={openListManager}
                />
                <div className="stoker-sidebar-content">
                    <EmptyState
                        message="Your inventory is empty"
                        buttonText="Add your first item"
                        onButtonClick={openAddModal}
                    />
                </div>
            </>
        );
    }
    
    return (
        <>
            <Header 
                listDisplayName={listDisplayName}
                listTitle={activeList.filePath}
                onAddClick={openAddModal}
                onListSelectorClick={showListDropdown}
                onManageListsClick={openListManager}
            />
            
            <div className="stoker-sidebar-content">
                {/* Warning banners */}
                {warningCounts.warning > 0 && (
                    <WarningBanner 
                        count={warningCounts.warning} 
                        type="warning" 
                        onClick={() => scrollToFirstItem('warning')} 
                    />
                )}
                {warningCounts.out > 0 && (
                    <WarningBanner 
                        count={warningCounts.out} 
                        type="danger" 
                        onClick={() => scrollToFirstItem('out')} 
                    />
                )}
                
                {/* Categories */}
                {itemsByCategory.sortedCategories.map(category => (
                    <CategorySection
                        key={category || '__uncategorized__'}
                        name={category || 'Uncategorized'}
                        items={itemsByCategory.grouped.get(category)!}
                        isCollapsed={collapsedCategories.has(category || 'Uncategorized')}
                        onToggle={() => toggleCategory(category || 'Uncategorized')}
                        getStockStatus={getStockStatus}
                        onEditItem={openEditModal}
                        onIncreaseAmount={(id) => { void increaseAmount(id); }}
                        onDecreaseAmount={(id) => { void decreaseAmount(id); }}
                        onToggleStock={(id) => { void toggleStock(id); }}
                        onToggleRestock={(id) => { void togglePlannedRestock(id); }}
                    />
                ))}
            </div>
        </>
    );
}

// Header Component
interface HeaderProps {
    listDisplayName: string;
    listTitle: string;
    onAddClick: () => void;
    onListSelectorClick: (e: React.MouseEvent) => void;
    onManageListsClick: () => void;
}

function Header({ listDisplayName, listTitle, onAddClick, onListSelectorClick, onManageListsClick }: HeaderProps) {
    return (
        <div className="stoker-sidebar-header">
            <div className="stoker-sidebar-title-row">
                <h4>Inventory</h4>
                <button className="stoker-add-btn" onClick={onAddClick}>
                    <span className="stoker-add-btn-icon"><Icon name="plus" /></span>
                    <span>Add item</span>
                </button>
            </div>
            
            <div className="stoker-sidebar-list-row">
                <div className="stoker-list-selector" onClick={onListSelectorClick}>
                    <span className="stoker-list-selector-icon">
                        <Icon name="list" />
                    </span>
                    <span className="stoker-list-selector-name" title={listTitle}>
                        {listDisplayName}
                    </span>
                    <span className="stoker-list-selector-chevron">
                        <Icon name="chevron-down" />
                    </span>
                </div>
                
                <div 
                    className="stoker-manage-lists-btn" 
                    aria-label="Manage lists"
                    onClick={onManageListsClick}
                >
                    <Icon name="settings" />
                </div>
            </div>
        </div>
    );
}
