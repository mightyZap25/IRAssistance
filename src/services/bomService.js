import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Generates the next revision character.
 * Rules: 1.0 -> 1.1 -> 1.2 ...
 */
export function getNextRevision(currentRev) {
    if (!currentRev || typeof currentRev !== 'string') return '1.0';

    // Handle Legacy Alphabet Revisions
    if (currentRev.match(/^[A-Z]$/i)) {
        // A -> 1.0, B -> 2.0, etc. (ASCII: A is 65)
        const major = currentRev.toUpperCase().charCodeAt(0) - 64;
        return `${major}.0`;
    }

    if (currentRev.includes('.')) {
        const parts = currentRev.split('.');
        if (parts.length === 2 && !isNaN(parseInt(parts[1], 10))) {
            const major = parts[0];
            const minor = parseInt(parts[1], 10);
            return `${major}.${minor + 1}`;
        }
    }
    return '1.0';
}

/**
 * Fetches all BOM relationships and builds a nested tree structure for a given root PartID.
 */
export async function getBOMStructure(rootPartId) {
    // 1. Fetch all BOM links (Flat list)
    const bomSnap = await getDocs(collection(db, 'bom'));
    const allLinks = [];
    bomSnap.forEach(doc => allLinks.push(doc.data()));

    // 2. Fetch all Parts (to get Names/Details)
    const partsSnap = await getDocs(collection(db, 'parts'));
    const partMap = {};
    partsSnap.forEach(doc => {
        const d = doc.data();
        partMap[d.PartID] = d;
    });

    // 3. Build Tree Function
    function buildTree(parentId, visited = new Set(), depth = 0) {
        const MAX_DEPTH = 20; // Safety limit for recursion
        const part = partMap[parentId];
        
        if (depth > MAX_DEPTH) {
            console.warn(`BOM Max depth reached at ${parentId}. Potential deep recursion.`);
            return { PartID: parentId, Name: `[DEPTH LIMIT] ${part?.Name || 'Unknown'}`, Children: [] };
        }

        if (!part) return { PartID: parentId, Name: 'Unknown Part', Children: [] };

        // Circular Reference Check
        if (visited.has(parentId)) {
            console.warn(`Circular reference detected at ${parentId}. Path: ${Array.from(visited).join(' -> ')}`);
            return { 
                ...part, 
                Name: `[CIRCULAR] ${part.Name}`, 
                Children: [], 
                isCircular: true 
            };
        }
        
        const nextVisited = new Set(visited);
        nextVisited.add(parentId);

        const childrenLinks = allLinks.filter(link => link.ParentID === parentId);
        const uniqueLinksMap = new Map();
        childrenLinks.forEach(link => {
            if (!uniqueLinksMap.has(link.ChildID)) {
                uniqueLinksMap.set(link.ChildID, link);
            }
        });

        const uniqueLinks = Array.from(uniqueLinksMap.values());

        return {
            ...part,
            Quantity: 1, 
            Children: uniqueLinks.map(link => {
                const childNode = buildTree(link.ChildID, nextVisited, depth + 1);
                return {
                    ...childNode,
                    Quantity: link.Quantity || 1,
                    Location: link.Location || '',
                    Note: link.Note || '',
                    isDiscontinued: link.Status === 'Discontinued'
                };
            }).sort((a, b) => {
                const getWeight = (pid) => {
                    const s = (pid || '').toUpperCase();
                    if (s.startsWith('IRPA')) return 0;
                    if (s.startsWith('IRAA')) return 1;
                    return 2;
                };
                const wa = getWeight(a.PartID);
                const wb = getWeight(b.PartID);
                if (wa !== wb) return wa - wb;
                return (a.Name || '').localeCompare(b.Name || '');
            })
        };
    }

    // 4. Return the tree for the requested Root
    if (!rootPartId) return null;
    return buildTree(rootPartId);
}

/**
 * Helper to get all Top-Level Assemblies
 */
export async function getMasterAssemblies() {
    const bomSnap = await getDocs(collection(db, 'bom'));
    const parentIds = new Set();
    bomSnap.forEach(doc => parentIds.add(doc.data().ParentID));

    const partsSnap = await getDocs(collection(db, 'parts'));
    const assemblies = [];
    partsSnap.forEach(doc => {
        const d = doc.data();
        if (parentIds.has(d.PartID)) {
            assemblies.push(d);
        }
    });

    return assemblies;
}
