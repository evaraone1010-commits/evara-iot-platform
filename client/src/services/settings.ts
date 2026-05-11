import api from './api';

// ── Types ───────────────────────────────────────────────────────────────

export interface UserPreferences {
    email_notifications: boolean;
    sms_notifications: boolean;
    theme: 'light' | 'dark' | 'system';
}

const DEFAULT_PREFS: UserPreferences = {
    email_notifications: true,
    sms_notifications: false,
    theme: 'light',
};

// ── API calls ───────────────────────────────────────────────────────────

/**
 * GET user preferences.
 *
 * NOTE: The backend does not yet have a /users/me/preferences endpoint.
 * Once implemented, swap the fallback with a real call.
 */
export const getUserPreferences = async (): Promise<UserPreferences> => {
    try {
        const response = await api.get<UserPreferences>('/users/me/preferences');
        return response.data;
    } catch {
        // Backend endpoint not yet implemented ─ return sensible defaults
        console.warn('[settings] GET /users/me/preferences not implemented — using defaults');
        return { ...DEFAULT_PREFS };
    }
};

/**
 * PATCH user preferences.
 *
 * Falls back to returning merged defaults if the backend endpoint is missing.
 */
export const updateUserPreferences = async (
    prefs: Partial<UserPreferences>
): Promise<UserPreferences> => {
    try {
        const response = await api.patch<UserPreferences>('/users/me/preferences', prefs);
        return response.data;
    } catch {
        console.warn('[settings] PATCH /users/me/preferences not implemented — returning merged defaults');
        return { ...DEFAULT_PREFS, ...prefs };
    }
};
