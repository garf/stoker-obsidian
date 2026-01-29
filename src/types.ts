/**
 * Unit types for inventory items
 */
export type UnitType = 'count' | 'portion' | 'weight' | 'volume' | 'boolean';

/**
 * Stock status for visual display
 */
export type StockStatus = 'normal' | 'warning' | 'out' | 'in-stock';

/**
 * Represents a single inventory item
 */
export interface InventoryItem {
    /** Unique identifier for the item */
    id: string;
    /** Display name of the item */
    name: string;
    /** Category name (empty string for uncategorized) */
    category: string;
    /** Type of unit measurement */
    unitType: UnitType;
    /** Current amount (number for count/weight/volume, boolean for boolean type) */
    amount: number | boolean;
    /** Display unit (e.g., "pcs", "kg", "L") - only for non-boolean types */
    unit: string;
    /** Minimum threshold for low-stock warning (optional) */
    minimum?: number;
    /** Whether this item is marked for planned restock */
    plannedRestock?: boolean;
}

/**
 * Represents a category grouping
 */
export interface Category {
    /** Category name */
    name: string;
    /** Whether the category is collapsed in the UI */
    collapsed: boolean;
}

/**
 * Represents an inventory list
 */
export interface InventoryList {
    /** Unique identifier for the list */
    id: string;
    /** Display name of the list */
    name: string;
    /** Path to the markdown file storing this list */
    filePath: string;
}

/**
 * Plugin settings
 */
export interface StokerSettings {
    /** @deprecated Use lists array instead. Kept for migration. */
    inventoryFilePath: string;
    /** All inventory lists */
    lists: InventoryList[];
    /** ID of the currently active list */
    activeListId: string | null;
    /** Whether to show sidebar on startup */
    showSidebarOnStartup: boolean;
    /** Collapsed state of categories */
    collapsedCategories: string[];
}

/**
 * Default plugin settings
 */
export const DEFAULT_SETTINGS: StokerSettings = {
    inventoryFilePath: 'stoker-inventory.md',
    lists: [],
    activeListId: null,
    showSidebarOnStartup: true,
    collapsedCategories: [],
};

/**
 * Parsed inventory data structure
 */
export interface InventoryData {
    /** Version of the data format */
    version: number;
    /** Last update timestamp */
    lastUpdated: string;
    /** All inventory items */
    items: InventoryItem[];
}

/**
 * Event types for inventory changes
 */
export type InventoryEventType = 'item-added' | 'item-updated' | 'item-deleted' | 'data-loaded';

/**
 * Callback for inventory change events
 */
export type InventoryEventCallback = (type: InventoryEventType, item?: InventoryItem) => void;

/**
 * Event types for list management changes
 */
export type ListEventType = 'list-created' | 'list-deleted' | 'list-switched';

/**
 * Callback for list change events
 */
export type ListEventCallback = (type: ListEventType, list?: InventoryList) => void;

