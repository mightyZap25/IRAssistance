const fs = require('fs');
const path = require('path');

const manualDir = path.join(__dirname, '../manual');
const outputFilePath = path.join(__dirname, '../src/components/common/manualData.js');

try {
    const files = fs.readdirSync(manualDir);
    const data = {};

    files.forEach(file => {
        if (file.endsWith('.md')) {
            const name = path.basename(file, '.md');
            const filePath = path.join(manualDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            data[name] = content;
        }
    });

    const outputContent = `// Auto-generated manual data module. Do not edit directly.\nexport const manualData = ${JSON.stringify(data, null, 4)};\n`;
    
    // 부모 폴더가 존재하는지 확인하고 생성
    const parentDir = path.dirname(outputFilePath);
    if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(outputFilePath, outputContent, 'utf8');
    console.log(`Successfully compiled ${Object.keys(data).length} manual pages into manualData.js!`);
} catch (err) {
    console.error("Failed to build manual data:", err);
}
