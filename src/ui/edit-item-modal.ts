import { App, Modal, Setting, DropdownComponent, TextComponent } from 'obsidian';
import type StokerPlugin from '../main';
import { FoodItem, UnitType } from '../types';
import { validateItemName, validateCategoryName, validateUnit, sanitizeInput, showInputError, clearInputError } from '../utils/validation';

export class EditItemModal extends Modal {
    plugin: StokerPlugin;
    item: FoodItem;
    
    private name: string;
    private category: string;
    private unitType: UnitType;
    private amount: number | boolean;
    private unit: string;
    private minimum: number | undefined;
    private plannedRestock: boolean;
    
    private nameInput: HTMLInputElement;
    private nameError: HTMLElement;
    private unitInputEl: HTMLInputElement;

    constructor(app: App, plugin: StokerPlugin, item: FoodItem) {
        super(app);
        this.plugin = plugin;
        this.item = item;
        
        // Initialize with current values
        this.name = item.name;
        this.category = item.category;
        this.unitType = item.unitType;
        this.amount = item.amount;
        this.unit = item.unit;
        this.minimum = item.minimum;
        this.plannedRestock = item.plannedRestock ?? false;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('stoker-modal');
        
        contentEl.createEl('h2', { text: 'Edit item' });
        
        // Name input
        const nameSetting = new Setting(contentEl)
            .setName('Item name')
            .setDesc('Name of the food item (no | [ ] characters)')
            .addText(text => {
                this.nameInput = text.inputEl;
                text.setValue(this.name)
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
                dropdown.setValue(this.category);
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
        let amountInput: TextComponent | null = null;
        let unitInput: TextComponent | null = null;
        let minimumSetting: Setting;
        let booleanSetting: Setting;
        
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
                    if (amountInput && unitInput) {
                        this.updateAmountField(amountSetting, amountInput, unitInput, minimumSetting, booleanSetting);
                    }
                });
            });
        
        // Amount input (for numeric types)
        amountSetting = new Setting(contentEl)
            .setName('Amount')
            .setDesc('Current quantity')
            .addText(text => {
                amountInput = text;
                text.inputEl.type = 'number';
                text.inputEl.min = '0';
                text.inputEl.step = 'any';
                text.setValue(typeof this.amount === 'number' ? String(this.amount) : '1');
                text.onChange(value => {
                    if (this.unitType !== 'boolean') {
                        this.amount = parseFloat(value) || 0;
                    }
                });
            })
            .addText(text => {
                unitInput = text;
                this.unitInputEl = text.inputEl;
                text.setPlaceholder('pcs');
                text.setValue(this.unit);
                text.onChange(value => {
                    this.unit = value || 'pcs';
                    const error = validateUnit(value);
                    if (error && value) {
                        showInputError(text.inputEl);
                    } else {
                        clearInputError(text.inputEl);
                    }
                });
            });
        
        // Boolean toggle (for boolean type)
        booleanSetting = new Setting(contentEl)
            .setName('Stock status')
            .setDesc('Is this item in stock?')
            .addToggle(toggle => {
                toggle.setValue(this.amount === true);
                toggle.onChange(value => {
                    if (this.unitType === 'boolean') {
                        this.amount = value;
                    }
                });
            });
        
        // Minimum threshold
        minimumSetting = new Setting(contentEl)
            .setName('Minimum threshold')
            .setDesc('Show warning when below this amount (optional, e.g., 0.25, 0.5)')
            .addText(text => {
                text.inputEl.type = 'number';
                text.inputEl.min = '0';
                text.inputEl.step = 'any';
                text.setValue(this.minimum !== undefined ? String(this.minimum) : '');
                text.setPlaceholder('e.g., 0.25, 0.5, 2');
                text.onChange(value => {
                    this.minimum = value ? parseFloat(value) : undefined;
                });
            });
        
        // Initial visibility update
        if (amountInput && unitInput) {
            this.updateAmountField(amountSetting, amountInput, unitInput, minimumSetting, booleanSetting);
        }
        
        // Planned restock toggle
        new Setting(contentEl)
            .setName('Planned restock')
            .setDesc('Mark this item for your shopping list')
            .addToggle(toggle => {
                toggle.setValue(this.plannedRestock);
                toggle.onChange(value => {
                    this.plannedRestock = value;
                });
            });
        
        // Buttons
        const buttonContainer = contentEl.createDiv({ cls: 'stoker-modal-buttons' });
        
        const deleteBtn = buttonContainer.createEl('button', { 
            text: 'Delete',
            cls: 'mod-warning'
        });
        deleteBtn.addEventListener('click', () => this.deleteItem());
        
        buttonContainer.createEl('button', { text: 'Cancel' })
            .addEventListener('click', () => this.close());
        
        const saveBtn = buttonContainer.createEl('button', { 
            text: 'Save',
            cls: 'mod-cta'
        });
        saveBtn.addEventListener('click', () => this.saveItem());
    }

    private updateAmountField(
        amountSetting: Setting, 
        amountInput: TextComponent,
        unitInput: TextComponent, 
        minimumSetting: Setting,
        booleanSetting: Setting
    ): void {
        const isBoolean = this.unitType === 'boolean';
        
        // Toggle visibility
        amountSetting.settingEl.style.display = isBoolean ? 'none' : '';
        minimumSetting.settingEl.style.display = isBoolean ? 'none' : '';
        booleanSetting.settingEl.style.display = isBoolean ? '' : 'none';
        
        // Update unit placeholder based on type
        if (!isBoolean) {
            switch (this.unitType) {
                case 'portion':
                    unitInput.setPlaceholder('(optional)');
                    // Don't force a unit for portion type
                    break;
                case 'weight':
                    unitInput.setPlaceholder('kg');
                    if (!this.unit || this.unit === 'pcs' || this.unit === 'L') {
                        this.unit = 'kg';
                        unitInput.setValue(this.unit);
                    }
                    break;
                case 'volume':
                    unitInput.setPlaceholder('L');
                    if (!this.unit || this.unit === 'pcs' || this.unit === 'kg') {
                        this.unit = 'L';
                        unitInput.setValue(this.unit);
                    }
                    break;
                default:
                    unitInput.setPlaceholder('pcs');
                    if (!this.unit || this.unit === 'kg' || this.unit === 'L') {
                        this.unit = 'pcs';
                        unitInput.setValue(this.unit);
                    }
            }
            
            // Convert boolean to number if needed
            if (typeof this.amount === 'boolean') {
                this.amount = this.amount ? 1 : 0;
                amountInput.setValue(String(this.amount));
            }
        } else {
            // Convert number to boolean if needed
            if (typeof this.amount === 'number') {
                this.amount = this.amount > 0;
            }
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
                return;
            }
            
            if (value) {
                const sanitized = sanitizeInput(value);
                dropdown.addOption(sanitized, sanitized);
                dropdown.setValue(sanitized);
                this.category = sanitized;
            } else {
                dropdown.setValue(this.item.category);
                this.category = this.item.category;
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

    private async saveItem(): Promise<void> {
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
                showInputError(this.unitInputEl);
                this.unitInputEl.focus();
                return;
            }
        }
        
        await this.plugin.store.updateItem(this.item.id, {
            name: sanitizeInput(this.name),
            category: sanitizeInput(this.category),
            unitType: this.unitType,
            amount: this.amount,
            unit: sanitizeInput(this.unit) || 'pcs',
            minimum: this.minimum,
            plannedRestock: this.plannedRestock,
        });
        
        this.close();
    }

    private async deleteItem(): Promise<void> {
        // Confirm deletion
        const confirmed = await this.confirmDelete();
        if (confirmed) {
            await this.plugin.store.deleteItem(this.item.id);
            this.close();
        }
    }

    private confirmDelete(): Promise<boolean> {
        return new Promise((resolve) => {
            const { contentEl } = this;
            contentEl.empty();
            contentEl.createEl('h2', { text: 'Delete item?' });
            contentEl.createEl('p', { 
                text: `Are you sure you want to delete "${this.item.name}"?` 
            });
            
            const buttonContainer = contentEl.createDiv({ cls: 'stoker-modal-buttons' });
            
            buttonContainer.createEl('button', { text: 'Cancel' })
                .addEventListener('click', () => {
                    this.close();
                    resolve(false);
                });
            
            const deleteBtn = buttonContainer.createEl('button', { 
                text: 'Delete',
                cls: 'mod-warning'
            });
            deleteBtn.addEventListener('click', () => resolve(true));
        });
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}

