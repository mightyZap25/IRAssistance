const fs = require('fs');
const file = './src/components/BOMImportModal.jsx';
let content = fs.readFileSync(file, 'utf8');

// Disable fetchSheetsList logic
content = content.replace(/fetchSheetsList\(spId\);/g, '// fetchSheetsList(spId);');

// Replace handleFetchAndParse entirely
const handleFetchAndParseRegex = /const handleFetchAndParse = async \(\) => \{[\s\S]*?(\n    };\n\n    \/\/ Execute Bottom-Up import)/;

const newHandleFetchAndParse = `const handleFetchAndParse = async () => {
        if (!sheetUrl) {
            setError("올바른 구글 시트 주소를 입력하세요.");
            return;
        }

        setLoading(true);
        setLoadingStatus('구글 시트 데이터를 다운로드하고 있습니다...');
        setError('');
        
        try {
            let csvUrl = sheetUrl;
            if (sheetUrl.includes('/edit')) {
                csvUrl = sheetUrl.split('/edit')[0] + '/export?format=csv';
                if (sheetUrl.includes('gid=')) {
                    const gid = sheetUrl.split('gid=')[1]?.split('&')[0];
                    if (gid) csvUrl += \`&gid=\${gid}\`;
                }
            }

            console.log("[BOMImport] Fetching CSV:", csvUrl);
            const res = await fetch(csvUrl);
            if (!res.ok) throw new Error(\`HTTP Error: \${res.status} - 시트가 공개되어 있는지 확인하세요.\`);
            const text = await res.text();

            // Parse CSV
            const lines = [];
            let rowObj = [""];
            let inQuotes = false;
            for (let i = 0; i < text.length; i++) {
                const c = text[i];
                const next = text[i+1];
                if (c === '"') {
                    if (inQuotes && next === '"') {
                        rowObj[rowObj.length - 1] += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (c === ',' && !inQuotes) {
                    rowObj.push("");
                } else if ((c === '\\r' || c === '\\n') && !inQuotes) {
                    if (c === '\\r' && next === '\\n') i++;
                    lines.push(rowObj);
                    rowObj = [""];
                } else {
                    rowObj[rowObj.length - 1] += c;
                }
            }
            if (rowObj.length > 1 || rowObj[0] !== "") lines.push(rowObj);

            if (lines.length === 0) {
                throw new Error("파싱된 데이터가 없습니다. 시트 양식을 확인해 주세요.");
            }

            const rows = lines;

            const parsedAccumulated = [];
            const relationsAccumulated = [];
            const seenPartIds = new Set();
            const seenRelations = new Set();

            // Find Header Row
            let headerRowIdx = -1;
            for (let i = 0; i < rows.length; i++) {
                const rowStr = rows[i].map(c => String(c || '').toLowerCase()).join(' ');
                if (rowStr.includes('part number') || rowStr.includes('partname') || rowStr.includes('assy /')) {
                    headerRowIdx = i;
                    break;
                }
            }

            if (headerRowIdx === -1) {
                headerRowIdx = 0;
            }

            const headers = rows[headerRowIdx].map(h => String(h || '').trim());
            
            // Map headers to column indices
            const colMap = {
                category: headers.findIndex(h => h.toLowerCase().includes('category')),
                partId: headers.findIndex(h => h.toLowerCase().includes('part number') || h.toLowerCase().includes('partid') || h.toLowerCase().includes('part id')),
                rev: headers.findIndex(h => h.toLowerCase().includes('rev')),
                name: headers.findIndex(h => h.toLowerCase().includes('part name') || h.toLowerCase().includes('partname')),
                assyPart: headers.findIndex(h => h.toLowerCase().includes('assy') || h.toLowerCase().includes('class')),
                qty: headers.findIndex(h => h.toLowerCase().includes("q'ty") || h.toLowerCase().includes('qty') || h.toLowerCase().includes('quantity')),
                location: headers.findIndex(h => h.toLowerCase().includes('location') || h.toLowerCase().includes('e-comp')),
                manufacturer: headers.findIndex(h => h.toLowerCase().includes('manufacturer') || h.toLowerCase().includes('maker')),
                supplier: headers.findIndex(h => h.toLowerCase().includes('supplier')),
                unitPrice: headers.findIndex(h => h.toLowerCase().includes('unit price') || h.toLowerCase().includes('price')),
                spec: headers.findIndex(h => h.toLowerCase().includes('manufacturer no') || h.toLowerCase().includes('mfn') || h.toLowerCase().includes('spec')),
            };

            if (colMap.category === -1) colMap.category = 9;
            if (colMap.partId === -1) colMap.partId = 10;
            if (colMap.rev === -1) colMap.rev = 11;
            if (colMap.name === -1) colMap.name = 12;
            if (colMap.assyPart === -1) colMap.assyPart = 14;
            if (colMap.qty === -1) colMap.qty = 15;
            if (colMap.location === -1) colMap.location = 20;
            if (colMap.manufacturer === -1) colMap.manufacturer = 18;
            if (colMap.supplier === -1) colMap.supplier = 17;
            if (colMap.unitPrice === -1) colMap.unitPrice = 21;
            if (colMap.spec === -1) colMap.spec = 19;

            const parentStack = [];
            let parsedCountInTab = 0;

            for (let i = headerRowIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;

                const partIdRaw = row[colMap.partId];
                if (!partIdRaw) continue;
                const partId = String(partIdRaw).trim();
                if (!partId || partId.toLowerCase() === 'n/a') continue;

                let level = -1;
                for (let col = 0; col < 9; col++) {
                    if (row[col] !== undefined && String(row[col]).trim() !== '') {
                        level = col + 1;
                        break;
                    }
                }

                if (level === -1) continue;

                const name = String(row[colMap.name] || '').trim();
                const categoryRaw = String(row[colMap.category] || '').trim();
                const rev = String(row[colMap.rev] || '1.0').trim();
                
                const assyPartText = String(row[colMap.assyPart] || '').trim().toUpperCase();
                const isAssembly = assyPartText.startsWith('A') || assyPartText.includes('ASSY') || partId.startsWith('IRA') || partId.startsWith('IRP');
                
                let partClass = 'Part (I)';
                if (isAssembly) {
                    if (parsedCountInTab === 0) {
                        partClass = 'Product (P)';
                    } else {
                        partClass = 'Assembly (A)';
                    }
                }
                
                const qtyRaw = String(row[colMap.qty] || '1').replace(/,/g, '');
                const qty = parseFloat(qtyRaw) || 1;

                const location = String(row[colMap.location] || '').trim();
                const manufacturer = String(row[colMap.manufacturer] || '').trim();
                const supplier = String(row[colMap.supplier] || '').trim();
                
                const priceRaw = String(row[colMap.unitPrice] || '0').replace(/[^0-9.]/g, '');
                const unitPrice = parseFloat(priceRaw) || 0;
                
                const spec = String(row[colMap.spec] || '').trim();

                const itemData = {
                    PartID: partId,
                    Name: name || 'Unnamed Item',
                    Category: categoryRaw || (isAssembly ? (parsedCountInTab === 0 ? '완제품' : '조립품') : '구매품'),
                    Class: partClass,
                    Rev: rev,
                    Location: location,
                    Manufacturer: manufacturer,
                    Supplier: supplier,
                    UnitPrice: unitPrice,
                    Spec: spec,
                    Level: level
                };

                if (!seenPartIds.has(partId)) {
                    seenPartIds.add(partId);
                    parsedAccumulated.push(itemData);
                }
                parsedCountInTab++;

                while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= level) {
                    parentStack.pop();
                }

                if (parentStack.length > 0) {
                    const parent = parentStack[parentStack.length - 1];
                    const relKey = \`\${parent.partId}_\${partId}\`;
                    if (!seenRelations.has(relKey)) {
                        seenRelations.add(relKey);
                        relationsAccumulated.push({
                            parentId: parent.partId,
                            childId: partId,
                            qty: qty,
                            location: location,
                            note: \`Lv \${level}\`
                        });
                    }
                }

                parentStack.push({ partId: partId, level: level });
            }

            // Match against existing parts
            setLoadingStatus('데이터베이스 기존 부품 목록과 매핑 및 정합성 검증 중입니다...');
            const statusMap = {};
            const existingMap = {};
            existingPartsList.forEach(p => {
                existingMap[p.PartID] = p;
            });

            parsedAccumulated.forEach(item => {
                const exist = existingMap[item.PartID];
                if (exist) {
                    statusMap[item.PartID] = {
                        exists: true,
                        data: exist,
                        isNew: false
                    };
                } else {
                    statusMap[item.PartID] = {
                        exists: false,
                        data: item,
                        isNew: true
                    };
                }
            });

            setParsedItems(parsedAccumulated);
            setBomRelations(relationsAccumulated);
            setPartStatusMap(statusMap);
            setStep(2); // Go to Preview

        } catch (err) {
            console.error("Fetch and Parse Error:", err);
            setError(err.message || "시트를 분석하는 도중 오류가 발생했습니다. 링크가 공유되었는지 확인하세요.");
        } finally {
            setLoading(false);
        }
$1`;

content = content.replace(handleFetchAndParseRegex, newHandleFetchAndParse);
fs.writeFileSync(file, content, 'utf8');
console.log('Patched BOMImportModal.jsx');
