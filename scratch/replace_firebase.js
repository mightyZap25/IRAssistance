import fs from 'fs';
import path from 'path';

const SRC_DIR = path.resolve('src');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        const dirPath = path.join(dir, f);
        const isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            walkDir(dirPath, callback);
        } else {
            callback(dirPath);
        }
    });
}

async function main() {
    console.log("Starting batch renaming of firebase import paths inside 'src/'...");
    let modifiedCount = 0;
    
    walkDir(SRC_DIR, (filePath) => {
        if (filePath.endsWith('mockDb.js') || filePath.endsWith('database.js')) {
            return;
        }
        
        if (filePath.endsWith('mockFirebase.js') || filePath.endsWith('firebase.js')) {
            return;
        }
        
        if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
            const content = fs.readFileSync(filePath, 'utf8');
            
            // 상대 경로 import 구문에서 'firebase'를 'database'로 치환하는 정확한 정규식
            // 예: from '../firebase', from "./firebase"
            const regex = /(from\s+['"])([^'"]*\/)firebase(['"])/g;
            
            if (regex.test(content)) {
                const newContent = content.replace(regex, '$1$2database$3');
                fs.writeFileSync(filePath, newContent, 'utf8');
                console.log(`- Updated imports in: ${path.relative(SRC_DIR, filePath)}`);
                modifiedCount++;
            }
        }
    });
    
    console.log(`\nBatch renaming finished. Total modified files: ${modifiedCount}`);
}

main().catch(err => console.error(err));
