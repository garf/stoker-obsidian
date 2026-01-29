/**
 * Characters that would break the markdown data structure
 */
const FORBIDDEN_CHARS = ['|', '[', ']', '\n', '\r'];

/**
 * Regex pattern for forbidden characters
 */
const FORBIDDEN_PATTERN = /[|\[\]\n\r]/g;

/**
 * Validate a string input and return an error message if invalid
 * @param value The input value to validate
 * @param fieldName The name of the field for error messages
 * @param required Whether the field is required
 * @returns Error message or null if valid
 */
export function validateInput(value: string, fieldName: string, required = true): string | null {
    const trimmed = value.trim();
    
    if (required && !trimmed) {
        return `${fieldName} is required`;
    }
    
    if (FORBIDDEN_PATTERN.test(value)) {
        return `${fieldName} cannot contain | [ ] or line breaks`;
    }
    
    return null;
}

/**
 * Sanitize a string by removing forbidden characters
 * @param value The input value to sanitize
 * @returns Sanitized string
 */
export function sanitizeInput(value: string): string {
    return value.replace(FORBIDDEN_PATTERN, '').trim();
}

/**
 * Check if a string contains forbidden characters
 * @param value The input value to check
 * @returns True if contains forbidden characters
 */
export function containsForbiddenChars(value: string): boolean {
    return FORBIDDEN_PATTERN.test(value);
}

/**
 * Show validation error styling on an input element
 */
export function showInputError(inputEl: HTMLInputElement | HTMLTextAreaElement, errorEl?: HTMLElement, message?: string): void {
    inputEl.classList.add('stoker-input-error');
    if (errorEl && message) {
        errorEl.textContent = message;
        errorEl.classList.add('stoker-error-visible');
    }
}

/**
 * Clear validation error styling from an input element
 */
export function clearInputError(inputEl: HTMLInputElement | HTMLTextAreaElement, errorEl?: HTMLElement): void {
    inputEl.classList.remove('stoker-input-error');
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.remove('stoker-error-visible');
    }
}

/**
 * Validate item name
 */
export function validateItemName(value: string): string | null {
    return validateInput(value, 'Item name', true);
}

/**
 * Validate category name
 */
export function validateCategoryName(value: string): string | null {
    return validateInput(value, 'Category name', false);
}

/**
 * Validate unit
 * @param value The unit value
 * @param required Whether the unit is required (false for portion type)
 */
export function validateUnit(value: string, required = true): string | null {
    if (required && !value.trim()) {
        return 'Unit is required';
    }
    if (value && FORBIDDEN_PATTERN.test(value)) {
        return 'Unit cannot contain | [ ] or line breaks';
    }
    return null;
}

/**
 * Validate minimum threshold
 * @param value The minimum threshold value
 * @param currentAmount The current amount (optional, for comparison)
 */
export function validateMinimum(value: number | undefined): string | null {
    if (value === undefined) {
        return null; // Optional field
    }
    if (value < 0) {
        return 'Minimum threshold cannot be negative';
    }
    if (!Number.isFinite(value)) {
        return 'Invalid minimum threshold value';
    }
    return null;
}

/**
 * Validate amount
 * @param value The amount value
 * @param unitType The unit type (boolean doesn't need numeric validation)
 */
export function validateAmount(value: number | boolean, unitType: string): string | null {
    if (unitType === 'boolean') {
        return null; // Boolean values are always valid
    }
    
    if (typeof value !== 'number') {
        return 'Amount must be a number';
    }
    
    if (value < 0) {
        return 'Amount cannot be negative';
    }
    
    if (!Number.isFinite(value)) {
        return 'Invalid amount value';
    }
    
    // Reasonable upper limit to prevent accidental huge values
    if (value > 999999999) {
        return 'Amount is too large';
    }
    
    return null;
}

/**
 * Check if an item name already exists in a category
 * @param name The item name to check
 * @param category The category to check in
 * @param existingItems Array of existing items
 * @param excludeId Optional ID to exclude (for editing existing items)
 */
export function checkDuplicateName(
    name: string, 
    category: string, 
    existingItems: Array<{ id: string; name: string; category: string }>,
    excludeId?: string
): string | null {
    const normalizedName = name.trim().toLowerCase();
    const normalizedCategory = category.trim().toLowerCase();
    
    const duplicate = existingItems.find(item => 
        item.name.trim().toLowerCase() === normalizedName &&
        item.category.trim().toLowerCase() === normalizedCategory &&
        item.id !== excludeId
    );
    
    if (duplicate) {
        return `An item named "${name}" already exists in this category`;
    }
    
    return null;
}

