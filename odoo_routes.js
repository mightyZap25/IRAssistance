import express from 'express';
import OdooClient from './odoo_rpc.js';

const router = express.Router();



router.post('/import-bom', async (req, res) => {
    const { items, relations, overwriteExisting } = req.body;
    
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
        // 1.5 Handle Suppliers/Manufacturers (res.partner)
        // ==========================================
        const partnerNames = new Set();
        items.forEach(item => {
            if (item.Supplier) partnerNames.add(item.Supplier.trim());
            if (item.Manufacturer) partnerNames.add(item.Manufacturer.trim());
        });
        const uniquePartnerNames = [...partnerNames].filter(Boolean);
        const partnerMap = {}; // Name -> res.partner ID
        
        if (uniquePartnerNames.length > 0) {
            console.log(`[Odoo] Resolving ${uniquePartnerNames.length} partners...`);
            const existingPartners = await odoo.execute_kw('res.partner', 'search_read', [
                [['name', 'in', uniquePartnerNames]]
            ], { fields: ['id', 'name'] });
            
            for (const p of existingPartners) {
                partnerMap[p.name] = p.id;
            }
            
            const missingPartners = uniquePartnerNames.filter(name => !partnerMap[name]);
            if (missingPartners.length > 0) {
                console.log(`[Odoo] Creating ${missingPartners.length} missing partners...`);
                for (const name of missingPartners) {
                    const pid = await odoo.execute_kw('res.partner', 'create', [{ name, is_company: true }]);
                    partnerMap[name] = pid;
                }
            }
        }

        // ==========================================
        // 1.6 Parse Product Specs and Resolve Relational Models
        // ==========================================
        const seriesSet = new Set();
        const commTypeSet = new Set();
        const strokeSet = new Set();

        items.forEach(item => {
            if (item.Class && item.Class.includes('Product')) {
                // Try parsing Name or Spec
                let targetStr = item.Name || '';
                let match = targetStr.match(/^([A-Za-z0-9]+)-([0-9]+)([A-Za-z]*)-([0-9]+)$/);
                if (!match) {
                    targetStr = item.Spec || '';
                    match = targetStr.match(/^([A-Za-z0-9]+)-([0-9]+)([A-Za-z]*)-([0-9]+)$/);
                }

                if (match) {
                    item._isActuator = true;
                    item._series = match[1];
                    item._ratedLoad = match[2]; // we don't have x_rated_load yet, so we ignore it or append to note
                    const commRaw = match[3] || '';
                    if (commRaw.toLowerCase() === 'f') item._commType = 'RS485';
                    else if (commRaw.toLowerCase() === 'pt') item._commType = 'PWM/TTL';
                    else if (commRaw.toLowerCase() === 's') item._commType = 'Switch';
                    else item._commType = 'Feedback';
                    item._stroke = match[4];

                    seriesSet.add(item._series);
                    commTypeSet.add(item._commType);
                    strokeSet.add(item._stroke);
                }
            }
        });

        // Helper to resolve custom dictionaries in Odoo
        const resolveCustomDict = async (modelName, stringSet) => {
            const arr = [...stringSet].filter(Boolean);
            const map = {};
            if (arr.length === 0) return map;
            
            const existing = await odoo.execute_kw(modelName, 'search_read', [
                [['name', 'in', arr]]
            ], { fields: ['id', 'name'] });
            
            for (const r of existing) map[r.name] = r.id;
            
            const missing = arr.filter(n => !map[n]);
            for (const name of missing) {
                const newId = await odoo.execute_kw(modelName, 'create', [{ name }]);
                map[name] = newId;
            }
            return map;
        };

        const seriesMap = await resolveCustomDict('ir.custom.series', seriesSet);
        const commTypeMap = await resolveCustomDict('ir.custom.comm.type', commTypeSet);
        const strokeMap = await resolveCustomDict('ir.custom.stroke.type', strokeSet);

        // ==========================================
        // 2. Bulk Creation of Missing Products
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

        if (missingItems.length > 0) {
            const productsToCreate = missingItems.map(item => {
                const isProductOrAssembly = item.Class && (item.Class.includes('Product') || item.Class.includes('Assembly'));
                const productData = {
                    name: item.Name,
                    default_code: item.PartID,
                    type: 'consu',
                    is_storable: true,
                    sale_ok: isProductOrAssembly,
                    purchase_ok: !isProductOrAssembly,
                    categ_id: 1,
                    list_price: item.UnitPrice || 0,
                    standard_price: item.UnitPrice || 0,
                    x_maker: (item.Supplier && partnerMap[item.Supplier.trim()]) ? partnerMap[item.Supplier.trim()] : false,
                    x_manufacturer: (item.Manufacturer && partnerMap[item.Manufacturer.trim()]) ? partnerMap[item.Manufacturer.trim()] : false,
                    x_owner: item.Owner || '',
                    x_category: (item.Category || '').replace(/\s+\(/g, '('),
                    x_class: item.Class || '',
                    x_part_type_code: item.PartTypeCode || '',
                };
                
                if (item._isActuator) {
                    productData.x_finished_category = 'actuator';
                    productData.x_series_id = seriesMap[item._series] || false;
                    productData.x_comm_type_id = commTypeMap[item._commType] || false;
                    productData.x_stroke_type_id = strokeMap[item._stroke] || false;
                    if (item._ratedLoad) {
                        productData.x_mfg_extra_notes = `Rated Load: ${item._ratedLoad}`;
                    }
                }
                return productData;
            });
            
            console.log(`[Odoo] Bulk creating ${productsToCreate.length} products in one API call...`);
            const createdIds = await odoo.execute_kw('product.template', 'create', [productsToCreate]);
            
            missingItems.forEach((item, idx) => {
                odooProductIdMap[item.PartID] = createdIds[idx];
                console.log(`[Odoo] Created Product ${item.PartID} (ID: ${createdIds[idx]})`);
            });
        }

        // ==========================================
        // 2.5 Parallel Update of Existing Products
        // ==========================================
        if (overwriteExisting) {
            const existingItemsToUpdate = items.filter(item => odooProductIdMap[item.PartID] && missingItems.findIndex(m => m.PartID === item.PartID) === -1);
            console.log(`[Odoo] Overwriting ${existingItemsToUpdate.length} existing products...`);
            await chunkedPromiseAll(existingItemsToUpdate, 20, async (item) => {
                const productId = odooProductIdMap[item.PartID];
                const isProductOrAssembly = item.Class && (item.Class.includes('Product') || item.Class.includes('Assembly'));

                const updateData = {
                    name: item.Name,
                    sale_ok: isProductOrAssembly,
                    purchase_ok: !isProductOrAssembly,
                    list_price: item.UnitPrice || 0,
                    standard_price: item.UnitPrice || 0,
                    x_maker: (item.Supplier && partnerMap[item.Supplier.trim()]) ? partnerMap[item.Supplier.trim()] : false,
                    x_manufacturer: (item.Manufacturer && partnerMap[item.Manufacturer.trim()]) ? partnerMap[item.Manufacturer.trim()] : false,
                    x_owner: item.Owner || '',
                    x_category: (item.Category || '').replace(/\s+\(/g, '('),
                    x_class: item.Class || '',
                    x_part_type_code: item.PartTypeCode || '',
                };

                if (item._isActuator) {
                    updateData.x_finished_category = 'actuator';
                    updateData.x_series_id = seriesMap[item._series] || false;
                    updateData.x_comm_type_id = commTypeMap[item._commType] || false;
                    updateData.x_stroke_type_id = strokeMap[item._stroke] || false;
                    if (item._ratedLoad) {
                        updateData.x_mfg_extra_notes = `Rated Load: ${item._ratedLoad}`;
                    }
                }
                await odoo.execute_kw('product.template', 'write', [[productId], updateData]);
                console.log(`[Odoo] Updated Product ${item.PartID} (ID: ${productId})`);
            });
        }

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
            // 6. Bulk Create Missing BOMs
            // ==========================================
            const bomsToCreate = [];
            const pidsWithoutBom = [];
            for (const pid of parentPartIds) {
                const odooId = odooProductIdMap[pid];
                if (odooId && !bomMap[odooId]) {
                    bomsToCreate.push({
                        product_tmpl_id: odooId,
                        product_qty: 1.0,
                        type: 'normal',
                    });
                    pidsWithoutBom.push(pid);
                }
            }
            if (bomsToCreate.length > 0) {
                console.log(`[Odoo] Bulk creating ${bomsToCreate.length} BOMs...`);
                const createdBomIds = await odoo.execute_kw('mrp.bom', 'create', [bomsToCreate]);
                for (let i = 0; i < pidsWithoutBom.length; i++) {
                    bomMap[odooProductIdMap[pidsWithoutBom[i]]] = createdBomIds[i];
                }
            }

            // ==========================================
            // 7. Bulk Process BOM Lines
            // ==========================================
            const allBomIds = Object.values(bomMap);
            console.log(`[Odoo] Fetching existing lines for ${allBomIds.length} BOMs...`);
            const allExistingLines = await odoo.execute_kw('mrp.bom.line', 'search_read', [
                [['bom_id', 'in', allBomIds]]
            ], { fields: ['id', 'bom_id', 'product_id'] });
            
            const existingLineMap = {}; // "bomId_productId" -> line_id
            for (const l of allExistingLines) {
                existingLineMap[`${l.bom_id[0]}_${l.product_id[0]}`] = l.id;
            }

            const linesToCreate = [];
            const linesToUpdate = [];

            for (const parentId of parentPartIds) {
                const odooParentId = odooProductIdMap[parentId];
                if (!odooParentId) continue;
                
                const bomId = bomMap[odooParentId];
                if (!bomId) continue;

                const children = bomGroups[parentId];
                for (const child of children) {
                    const odooChildId = odooProductIdMap[child.childId];
                    if (!odooChildId) continue;
                    
                    const variantId = variantMap[odooChildId];
                    if (!variantId) continue;
                    
                    const safeQty = parseFloat(child.qty) > 0 ? parseFloat(child.qty) : 0.001;
                    const lineKey = `${bomId}_${variantId}`;
                    const existingLineId = existingLineMap[lineKey];
                    
                    if (existingLineId) {
                        linesToUpdate.push({ id: existingLineId, product_qty: safeQty });
                    } else {
                        linesToCreate.push({
                            bom_id: bomId,
                            product_id: variantId,
                            product_qty: safeQty,
                        });
                    }
                }
            }

            if (linesToCreate.length > 0) {
                console.log(`[Odoo] Bulk creating ${linesToCreate.length} BOM lines...`);
                await odoo.execute_kw('mrp.bom.line', 'create', [linesToCreate]);
            }

            if (linesToUpdate.length > 0) {
                console.log(`[Odoo] Overwriting ${linesToUpdate.length} BOM lines...`);
                await chunkedPromiseAll(linesToUpdate, 20, async (line) => {
                    await odoo.execute_kw('mrp.bom.line', 'write', [[line.id], { product_qty: line.product_qty }]);
                });
            }
        }

        res.json({ success: true, message: 'Odoo DB import completed successfully' });

    } catch (error) {
        console.error('[Odoo Error]', error);
        res.status(500).json({ success: false, error: error.message || 'Odoo connection failed' });
    }
});

export default router;
