import { App, Modal, Setting, TextComponent } from 'obsidian';
import type StokerPlugin from '../main';
import { sanitizeInput } from '../utils/validation';

export class CreateListModal extends Modal {
    plugin: StokerPlugin;
    
    private name = '';
    private filePath = '';
    
    private nameInput: TextComponent;
    private nameError: HTMLElement;
    private filePathInput: TextComponent;
    private filePathError: HTMLElement;
    
    private onSuccess: (() => void) | undefined;

    constructor(app: App, plugin: StokerPlugin, onSuccess?: () => void) {
        super(app);
        this.plugin = plugin;
        this.onSuccess = onSuccess;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('stoker-modal');
        
        contentEl.createEl('h2', { text: 'Create new list' });
        
        // Name input
        const nameSetting = new Setting(contentEl)
            .setName('List name')
            .setDesc('A friendly name for this inventory list')
            .addText(text => {
                this.nameInput = text;
                text.setPlaceholder('e.g., Home, Office, Vacation house')
                    .onChange(value => {
                        this.name = value;
                        this.clearError(this.nameInput, this.nameError);
                        
                        // Auto-suggest file path if empty
                        if (value && !this.filePath) {
                            const suggested = this.suggestFilePath(value);
                            this.filePathInput.setValue(suggested);
                            this.filePath = suggested;
                        }
                    });
            });
        this.nameError = nameSetting.settingEl.createDiv({ cls: 'stoker-field-error' });
        
        // File path input
        const filePathSetting = new Setting(contentEl)
            .setName('File path')
            .setDesc('Path to the markdown file (must end with .md)')
            .addText(text => {
                this.filePathInput = text;
                text.setPlaceholder('e.g., stoker-lists/home.md')
                    .onChange(value => {
                        this.filePath = value;
                        this.clearError(this.filePathInput, this.filePathError);
                    });
            });
        this.filePathError = filePathSetting.settingEl.createDiv({ cls: 'stoker-field-error' });
        
        // Info text
        contentEl.createEl('p', {
            text: 'The file will be created if it doesn\'t exist. You can put it anywhere in your vault.',
            cls: 'stoker-modal-info'
        });
        
        // Buttons
        const buttonContainer = contentEl.createDiv({ cls: 'stoker-modal-buttons' });
        
        buttonContainer.createEl('button', { text: 'Cancel' })
            .addEventListener('click', () => this.close());
        
        const createBtn = buttonContainer.createEl('button', { 
            text: 'Create list',
            cls: 'mod-cta'
        });
        createBtn.addEventListener('click', () => this.createList());
    }

    private suggestFilePath(name: string): string {
        // Convert name to a safe file path
        const safeName = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        return `stoker-${safeName}.md`;
    }

    private validateInputs(): { valid: boolean; fileExists: boolean } {
        let isValid = true;
        let fileExists = false;
        
        // Validate name
        const name = this.name.trim();
        if (!name) {
            this.showError(this.nameInput, this.nameError, 'List name is required');
            isValid = false;
        } else if (name.length > 100) {
            this.showError(this.nameInput, this.nameError, 'Name is too long (maximum 100 characters)');
            isValid = false;
        }
        
        // Validate file path
        const filePath = this.filePath.trim();
        if (!filePath) {
            this.showError(this.filePathInput, this.filePathError, 'File path is required');
            isValid = false;
        } else if (!filePath.endsWith('.md')) {
            this.showError(this.filePathInput, this.filePathError, 'File path must end with .md');
            isValid = false;
        } else if (this.plugin.listManager.isFilePathUsed(filePath)) {
            this.showError(this.filePathInput, this.filePathError, 'This file path is already used by another list');
            isValid = false;
        } else if (filePath.includes('..')) {
            this.showError(this.filePathInput, this.filePathError, 'Invalid file path');
            isValid = false;
        } else {
            // Check if file already exists on disk (but not tracked by plugin)
            const existingFile = this.app.vault.getAbstractFileByPath(filePath);
            if (existingFile) {
                fileExists = true;
            }
        }
        
        return { valid: isValid, fileExists };
    }

    private showError(input: TextComponent, errorEl: HTMLElement, message: string): void {
        input.inputEl.classList.add('stoker-input-error');
        errorEl.setText(message);
        errorEl.classList.add('stoker-error-visible');
    }

    private clearError(input: TextComponent, errorEl: HTMLElement): void {
        input.inputEl.classList.remove('stoker-input-error');
        errorEl.classList.remove('stoker-error-visible');
    }

    private async createList(): Promise<void> {
        const validation = this.validateInputs();
        if (!validation.valid) {
            return;
        }
        
        const name = sanitizeInput(this.name.trim());
        const filePath = this.filePath.trim();
        
        // If file exists, ask for confirmation
        if (validation.fileExists) {
            const confirmed = await this.confirmOverwrite(filePath);
            if (!confirmed) {
                return;
            }
        }
        
        try {
            await this.plugin.listManager.createList(name, filePath);
            
            this.close();
            
            if (this.onSuccess) {
                this.onSuccess();
            }
        } catch (error) {
            // Show error on file path field
            const errorMessage = error instanceof Error ? error.message : 'Failed to create list';
            this.showError(this.filePathInput, this.filePathError, errorMessage);
            console.error('Stoker: Failed to create list:', error);
        }
    }
    
    private async confirmOverwrite(filePath: string): Promise<boolean> {
        return new Promise((resolve) => {
            const { contentEl } = this;
            contentEl.empty();
            
            contentEl.createEl('h2', { text: 'File already exists' });
            contentEl.createEl('p', { 
                text: `The file "${filePath}" already exists. Do you want to use it as an inventory list?`,
                cls: 'stoker-modal-info'
            });
            contentEl.createEl('p', { 
                text: 'Note: If this is already a Stoker inventory file, it will be added to your lists. Otherwise, it will be overwritten.',
                cls: 'stoker-modal-warning'
            });
            
            const buttonContainer = contentEl.createDiv({ cls: 'stoker-modal-buttons' });
            
            buttonContainer.createEl('button', { text: 'Cancel' })
                .addEventListener('click', () => {
                    this.onOpen(); // Re-render the form
                    resolve(false);
                });
            
            const confirmBtn = buttonContainer.createEl('button', { 
                text: 'Use existing file',
                cls: 'mod-warning'
            });
            confirmBtn.addEventListener('click', () => resolve(true));
        });
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}

