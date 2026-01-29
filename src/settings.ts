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
        
        // Default categories
        containerEl.createEl('h3', { text: 'Default categories' });
        containerEl.createEl('p', { 
            text: 'Categories shown when adding new items. One per line.',
            cls: 'setting-item-description'
        });
        
        const categoriesTextArea = containerEl.createEl('textarea', {
            cls: 'stoker-categories-textarea'
        });
        categoriesTextArea.value = this.plugin.settings.defaultCategories.join('\n');
        categoriesTextArea.rows = 8;
        categoriesTextArea.addEventListener('change', async () => {
            const categories = categoriesTextArea.value
                .split('\n')
                .map(c => c.trim())
                .filter(c => c.length > 0);
            this.plugin.settings.defaultCategories = categories;
            await this.plugin.saveSettings();
        });
        
        // Reset to defaults button
        new Setting(containerEl)
            .setName('Reset categories')
            .setDesc('Reset the default categories to the original list')
            .addButton(button => button
                .setButtonText('Reset')
                .onClick(async () => {
                    this.plugin.settings.defaultCategories = [...DEFAULT_SETTINGS.defaultCategories];
                    await this.plugin.saveSettings();
                    categoriesTextArea.value = this.plugin.settings.defaultCategories.join('\n');
                }));
        
        // About section
        containerEl.createEl('h3', { text: 'About' });
        
        const aboutDiv = containerEl.createDiv({ cls: 'stoker-about' });
        aboutDiv.createEl('p', { 
            text: 'Stoker helps you track your food inventory. Add items, set minimum thresholds, and get warnings when running low.' 
        });
        aboutDiv.createEl('p', { 
            text: 'You can create multiple inventory lists (e.g., home, office, vacation house), each stored in a separate markdown file that syncs with Obsidian Sync.' 
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
