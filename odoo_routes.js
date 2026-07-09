import express from 'express';
import OdooClient from './odoo_rpc.js';

const router = express.Router();



router.post('/import-bom', async (req, res) => {
    const { items, relations, overwriteExisting, sessionId } = req.body;
    
    if (!items || !relations) {
        return res.status(400).json({ error: 'items and relations are required' });
    }

    try {
        const ODOO_URL  = process.env.ODOO_URL  || 'http://100.67.238.32:8069';
        const ODOO_DB   = process.env.ODOO_DB   || 'odoo';
        const ODOO_USER = process.env.ODOO_USER;
        const ODOO_PASS = process.env.ODOO_API_KEY;

        if (!sessionId && (!ODOO_USER || !ODOO_PASS)) {
            return res.status(500).json({ error: '세션 정보가 없으며, .env에 ODOO_USER와 ODOO_API_KEY도 설정되어 있지 않습니다.' });
        }

        const odoo = new OdooClient(ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASS, sessionId);
        if (sessionId) {
            console.log('[Odoo] Authenticating with WebView session...');
        } else {
            console.log('[Odoo] Authenticating with API key for user:', ODOO_USER);
        }
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
        
        // Fetch a valid product.category to use as default instead of hardcoding 1
        let defaultCategId = 1;
        try {
            const categories = await odoo.execute_kw('product.category', 'search_read', [[]], { fields: ['id'], limit: 1 });
            if (categories && categories.length > 0) {
                defaultCategId = categories[0].id;
            } else {
                defaultCategId = await odoo.execute_kw('product.category', 'create', [{ name: 'All' }]);
            }
        } catch (catErr) {
            console.log('[Odoo] Warning: Failed to fetch default product category, falling back to 1');
        }
        
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
                    categ_id: defaultCategId,
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
            await chunkedPromiseAll(existingItemsToUpdate, 5, async (item) => {
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
        // ✅ 현재 시트의 items에 포함된 PartID만 부모로 허용
        const currentSheetPartIds = new Set(items.map(item => item.PartID));
        
        const bomGroups = {};
        for (const rel of relations) {
            if (!currentSheetPartIds.has(rel.parentId)) {
                console.log(`[Odoo] Skipping relation: parent ${rel.parentId} not in current sheet.`);
                continue;
            }
            if (!bomGroups[rel.parentId]) bomGroups[rel.parentId] = [];
            bomGroups[rel.parentId].push(rel);
        }
        const parentPartIds = Object.keys(bomGroups);
        const parentOdooIds = parentPartIds.map(pid => odooProductIdMap[pid]).filter(Boolean);

        // ==========================================
        // ✅ 핵심 수정: 각 시트의 루트(최상위) 아이템 식별
        // relations에서 childId로 등장하지 않는 parentId = 이 시트의 루트
        // 루트 아이템: 해당 시트에서 BOM 헤더 + 라인 모두 처리
        // 서브어셈블리: BOM 헤더가 없을 때만 신규 생성, 이미 있으면 라인 추가 금지
        // ==========================================
        const allChildIds = new Set(relations.map(r => r.childId));
        const sheetRootPartIds = new Set(
            parentPartIds.filter(pid => !allChildIds.has(pid))
        );
        console.log(`[Odoo] Sheet root items: ${[...sheetRootPartIds].join(', ')}`);

        if (parentOdooIds.length > 0) {
            // ==========================================
            // 4. Bulk Search for Existing BOMs
            // ==========================================
            console.log(`[Odoo] Bulk searching BOMs for ${parentOdooIds.length} parents...`);
            const existingBoms = await odoo.execute_kw('mrp.bom', 'search_read', [
                [['product_tmpl_id', 'in', parentOdooIds]]
            ], { fields: ['id', 'product_tmpl_id'] });
            
            const bomMap = {}; // product_tmpl_id -> bom_id
            for (const b of existingBoms) {
                bomMap[b.product_tmpl_id[0]] = b.id;
            }
            
            // 이미 BOM이 존재하는 서브어셈블리 PartID 집합
            // (루트가 아닌 서브어셈블리 중 기존 BOM 보유한 것 → 현재 시트에서 라인 추가 금지)
            const subAssemblyWithExistingBom = new Set(
                parentPartIds.filter(pid => {
                    if (sheetRootPartIds.has(pid)) return false; // 루트는 제외
                    const odooId = odooProductIdMap[pid];
                    return odooId && bomMap[odooId]; // 이미 BOM 존재
                })
            );
            if (subAssemblyWithExistingBom.size > 0) {
                console.log(`[Odoo] Skipping BOM line update for existing sub-assemblies: ${[...subAssemblyWithExistingBom].join(', ')}`);
            }

            // ==========================================
            // 5. Bulk Search for Product Variants
            // ==========================================
            const allChildPartIds = relations.map(r => r.childId);
            const childOdooTmplIds = [...new Set(allChildPartIds.map(cid => odooProductIdMap[cid]).filter(Boolean))];
            
            console.log(`[Odoo] Bulk searching variants for ${childOdooTmplIds.length} components...`);
            const variants = await odoo.execute_kw('product.product', 'search_read', [
                [['product_tmpl_id', 'in', childOdooTmplIds]]
            ], { fields: ['id', 'product_tmpl_id'] });
            
            const variantMap = {}; // product_tmpl_id -> product_id
            for (const v of variants) {
                if (!variantMap[v.product_tmpl_id[0]]) variantMap[v.product_tmpl_id[0]] = v.id;
            }

            // ==========================================
            // 6. Bulk Create Missing BOMs
            // ==========================================
            const bomsToCreate = [];
            const pidsWithoutBom = [];
            for (const pid of parentPartIds) {
                // 이미 BOM 있는 서브어셈블리는 신규 BOM 생성 건너뜀
                if (subAssemblyWithExistingBom.has(pid)) continue;
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
                // ✅ 이미 BOM 있는 서브어셈블리는 라인 추가/수정 금지
                if (subAssemblyWithExistingBom.has(parentId)) {
                    console.log(`[Odoo] Skipping BOM lines for existing sub-assembly: ${parentId}`);
                    continue;
                }

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
                await chunkedPromiseAll(linesToUpdate, 5, async (line) => {
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



// ============================================================================
// HR Attendance & Leave API endpoints
// ============================================================================

// Helper to get authenticated Odoo Client
const getOdooClient = async () => {
    const ODOO_URL  = process.env.ODOO_URL  || 'http://100.67.238.32:8069';
    const ODOO_DB   = process.env.ODOO_DB   || 'odoo';
    const ODOO_USER = process.env.ODOO_USER;
    const ODOO_PASS = process.env.ODOO_API_KEY;

    if (!ODOO_USER || !ODOO_PASS) {
        throw new Error('.env에 ODOO_USER와 ODOO_API_KEY가 설정되어 있지 않습니다.');
    }

    const odoo = new OdooClient(ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASS);
    await odoo.authenticate();
    return odoo;
};

// Helper to fetch employee by email
const getEmployeeByEmail = async (odoo, email) => {
    if (!email) throw new Error("Email is required");
    const employees = await odoo.execute_kw('hr.employee', 'search_read', [
        [['work_email', '=', email]]
    ], { fields: ['id', 'name'] });
    if (employees.length === 0) {
        throw new Error(`Employee with email ${email} not found in Odoo`);
    }
    return employees[0];
};

router.get('/attendance/today', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ error: 'Email query parameter is required' });

        const odoo = await getOdooClient();
        const employee = await getEmployeeByEmail(odoo, email);

        // Find today's attendance for this employee
        // We look for any record where check_in is today (UTC)
        const todayStr = new Date().toISOString().split('T')[0];
        const attendances = await odoo.execute_kw('hr.attendance', 'search_read', [
            [
                ['employee_id', '=', employee.id],
                ['check_in', '>=', `${todayStr} 00:00:00`]
            ]
        ], { fields: ['id', 'check_in', 'check_out'], order: 'check_in desc', limit: 1 });

        if (attendances.length > 0) {
            res.json(attendances[0]);
        } else {
            res.json(null);
        }
    } catch (err) {
        console.error('[Odoo] /attendance/today Error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/attendance/check-in', async (req, res) => {
    try {
        const { email } = req.body;
        const odoo = await getOdooClient();
        const employee = await getEmployeeByEmail(odoo, email);

        // check if already checked in (no checkout)
        const openAtt = await odoo.execute_kw('hr.attendance', 'search_read', [
            [['employee_id', '=', employee.id], ['check_out', '=', false]]
        ], { limit: 1 });

        if (openAtt.length > 0) {
            return res.status(400).json({ error: 'Already checked in' });
        }

        // Create hr.attendance
        // Note: Odoo hr.attendance automatically uses the current UTC time for check_in if not provided,
        // but we can pass it explicitly. For now, we'll let Odoo set the time if possible, or pass it.
        const checkInTimeStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const newId = await odoo.execute_kw('hr.attendance', 'create', [{
            employee_id: employee.id,
            check_in: checkInTimeStr
        }]);

        res.json({ success: true, id: newId, check_in: checkInTimeStr });
    } catch (err) {
        console.error('[Odoo] /attendance/check-in Error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/attendance/check-out', async (req, res) => {
    try {
        const { email } = req.body;
        const odoo = await getOdooClient();
        const employee = await getEmployeeByEmail(odoo, email);

        // Find open attendance
        const openAtt = await odoo.execute_kw('hr.attendance', 'search_read', [
            [['employee_id', '=', employee.id], ['check_out', '=', false]]
        ], { fields: ['id'] });

        if (openAtt.length === 0) {
            return res.status(400).json({ error: 'No active check-in found' });
        }

        const attId = openAtt[0].id;
        const checkOutTimeStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
        await odoo.execute_kw('hr.attendance', 'write', [
            [attId],
            { check_out: checkOutTimeStr }
        ]);

        res.json({ success: true, id: attId, check_out: checkOutTimeStr });
    } catch (err) {
        console.error('[Odoo] /attendance/check-out Error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/leave/request', async (req, res) => {
    try {
        const { email, title, reason, startDate, endDate, category, type } = req.body;
        const odoo = await getOdooClient();
        const employee = await getEmployeeByEmail(odoo, email);

        // Map Category/Type to Odoo Time Off Type (hr.leave.type)
        // We will try to find a type matching the requested 'type' or just use the first available type.
        let leaveTypeId = null;
        
        // Search by name
        const leaveTypes = await odoo.execute_kw('hr.leave.type', 'search_read', [
            [['name', 'ilike', type]]
        ], { fields: ['id', 'name'], limit: 1 });

        if (leaveTypes.length > 0) {
            leaveTypeId = leaveTypes[0].id;
        } else {
            // Fallback to any active leave type
            const anyLeaveType = await odoo.execute_kw('hr.leave.type', 'search_read', [
                [['active', '=', true]]
            ], { fields: ['id', 'name'], limit: 1 });
            
            if (anyLeaveType.length > 0) {
                leaveTypeId = anyLeaveType[0].id;
            } else {
                throw new Error("No active Leave Types (hr.leave.type) found in Odoo.");
            }
        }

        // Create hr.leave
        const payload = {
            employee_id: employee.id,
            holiday_status_id: leaveTypeId,
            request_date_from: startDate,
            request_date_to: endDate,
            name: `[${category}] ${title} - ${reason || '사유 없음'}`,
        };

        if (type === 'Hourly' && req.body.startTime && req.body.endTime) {
            payload.request_unit_hours = true;
            const sH = parseInt(req.body.startTime.split(':')[0], 10);
            const sM = parseInt(req.body.startTime.split(':')[1], 10);
            const eH = parseInt(req.body.endTime.split(':')[0], 10);
            const eM = parseInt(req.body.endTime.split(':')[1], 10);
            payload.request_hour_from = (sH + sM / 60).toString();
            payload.request_hour_to = (eH + eM / 60).toString();
        }

        const newId = await odoo.execute_kw('hr.leave', 'create', [payload]);

        // Attempt to confirm the leave so it moves out of draft to "To Approve" state
        try {
            await odoo.execute_kw('hr.leave', 'action_confirm', [[newId]]);
        } catch (statusErr) {
            console.log("Could not auto-confirm leave:", statusErr.message);
        }

        res.json({ success: true, id: newId });
    } catch (err) {
        console.error('[Odoo] /leave/request Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- New endpoints added for Leave Management ---

router.get('/leave/balance', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ error: 'Email query parameter is required' });

        const odoo = await getOdooClient();
        const employee = await getEmployeeByEmail(odoo, email);

        const allocations = await odoo.execute_kw('hr.leave.allocation', 'search_read', [
            [['employee_id', '=', employee.id], ['state', '=', 'validate']]
        ], { fields: ['number_of_days'] });
        const total = allocations.reduce((sum, a) => sum + (a.number_of_days || 0), 0);

        const leaves = await odoo.execute_kw('hr.leave', 'search_read', [
            [['employee_id', '=', employee.id], ['state', '=', 'validate']]
        ], { fields: ['number_of_days'] });
        const used = leaves.reduce((sum, l) => sum + (l.number_of_days || 0), 0);

        const remaining = total - used;
        const remainingHours = remaining * 8; 

        res.json({ total, used, remaining, remainingHours });
    } catch (err) {
        console.error('[Odoo] /leave/balance Error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/attendance/stats', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ error: 'Email query parameter is required' });

        const odoo = await getOdooClient();
        const employee = await getEmployeeByEmail(odoo, email);

        const now = new Date();
        const dayOfWeek = now.getDay() || 7; 
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - dayOfWeek + 1);
        startOfWeek.setHours(0, 0, 0, 0);

        const attendances = await odoo.execute_kw('hr.attendance', 'search_read', [
            [
                ['employee_id', '=', employee.id],
                ['check_in', '>=', startOfWeek.toISOString().split('T')[0] + ' 00:00:00']
            ]
        ], { fields: ['worked_hours'] });

        const weeklyWorked = attendances.reduce((sum, att) => sum + (att.worked_hours || 0), 0);
        
        const limit = 40;
        const overtime = Math.max(0, weeklyWorked - limit);
        const remaining = Math.max(0, limit - weeklyWorked);

        res.json({
            weekly: Math.round(weeklyWorked * 10) / 10,
            limit,
            accumulated: Math.round(weeklyWorked * 10) / 10, 
            remaining: Math.round(remaining * 10) / 10,
            overtime: Math.round(overtime * 10) / 10
        });
    } catch (err) {
        console.error('[Odoo] /attendance/stats Error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/leave/my-requests', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ error: 'Email query parameter is required' });

        const odoo = await getOdooClient();
        const employee = await getEmployeeByEmail(odoo, email);

        const leaves = await odoo.execute_kw('hr.leave', 'search_read', [
            [['employee_id', '=', employee.id]]
        ], { 
            fields: ['id', 'name', 'state', 'request_date_from', 'request_date_to', 'number_of_days', 'holiday_status_id'],
            order: 'create_date desc'
        });

        const formatted = leaves.map(l => ({
            id: l.id,
            title: l.name || (l.holiday_status_id ? l.holiday_status_id[1] : 'Leave'),
            startDate: l.request_date_from,
            endDate: l.request_date_to,
            totalDays: l.number_of_days,
            Status: l.state === 'validate' ? 'Approved' : l.state === 'refuse' ? 'Rejected' : 'Pending',
            OdooState: l.state,
            category: 'Leave',
            userName: employee.name,
            createdAt: l.request_date_from 
        }));

        res.json(formatted);
    } catch (err) {
        console.error('[Odoo] /leave/my-requests Error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/leave/pending-approvals', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const odoo = await getOdooClient();
        
        const users = await odoo.execute_kw('res.users', 'search_read', [
            [['login', '=', email]]
        ], { fields: ['id'] });

        if (users.length === 0) return res.json([]);

        // Simplistic approach: Just fetch leaves in "confirm" state (To Approve)
        const leaves = await odoo.execute_kw('hr.leave', 'search_read', [
            [['state', 'in', ['confirm', 'validate1']]]
        ], { 
            fields: ['id', 'name', 'state', 'request_date_from', 'request_date_to', 'number_of_days', 'employee_id']
        });

        const formatted = leaves.map(l => ({
            id: l.id,
            title: l.name || 'Leave Request',
            startDate: l.request_date_from,
            endDate: l.request_date_to,
            totalDays: l.number_of_days,
            userName: l.employee_id ? l.employee_id[1] : 'Unknown',
            Status: 'Pending',
            OdooState: l.state,
            category: 'Leave',
            userId: l.employee_id ? l.employee_id[0] : null,
            approverUid: users[0].id // to mock the frontend condition
        }));

        res.json(formatted);
    } catch (err) {
        console.error('[Odoo] /leave/pending-approvals Error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/leave/all-events', async (req, res) => {
    try {
        const odoo = await getOdooClient();
        const leaves = await odoo.execute_kw('hr.leave', 'search_read', [
            [['state', '=', 'validate']]
        ], { 
            fields: ['id', 'name', 'request_date_from', 'request_date_to', 'employee_id']
        });

        const formatted = leaves.map(l => ({
            id: l.id,
            title: l.name || 'Leave',
            startDate: l.request_date_from,
            endDate: l.request_date_to,
            userName: l.employee_id ? l.employee_id[1] : 'Unknown',
            department: '', 
            category: 'Leave'
        }));

        res.json(formatted);
    } catch (err) {
        console.error('[Odoo] /leave/all-events Error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/leave/approve', async (req, res) => {
    try {
        const { leaveId } = req.body;
        const odoo = await getOdooClient();
        
        await odoo.execute_kw('hr.leave', 'action_approve', [[parseInt(leaveId)]]);
        res.json({ success: true });
    } catch (err) {
        console.error('[Odoo] /leave/approve Error:', err);
        try {
            const odoo = await getOdooClient();
            await odoo.execute_kw('hr.leave', 'action_validate', [[parseInt(req.body.leaveId)]]);
            res.json({ success: true });
        } catch (e2) {
            res.status(500).json({ error: err.message });
        }
    }
});

router.post('/leave/refuse', async (req, res) => {
    try {
        const { leaveId } = req.body;
        const odoo = await getOdooClient();
        await odoo.execute_kw('hr.leave', 'action_refuse', [[parseInt(leaveId)]]);
        res.json({ success: true });
    } catch (err) {
        console.error('[Odoo] /leave/refuse Error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
