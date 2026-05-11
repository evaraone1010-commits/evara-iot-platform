import { useAuth } from '../context/AuthContext';
import type { UserPlan } from '../context/AuthContext';

export type Feature =
    | 'basic_dashboard'
    | 'basic_analytics'
    | 'advanced_analytics'
    | 'report_download'
    | 'advanced_exports'
    | 'automation'
    | 'ai_features'
    | 'priority_support';

export type LimitType = 'projects' | 'devices' | 'data_retention';

type DefinedPlan = 'base' | 'plus' | 'pro';

const PLAN_FEATURES: Record<DefinedPlan, Feature[]> = {
    base: ['basic_dashboard', 'basic_analytics'],
    plus: ['basic_dashboard', 'basic_analytics', 'report_download', 'advanced_analytics'],
    pro: [
        'basic_dashboard',
        'basic_analytics',
        'advanced_analytics',
        'report_download',
        'advanced_exports',
        'automation',
        'ai_features',
        'priority_support'
    ]
};

const PLAN_LIMITS: Record<DefinedPlan, Record<LimitType, number>> = {
    base: { projects: 3, devices: 5, data_retention: 30 },
    plus: { projects: 10, devices: 20, data_retention: 90 },
    pro: { projects: -1, devices: -1, data_retention: 365 } // -1 = unlimited
};

export const usePlan = () => {
    const { user } = useAuth();
    const currentPlan = (user?.plan || 'base') as DefinedPlan;

    const canAccessFeature = (feature: Feature): boolean => {
        if (user?.role !== 'customer') return true; // Non-customers have full access
        return PLAN_FEATURES[currentPlan]?.includes(feature) || false;
    };

    const getPlanLimit = (limitType: LimitType): number => {
        if (user?.role !== 'customer') return -1; // Non-customers have no limits
        return PLAN_LIMITS[currentPlan][limitType];
    };

    const getRequiredPlan = (feature: Feature): UserPlan | null => {
        for (const [plan, features] of Object.entries(PLAN_FEATURES)) {
            if (features.includes(feature)) {
                return plan as UserPlan;
            }
        }
        return null;
    };

    const isLimitReached = (limitType: LimitType, currentCount: number): boolean => {
        const limit = getPlanLimit(limitType);
        if (limit === -1) return false; // Unlimited
        return currentCount >= limit;
    };

    return {
        currentPlan,
        canAccessFeature,
        getPlanLimit,
        getRequiredPlan,
        isLimitReached,
        isCustomer: user?.role === 'customer'
    };
};
