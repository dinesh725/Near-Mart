const fs = require('fs');
const path = require('path');
const routesDir = path.join(__dirname, 'src', 'routes');

const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
let targets = [];

for (const file of routeFiles) {
    const filePath = path.join(routesDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let hasMatch = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/router\.(get|post|patch|put|delete)\(['`"](.*?:([a-zA-Z0-9_]+).*?)['`"]/);
        if (match) {
            let hasValidateJoi = false;
            // Check next few lines for validateJoi
            for(let j=i; j < i+7 && j < lines.length; j++) {
                if (lines[j].includes('validateJoi') || lines[j].includes('require("../middleware/validateJoi")')) {
                    hasValidateJoi = true; 
                    break;
                }
            }
            if (!hasValidateJoi) {
                targets.push({ file, line: i + 1, content: line.trim(), param: match[3] });
                hasMatch = true;
            }
        }
    }
}
console.log(JSON.stringify(targets, null, 2));
