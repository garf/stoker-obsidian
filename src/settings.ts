import { App, PluginSettingTab, Setting } from 'obsidian';
import type StokerPlugin from './main';
import { StokerSettings, DEFAULT_SETTINGS } from './types';

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
        
        // Inventory file path
        new Setting(containerEl)
            .setName('Inventory file')
            .setDesc('Path to the markdown file where inventory data is stored')
            .addText(text => text
                .setPlaceholder('stoker-inventory.md')
                .setValue(this.plugin.settings.inventoryFilePath)
                .onChange(async (value) => {
                    this.plugin.settings.inventoryFilePath = value || DEFAULT_SETTINGS.inventoryFilePath;
                    await this.plugin.saveSettings();
                    // Update store path
                    this.plugin.store.setFilePath(this.plugin.settings.inventoryFilePath);
                    await this.plugin.store.load();
                }));
        
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
            text: 'Your inventory is stored as a markdown file, so it syncs with Obsidian Sync and can be edited manually.' 
        });
    }
}
