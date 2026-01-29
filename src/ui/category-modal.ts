import { App, Modal, Setting, setIcon, Notice } from 'obsidian';
import type StokerPlugin from '../main';
import { validateCategoryName, sanitizeInput, showInputError, clearInputError } from '../utils/validation';

export class CategoryManageModal extends Modal {
    plugin: StokerPlugin;

    constructor(app: App, plugin: StokerPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen(): void {
        this.render();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('stoker-modal', 'stoker-category-modal');
        
        contentEl.createEl('h2', { text: 'Manage categories' });
        
        const store = this.plugin.store;
        if (!store) {
            contentEl.createEl('p', { text: 'No active inventory list.', cls: 'stoker-muted' });
            return;
        }
        
        const categories = store.getCategories();
        const itemsByCategory = store.getItemsByCategory();
        
        if (categories.length === 0) {
            contentEl.createEl('p', { 
                text: 'No categories yet. Categories are created when you assign items to them.',
                cls: 'stoker-muted'
            });
        } else {
            const list = contentEl.createDiv({ cls: 'stoker-category-list' });
            
            for (const category of categories) {
                const itemCount = itemsByCategory.get(category)?.length ?? 0;
                this.renderCategoryRow(list, category, itemCount);
            }
        }
        
        // Show uncategorized count
        const uncategorizedCount = itemsByCategory.get('')?.length ?? 0;
        if (uncategorizedCount > 0) {
            contentEl.createDiv({ cls: 'stoker-uncategorized-info' })
                .createSpan({ text: `${uncategorizedCount} item${uncategorizedCount !== 1 ? 's' : ''} without category` });
        }
        
        // Close button
        const buttonContainer = contentEl.createDiv({ cls: 'stoker-modal-buttons' });
        const closeBtn = buttonContainer.createEl('button', { 
            text: 'Close',
            cls: 'mod-cta'
        });
        closeBtn.addEventListener('click', () => this.close());
    }

    private renderCategoryRow(container: HTMLElement, category: string, itemCount: number): void {
        const row = container.createDiv({ cls: 'stoker-category-row' });
        
        // Category name and count
        const info = row.createDiv({ cls: 'stoker-category-info' });
        info.createSpan({ cls: 'stoker-category-row-name', text: category });
        info.createSpan({ cls: 'stoker-category-row-count', text: `${itemCount} item${itemCount !== 1 ? 's' : ''}` });
        
        // Actions
        const actions = row.createDiv({ cls: 'stoker-category-actions' });
        
        // Rename button
        const renameBtn = actions.createEl('button', { 
            cls: 'stoker-btn',
            attr: { 'aria-label': 'Rename category' }
        });
        setIcon(renameBtn, 'pencil');
        renameBtn.addEventListener('click', () => this.showRenameDialog(category));
        
        // Delete button
        const deleteBtn = actions.createEl('button', { 
            cls: 'stoker-btn',
            attr: { 'aria-label': 'Delete category' }
        });
        setIcon(deleteBtn, 'trash');
        deleteBtn.addEventListener('click', () => this.showDeleteDialog(category, itemCount));
    }

    private showRenameDialog(oldName: string): void {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: 'Rename category' });
        
        let newName = oldName;
        let nameInput: HTMLInputElement;
        let errorEl: HTMLElement;
        
        const setting = new Setting(contentEl)
            .setName('New name')
            .setDesc('No | [ ] characters allowed')
            .addText(text => {
                nameInput = text.inputEl;
                text.setValue(oldName);
                text.inputEl.select();
                text.onChange(value => {
                    newName = value;
                    const error = validateCategoryName(value);
                    if (error) {
                        showInputError(nameInput, errorEl, error);
                    } else {
                        clearInputError(nameInput, errorEl);
                    }
                });
            });
        errorEl = setting.settingEl.createDiv({ cls: 'stoker-field-error' });
        
        const buttonContainer = contentEl.createDiv({ cls: 'stoker-modal-buttons' });
        
        buttonContainer.createEl('button', { text: 'Cancel' })
            .addEventListener('click', () => this.render());
        
        const saveBtn = buttonContainer.createEl('button', { 
            text: 'Rename',
            cls: 'mod-cta'
        });
        saveBtn.addEventListener('click', () => {
            const error = validateCategoryName(newName);
            if (error) {
                showInputError(nameInput, errorEl, error);
                return;
            }
            
            const sanitized = sanitizeInput(newName);
            if (sanitized && sanitized !== oldName) {
                void this.renameCategory(oldName, sanitized).then(() => this.render());
            } else {
                this.render();
            }
        });
    }

    private showDeleteDialog(category: string, itemCount: number): void {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: 'Delete category' });
        
        contentEl.createEl('p', { 
            text: `Are you sure you want to delete "${category}"?`
        });
        
        if (itemCount > 0) {
            contentEl.createEl('p', { 
                text: `${itemCount} item${itemCount !== 1 ? 's' : ''} will be moved to Uncategorized.`,
                cls: 'stoker-warning-text'
            });
        }
        
        const buttonContainer = contentEl.createDiv({ cls: 'stoker-modal-buttons' });
        
        buttonContainer.createEl('button', { text: 'Cancel' })
            .addEventListener('click', () => this.render());
        
        const deleteBtn = buttonContainer.createEl('button', { 
            text: 'Delete',
            cls: 'mod-warning'
        });
        deleteBtn.addEventListener('click', () => {
            void this.deleteCategory(category).then(() => this.render());
        });
    }

    private async renameCategory(oldName: string, newName: string): Promise<void> {
        const store = this.plugin.store;
        if (!store) return;
        
        const items = store.getItems();
        
        // Collect all items to update
        const updates = items
            .filter(item => item.category === oldName)
            .map(item => ({ id: item.id, updates: { category: newName } }));
        
        // Batch update - saves only once
        if (updates.length > 0) {
            try {
                await store.updateItemsBatch(updates);
                new Notice(`Renamed category to "${newName}"`);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to rename category';
                new Notice(`Error: ${message}`);
                console.error('Stoker: Failed to rename category:', error);
            }
        }
    }

    private async deleteCategory(category: string): Promise<void> {
        const store = this.plugin.store;
        if (!store) return;
        
        const items = store.getItems();
        
        // Collect all items to update
        const updates = items
            .filter(item => item.category === category)
            .map(item => ({ id: item.id, updates: { category: '' } }));
        
        // Batch update - saves only once
        if (updates.length > 0) {
            try {
                await store.updateItemsBatch(updates);
                new Notice(`Deleted category "${category}"`);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to delete category';
                new Notice(`Error: ${message}`);
                console.error('Stoker: Failed to delete category:', error);
            }
        }
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}

