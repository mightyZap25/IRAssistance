
const fs = require('fs');
const path = 'd:/workspace/IR_Assistant/odoo_addons/ir_approval/views/ir_approval_views.xml';
let content = fs.readFileSync(path, 'utf8');

const formStart = content.indexOf('<form');
const formEnd = content.indexOf('</form>');

if (formStart !== -1 && formEnd !== -1) {
    let formContent = content.substring(formStart, formEnd);
    formContent = formContent.replace(/<field\s+[^>]+>/g, (match) => {
        if (match.includes('readonly=') || match.includes('status') || match.includes('message_') || match.includes('activity_')) {
            return match;
        }
        if (match.endsWith('/>')) {
            return match.slice(0, -2) + ' readonly=\u0022status != \'draft\'\u0022/>';
        } else {
            return match.slice(0, -1) + ' readonly=\u0022status != \'draft\'\u0022>';
        }
    });
    content = content.substring(0, formStart) + formContent + content.substring(formEnd);
    fs.writeFileSync(path, content, 'utf8');
    console.log('Fields updated');
}

