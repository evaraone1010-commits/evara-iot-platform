const fs = require('fs');

const file = 'd:/20-04-26/main/backend/src/controllers/admin.controller.js';
let content = fs.readFileSync(file, 'utf8');

// Add next parameter
content = content.replace(/exports\.(\w+)\s*=\s*async\s*\(\s*req\s*,\s*res\s*\)\s*=>/g, 'exports.$1 = async (req, res, next) =>');

// Replace the specific catch contents
// Some have req.log?.error
content = content.replace(/req\.log\?\.error\([\s\S]*?\);\s*(return )?res\.status\(500\)\.json\(\{[\s\S]*?\}\);/g, 'return next(error);');
// Some just have res.status(500)
content = content.replace(/(return )?res\.status\(500\)\.json\(\{[\s\S]*?\}\);/g, 'return next(error);');
// And some log with logger.error
content = content.replace(/logger\.error\([\s\S]*?\);\s*(return )?res\.status\(500\)\.json\(\{[\s\S]*?\}\);/g, 'return next(error);');

fs.writeFileSync(file, content);
console.log('Fixed admin.controller.js');
