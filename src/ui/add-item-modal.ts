import { App, Modal, Setting, DropdownComponent, TextComponent } from 'obsidian';
import type StokerPlugin from '../main';
import { UnitType } from '../types';
import { validateItemName, validateCategoryName, validateUnit, sanitizeInput, showInputError, clearInputError } from '../utils/validation';

export class AddItemModal extends Modal {
    plugin: StokerPlugin;
    
    private name = '';
    private category = '';
    private unitType: UnitType = 'count';
    private amount: number | boolean = 1;
    private unit = 'pcs';
    private minimum: number | undefined;
    
    private nameInput: HTMLInputElement;
    private nameError: HTMLElement;
    private unitInput: TextComponent;
    private unitError: HTMLElement;

    constructor(app: App, plugin: StokerPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('stoker-modal');
        
        contentEl.createEl('h2', { text: 'Add new item' });
        
        // Name input
        const nameSetting = new Setting(contentEl)
            .setName('Item name')
            .setDesc('Name of the item (no | [ ] characters)')
            .addText(text => {
                this.nameInput = text.inputEl;
                text.setPlaceholder('e.g., Milk')
                    .onChange(value => {
                        this.name = value;
                        const error = validateItemName(value);
                        if (error) {
                            showInputError(this.nameInput, this.nameError, error);
                        } else {
                            clearInputError(this.nameInput, this.nameError);
                        }
                    });
            });
        this.nameError = nameSetting.settingEl.createDiv({ cls: 'stoker-field-error' });
        
        // Category dropdown - only show existing categories from inventory
        const categories = this.plugin.store.getCategories();
        
        new Setting(contentEl)
            .setName('Category')
            .setDesc('Group similar items together')
            .addDropdown(dropdown => {
                dropdown.addOption('', 'Uncategorized');
                for (const cat of categories) {
                    dropdown.addOption(cat, cat);
                }
                dropdown.addOption('__new__', '+ New category...');
                dropdown.onChange(value => {
                    if (value === '__new__') {
                        this.promptNewCategory(dropdown);
                    } else {
                        this.category = value;
                    }
                });
            });
        
        // Unit type selector
        let amountSetting: Setting;
        let minimumSetting: Setting;
        
        new Setting(contentEl)
            .setName('Unit type')
            .setDesc('How to track this item')
            .addDropdown(dropdown => {
                dropdown.addOption('count', 'Count (whole pieces)');
                dropdown.addOption('portion', 'Portion (fractions like 0.5, 0.25)');
                dropdown.addOption('weight', 'Weight (kg, g, lb)');
                dropdown.addOption('volume', 'Volume (L, ml)');
                dropdown.addOption('boolean', 'In stock / Out of stock');
                dropdown.setValue(this.unitType);
                dropdown.onChange(value => {
                    this.unitType = value as UnitType;
                    this.updateAmountField(amountSetting, minimumSetting);
                });
            });
        
        // Amount input (dynamic based on unit type)
        amountSetting = new Setting(contentEl)
            .setName('Amount')
            .setDesc('Current quantity')
            .addText(text => {
                text.inputEl.type = 'number';
                text.inputEl.min = '0';
                text.inputEl.step = 'any';
                text.setValue('1');
                text.onChange(value => this.amount = parseFloat(value) || 0);
            })
            .addText(text => {
                this.unitInput = text;
                text.setPlaceholder('pcs');
                text.setValue(this.unit);
                text.onChange(value => {
                    this.unit = value || 'pcs';
                    const error = validateUnit(value);
                    if (error && value) {
                        showInputError(text.inputEl, this.unitError, error);
                    } else {
                        clearInputError(text.inputEl, this.unitError);
                    }
                });
            });
        this.unitError = amountSetting.settingEl.createDiv({ cls: 'stoker-field-error' });
        
        // Minimum threshold
        minimumSetting = new Setting(contentEl)
            .setName('Minimum threshold')
            .setDesc('Show warning when below this amount (optional, e.g., 0.25, 0.5)')
            .addText(text => {
                text.inputEl.type = 'number';
                text.inputEl.min = '0';
                text.inputEl.step = 'any';
                text.setPlaceholder('e.g., 0.25, 0.5, 2');
                text.onChange(value => {
                    this.minimum = value ? parseFloat(value) : undefined;
                });
            });
        
        // Buttons
        const buttonContainer = contentEl.createDiv({ cls: 'stoker-modal-buttons' });
        
        buttonContainer.createEl('button', { text: 'Cancel' })
            .addEventListener('click', () => this.close());
        
        const addBtn = buttonContainer.createEl('button', { 
            text: 'Add item',
            cls: 'mod-cta'
        });
        addBtn.addEventListener('click', () => this.addItem());
    }

    private updateAmountField(amountSetting: Setting, minimumSetting: Setting): void {
        const isBoolean = this.unitType === 'boolean';
        
        // Hide/show amount components
        amountSetting.settingEl.style.display = isBoolean ? 'none' : '';
        minimumSetting.settingEl.style.display = isBoolean ? 'none' : '';
        
        // Update unit placeholder based on type
        if (!isBoolean) {
            switch (this.unitType) {
                case 'portion':
                    this.unitInput.setPlaceholder('(optional)');
                    this.unit = '';
                    break;
                case 'weight':
                    this.unitInput.setPlaceholder('kg');
                    this.unit = 'kg';
                    break;
                case 'volume':
                    this.unitInput.setPlaceholder('L');
                    this.unit = 'L';
                    break;
                default:
                    this.unitInput.setPlaceholder('pcs');
                    this.unit = 'pcs';
            }
            this.unitInput.setValue(this.unit);
        }
        
        // Set default for boolean
        if (isBoolean) {
            this.amount = true;
            this.minimum = undefined;
        }
    }

    private promptNewCategory(dropdown: DropdownComponent): void {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'New category name';
        input.className = 'stoker-new-category-input';
        
        const container = dropdown.selectEl.parentElement!;
        container.appendChild(input);
        dropdown.selectEl.style.display = 'none';
        input.focus();
        
        const finalize = () => {
            const value = input.value.trim();
            const error = validateCategoryName(value);
            
            if (error) {
                input.classList.add('stoker-input-error');
                return; // Don't finalize if invalid
            }
            
            if (value) {
                const sanitized = sanitizeInput(value);
                // Add new option and select it
                dropdown.addOption(sanitized, sanitized);
                dropdown.setValue(sanitized);
                this.category = sanitized;
            } else {
                dropdown.setValue('');
                this.category = '';
            }
            input.remove();
            dropdown.selectEl.style.display = '';
        };
        
        input.addEventListener('blur', finalize);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                finalize();
            } else if (e.key === 'Escape') {
                input.value = '';
                finalize();
            }
        });
    }

    private async addItem(): Promise<void> {
        // Validate all inputs
        const nameError = validateItemName(this.name);
        if (nameError) {
            showInputError(this.nameInput, this.nameError, nameError);
            this.nameInput.focus();
            return;
        }
        
        if (this.unitType !== 'boolean' && this.unitType !== 'portion') {
            const unitError = validateUnit(this.unit, true);
            if (unitError) {
                showInputError(this.unitInput.inputEl, this.unitError, unitError);
                this.unitInput.inputEl.focus();
                return;
            }
        }
        
        await this.plugin.store.addItem({
            name: sanitizeInput(this.name),
            category: sanitizeInput(this.category),
            unitType: this.unitType,
            amount: this.unitType === 'boolean' ? true : this.amount,
            unit: sanitizeInput(this.unit) || 'pcs',
            minimum: this.minimum,
        });
        
        this.close();
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}

