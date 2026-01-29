import { App, Modal, Setting, DropdownComponent, TextComponent, Notice } from 'obsidian';
import type StokerPlugin from '../main';
import { InventoryItem, UnitType } from '../types';
import { validateItemName, validateCategoryName, validateUnit, validateMinimum, validateAmount, checkDuplicateName, sanitizeInput, showInputError, clearInputError } from '../utils/validation';

export class EditItemModal extends Modal {
    plugin: StokerPlugin;
    item: InventoryItem;
    
    private name: string;
    private category: string;
    private unitType: UnitType;
    private amount: number | boolean;
    private unit: string;
    private minimum: number;
    private plannedRestock: boolean;
    
    private nameInput: HTMLInputElement;
    private nameError: HTMLElement;
    private unitInputEl: HTMLInputElement;

    constructor(app: App, plugin: StokerPlugin, item: InventoryItem) {
        super(app);
        this.plugin = plugin;
        this.item = item;
        
        // Initialize with current values
        this.name = item.name;
        this.category = item.category;
        this.unitType = item.unitType;
        this.amount = item.amount;
        this.unit = item.unit;
        this.minimum = item.minimum ?? 0;
        this.plannedRestock = item.plannedRestock ?? false;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('stoker-modal');
        
        contentEl.createEl('h2', { text: 'Edit item' });
        
        // Name input
        const nameSetting = new Setting(contentEl)
            .setName('Item name')
            .setDesc('Name of the item')
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
        const store = this.plugin.store;
        const categories = store ? store.getCategories() : [];
        
        new Setting(contentEl)
            .setName('Category')
            .setDesc('Group similar items together')
            .addDropdown(dropdown => {
                dropdown.addOption('', 'Uncategorized');
                for (const cat of categories) {
                    dropdown.addOption(cat, cat);
                }
                dropdown.addOption('__new__', '+ new category');
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
                dropdown.addOption('count', 'Count');
                dropdown.addOption('portion', 'Portion');
                dropdown.addOption('weight', 'Weight');
                dropdown.addOption('volume', 'Volume');
                dropdown.addOption('boolean', 'In stock / out of stock');
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
                text.setPlaceholder('Unit');
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
            .setDesc('Show warning when below this amount (0 = no warning)')
            .addText(text => {
                text.inputEl.type = 'number';
                text.inputEl.min = '0';
                text.inputEl.step = 'any';
                text.setValue(this.minimum > 0 ? String(this.minimum) : '');
                text.setPlaceholder('0');
                text.onChange(value => {
                    this.minimum = value ? parseFloat(value) : 0;
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
        deleteBtn.addEventListener('click', () => { void this.deleteItem(); });
        
        buttonContainer.createEl('button', { text: 'Cancel' })
            .addEventListener('click', () => this.close());
        
        const saveBtn = buttonContainer.createEl('button', { 
            text: 'Save',
            cls: 'mod-cta'
        });
        saveBtn.addEventListener('click', () => { void this.saveItem(); });
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
        amountSetting.settingEl.toggleClass('stoker-hidden', isBoolean);
        minimumSetting.settingEl.toggleClass('stoker-hidden', isBoolean);
        booleanSetting.settingEl.toggleClass('stoker-hidden', !isBoolean);
        
        // Update unit placeholder based on type
        if (!isBoolean) {
            switch (this.unitType) {
                case 'portion':
                    unitInput.setPlaceholder('(optional)');
                    // Don't force a unit for portion type
                    break;
                case 'weight':
                    unitInput.setPlaceholder('Weight unit');
                    if (!this.unit || this.unit === 'pcs' || this.unit === 'L') {
                        this.unit = 'kg';
                        unitInput.setValue(this.unit);
                    }
                    break;
                case 'volume':
                    unitInput.setPlaceholder('Volume unit');
                    if (!this.unit || this.unit === 'pcs' || this.unit === 'kg') {
                        this.unit = 'L';
                        unitInput.setValue(this.unit);
                    }
                    break;
                default:
                    unitInput.setPlaceholder('Unit');
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
            this.minimum = 0;
        }
    }

    private promptNewCategory(dropdown: DropdownComponent): void {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'New category name';
        input.className = 'stoker-new-category-input';
        
        const container = dropdown.selectEl.parentElement!;
        container.appendChild(input);
        dropdown.selectEl.addClass('stoker-hidden');
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
            dropdown.selectEl.removeClass('stoker-hidden');
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
        const store = this.plugin.store;
        if (!store) {
            return;
        }
        
        // Validate name
        const nameError = validateItemName(this.name);
        if (nameError) {
            showInputError(this.nameInput, this.nameError, nameError);
            this.nameInput.focus();
            return;
        }
        
        // Check for duplicate names in same category (exclude current item)
        const existingItems = store.getItems();
        const duplicateError = checkDuplicateName(this.name, this.category, existingItems, this.item.id);
        if (duplicateError) {
            showInputError(this.nameInput, this.nameError, duplicateError);
            this.nameInput.focus();
            return;
        }
        
        // Validate unit for non-boolean and non-portion types
        if (this.unitType !== 'boolean' && this.unitType !== 'portion') {
            const unitError = validateUnit(this.unit, true);
            if (unitError) {
                showInputError(this.unitInputEl);
                this.unitInputEl.focus();
                return;
            }
        }
        
        // Validate amount
        const amountError = validateAmount(this.amount, this.unitType);
        if (amountError) {
            showInputError(this.nameInput, this.nameError, amountError);
            return;
        }
        
        // Validate minimum threshold
        const minimumError = validateMinimum(this.minimum);
        if (minimumError) {
            showInputError(this.nameInput, this.nameError, minimumError);
            return;
        }
        
        try {
            await store.updateItem(this.item.id, {
                name: sanitizeInput(this.name),
                category: sanitizeInput(this.category),
                unitType: this.unitType,
                amount: this.amount,
                unit: sanitizeInput(this.unit) || 'pcs',
                minimum: this.minimum,
                plannedRestock: this.plannedRestock,
            });
            
            this.close();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to save item';
            new Notice(`Error: ${message}`);
            console.error('Stoker: Failed to save item:', error);
        }
    }

    private async deleteItem(): Promise<void> {
        // Confirm deletion
        const confirmed = await this.confirmDelete();
        if (confirmed) {
            const store = this.plugin.store;
            if (store) {
                try {
                    await store.deleteItem(this.item.id);
                    new Notice(`Deleted "${this.item.name}"`);
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Failed to delete item';
                    new Notice(`Error: ${message}`);
                    console.error('Stoker: Failed to delete item:', error);
                }
            }
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

