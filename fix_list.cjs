
const fs = require('fs');
const path = 'd:/workspace/IR_Assistant/odoo_addons/ir_approval/views/ir_approval_views.xml';
let content = fs.readFileSync(path, 'utf8');

// Use regex to remove readonly=\u0022status != 'draft'\u0022 from fields inside <list> tags
content = content.replace(/<list[^>]*>([\s\S]*?)<\/list>/g, (match) => {
    return match.replace(/ readonly=\u0022status != 'draft'\u0022/g, '');
});

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed lists');

