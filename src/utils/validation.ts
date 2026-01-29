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

