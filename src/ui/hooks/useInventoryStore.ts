import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import type { InventoryItem, StockStatus, InventoryEventType, InventoryEventCallback } from '../../types';
import type { InventoryStore } from '../../data/inventory-store';

/**
 * Return type for the useInventoryStore hook
 */
export interface UseInventoryStoreReturn {
    /** All inventory items */
    items: InventoryItem[];
    /** Whether the store is loading */
    loading: boolean;
    /** The inventory store instance (may be null if no active list) */
    store: InventoryStore | null;
    /** Get items grouped by category */
    itemsByCategory: Map<string, InventoryItem[]>;
    /** Get all unique categories */
    categories: string[];
    /** Get the stock status for an item */
    getStockStatus: (item: InventoryItem) => StockStatus;
    /** Get items with low stock */
    lowStockItems: InventoryItem[];
    /** Get items marked for restock */
    restockItems: InventoryItem[];
    /** Add a new item */
    addItem: (item: Omit<InventoryItem, 'id'>) => Promise<InventoryItem | null>;
    /** Update an existing item */
    updateItem: (id: string, updates: Partial<Omit<InventoryItem, 'id'>>) => Promise<InventoryItem | null>;
    /** Delete an item */
    deleteItem: (id: string) => Promise<boolean>;
    /** Increase item amount */
    increaseAmount: (id: string, by?: number) => Promise<InventoryItem | null>;
    /** Decrease item amount */
    decreaseAmount: (id: string, by?: number) => Promise<InventoryItem | null>;
    /** Toggle boolean item stock */
    toggleStock: (id: string) => Promise<InventoryItem | null>;
    /** Toggle planned restock */
    togglePlannedRestock: (id: string) => Promise<InventoryItem | null>;
}

/**
 * Hook that subscribes to InventoryStore changes and provides store methods
 */
export function useInventoryStore(): UseInventoryStoreReturn {
    const { plugin } = useApp();
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [store, setStore] = useState<InventoryStore | null>(null);

    // Refs to track current store and handler for proper cleanup during mid-lifecycle switches
    const storeRef = useRef<InventoryStore | null>(null);
    const handleChangeRef = useRef<InventoryEventCallback | null>(null);

    // Helper to subscribe to a store
    const subscribeToStore = useCallback((targetStore: InventoryStore | null) => {
        // Clean up old subscription if switching stores
        if (storeRef.current && handleChangeRef.current && storeRef.current !== targetStore) {
            storeRef.current.offInventoryChange(handleChangeRef.current);
            handleChangeRef.current = null;
        }

        storeRef.current = targetStore;
        setStore(targetStore);

        if (targetStore) {
            // Create new handler that uses the captured store reference
            const handleChange: InventoryEventCallback = (_type: InventoryEventType) => {
                // Use the store we're subscribed to, not plugin.store (avoids stale closure)
                setItems(targetStore.getItems());
            };
            handleChangeRef.current = handleChange;
            targetStore.onInventoryChange(handleChange);
            setItems(targetStore.getItems());
        } else {
            handleChangeRef.current = null;
            setItems([]);
        }
    }, []);

    // Subscribe to store changes
    useEffect(() => {
        const currentStore = plugin.store;
        
        // Initial subscription
        subscribeToStore(currentStore);
        setLoading(false);

        // Listen for list changes that might switch the store
        const handleListChange = () => {
            const newStore = plugin.store;
            subscribeToStore(newStore);
        };

        plugin.listManager.onListChange(handleListChange);

        return () => {
            // Clean up store subscription
            if (storeRef.current && handleChangeRef.current) {
                storeRef.current.offInventoryChange(handleChangeRef.current);
            }
            // Clean up list change subscription
            plugin.listManager.offListChange(handleListChange);
        };
    }, [plugin, subscribeToStore]);

    // Computed values
    const itemsByCategory = useMemo(() => {
        const grouped = new Map<string, InventoryItem[]>();
        for (const item of items) {
            const cat = item.category || '';
            if (!grouped.has(cat)) {
                grouped.set(cat, []);
            }
            grouped.get(cat)!.push(item);
        }
        return grouped;
    }, [items]);

    const categories = useMemo(() => {
        const cats = new Set<string>();
        for (const item of items) {
            if (item.category) {
                cats.add(item.category);
            }
        }
        return Array.from(cats).sort();
    }, [items]);

    const getStockStatus = useCallback((item: InventoryItem): StockStatus => {
        if (!store) return 'normal';
        return store.getStockStatus(item);
    }, [store]);

    const lowStockItems = useMemo(() => {
        if (!store) return [];
        return items.filter(item => {
            const status = store.getStockStatus(item);
            return status === 'warning' || status === 'out';
        });
    }, [items, store]);

    const restockItems = useMemo(() => {
        return items.filter(item => item.plannedRestock);
    }, [items]);

    // Actions
    const addItem = useCallback(async (item: Omit<InventoryItem, 'id'>): Promise<InventoryItem | null> => {
        if (!store) return null;
        return store.addItem(item);
    }, [store]);

    const updateItem = useCallback(async (id: string, updates: Partial<Omit<InventoryItem, 'id'>>): Promise<InventoryItem | null> => {
        if (!store) return null;
        return store.updateItem(id, updates);
    }, [store]);

    const deleteItem = useCallback(async (id: string): Promise<boolean> => {
        if (!store) return false;
        return store.deleteItem(id);
    }, [store]);

    const increaseAmount = useCallback(async (id: string, by = 1): Promise<InventoryItem | null> => {
        if (!store) return null;
        return store.increaseAmount(id, by);
    }, [store]);

    const decreaseAmount = useCallback(async (id: string, by = 1): Promise<InventoryItem | null> => {
        if (!store) return null;
        return store.decreaseAmount(id, by);
    }, [store]);

    const toggleStock = useCallback(async (id: string): Promise<InventoryItem | null> => {
        if (!store) return null;
        return store.toggleStock(id);
    }, [store]);

    const togglePlannedRestock = useCallback(async (id: string): Promise<InventoryItem | null> => {
        if (!store) return null;
        return store.togglePlannedRestock(id);
    }, [store]);

    return {
        items,
        loading,
        store,
        itemsByCategory,
        categories,
        getStockStatus,
        lowStockItems,
        restockItems,
        addItem,
        updateItem,
        deleteItem,
        increaseAmount,
        decreaseAmount,
        toggleStock,
        togglePlannedRestock,
    };
}
