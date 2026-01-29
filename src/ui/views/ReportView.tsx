import { useState, useCallback, useMemo } from 'react';
import { setIcon, Notice } from 'obsidian';
import { useApp } from '../context/AppContext';
import { useInventoryStore } from '../hooks/useInventoryStore';
import { useListManager } from '../hooks/useListManager';
import type { InventoryItem, StockStatus } from '../../types';
import type { InventoryStore } from '../../data/inventory-store';
import { LIST_MANAGER_VIEW_TYPE } from '../list-manager-view';

type ReportType = 'shopping-list' | 'low-stock' | 'full-inventory';

const REPORT_OPTIONS: { type: ReportType; label: string; icon: string }[] = [
    { type: 'shopping-list', label: 'Shopping list', icon: 'shopping-cart' },
    { type: 'low-stock', label: 'Low stock report', icon: 'alert-triangle' },
    { type: 'full-inventory', label: 'Full inventory', icon: 'package' },
];

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
    
    if (item.minimum !== undefined && item.minimum > 0) {
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
interface EmptyStateProps {
    message: string;
    icon: string;
}

function EmptyState({ message, icon }: EmptyStateProps) {
    return (
        <div className="stoker-report-empty">
            <div className="stoker-report-empty-icon">
                <Icon name={icon} />
            </div>
            <div className="stoker-report-empty-text">{message}</div>
        </div>
    );
}

// Report Item Component
interface ReportItemProps {
    item: InventoryItem;
    status: StockStatus;
    showCheckbox?: boolean;
    showCategory?: boolean;
}

function ReportItem({ item, status, showCheckbox, showCategory }: ReportItemProps) {
    const statusClass = status === 'out' ? 'stoker-report-item--out' : 
                       status === 'warning' ? 'stoker-report-item--warning' : '';
    
    return (
        <li className={`stoker-report-item ${statusClass}`}>
            {showCheckbox && <span className="stoker-report-checkbox">☐</span>}
            <span className="stoker-report-item-name">{item.name}</span>
            {showCategory && item.category && (
                <span className="stoker-report-item-category">[{item.category}]</span>
            )}
            <span className="stoker-report-item-amount">{formatAmount(item)}</span>
            {item.plannedRestock && <span className="stoker-report-item-restock">🛒</span>}
        </li>
    );
}

// Group items by category helper
function groupByCategory(items: InventoryItem[]): Map<string, InventoryItem[]> {
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

// Main Report View Component
export function ReportView() {
    const { app } = useApp();
    const { items, store, getStockStatus } = useInventoryStore();
    const { activeList } = useListManager();
    
    const [reportType, setReportType] = useState<ReportType>('shopping-list');
    
    // Computed data
    const reportData = useMemo(() => {
        if (!store) return null;
        
        const shoppingItems = items.filter(item => item.plannedRestock);
        const outItems = items.filter(item => store.getStockStatus(item) === 'out');
        const warningItems = items.filter(item => store.getStockStatus(item) === 'warning');
        const inStockItems = items.filter(item => {
            const status = store.getStockStatus(item);
            return status === 'normal' || status === 'in-stock';
        });
        
        return { shoppingItems, outItems, warningItems, inStockItems };
    }, [items, store]);
    
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
    
    // Copy handlers
    const copyAsMarkdown = useCallback(() => {
        const doCopy = async () => {
            if (!store || !reportData) {
                new Notice('No active inventory list');
                return;
            }
            
            const listName = activeList?.name || 'Inventory';
            const date = new Date().toLocaleDateString();
            let markdown = '';
            
            switch (reportType) {
                case 'shopping-list':
                    markdown = generateShoppingListMarkdown(reportData.shoppingItems, listName, date);
                    break;
                case 'low-stock':
                    markdown = generateLowStockMarkdown(reportData.outItems, reportData.warningItems, listName, date, store);
                    break;
                case 'full-inventory':
                    markdown = generateFullInventoryMarkdown(items, listName, date, store);
                    break;
            }
            
            await navigator.clipboard.writeText(markdown);
            new Notice('Copied to clipboard as Markdown');
        };
        void doCopy();
    }, [store, reportData, activeList, reportType, items]);
    
    const copyAsText = useCallback(() => {
        const doCopy = async () => {
            if (!store || !reportData) {
                new Notice('No active inventory list');
                return;
            }
            
            const listName = activeList?.name || 'Inventory';
            const date = new Date().toLocaleDateString();
            let text = '';
            
            switch (reportType) {
                case 'shopping-list':
                    text = generateShoppingListText(reportData.shoppingItems, listName, date);
                    break;
                case 'low-stock':
                    text = generateLowStockText(reportData.outItems, reportData.warningItems, listName, date, store);
                    break;
                case 'full-inventory':
                    text = generateFullInventoryText(items, listName, date, store);
                    break;
            }
            
            await navigator.clipboard.writeText(text);
            new Notice('Copied to clipboard as plain text');
        };
        void doCopy();
    }, [store, reportData, activeList, reportType, items]);
    
    // No active list state
    if (!activeList || !store || !reportData) {
        return (
            <>
                <ReportHeader 
                    reportType={reportType}
                    onReportTypeChange={setReportType}
                    onCopyMarkdown={copyAsMarkdown}
                    onCopyText={copyAsText}
                />
                <div className="stoker-report-content">
                    <div className="stoker-report-empty">
                        <div className="stoker-report-empty-icon">
                            <Icon name="inbox" />
                        </div>
                        <h3>No active list</h3>
                        <p className="stoker-report-empty-text">
                            Create or select an inventory list to generate reports.
                        </p>
                        <button className="stoker-btn mod-cta" onClick={openListManager}>
                            <span className="stoker-btn-icon"><Icon name="list" /></span>
                            <span>Open list manager</span>
                        </button>
                    </div>
                </div>
            </>
        );
    }
    
    return (
        <>
            <ReportHeader 
                reportType={reportType}
                onReportTypeChange={setReportType}
                onCopyMarkdown={copyAsMarkdown}
                onCopyText={copyAsText}
            />
            
            <div className="stoker-report-content">
                {reportType === 'shopping-list' && (
                    <ShoppingListReport 
                        items={reportData.shoppingItems} 
                        getStockStatus={getStockStatus}
                    />
                )}
                {reportType === 'low-stock' && (
                    <LowStockReport 
                        outItems={reportData.outItems}
                        warningItems={reportData.warningItems}
                        getStockStatus={getStockStatus}
                    />
                )}
                {reportType === 'full-inventory' && (
                    <FullInventoryReport 
                        items={items}
                        inStockItems={reportData.inStockItems}
                        warningItems={reportData.warningItems}
                        outItems={reportData.outItems}
                        getStockStatus={getStockStatus}
                    />
                )}
            </div>
        </>
    );
}

// Report Header Component
interface ReportHeaderProps {
    reportType: ReportType;
    onReportTypeChange: (type: ReportType) => void;
    onCopyMarkdown: () => void;
    onCopyText: () => void;
}

function ReportHeader({ reportType, onReportTypeChange, onCopyMarkdown, onCopyText }: ReportHeaderProps) {
    return (
        <div className="stoker-report-header">
            <div className="stoker-report-title-row">
                <h2>Inventory report</h2>
                
                <div className="stoker-export-btns">
                    <button className="stoker-export-btn" onClick={onCopyMarkdown} aria-label="Copy as Markdown">
                        <span className="stoker-export-btn-icon"><Icon name="copy" /></span>
                        <span>Copy MD</span>
                    </button>
                    <button className="stoker-export-btn" onClick={onCopyText} aria-label="Copy as plain text">
                        <span className="stoker-export-btn-icon"><Icon name="file-text" /></span>
                        <span>Copy text</span>
                    </button>
                </div>
            </div>
            
            <div className="stoker-report-selector">
                {REPORT_OPTIONS.map(opt => (
                    <button
                        key={opt.type}
                        className={`stoker-report-type-btn${reportType === opt.type ? ' stoker-report-type-btn--active' : ''}`}
                        onClick={() => onReportTypeChange(opt.type)}
                    >
                        <span className="stoker-report-type-icon"><Icon name={opt.icon} /></span>
                        <span>{opt.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

// Shopping List Report
interface ShoppingListReportProps {
    items: InventoryItem[];
    getStockStatus: (item: InventoryItem) => StockStatus;
}

function ShoppingListReport({ items, getStockStatus }: ShoppingListReportProps) {
    if (items.length === 0) {
        return <EmptyState message="Your shopping list is empty" icon="shopping-cart" />;
    }
    
    const grouped = groupByCategory(items);
    
    return (
        <>
            <h3 className="stoker-report-section-title">Shopping list ({items.length} items)</h3>
            <div className="stoker-report-date">Generated: {new Date().toLocaleDateString()}</div>
            
            {Array.from(grouped.entries()).map(([category, categoryItems]) => (
                <div key={category}>
                    <div className="stoker-report-category">{category}</div>
                    <ul className="stoker-report-list">
                        {categoryItems.sort((a, b) => a.name.localeCompare(b.name)).map(item => (
                            <ReportItem 
                                key={item.id} 
                                item={item} 
                                status={getStockStatus(item)}
                                showCheckbox 
                            />
                        ))}
                    </ul>
                </div>
            ))}
        </>
    );
}

// Low Stock Report
interface LowStockReportProps {
    outItems: InventoryItem[];
    warningItems: InventoryItem[];
    getStockStatus: (item: InventoryItem) => StockStatus;
}

function LowStockReport({ outItems, warningItems, getStockStatus }: LowStockReportProps) {
    if (outItems.length === 0 && warningItems.length === 0) {
        return <EmptyState message="All items are well stocked!" icon="check-circle" />;
    }
    
    return (
        <>
            <h3 className="stoker-report-section-title">Low stock report</h3>
            <div className="stoker-report-date">Generated: {new Date().toLocaleDateString()}</div>
            
            <div className="stoker-report-summary">
                {warningItems.length > 0 && (
                    <span className="stoker-report-stat stoker-report-stat--warning">
                        {warningItems.length} almost running out
                    </span>
                )}
                {outItems.length > 0 && (
                    <span className="stoker-report-stat stoker-report-stat--danger">
                        {outItems.length} out of stock
                    </span>
                )}
            </div>
            
            {outItems.length > 0 && (
                <>
                    <h4 className="stoker-report-subsection-title stoker-report-subsection--danger">
                        Out of stock
                    </h4>
                    <ul className="stoker-report-list">
                        {outItems.sort((a, b) => a.name.localeCompare(b.name)).map(item => (
                            <ReportItem key={item.id} item={item} status={getStockStatus(item)} showCategory />
                        ))}
                    </ul>
                </>
            )}
            
            {warningItems.length > 0 && (
                <>
                    <h4 className="stoker-report-subsection-title stoker-report-subsection--warning">
                        Almost running out
                    </h4>
                    <ul className="stoker-report-list">
                        {warningItems.sort((a, b) => a.name.localeCompare(b.name)).map(item => (
                            <ReportItem key={item.id} item={item} status={getStockStatus(item)} showCategory />
                        ))}
                    </ul>
                </>
            )}
        </>
    );
}

// Full Inventory Report
interface FullInventoryReportProps {
    items: InventoryItem[];
    inStockItems: InventoryItem[];
    warningItems: InventoryItem[];
    outItems: InventoryItem[];
    getStockStatus: (item: InventoryItem) => StockStatus;
}

function FullInventoryReport({ items, inStockItems, warningItems, outItems, getStockStatus }: FullInventoryReportProps) {
    if (items.length === 0) {
        return <EmptyState message="Your inventory is empty" icon="package" />;
    }
    
    const renderSection = (sectionItems: InventoryItem[]) => {
        const grouped = groupByCategory(sectionItems);
        return Array.from(grouped.entries()).map(([category, categoryItems]) => (
            <div key={category}>
                <div className="stoker-report-category">{category}</div>
                <ul className="stoker-report-list">
                    {categoryItems.sort((a, b) => a.name.localeCompare(b.name)).map(item => (
                        <ReportItem key={item.id} item={item} status={getStockStatus(item)} />
                    ))}
                </ul>
            </div>
        ));
    };
    
    return (
        <>
            <h3 className="stoker-report-section-title">Full inventory</h3>
            <div className="stoker-report-date">Generated: {new Date().toLocaleDateString()}</div>
            
            <div className="stoker-report-summary">
                <span className="stoker-report-stat">{items.length} total items</span>
                {inStockItems.length > 0 && (
                    <span className="stoker-report-stat stoker-report-stat--success">
                        {inStockItems.length} in stock
                    </span>
                )}
                {warningItems.length > 0 && (
                    <span className="stoker-report-stat stoker-report-stat--warning">
                        {warningItems.length} low
                    </span>
                )}
                {outItems.length > 0 && (
                    <span className="stoker-report-stat stoker-report-stat--danger">
                        {outItems.length} out
                    </span>
                )}
            </div>
            
            {inStockItems.length > 0 && (
                <>
                    <h4 className="stoker-report-subsection-title stoker-report-subsection--success">
                        In stock
                    </h4>
                    {renderSection(inStockItems)}
                </>
            )}
            
            {warningItems.length > 0 && (
                <>
                    <h4 className="stoker-report-subsection-title stoker-report-subsection--warning">
                        Almost running out
                    </h4>
                    {renderSection(warningItems)}
                </>
            )}
            
            {outItems.length > 0 && (
                <>
                    <h4 className="stoker-report-subsection-title stoker-report-subsection--danger">
                        Out of stock
                    </h4>
                    {renderSection(outItems)}
                </>
            )}
        </>
    );
}

// Export generators (simplified versions)
function generateShoppingListMarkdown(items: InventoryItem[], listName: string, date: string): string {
    if (items.length === 0) {
        return `# Shopping list - ${listName}\n\n*Generated: ${date}*\n\nNo items to buy.`;
    }
    
    let md = `# Shopping list - ${listName}\n\n*Generated: ${date}*\n\n`;
    const grouped = groupByCategory(items);
    
    for (const [category, categoryItems] of grouped) {
        md += `## ${category}\n\n`;
        for (const item of categoryItems.sort((a, b) => a.name.localeCompare(b.name))) {
            md += `- [ ] ${item.name}`;
            if (item.unitType !== 'boolean' && item.minimum !== undefined) {
                const amount = item.amount as number;
                const needed = Math.max(0, item.minimum - amount);
                if (needed > 0) md += ` (need ${needed} ${item.unit})`;
            }
            md += '\n';
        }
        md += '\n';
    }
    
    return md.trim();
}

function generateShoppingListText(items: InventoryItem[], listName: string, date: string): string {
    if (items.length === 0) {
        return `SHOPPING LIST - ${listName}\n${date}\n\nNo items to buy.`;
    }
    
    let text = `SHOPPING LIST - ${listName}\n${date}\n${'='.repeat(40)}\n\n`;
    const grouped = groupByCategory(items);
    
    for (const [category, categoryItems] of grouped) {
        text += `${category.toUpperCase()}\n${'-'.repeat(category.length)}\n`;
        for (const item of categoryItems.sort((a, b) => a.name.localeCompare(b.name))) {
            text += `☐ ${item.name}`;
            if (item.unitType !== 'boolean' && item.minimum !== undefined) {
                const amount = item.amount as number;
                const needed = Math.max(0, item.minimum - amount);
                if (needed > 0) text += ` (need ${needed} ${item.unit})`;
            }
            text += '\n';
        }
        text += '\n';
    }
    
    return text.trim();
}

function generateLowStockMarkdown(outItems: InventoryItem[], warningItems: InventoryItem[], listName: string, date: string, _store: unknown): string {
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
    }
    
    return md.trim();
}

function generateLowStockText(outItems: InventoryItem[], warningItems: InventoryItem[], listName: string, date: string, _store: unknown): string {
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
    }
    
    return text.trim();
}

function generateFullInventoryMarkdown(items: InventoryItem[], listName: string, date: string, store: InventoryStore): string {
    if (items.length === 0) {
        return `# Full inventory - ${listName}\n\n*Generated: ${date}*\n\nNo items in inventory.`;
    }
    
    let md = `# Full inventory - ${listName}\n\n*Generated: ${date}*\n\n`;
    md += `**Total items:** ${items.length}\n\n`;
    
    const grouped = groupByCategory(items);
    
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

function generateFullInventoryText(items: InventoryItem[], listName: string, date: string, store: InventoryStore): string {
    if (items.length === 0) {
        return `FULL INVENTORY - ${listName}\n${date}\n\nNo items in inventory.`;
    }
    
    let text = `FULL INVENTORY - ${listName}\n${date}\n${'='.repeat(40)}\n\n`;
    text += `Total items: ${items.length}\n\n`;
    
    const grouped = groupByCategory(items);
    
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
