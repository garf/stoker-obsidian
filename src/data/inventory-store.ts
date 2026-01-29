import { TFile, Vault, Events } from 'obsidian';
import { 
    FoodItem, 
    InventoryData, 
    InventoryEventType, 
    InventoryEventCallback,
    StockStatus 
} from '../types';

/**
 * Manages inventory data with markdown file storage
 */
export class InventoryStore extends Events {
    private vault: Vault;
    private filePath: string;
    private items: FoodItem[] = [];
    private version = 1;
    private lastUpdated: string = new Date().toISOString().split('T')[0] ?? '';
    private listeners: InventoryEventCallback[] = [];

    constructor(vault: Vault, filePath: string) {
        super();
        this.vault = vault;
        this.filePath = filePath;
    }

    /**
     * Generate a unique ID for new items
     */
    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    /**
     * Get the stock status for an item
     */
    getStockStatus(item: FoodItem): StockStatus {
        if (item.unitType === 'boolean') {
            return item.amount ? 'in-stock' : 'out';
        }
        
        const amount = typeof item.amount === 'number' ? item.amount : 0;
        if (amount <= 0) {
            return 'out';
        }
        
        // Check if below or at minimum threshold (warning = almost running out)
        const minimum = item.minimum;
        if (typeof minimum === 'number' && minimum > 0 && amount <= minimum) {
            return 'warning';
        }
        return 'normal';
    }

    /**
     * Parse the markdown file content into structured data
     */
    private parseMarkdown(content: string): void {
        this.items = [];
        
        const lines = content.split('\n');
        let currentCategory = '';
        let inFrontmatter = false;
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Handle YAML frontmatter
            if (trimmed === '---') {
                inFrontmatter = !inFrontmatter;
                continue;
            }
            
            if (inFrontmatter) {
                if (trimmed.startsWith('version:')) {
                    const versionStr = trimmed.split(':')[1];
                    this.version = parseInt(versionStr?.trim() ?? '1') || 1;
                } else if (trimmed.startsWith('lastUpdated:')) {
                    const dateStr = trimmed.split(':')[1];
                    this.lastUpdated = dateStr?.trim() ?? (new Date().toISOString().split('T')[0] ?? '');
                }
                // stoker-plugin: inventory is handled by file-discovery, no need to parse here
                continue;
            }
            
            // Parse category headers
            if (trimmed.startsWith('## ')) {
                currentCategory = trimmed.substring(3).trim();
                if (currentCategory.toLowerCase() === 'uncategorized') {
                    currentCategory = '';
                }
                continue;
            }
            
            // Parse item lines: - [ ] Name | amount unit | min: X
            // or - [x] Name | in stock (for boolean in-stock)
            // or - [-] Name | out of stock (for boolean out-of-stock)
            // or - [!] Name | amount unit | min: X (warning)
            const itemMatch = trimmed.match(/^- \[(.)\] (.+)$/);
            if (itemMatch && itemMatch[1] && itemMatch[2]) {
                const statusChar = itemMatch[1];
                const itemContent = itemMatch[2];
                
                const item = this.parseItemContent(itemContent, currentCategory, statusChar);
                if (item) {
                    this.items.push(item);
                }
            }
        }
    }

    /**
     * Parse a single item's content string
     */
    private parseItemContent(content: string, category: string, statusChar: string): FoodItem | null {
        const parts = content.split('|').map(p => p.trim());
        if (parts.length === 0) return null;
        
        const name = parts[0] ?? '';
        let unitType: FoodItem['unitType'] = 'count';
        let amount: number | boolean = 0;
        let unit = 'pcs';
        let minimum: number | undefined;
        
        // Check for boolean type
        if (parts.length >= 2) {
            const amountPart = (parts[1] ?? '').toLowerCase();
            if (amountPart === 'in stock') {
                unitType = 'boolean';
                amount = true;
            } else if (amountPart === 'out of stock') {
                unitType = 'boolean';
                amount = false;
            } else {
                // Parse numeric amount with unit
                const amountMatch = amountPart.match(/^([\d.]+)\s*(.*)$/);
                if (amountMatch) {
                    amount = parseFloat(amountMatch[1] ?? '0') || 0;
                    unit = amountMatch[2] || '';
                    
                    // Determine unit type from unit string
                    const unitLower = unit.toLowerCase();
                    if (['kg', 'g', 'lb', 'oz'].includes(unitLower)) {
                        unitType = 'weight';
                    } else if (['l', 'ml', 'gal', 'fl oz'].includes(unitLower)) {
                        unitType = 'volume';
                    } else if (unit === '' || unit === 'portion') {
                        // No unit or "portion" = portion type
                        unitType = 'portion';
                    } else if (['pcs', 'pieces', 'items', 'units'].includes(unitLower)) {
                        unitType = 'count';
                    } else {
                        // Default: if amount has decimals and no/short unit, likely portion
                        if (amount !== Math.floor(amount) && unit.length <= 3) {
                            unitType = 'portion';
                        } else {
                            unitType = 'count';
                        }
                    }
                }
            }
        }
        
        // Parse minimum threshold and planned restock
        let plannedRestock = false;
        for (let i = 2; i < parts.length; i++) {
            const part = parts[i];
            if (part) {
                const minMatch = part.match(/^min:\s*([\d.]+)$/i);
                if (minMatch && minMatch[1]) {
                    minimum = parseFloat(minMatch[1]);
                }
                if (part.toLowerCase() === 'restock') {
                    plannedRestock = true;
                }
            }
        }
        
        // Handle status character for boolean items
        if (statusChar === 'x' && unitType !== 'boolean') {
            // If marked with x but has numeric amount, treat as normal
        } else if (statusChar === '-') {
            if (unitType === 'boolean') {
                amount = false;
            } else {
                amount = 0;
            }
        }
        
        return {
            id: this.generateId(),
            name,
            category,
            unitType,
            amount,
            unit,
            minimum,
            plannedRestock,
        };
    }

    /**
     * Serialize the inventory data to markdown
     */
    private toMarkdown(): string {
        const lines: string[] = [];
        
        // YAML frontmatter with stoker-plugin marker
        lines.push('---');
        lines.push('stoker-plugin: inventory');
        lines.push(`version: ${this.version}`);
        lines.push(`lastUpdated: ${new Date().toISOString().split('T')[0] ?? ''}`);
        lines.push('---');
        lines.push('');
        
        // Group items by category
        const categorized = new Map<string, FoodItem[]>();
        
        for (const item of this.items) {
            const cat = item.category || '';
            if (!categorized.has(cat)) {
                categorized.set(cat, []);
            }
            categorized.get(cat)!.push(item);
        }
        
        // Sort categories (empty/uncategorized last)
        const sortedCategories = Array.from(categorized.keys()).sort((a, b) => {
            if (a === '') return 1;
            if (b === '') return -1;
            return a.localeCompare(b);
        });
        
        for (const category of sortedCategories) {
            const items = categorized.get(category)!;
            
            // Category header
            lines.push(`## ${category || 'Uncategorized'}`);
            
            // Items
            for (const item of items) {
                lines.push(this.itemToMarkdownLine(item));
            }
            
            lines.push('');
        }
        
        return lines.join('\n');
    }

    /**
     * Convert a single item to a markdown line
     */
    private itemToMarkdownLine(item: FoodItem): string {
        const status = this.getStockStatus(item);
        let statusChar: string;
        
        switch (status) {
            case 'out':
                statusChar = '-';
                break;
            case 'warning':
                statusChar = '!';
                break;
            case 'in-stock':
                statusChar = 'x';
                break;
            default:
                statusChar = ' ';
        }
        
        let line = `- [${statusChar}] ${item.name}`;
        
        if (item.unitType === 'boolean') {
            line += ` | ${item.amount ? 'in stock' : 'out of stock'}`;
        } else {
            line += ` | ${item.amount} ${item.unit}`;
        }
        
        if (item.minimum !== undefined && item.unitType !== 'boolean') {
            line += ` | min: ${item.minimum}`;
        }
        
        if (item.plannedRestock) {
            line += ` | restock`;
        }
        
        return line;
    }

    /**
     * Load inventory from the markdown file
     */
    async load(): Promise<void> {
        const file = this.vault.getAbstractFileByPath(this.filePath);
        
        if (file instanceof TFile) {
            const content = await this.vault.read(file);
            this.parseMarkdown(content);
        } else {
            // File doesn't exist, start with empty inventory
            this.items = [];
        }
        
        this.notifyListeners('data-loaded');
    }

    /**
     * Save inventory to the markdown file
     */
    async save(): Promise<void> {
        const content = this.toMarkdown();
        const file = this.vault.getAbstractFileByPath(this.filePath);
        
        if (file instanceof TFile) {
            await this.vault.modify(file, content);
        } else {
            // Ensure parent directories exist before creating the file
            await this.ensureParentDirExists();
            await this.vault.create(this.filePath, content);
        }
    }

    /**
     * Ensure parent directories exist for the file path
     */
    private async ensureParentDirExists(): Promise<void> {
        const parts = this.filePath.split('/');
        if (parts.length <= 1) return; // No parent directory
        
        // Remove the filename to get directory path
        parts.pop();
        const dirPath = parts.join('/');
        
        if (!dirPath) return;
        
        // Check if directory exists
        const existing = this.vault.getAbstractFileByPath(dirPath);
        if (!existing) {
            // Create directory (and any parent directories)
            await this.vault.createFolder(dirPath);
        }
    }

    /**
     * Get all items
     */
    getItems(): FoodItem[] {
        return [...this.items];
    }

    /**
     * Get items grouped by category
     */
    getItemsByCategory(): Map<string, FoodItem[]> {
        const grouped = new Map<string, FoodItem[]>();
        
        for (const item of this.items) {
            const cat = item.category || '';
            if (!grouped.has(cat)) {
                grouped.set(cat, []);
            }
            grouped.get(cat)!.push(item);
        }
        
        return grouped;
    }

    /**
     * Get all unique categories
     */
    getCategories(): string[] {
        const categories = new Set<string>();
        for (const item of this.items) {
            if (item.category) {
                categories.add(item.category);
            }
        }
        return Array.from(categories).sort();
    }

    /**
     * Get a single item by ID
     */
    getItem(id: string): FoodItem | undefined {
        return this.items.find(item => item.id === id);
    }

    /**
     * Add a new item
     */
    async addItem(item: Omit<FoodItem, 'id'>): Promise<FoodItem> {
        const newItem: FoodItem = {
            ...item,
            id: this.generateId(),
        };
        
        this.items.push(newItem);
        await this.save();
        this.notifyListeners('item-added', newItem);
        
        return newItem;
    }

    /**
     * Update an existing item
     */
    async updateItem(id: string, updates: Partial<Omit<FoodItem, 'id'>>): Promise<FoodItem | null> {
        const index = this.items.findIndex(item => item.id === id);
        if (index === -1) return null;
        
        const currentItem = this.items[index];
        if (!currentItem) return null;
        
        const updatedItem: FoodItem = {
            id: currentItem.id,
            name: updates.name ?? currentItem.name,
            category: updates.category ?? currentItem.category,
            unitType: updates.unitType ?? currentItem.unitType,
            amount: updates.amount ?? currentItem.amount,
            unit: updates.unit ?? currentItem.unit,
            minimum: updates.minimum !== undefined ? updates.minimum : currentItem.minimum,
            plannedRestock: updates.plannedRestock !== undefined ? updates.plannedRestock : currentItem.plannedRestock,
        };
        
        this.items[index] = updatedItem;
        
        await this.save();
        this.notifyListeners('item-updated', updatedItem);
        
        return updatedItem;
    }

    /**
     * Delete an item
     */
    async deleteItem(id: string): Promise<boolean> {
        const index = this.items.findIndex(item => item.id === id);
        if (index === -1) return false;
        
        const deleted = this.items.splice(index, 1)[0];
        await this.save();
        this.notifyListeners('item-deleted', deleted);
        
        return true;
    }

    /**
     * Increase item amount
     */
    async increaseAmount(id: string, by = 1): Promise<FoodItem | null> {
        const item = this.getItem(id);
        if (!item || item.unitType === 'boolean') return null;
        
        return this.updateItem(id, {
            amount: (item.amount as number) + by,
        });
    }

    /**
     * Decrease item amount
     */
    async decreaseAmount(id: string, by = 1): Promise<FoodItem | null> {
        const item = this.getItem(id);
        if (!item || item.unitType === 'boolean') return null;
        
        const newAmount = Math.max(0, (item.amount as number) - by);
        return this.updateItem(id, {
            amount: newAmount,
        });
    }

    /**
     * Toggle boolean item stock status
     */
    async toggleStock(id: string): Promise<FoodItem | null> {
        const item = this.getItem(id);
        if (!item || item.unitType !== 'boolean') return null;
        
        return this.updateItem(id, {
            amount: !item.amount,
        });
    }

    /**
     * Toggle planned restock status
     */
    async togglePlannedRestock(id: string): Promise<FoodItem | null> {
        const item = this.getItem(id);
        if (!item) return null;
        
        return this.updateItem(id, {
            plannedRestock: !item.plannedRestock,
        });
    }

    /**
     * Get items marked for planned restock
     */
    getPlannedRestockItems(): FoodItem[] {
        return this.items.filter(item => item.plannedRestock);
    }

    /**
     * Get items with low stock (below minimum)
     */
    getLowStockItems(): FoodItem[] {
        return this.items.filter(item => {
            const status = this.getStockStatus(item);
            return status === 'warning' || status === 'out';
        });
    }

    /**
     * Register a listener for inventory changes
     */
    onInventoryChange(callback: InventoryEventCallback): void {
        this.listeners.push(callback);
    }

    /**
     * Remove a listener
     */
    offInventoryChange(callback: InventoryEventCallback): void {
        const index = this.listeners.indexOf(callback);
        if (index !== -1) {
            this.listeners.splice(index, 1);
        }
    }

    /**
     * Notify all listeners of a change
     */
    private notifyListeners(type: InventoryEventType, item?: FoodItem): void {
        for (const listener of this.listeners) {
            listener(type, item);
        }
    }

    /**
     * Update the file path (for settings change)
     */
    setFilePath(newPath: string): void {
        this.filePath = newPath;
    }
}

