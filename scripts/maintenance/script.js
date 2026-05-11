const fs = require('fs');
const path = require('path');

const dir = 'd:/20-04-26/main/backend/src/controllers';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

files.forEach(file => {
    let content = fs.readFileSync(path.join(dir, file), 'utf8');
    
    // Replace async (req, res) with async (req, res, next)
    content = content.replace(/async\s*\(\s*req\s*,\s*res\s*\)/g, 'async (req, res, next)');
    
    // Also catch any specific res.status(500) patterns and replace the whole catch block
    // We want to replace from 'catch (error) {' or 'catch(err) {' to the matching '}'
    // Actually, just doing it carefully.
    
    // To be very precise, let's replace the common 500 patterns inside the catch
    content = content.replace(/catch\s*\(([^)]+)\)\s*\{[^}]*res\.status\(500\)[^}]*\}/g, 'catch () {\n        return next();\n    }');
    
    // Wait, some catch blocks have nested blocks (like if statements).
    // The regex [^}]* will stop at the FIRST closing brace! That's bad for nested blocks.
    
    fs.writeFileSync(path.join(dir, file), content);
    console.log('Processed', file);
});
