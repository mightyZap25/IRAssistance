import express from 'express';
import OdooClient from './odoo_rpc.js';

const router = express.Router();



router.post('/import-bom', async (req, res) => {
    const { items, relations } = req.body;
    
    if (!items || !relations) {
        return res.status(400).json({ error: 'items and relations are required' });
    }

    try {
        const ODOO_URL = process.env.ODOO_URL || 'http://100.67.238.32:8069';
        const ODOO_DB = process.env.ODOO_DB || 'odoo';
        const ODOO_USER = process.env.ODOO_USER || 'admin';
        const ODOO_PASS = process.env.ODOO_PASS || 'admin';

        const odoo = new OdooClient(ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASS);
        console.log('[Odoo] Authenticating...');
        await odoo.authenticate();
        console.log('[Odoo] Authenticated successfully. UID:', odoo.uid);

        const odooProductIdMap = {}; // PartID -> Odoo Product ID

        // 1. Create or Find Products
        for (const item of items) {
            console.log(`[Odoo] Processing Product: ${item.PartID}`);
            // Check if product exists (by default_code / Part Number)
            const searchResult = await odoo.execute_kw('product.template', 'search', [[['default_code', '=', item.PartID]]]);
            
            let productId;
            if (searchResult && searchResult.length > 0) {
                productId = searchResult[0];
                console.log(`[Odoo] Product ${item.PartID} already exists (ID: ${productId})`);
            } else {
                // Create new product
                const productData = {
                    name: item.Name,
                    default_code: item.PartID,
                    type: 'consu', // Goods/Consumable (since 'product' is missing without stock module)
                    categ_id: 1, // Default category, ideally mapped from item.Category
                    list_price: item.UnitPrice || 0,
                    standard_price: item.UnitPrice || 0,
                };
                
                productId = await odoo.execute_kw('product.template', 'create', [productData]);
                console.log(`[Odoo] Created Product ${item.PartID} (ID: ${productId})`);
            }
            odooProductIdMap[item.PartID] = productId;
        }

        // 2. Create BOMs
        // Group relations by parentId
        const bomGroups = {};
        for (const rel of relations) {
            if (!bomGroups[rel.parentId]) bomGroups[rel.parentId] = [];
            bomGroups[rel.parentId].push(rel);
        }

        for (const parentId of Object.keys(bomGroups)) {
            const odooParentId = odooProductIdMap[parentId];
            if (!odooParentId) {
                console.warn(`[Odoo] Skip BOM creation: Parent ${parentId} not found in Odoo.`);
                continue;
            }
            
            // Check if product variant exists (BOM needs product.product, but product_tmpl_id is used for template BOM)
            // Odoo mrp.bom uses product_tmpl_id
            
            // First check if BOM already exists for this template
            const existingBom = await odoo.execute_kw('mrp.bom', 'search', [[['product_tmpl_id', '=', odooParentId]]]);
            let bomId;
            
            if (existingBom && existingBom.length > 0) {
                bomId = existingBom[0];
                console.log(`[Odoo] BOM for ${parentId} already exists (ID: ${bomId})`);
                // Optional: Delete existing lines or update them
            } else {
                // Create BOM Header
                const bomData = {
                    product_tmpl_id: odooParentId,
                    product_qty: 1.0,
                    type: 'normal', // Manufacture
                };
                bomId = await odoo.execute_kw('mrp.bom', 'create', [bomData]);
                console.log(`[Odoo] Created BOM for ${parentId} (ID: ${bomId})`);
            }

            // Create BOM Lines
            const children = bomGroups[parentId];
            for (const child of children) {
                const odooChildId = odooProductIdMap[child.childId];
                if (!odooChildId) continue;
                
                // Need to find the product.product ID for the child, not just template
                const productVariant = await odoo.execute_kw('product.product', 'search', [[['product_tmpl_id', '=', odooChildId]]]);
                if (!productVariant || productVariant.length === 0) continue;
                
                const bomLineData = {
                    bom_id: bomId,
                    product_id: productVariant[0], // mrp.bom.line needs product.product
                    product_qty: child.qty || 1.0,
                };
                
                // Check if line exists
                const existingLine = await odoo.execute_kw('mrp.bom.line', 'search', [[
                    ['bom_id', '=', bomId],
                    ['product_id', '=', productVariant[0]]
                ]]);
                
                if (existingLine && existingLine.length > 0) {
                    // Update qty
                    await odoo.execute_kw('mrp.bom.line', 'write', [[existingLine[0]], { product_qty: child.qty || 1.0 }]);
                } else {
                    await odoo.execute_kw('mrp.bom.line', 'create', [bomLineData]);
                }
            }
        }

        res.json({ success: true, message: 'Odoo DB import completed successfully' });

    } catch (error) {
        console.error('[Odoo Error]', error);
        res.status(500).json({ success: false, error: error.message || 'Odoo connection failed' });
    }
});

export default router;
