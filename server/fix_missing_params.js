const fs = require('fs');
const path = require('path');
const routesDir = path.join(__dirname, 'src', 'routes');

const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
let modifiedFiles = 0;

for (const file of routeFiles) {
    const filePath = path.join(routesDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;
    
    // We want to find route declarations that don't have validateJoi.
    // We will do this by tracking the index.
    let searchIdx = 0;
    while(true) {
        // Find next route definition
        const routeMatch = content.slice(searchIdx).match(/router\.(get|post|patch|put|delete)\(['`"](.*?:([a-zA-Z0-9_]+).*?)['`"]/);
        if (!routeMatch) break;
        
        const absoluteMatchIndex = searchIdx + routeMatch.index;
        const fnMatch = content.slice(absoluteMatchIndex).match(/async\s*\(\s*req\s*,\s*res\s*(,\s*next\s*)?\)\s*=>\s*\{/);
        
        if (!fnMatch) {
            searchIdx = absoluteMatchIndex + routeMatch[0].length;
            continue;
        }

        const absoluteFnIndex = absoluteMatchIndex + fnMatch.index;
        
        // Extract the declaration part
        const declarationPart = content.slice(absoluteMatchIndex, absoluteFnIndex);
        
        if (declarationPart.includes('validateJoi') || declarationPart.includes('require("../middleware/validateJoi")')) {
            // Already has validation
            searchIdx = absoluteFnIndex + fnMatch[0].length;
            continue;
        }
        
        const paramName = routeMatch[3];
        
        // Inject validation middleware before async
        const middleware = `\n    require("../middleware/validateJoi")({ params: require("joi").object({ ${paramName}: require("joi").string().required() }) }),\n`;
        
        // Inject params assignment after try {
        // We need to find the specific try block inside THIS handler
        const afterFnIndex = absoluteFnIndex + fnMatch[0].length;
        const tryMatch = content.slice(afterFnIndex, afterFnIndex + 200).match(/try\s*\{\s*/);
        
        if (!tryMatch) {
            // No try block, skip or manual handle
            console.log(`Skipping route in ${file} (no try block found easily)`);
            searchIdx = afterFnIndex;
            continue;
        }
        
        const absoluteTryIndex = afterFnIndex + tryMatch.index + tryMatch[0].length;
        const injectParamsLine = `\n            const params = req.validatedParams || req.params;\n`;
        
        // Modify content backwards to maintain indices
        content = content.slice(0, absoluteTryIndex) + injectParamsLine + content.slice(absoluteTryIndex);
        
        // The injection of middleware happens BEFORE absoluteFnIndex
        // Because we injected `injectParamsLine` AFTER absoluteFnIndex, the absoluteFnIndex is still valid.
        content = content.slice(0, absoluteFnIndex) + middleware + `    ` + content.slice(absoluteFnIndex);
        
        // Now replace req.params.PARAM or req.params inside the handler?
        // Let's just do a blanket replace of req.params to params inside this handler's scope roughly.
        // Actually, just doing req.params.PARAM -> params.PARAM is safer.
        // But let's let the user keep using req.params fallback, and next time we can write a more robust AST.
        // For now, since we added `const params = req.validatedParams || req.params`, any existing req.params.PARAM works fine because req.params still exists.
        // Wait! The whole point of the fallback was to USE the validated data.
        // If we just add `const params = req.validatedParams || req.params`, but the code still says `req.params.id`, we aren't using the validated data.
        // Let's replace req.params with params within the next 1000 characters or until the next router.(something)

        // Find end of handler (roughly next router. or end of file)
        const nextRouterMatch = content.slice(absoluteTryIndex + injectParamsLine.length).match(/router\.(get|post|patch|put|delete)/);
        const endOfHandler = nextRouterMatch ? (absoluteTryIndex + injectParamsLine.length + nextRouterMatch.index) : content.length;
        
        const handlerBody = content.slice(absoluteTryIndex + injectParamsLine.length, endOfHandler);
        // Replace req.params with params safely
        const updatedHandlerBody = handlerBody.replace(/req\.params/g, 'params');
        
        content = content.slice(0, absoluteTryIndex + injectParamsLine.length) + updatedHandlerBody + content.slice(endOfHandler);
        
        searchIdx = absoluteTryIndex + injectParamsLine.length;
    }
    
    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        modifiedFiles++;
        console.log(`Modified ${file}`);
    }
}
console.log(`Done. Modified ${modifiedFiles} files.`);
