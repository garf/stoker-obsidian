import { App, PluginSettingTab, Setting, setIcon } from 'obsidian';
import type StokerPlugin from './main';
import { StokerSettings, DEFAULT_SETTINGS } from './types';
import { LIST_MANAGER_VIEW_TYPE } from './ui/list-manager-view';

export type { StokerSettings };
export { DEFAULT_SETTINGS };

export class StokerSettingTab extends PluginSettingTab {
    plugin: StokerPlugin;

    constructor(app: App, plugin: StokerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        
        containerEl.createEl('h2', { text: 'Stoker settings' });
        
        // Inventory lists section
        containerEl.createEl('h3', { text: 'Inventory lists' });
        
        // Show current lists summary
        const lists = this.plugin.listManager.getLists();
        const activeList = this.plugin.listManager.getActiveList();
        
        const listsSummary = new Setting(containerEl)
            .setName('Manage lists')
            .setDesc(`You have ${lists.length} inventory list${lists.length !== 1 ? 's' : ''}.${activeList ? ` Active: ${activeList.name}` : ''}`)
            .addButton(button => button
                .setButtonText('Open list manager')
                .setCta()
                .onClick(() => this.openListManager()));
        
        // Show sidebar on startup
        new Setting(containerEl)
            .setName('Show sidebar on startup')
            .setDesc('Automatically show the inventory sidebar when Obsidian starts')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showSidebarOnStartup)
                .onChange(async (value) => {
                    this.plugin.settings.showSidebarOnStartup = value;
                    await this.plugin.saveSettings();
                }));
        
        // About section
        containerEl.createEl('h3', { text: 'About' });
        
        const aboutDiv = containerEl.createDiv({ cls: 'stoker-about' });
        aboutDiv.createEl('p', { 
            text: 'Stoker helps you track your inventory. Add items, set minimum thresholds, and get warnings when running low.' 
        });
        aboutDiv.createEl('p', { 
            text: 'You can create multiple inventory lists (e.g., home supplies, office equipment, workshop tools), each stored in a separate markdown file that syncs with Obsidian Sync.' 
        });
    }

    private async openListManager(): Promise<void> {
        const { workspace } = this.app;
        
        // Check if view already exists
        const existing = workspace.getLeavesOfType(LIST_MANAGER_VIEW_TYPE);
        if (existing.length > 0 && existing[0]) {
            workspace.revealLeaf(existing[0]);
            return;
        }
        
        // Create new view in a tab
        const leaf = workspace.getLeaf('tab');
        if (leaf) {
            await leaf.setViewState({
                type: LIST_MANAGER_VIEW_TYPE,
                active: true,
            });
            workspace.revealLeaf(leaf);
        }
    }
}
