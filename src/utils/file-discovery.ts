import { App, TFile, CachedMetadata } from 'obsidian';

/**
 * Types of stoker files that can be auto-discovered
 */
export type StokerFileType = 'inventory';

/**
 * Represents a discovered stoker file
 */
export interface DiscoveredFile {
    file: TFile;
    type: StokerFileType;
    version?: number;
    lastUpdated?: string;
}

/**
 * The frontmatter key used to identify stoker files
 */
export const STOKER_FRONTMATTER_KEY = 'stoker';

/**
 * Checks if a file's metadata indicates it's a stoker file
 */
export function isStokerFile(metadata: CachedMetadata | null): boolean {
    if (!metadata?.frontmatter) return false;
    return STOKER_FRONTMATTER_KEY in metadata.frontmatter;
}

/**
 * Gets the stoker file type from metadata
 */
export function getStokerFileType(metadata: CachedMetadata | null): StokerFileType | null {
    if (!metadata?.frontmatter) return null;
    const type = metadata.frontmatter[STOKER_FRONTMATTER_KEY] as unknown;
    if (type === 'inventory') return 'inventory';
    return null;
}

/**
 * Discovers all stoker files in the vault by scanning frontmatter
 */
export function discoverStokerFiles(app: App): DiscoveredFile[] {
    const discovered: DiscoveredFile[] = [];
    const markdownFiles = app.vault.getMarkdownFiles();

    for (const file of markdownFiles) {
        const metadata = app.metadataCache.getFileCache(file);
        
        if (isStokerFile(metadata)) {
            const type = getStokerFileType(metadata);
            if (type) {
                discovered.push({
                    file,
                    type,
                    version: metadata?.frontmatter?.version as number | undefined,
                    lastUpdated: metadata?.frontmatter?.lastUpdated as string | undefined,
                });
            }
        }
    }

    return discovered;
}

/**
 * Discovers only inventory files in the vault
 */
export function discoverInventoryFiles(app: App): DiscoveredFile[] {
    return discoverStokerFiles(app).filter(f => f.type === 'inventory');
}

/**
 * Checks if a specific file is a stoker inventory file
 */
export function isInventoryFile(app: App, file: TFile): boolean {
    const metadata = app.metadataCache.getFileCache(file);
    return getStokerFileType(metadata) === 'inventory';
}

/**
 * Watch for new stoker files being created or modified
 * Returns an unsubscribe function
 */
export function watchForStokerFiles(
    app: App,
    onFileDiscovered: (file: DiscoveredFile) => void,
    onFileRemoved?: (file: TFile) => void
): () => void {
    // Track currently known stoker files
    const knownFiles = new Set<string>();
    
    // Initial discovery
    const initial = discoverStokerFiles(app);
    for (const discovered of initial) {
        knownFiles.add(discovered.file.path);
    }

    // Watch for metadata changes (which includes frontmatter changes)
    const metadataRef = app.metadataCache.on('changed', (file) => {
        const metadata = app.metadataCache.getFileCache(file);
        const wasStokerFile = knownFiles.has(file.path);
        const isStoker = isStokerFile(metadata);
        const type = getStokerFileType(metadata);

        if (isStoker && type && !wasStokerFile) {
            // New stoker file discovered
            knownFiles.add(file.path);
            onFileDiscovered({
                file,
                type,
                version: metadata?.frontmatter?.version as number | undefined,
                lastUpdated: metadata?.frontmatter?.lastUpdated as string | undefined,
            });
        } else if (!isStoker && wasStokerFile) {
            // File is no longer a stoker file
            knownFiles.delete(file.path);
            onFileRemoved?.(file);
        }
    });

    // Watch for file deletions
    const deleteRef = app.vault.on('delete', (file) => {
        if (file instanceof TFile && knownFiles.has(file.path)) {
            knownFiles.delete(file.path);
            onFileRemoved?.(file);
        }
    });

    // Return unsubscribe function
    return () => {
        app.metadataCache.offref(metadataRef);
        app.vault.offref(deleteRef);
    };
}

