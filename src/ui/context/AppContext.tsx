import { createContext, useContext } from 'react';
import { App } from 'obsidian';
import type StokerPlugin from '../../main';

/**
 * Context value for accessing Obsidian App and Plugin instances
 */
export interface AppContextValue {
    app: App;
    plugin: StokerPlugin;
}

/**
 * React context for Obsidian App and Plugin
 */
export const AppContext = createContext<AppContextValue | null>(null);

/**
 * Hook to access the Obsidian App and Plugin instances
 * @throws Error if used outside of AppContext.Provider
 */
export function useApp(): AppContextValue {
    const ctx = useContext(AppContext);
    if (!ctx) {
        throw new Error('useApp must be used within AppContext.Provider');
    }
    return ctx;
}

/**
 * Hook to access just the Obsidian App instance
 */
export function useObsidianApp(): App {
    return useApp().app;
}

/**
 * Hook to access just the Plugin instance
 */
export function usePlugin(): StokerPlugin {
    return useApp().plugin;
}
