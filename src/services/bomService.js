import { collection, getDocs, query, where } from '../firebase';
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
            return { PartID: parentId, Name: `[DEPTH LIMIT] ${part?.Name || 'Unknown'}`, Children: [], TotalCost: 0, AccumulatedLeadTime: 0 };
        }

        if (!part) return { PartID: parentId, Name: 'Unknown Part', Children: [], TotalCost: 0, AccumulatedLeadTime: 0 };

        // Circular Reference Check
        if (visited.has(parentId)) {
            console.warn(`Circular reference detected at ${parentId}. Path: ${Array.from(visited).join(' -> ')}`);
            return { 
                ...part, 
                Children: [], 
                isCircular: true,
                TotalCost: 0,
                AccumulatedLeadTime: 0
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

        const children = uniqueLinks.map(link => {
            const childNode = buildTree(link.ChildID, nextVisited, depth + 1);
            const qty = link.Quantity || 1;
            return {
                ...childNode,
                Quantity: qty,
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
        });

        // Calculate Metrics
        const unitPrice = Number(part.UnitPrice) || 0;
        const childrenCost = children.reduce((sum, child) => sum + (child.TotalCost * child.Quantity), 0);
        const nodeTotalCost = children.length === 0 ? unitPrice : childrenCost + unitPrice;

        const ownLeadTime = Number(part.LeadTime) || 0;
        const maxChildLeadTime = children.length === 0 ? 0 : Math.max(...children.map(c => c.AccumulatedLeadTime));
        const nodeAccumulatedLeadTime = ownLeadTime + maxChildLeadTime;

        return {
            ...part,
            Quantity: 1, 
            Children: children,
            TotalCost: nodeTotalCost,
            AccumulatedLeadTime: nodeAccumulatedLeadTime
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

/**
 * Compares two BOM trees and returns a list of changes.
 */
export function compareBOMs(oldTree, newTree) {
    const changes = [];

    function flatten(node, map = {}) {
        if (!node) return map;
        map[node.PartID] = {
            Name: node.Name,
            Quantity: node.Quantity,
            Location: node.Location,
            Note: node.Note
        };
        if (node.Children) {
            node.Children.forEach(child => flatten(child, map));
        }
        return map;
    }

    const oldMap = flatten(oldTree);
    const newMap = flatten(newTree);

    const allKeys = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);

    allKeys.forEach(id => {
        const oldItem = oldMap[id];
        const newItem = newMap[id];

        if (!oldItem && newItem) {
            changes.push({ type: 'added', partId: id, name: newItem.Name, newValue: newItem.Quantity });
        } else if (oldItem && !newItem) {
            changes.push({ type: 'removed', partId: id, name: oldItem.Name, oldValue: oldItem.Quantity });
        } else if (oldItem && newItem) {
            const propChanges = [];
            if (oldItem.Quantity !== newItem.Quantity) {
                propChanges.push(`수량: ${oldItem.Quantity} -> ${newItem.Quantity}`);
            }
            if (oldItem.Location !== newItem.Location) {
                propChanges.push(`위치: ${oldItem.Location || 'N/A'} -> ${newItem.Location || 'N/A'}`);
            }
            if (oldItem.Note !== newItem.Note) {
                propChanges.push(`비고: ${oldItem.Note || 'N/A'} -> ${newItem.Note || 'N/A'}`);
            }

            if (propChanges.length > 0) {
                changes.push({ 
                    type: 'modified', 
                    partId: id, 
                    name: newItem.Name, 
                    details: propChanges.join(', ')
                });
            }
        }
    });

    return changes;
}

/**
 * Fetches the previous revision of a part.
 */
export async function getPreviousRevision(currentPartID) {
    if (!currentPartID) return null;
    
    // Assume PartID format: MASTER-REV (e.g., IRP-001-1.1)
    const parts = currentPartID.split('-');
    if (parts.length < 2) return null;
    
    const masterId = parts.slice(0, -1).join('-');
    
    try {
        const partsRef = collection(db, 'parts');
        const snap = await getDocs(partsRef);
        const revisions = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(p => p.MasterPartID === masterId);
            
        revisions.sort((a, b) => (b.Rev || '1.0').localeCompare(a.Rev || '1.0'));
        
        // Find the one immediately before current
        const currentIndex = revisions.findIndex(r => r.PartID === currentPartID);
        if (currentIndex !== -1 && currentIndex < revisions.length - 1) {
            return revisions[currentIndex + 1];
        }
    } catch (err) {
        console.error("Error in getPreviousRevision fallback:", err);
    }
    
    return null;
}
