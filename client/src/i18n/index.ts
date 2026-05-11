/**
 * Phase 28: Internationalization (i18n) System
 * Lightweight translation system for multi-language support.
 */

type TranslationKey = string;
type Locale = 'en' | 'hi' | 'te';

interface TranslationMap {
    [key: string]: {
        [locale in Locale]?: string;
    };
}

const translations: TranslationMap = {
    // Dashboard
    "dashboard.title": {
        en: "System Dashboard",
        hi: "सिस्टम डैशबोर्ड",
        te: "సిస్టమ్ డాష్‌బోర్డ్"
    },
    "dashboard.total_assets": {
        en: "Total Assets",
        hi: "कुल संपत्तियां",
        te: "మొత్తం ఆస్తులు"
    },
    "dashboard.active_alerts": {
        en: "Active Alerts",
        hi: "सक्रिय अलर्ट",
        te: "యాక్టివ్ అలర్ట్‌లు"
    },
    "dashboard.system_health": {
        en: "System Health",
        hi: "सिस्टम स्वास्थ्य",
        te: "సిస్టమ్ ఆరోగ్యం"
    },
    "dashboard.live_feed": {
        en: "Live Feed",
        hi: "लाइव फीड",
        te: "లైవ్ ఫీడ్"
    },
    "dashboard.device_fleet": {
        en: "Device Fleet",
        hi: "डिवाइस बेड़ा",
        te: "పరికర బృందం"
    },

    // Common
    "common.search": {
        en: "Search assets...",
        hi: "संपत्तियां खोजें...",
        te: "ఆస్తులు శోధించండి..."
    },
    "common.online": {
        en: "Online",
        hi: "ऑनलाइन",
        te: "ఆన్‌లైన్"
    },
    "common.offline": {
        en: "Offline",
        hi: "ऑफ़लाइन",
        te: "ఆఫ్‌లైన్"
    },
    "common.retry": {
        en: "Retry",
        hi: "पुनः प्रयास करें",
        te: "మళ్ళీ ప్రయత్నించు"
    },
    "common.sync": {
        en: "Sync Account",
        hi: "खाता सिंक करें",
        te: "ఖాతా సింక్ చేయి"
    },

    // Status
    "status.live_system": {
        en: "Live System",
        hi: "लाइव सिस्टम",
        te: "లైవ్ సిస్టమ్"
    },
    "status.all_operational": {
        en: "All Systems Operational",
        hi: "सभी सिस्टम चालू",
        te: "అన్ని సిస్టమ్‌లు పనిచేస్తున్నాయి"
    }
};

let currentLocale: Locale = 'en';

export function setLocale(locale: Locale): void {
    currentLocale = locale;
    localStorage.setItem('evara_locale', locale);
}

export function getLocale(): Locale {
    return (localStorage.getItem('evara_locale') as Locale) || 'en';
}

export function t(key: TranslationKey): string {
    const entry = translations[key];
    if (!entry) return key;
    return entry[currentLocale] || entry['en'] || key;
}

export function getAvailableLocales(): { code: Locale; name: string }[] {
    return [
        { code: 'en', name: 'English' },
        { code: 'hi', name: 'हिंदी' },
        { code: 'te', name: 'తెలుగు' }
    ];
}

// Initialize locale from storage
currentLocale = getLocale();

export default { t, setLocale, getLocale, getAvailableLocales };
