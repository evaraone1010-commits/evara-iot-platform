/**
 * Type-safe API error handling
 * Pattern extracted from TDS-app_main with enhancements
 */

// ============================================================================
// API ERROR TYPES
// ============================================================================

export interface ApiErrorResponse {
    detail: string;
    type?: string;
    path?: string;
}

export interface ValidationError {
    loc: (string | number)[];
    msg: string;
    type: string;
}

export interface ApiValidationErrorResponse {
    detail: ValidationError[];
}

/**
 * Type guard for API error responses
 */
export function isApiError(error: unknown): error is { response: { data: ApiErrorResponse } } {
    return (
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as { response?: unknown }).response === 'object'
    );
}

/**
 * Extract error message from various error formats
 */
export function getErrorMessage(error: unknown): string {
    if (isApiError(error)) {
        const errorData = error.response.data;
        
        // Handle string detail
        if (typeof errorData.detail === 'string') {
            return errorData.detail;
        }
        
        // Handle validation error array (FastAPI format)
        if (Array.isArray(errorData.detail)) {
            const validationErrors = errorData.detail as ValidationError[];
            if (validationErrors.length > 0) {
                return validationErrors
                    .map((err) => `${err.loc.join('.')}: ${err.msg}`)
                    .join(', ');
            }
        }
    }
    
    if (error instanceof Error) {
        return error.message;
    }
    
    return 'An unknown error occurred';
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface SuccessResponse<T = unknown> {
    data: T;
    message?: string;
}

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
}

// ============================================================================
// API REQUEST TYPES
// ============================================================================

export interface ListQueryParams {
    page?: number;
    page_size?: number;
    q?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
}

// ============================================================================
// ASYNC OPERATION RESULT
// ============================================================================

export type AsyncResult<T, E = Error> = 
    | { success: true; data: T }
    | { success: false; error: E };

/**
 * Wrap async operations with error handling
 * 
 * Usage:
 * ```ts
 * const result = await wrapAsync(() => api.get('/devices'));
 * if (result.success) {
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export async function wrapAsync<T>(
    operation: () => Promise<T>
): Promise<AsyncResult<T, string>> {
    try {
        const data = await operation();
        return { success: true, data };
    } catch (error) {
        return { success: false, error: getErrorMessage(error) };
    }
}

// ============================================================================
// TYPED METADATA
// ============================================================================

/**
 * Replace 'any' metadata with proper types
 */
export interface DeviceMetadata {
    installation_notes?: string;
    maintenance_schedule?: string;
    firmware_version?: string;
    hardware_revision?: string;
    [key: string]: string | number | boolean | undefined;
}

export interface AnalyticsMetadata {
    algorithm?: string;
    confidence_threshold?: number;
    last_calibration?: string;
    [key: string]: string | number | boolean | undefined;
}

export interface AuditMetadata {
    ip_address?: string;
    previous_value?: string | number | boolean;
    new_value?: string | number | boolean;
    reason?: string;
    [key: string]: string | number | boolean | undefined;
}
