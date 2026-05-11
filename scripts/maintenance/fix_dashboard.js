const fs = require('fs');

// Fix admin.controller.js - getDashboardSummary
let ctrl = fs.readFileSync('backend/src/controllers/admin.controller.js', 'utf8');

// Fix the broken result block that references undefined communitiesSnap and has total_cones typo
ctrl = ctrl.replace(
    /const result = \{\r?\n\s+total_nodes: actualNodeCount,\r?\n\s+total_communities: isSuperAdmin \? communitiesSnap\.data\(\)\.count : 1,\r?\n\s+total_cones: isSuperAdmin \? zonesSnap\.data\(\)\.count : 1,\r?\n\s+online_nodes: onlineNodes,\r?\n\s+alerts_active: 0,\r?\n\s+system_health: actualNodeCount > 0 \? 100 : 0\r?\n\s+\};/,
    `const totalZones = zonesSnap.data().count;\r\n\r\n        const result = {\r\n            total_nodes: actualNodeCount,\r\n            total_customers: totalCustomers,\r\n            total_zones: totalZones,\r\n            online_nodes: onlineNodes,\r\n            alerts_active: 0,\r\n            system_health: actualNodeCount > 0 ? 92 : 0\r\n        };`
);

fs.writeFileSync('backend/src/controllers/admin.controller.js', ctrl, 'utf8');
console.log('admin.controller.js patched');

// Fix useDashboardStats.ts - wrong endpoint
let hook = fs.readFileSync('client/src/hooks/useDashboardStats.ts', 'utf8');

hook = hook.replace(
    /export interface DashboardStats \{[\s\S]*?\}/,
    `export interface DashboardStats {\r\n    total_nodes: number;\r\n    online_nodes: number;\r\n    total_customers: number;\r\n    total_zones: number;\r\n    alerts_active: number;\r\n    system_health: number;\r\n}`
);

hook = hook.replace(
    "api.get<DashboardStats>('/dashboard/stats')",
    "api.get<DashboardStats>('/stats/dashboard/summary')"
);

hook = hook.replace(
    '            return data;\r\n',
    "            console.log('[useDashboardStats] API RESPONSE:', data);\r\n            return data;\r\n"
);
hook = hook.replace(
    '            return data;\n',
    "            console.log('[useDashboardStats] API RESPONSE:', data);\n            return data;\n"
);

fs.writeFileSync('client/src/hooks/useDashboardStats.ts', hook, 'utf8');
console.log('useDashboardStats.ts patched');
