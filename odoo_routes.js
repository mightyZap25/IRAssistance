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
        const ODOO_USER = process.env.ODOO_USER || 'jogak@mightyzap.com';
        const ODOO_PASS = process.env.ODOO_PASS || 'jogak0622#';

        const odoo = new OdooClient(ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASS);
        console.log('[Odoo] Authenticating...');
        await odoo.authenticate();
        console.log('[Odoo] Authenticated successfully. UID:', odoo.uid);

        const odooProductIdMap = {}; // PartID -> Odoo Product ID

        // ==========================================
        // 1. Bulk Search for Existing Products
        // ==========================================
        const partIds = items.map(item => item.PartID).filter(Boolean);
        const uniquePartIds = [...new Set(partIds)];
        
        console.log(`[Odoo] Bulk searching ${uniquePartIds.length} products...`);
        const existingProducts = await odoo.execute_kw('product.template', 'search_read', [
            [['default_code', 'in', uniquePartIds]]
        ], { fields: ['id', 'default_code'] });
        
        for (const p of existingProducts) {
            odooProductIdMap[p.default_code] = p.id;
        }

        // ==========================================
        // 2. Parallel Creation of Missing Products
        // ==========================================
        const missingItems = items.filter(item => !odooProductIdMap[item.PartID]);
        console.log(`[Odoo] Found ${existingProducts.length} existing, creating ${missingItems.length} missing products...`);
        
        // Helper to run promises in chunks (concurrency limit) for safety
        const chunkedPromiseAll = async (items, concurrency, fn) => {
            const results = [];
            for (let i = 0; i < items.length; i += concurrency) {
                const chunk = items.slice(i, i + concurrency);
                const chunkResults = await Promise.all(chunk.map(fn));
                results.push(...chunkResults);
            }
            return results;
        };

        await chunkedPromiseAll(missingItems, 10, async (item) => {
            const productData = {
                name: item.Name,
                default_code: item.PartID,
                type: 'consu',
                categ_id: 1,
                list_price: item.UnitPrice || 0,
                standard_price: item.UnitPrice || 0,
            };
            const productId = await odoo.execute_kw('product.template', 'create', [productData]);
            odooProductIdMap[item.PartID] = productId;
            console.log(`[Odoo] Created Product ${item.PartID} (ID: ${productId})`);
        });

        // ==========================================
        // 3. Group BOM Relations
        // ==========================================
        const bomGroups = {};
        for (const rel of relations) {
            if (!bomGroups[rel.parentId]) bomGroups[rel.parentId] = [];
            bomGroups[rel.parentId].push(rel);
        }
        const parentPartIds = Object.keys(bomGroups);
        const parentOdooIds = parentPartIds.map(pid => odooProductIdMap[pid]).filter(Boolean);

        if (parentOdooIds.length > 0) {
            // ==========================================
            // 4. Bulk Search for Existing BOMs
            // ==========================================
            console.log(`[Odoo] Bulk searching BOMs for ${parentOdooIds.length} parents...`);
            const existingBoms = await odoo.execute_kw('mrp.bom', 'search_read', [
                [['product_tmpl_id', 'in', parentOdooIds]]
            ], { fields: ['id', 'product_tmpl_id'] });
            
            const bomMap = {}; // product_tmpl_id[0] -> bom_id
            for (const b of existingBoms) {
                bomMap[b.product_tmpl_id[0]] = b.id;
            }

            // ==========================================
            // 5. Bulk Search for Product Variants
            // ==========================================
            // We need variant IDs (product.product) for all children to create BOM lines.
            const allChildPartIds = relations.map(r => r.childId);
            const childOdooTmplIds = [...new Set(allChildPartIds.map(cid => odooProductIdMap[cid]).filter(Boolean))];
            
            console.log(`[Odoo] Bulk searching variants for ${childOdooTmplIds.length} components...`);
            const variants = await odoo.execute_kw('product.product', 'search_read', [
                [['product_tmpl_id', 'in', childOdooTmplIds]]
            ], { fields: ['id', 'product_tmpl_id'] });
            
            const variantMap = {}; // product_tmpl_id[0] -> product_id
            for (const v of variants) {
                // Take the first variant if multiple exist
                if (!variantMap[v.product_tmpl_id[0]]) variantMap[v.product_tmpl_id[0]] = v.id;
            }

            // ==========================================
            // 6. Process BOMs and Lines (Safe Parallel Execution)
            // ==========================================
            await chunkedPromiseAll(parentPartIds, 5, async (parentId) => {
                const odooParentId = odooProductIdMap[parentId];
                if (!odooParentId) return;
                
                let bomId = bomMap[odooParentId];
                if (!bomId) {
                    const bomData = {
                        product_tmpl_id: odooParentId,
                        product_qty: 1.0,
                        type: 'normal',
                    };
                    bomId = await odoo.execute_kw('mrp.bom', 'create', [bomData]);
                }

                // Get existing BOM lines for this BOM
                const existingLines = await odoo.execute_kw('mrp.bom.line', 'search_read', [
                    [['bom_id', '=', bomId]]
                ], { fields: ['id', 'product_id'] });
                
                const existingLineMap = {}; // product_id[0] -> line_id
                for (const l of existingLines) {
                    existingLineMap[l.product_id[0]] = l.id;
                }

                const children = bomGroups[parentId];
                for (const child of children) {
                    const odooChildId = odooProductIdMap[child.childId];
                    if (!odooChildId) continue;
                    
                    const variantId = variantMap[odooChildId];
                    if (!variantId) continue;
                    
                    if (existingLineMap[variantId]) {
                        // Safe to skip write if we assume qty hasn't changed, 
                        // but to be safe we update qty
                        await odoo.execute_kw('mrp.bom.line', 'write', [[existingLineMap[variantId]], { product_qty: child.qty || 1.0 }]);
                    } else {
                        await odoo.execute_kw('mrp.bom.line', 'create', [{
                            bom_id: bomId,
                            product_id: variantId,
                            product_qty: child.qty || 1.0,
                        }]);
                    }
                }
            });
        }

        res.json({ success: true, message: 'Odoo DB import completed successfully' });

    } catch (error) {
        console.error('[Odoo Error]', error);
        res.status(500).json({ success: false, error: error.message || 'Odoo connection failed' });
    }
});

export default router;
