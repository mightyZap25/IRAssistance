/**
 * supplierAutoRegister.js
 *
 * Part 또는 BOM 저장 시 부품에 포함된 공급사(Maker/Supplier)와
 * 제조사(Manufacturer) 이름을 대소문자 무시 검색하여
 * 아직 등록되지 않은 경우에만 자동으로 신규 등록합니다.
 *
 * 사용처:
 *  - PartFormModal.jsx (신규 등록 / 편집 저장 후)
 *  - BOMImportModal.jsx (구글 시트 BOM 가져오기 커밋 후)
 */

import { collection, getDocs, addDoc, serverTimestamp } from '../firebase';
import { db } from '../firebase';

/**
 * 문자열 배열 중 DB에 없는 항목만 필터링하여 반환 (대소문자·공백 무시)
 * @param {string[]} names - 등록 여부를 확인할 이름 목록
 * @param {string} collectionName - 'vendors' | 'manufacturers'
 * @returns {Promise<string[]>} - DB에 미등록된 이름 목록
 */
async function findUnregisteredNames(names, collectionName) {
    const validNames = names
        .map(n => (n || '').trim())
        .filter(n => n.length > 0);

    if (validNames.length === 0) return [];

    try {
        const snap = await getDocs(collection(db, collectionName));
        const existingNamesLower = new Set();
        snap.forEach(docSnap => {
            const name = docSnap.data().Name;
            if (name) existingNamesLower.add(name.trim().toLowerCase());
        });

        return validNames.filter(n => !existingNamesLower.has(n.toLowerCase()));
    } catch (err) {
        console.error(`[supplierAutoRegister] ${collectionName} 조회 실패:`, err);
        return [];
    }
}

/**
 * 미등록 이름 목록을 해당 컬렉션에 일괄 등록
 * @param {string[]} names - 등록할 이름 목록
 * @param {string} collectionName - 'vendors' | 'manufacturers'
 * @param {object} extraFields - 추가로 저장할 필드 (예: { Category: '부품공급' })
 */
async function registerNewEntries(names, collectionName, extraFields = {}) {
    for (const name of names) {
        try {
            await addDoc(collection(db, collectionName), {
                Name: name,
                CreatedAt: serverTimestamp(),
                AutoRegistered: true, // 자동 등록 여부 표시
                ...extraFields
            });
            console.info(`[supplierAutoRegister] '${name}' → ${collectionName} 자동 등록 완료`);
        } catch (err) {
            console.error(`[supplierAutoRegister] '${name}' 등록 실패 (${collectionName}):`, err);
        }
    }
}

/**
 * Part 데이터에서 공급사/제조사를 추출하여 미등록 항목을 자동 등록합니다.
 *
 * @param {object} partData - 저장된 부품 데이터 객체 (Maker, Supplier, Manufacturer 필드 포함)
 */
export async function autoRegisterFromPart(partData) {
    if (!partData) return;

    const supplierNames = [partData.Maker, partData.Supplier].filter(Boolean);
    const manufacturerNames = [partData.Manufacturer].filter(Boolean);

    const [newSuppliers, newManufacturers] = await Promise.all([
        findUnregisteredNames(supplierNames, 'vendors'),
        findUnregisteredNames(manufacturerNames, 'manufacturers')
    ]);

    await Promise.all([
        registerNewEntries(newSuppliers, 'vendors', { Category: '부품공급' }),
        registerNewEntries(newManufacturers, 'manufacturers')
    ]);
}

/**
 * 여러 Part 데이터 배열에서 공급사/제조사를 일괄 추출하여 미등록 항목을 자동 등록합니다.
 * BOM 가져오기 등 대량 처리에 사용합니다.
 *
 * @param {object[]} partsArray - 부품 데이터 배열 (Maker, Supplier, Manufacturer 필드 포함)
 */
export async function autoRegisterFromParts(partsArray) {
    if (!partsArray || partsArray.length === 0) return;

    // 중복 제거 후 목록 추출
    const supplierSet = new Set();
    const manufacturerSet = new Set();

    partsArray.forEach(part => {
        if (part.Maker?.trim()) supplierSet.add(part.Maker.trim());
        if (part.Supplier?.trim()) supplierSet.add(part.Supplier.trim());
        if (part.Manufacturer?.trim()) manufacturerSet.add(part.Manufacturer.trim());
    });

    const supplierNames = [...supplierSet];
    const manufacturerNames = [...manufacturerSet];

    const [newSuppliers, newManufacturers] = await Promise.all([
        findUnregisteredNames(supplierNames, 'vendors'),
        findUnregisteredNames(manufacturerNames, 'manufacturers')
    ]);

    await Promise.all([
        registerNewEntries(newSuppliers, 'vendors', { Category: '부품공급' }),
        registerNewEntries(newManufacturers, 'manufacturers')
    ]);
}

/**
 * 기존 DB의 모든 Parts를 스캔하여 미등록 공급사/제조사를 일괄 등록합니다.
 * 최초 1회 실행하거나 SettingsPage 등에서 "동기화" 버튼을 통해 실행합니다.
 *
 * @returns {Promise<{ addedSuppliers: number, addedManufacturers: number }>}
 */
export async function syncAllPartsToSupplierDB() {
    try {
        const snap = await getDocs(collection(db, 'parts'));
        const allParts = [];
        snap.forEach(docSnap => allParts.push(docSnap.data()));

        const supplierSet = new Set();
        const manufacturerSet = new Set();

        allParts.forEach(part => {
            if (part.Maker?.trim()) supplierSet.add(part.Maker.trim());
            if (part.Supplier?.trim()) supplierSet.add(part.Supplier.trim());
            if (part.Manufacturer?.trim()) manufacturerSet.add(part.Manufacturer.trim());
        });

        const [newSuppliers, newManufacturers] = await Promise.all([
            findUnregisteredNames([...supplierSet], 'vendors'),
            findUnregisteredNames([...manufacturerSet], 'manufacturers')
        ]);

        await Promise.all([
            registerNewEntries(newSuppliers, 'vendors', { Category: '부품공급' }),
            registerNewEntries(newManufacturers, 'manufacturers')
        ]);

        return {
            addedSuppliers: newSuppliers.length,
            addedManufacturers: newManufacturers.length
        };
    } catch (err) {
        console.error('[supplierAutoRegister] 전체 동기화 실패:', err);
        throw err;
    }
}
