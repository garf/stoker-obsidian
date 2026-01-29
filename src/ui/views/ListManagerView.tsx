import { useState, useCallback, useEffect } from 'react';
import { Menu, setIcon, Modal, App, TFile } from 'obsidian';
import { useApp, usePlugin } from '../context/AppContext';
import { useListManager } from '../hooks/useListManager';
import type { InventoryList } from '../../types';
import { INVENTORY_VIEW_TYPE } from '../inventory-leaf-view';

interface ListStats {
    total: number;
    warning: number;
    outOfStock: number;
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

// Empty State Component
function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
    return (
        <div className="stoker-empty-state">
            <div className="stoker-empty-icon">
                <Icon name="inbox" />
            </div>
            <h3>No inventory lists</h3>
            <p>Create your first inventory list to start tracking items.</p>
            <button className="stoker-btn mod-cta" onClick={onCreateClick}>
                <span className="stoker-btn-icon"><Icon name="plus" /></span>
                <span>Create first list</span>
            </button>
        </div>
    );
}

// List Item Component
interface ListItemProps {
    list: InventoryList;
    isActive: boolean;
    stats: ListStats;
    onSelect: () => void;
    onOpenInventory: () => void;
    onShowMenu: (e: React.MouseEvent) => void;
}

function ListItem({ list, isActive, stats, onSelect, onOpenInventory, onShowMenu }: ListItemProps) {
    return (
        <div 
            className={`stoker-list-item${isActive ? ' stoker-list-item--active' : ''}`}
            onClick={onSelect}
        >
            <div className="stoker-list-item-left">
                <div className="stoker-list-item-icon">
                    <Icon name={isActive ? 'check-circle' : 'circle'} />
                </div>
                
                <div className="stoker-list-item-info">
                    <div className="stoker-list-item-name">{list.name}</div>
                    <div className="stoker-list-item-path">{list.filePath}</div>
                    
                    <div className="stoker-list-item-stats">
                        <span className="stoker-list-stat">{stats.total} items</span>
                        
                        {stats.warning > 0 && (
                            <span className="stoker-list-stat stoker-list-stat--warning">
                                <span className="stoker-list-stat-icon"><Icon name="alert-triangle" /></span>
                                <span>{stats.warning}</span>
                            </span>
                        )}
                        
                        {stats.outOfStock > 0 && (
                            <span className="stoker-list-stat stoker-list-stat--danger">
                                <span className="stoker-list-stat-icon"><Icon name="x-circle" /></span>
                                <span>{stats.outOfStock}</span>
                            </span>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="stoker-list-item-actions">
                <button 
                    className="stoker-list-action-btn"
                    aria-label="Open inventory"
                    onClick={(e) => { e.stopPropagation(); onOpenInventory(); }}
                >
                    <Icon name="package" />
                </button>
                
                <button 
                    className="stoker-list-action-btn"
                    aria-label="More options"
                    onClick={(e) => { e.stopPropagation(); onShowMenu(e); }}
                >
                    <Icon name="more-vertical" />
                </button>
            </div>
        </div>
    );
}

// Confirmation modal for deleting a list
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
            // eslint-disable-next-line obsidianmd/ui/sentence-case -- "Stoker" is a product name
            text: 'This will remove the list from Stoker. The markdown file will not be deleted.',
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

// Main List Manager View Component
export function ListManagerView() {
    const { app } = useApp();
    const plugin = usePlugin();
    const { lists, activeList, switchList, deleteList } = useListManager();
    
    // Stats cache
    const [statsCache, setStatsCache] = useState<Map<string, ListStats>>(new Map());
    
    // Load stats for all lists
    useEffect(() => {
        const loadStats = async () => {
            const newCache = new Map<string, ListStats>();
            
            for (const list of lists) {
                try {
                    if (!plugin.listManager.fileExists(list.filePath)) {
                        newCache.set(list.id, { total: 0, warning: 0, outOfStock: 0 });
                        continue;
                    }
                    
                    const store = plugin.listManager.getStore(list.id);
                    if (!store) {
                        newCache.set(list.id, { total: 0, warning: 0, outOfStock: 0 });
                        continue;
                    }
                    
                    await store.load();
                    const items = store.getItems();
                    let warning = 0;
                    let outOfStock = 0;
                    
                    for (const item of items) {
                        const status = store.getStockStatus(item);
                        if (status === 'warning') warning++;
                        else if (status === 'out') outOfStock++;
                    }
                    
                    newCache.set(list.id, { total: items.length, warning, outOfStock });
                } catch {
                    newCache.set(list.id, { total: 0, warning: 0, outOfStock: 0 });
                }
            }
            
            setStatsCache(newCache);
        };
        
        void loadStats();
    }, [lists, plugin.listManager]);
    
    // Handlers
    const openCreateModal = useCallback(() => {
        void import('../create-list-modal').then(({ CreateListModal }) => {
            new CreateListModal(app, plugin).open();
        });
    }, [app, plugin]);
    
    const handleSelectList = useCallback((listId: string) => {
        if (listId !== activeList?.id) {
            void switchList(listId);
        }
    }, [activeList, switchList]);
    
    const openInventoryView = useCallback((list: InventoryList) => {
        const doOpen = async () => {
            await switchList(list.id);
            
            const { workspace } = app;
            const existing = workspace.getLeavesOfType(INVENTORY_VIEW_TYPE);
            if (existing.length > 0 && existing[0]) {
                void workspace.revealLeaf(existing[0]);
                return;
            }
            
            const leaf = workspace.getLeaf('tab');
            if (leaf) {
                await leaf.setViewState({ type: INVENTORY_VIEW_TYPE, active: true });
                void workspace.revealLeaf(leaf);
            }
        };
        void doOpen();
    }, [app, switchList]);
    
    const openRawFile = useCallback((list: InventoryList) => {
        const doOpen = async () => {
            const file = app.vault.getAbstractFileByPath(list.filePath);
            if (file instanceof TFile) {
                const leaf = app.workspace.getLeaf('tab');
                if (leaf) {
                    await leaf.openFile(file);
                }
            }
        };
        void doOpen();
    }, [app]);
    
    const confirmDeleteList = useCallback((list: InventoryList) => {
        const modal = new ConfirmDeleteModal(app, list, () => {
            void deleteList(list.id);
        });
        modal.open();
    }, [app, deleteList]);
    
    const showListMenu = useCallback((e: React.MouseEvent, list: InventoryList, isActive: boolean) => {
        const menu = new Menu();
        
        if (!isActive) {
            menu.addItem((item) => {
                item.setTitle('Set as active')
                    .setIcon('check')
                    .onClick(() => {
                        void switchList(list.id);
                    });
            });
        }
        
        menu.addItem((item) => {
            item.setTitle('Open inventory')
                .setIcon('package')
                .onClick(() => {
                    openInventoryView(list);
                });
        });

        menu.addItem((item) => {
            item.setTitle('View source file')
                .setIcon('file-text')
                .onClick(() => {
                    openRawFile(list);
                });
        });
        
        menu.addSeparator();
        
        menu.addItem((item) => {
            item.setTitle('Delete list')
                .setIcon('trash')
                .onClick(() => {
                    confirmDeleteList(list);
                });
        });
        
        menu.showAtMouseEvent(e.nativeEvent);
    }, [switchList, openInventoryView, openRawFile, confirmDeleteList]);
    
    return (
        <>
            {/* Header */}
            <div className="stoker-list-manager-header">
                <h2>Inventory lists</h2>
                <button className="stoker-btn mod-cta" onClick={openCreateModal}>
                    <span className="stoker-btn-icon"><Icon name="plus" /></span>
                    <span>New list</span>
                </button>
            </div>
            
            <p className="stoker-list-manager-desc">
                Manage your inventory lists. Each list is stored in a separate markdown file.
            </p>
            
            {/* Content */}
            <div className="stoker-list-manager-content">
                {lists.length === 0 ? (
                    <EmptyState onCreateClick={openCreateModal} />
                ) : (
                    <div className="stoker-lists-container">
                        {lists.map(list => (
                            <ListItem
                                key={list.id}
                                list={list}
                                isActive={list.id === activeList?.id}
                                stats={statsCache.get(list.id) || { total: 0, warning: 0, outOfStock: 0 }}
                                onSelect={() => handleSelectList(list.id)}
                                onOpenInventory={() => openInventoryView(list)}
                                onShowMenu={(e) => showListMenu(e, list, list.id === activeList?.id)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
