import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import type { InventoryList, ListEventType } from '../../types';
import type { ListManager } from '../../data/list-manager';

/**
 * Return type for the useListManager hook
 */
export interface UseListManagerReturn {
    /** All inventory lists */
    lists: InventoryList[];
    /** The currently active list */
    activeList: InventoryList | undefined;
    /** The list manager instance */
    listManager: ListManager;
    /** Create a new list */
    createList: (name: string, filePath: string) => Promise<InventoryList | null>;
    /** Delete a list */
    deleteList: (id: string) => Promise<boolean>;
    /** Switch to a different list */
    switchList: (id: string) => Promise<boolean>;
    /** Update list properties */
    updateList: (id: string, updates: Partial<Pick<InventoryList, 'name' | 'filePath'>>) => Promise<InventoryList | null>;
    /** Check if a file exists */
    fileExists: (filePath: string) => boolean;
}

/**
 * Hook that subscribes to ListManager changes and provides list management methods
 */
export function useListManager(): UseListManagerReturn {
    const { plugin } = useApp();
    const [lists, setLists] = useState<InventoryList[]>([]);
    const [activeList, setActiveList] = useState<InventoryList | undefined>();

    // Subscribe to list changes
    useEffect(() => {
        const { listManager } = plugin;

        // Initial state
        setLists(listManager.getLists());
        setActiveList(listManager.getActiveList());

        // Subscribe to changes
        const handleChange = (_type: ListEventType) => {
            setLists(listManager.getLists());
            setActiveList(listManager.getActiveList());
        };

        listManager.onListChange(handleChange);

        return () => {
            listManager.offListChange(handleChange);
        };
    }, [plugin]);

    // Actions
    const createList = useCallback(async (name: string, filePath: string): Promise<InventoryList | null> => {
        try {
            return await plugin.listManager.createList(name, filePath);
        } catch {
            return null;
        }
    }, [plugin]);

    const deleteList = useCallback(async (id: string): Promise<boolean> => {
        return plugin.listManager.deleteList(id);
    }, [plugin]);

    const switchList = useCallback(async (id: string): Promise<boolean> => {
        return plugin.listManager.switchList(id);
    }, [plugin]);

    const updateList = useCallback(async (
        id: string, 
        updates: Partial<Pick<InventoryList, 'name' | 'filePath'>>
    ): Promise<InventoryList | null> => {
        return plugin.listManager.updateList(id, updates);
    }, [plugin]);

    const fileExists = useCallback((filePath: string): boolean => {
        return plugin.listManager.fileExists(filePath);
    }, [plugin]);

    return {
        lists,
        activeList,
        listManager: plugin.listManager,
        createList,
        deleteList,
        switchList,
        updateList,
        fileExists,
    };
}
