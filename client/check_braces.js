const fs = require('fs');
const content = fs.readFileSync('c:\\Users\\yasha_ambulkar\\OneDrive\\Documents\\26-03-26\\MAIN\\client\\src\\pages\\EvaraFlowAnalytics.tsx', 'utf8');
const lines = content.split('\n');
let level = 0;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let char of line) {
        if (char === '{') level++;
        if (char === '}') level--;
    }
}
console.log(`Final level: ${level}`);
