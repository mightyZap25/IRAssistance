import { db, doc, getDoc, setDoc, updateDoc, addDoc, collection, serverTimestamp, writeBatch } from '../firebase';

export const inventoryService = {
    /**
     * Adds a transaction and updates the inventory atomicity.
     * Can accept an existing batch to combine operations.
     * 
     * @param {Object} txData - Transaction details
     * @param {string} txData.PartID
     * @param {string} txData.Type - 'In' or 'Out'
     * @param {number} txData.Quantity - Absolute quantity (always positive)
     * @param {string} txData.Reason
     * @param {string} [txData.RefDoc]
     * @param {string} [txData.Location]
     * @param {string} [txData.LotNumber]
     * @param {string} [txData.CustomerName]
     * @param {string} [txData.CreatedBy]
     * @param {Object} [batch] - Firestore writeBatch instance (optional)
     * @returns {Promise<void>}
     */
    addTransaction: async (txData, providedBatch = null) => {
        const batch = providedBatch || writeBatch(db);
        const timestamp = serverTimestamp();
        
        // 1. Calculate new on-hand stock
        const invRef = doc(db, 'inventory', txData.PartID);
        const invSnap = await getDoc(invRef);
        
        const currentOnHand = invSnap.exists() ? Number(invSnap.data().OnHand || 0) : 0;
        const qty = Number(txData.Quantity || 0);
        let newTotal = currentOnHand;
        
        if (txData.Type === 'In') {
            newTotal += qty;
        } else if (txData.Type === 'Out') {
            newTotal -= qty;
        }

        // 2. Update or Set Inventory Doc
        if (invSnap.exists()) {
            batch.update(invRef, {
                OnHand: newTotal,
                Location: txData.Location || invSnap.data().Location || '-',
                LastUpdated: timestamp
            });
        } else {
            batch.set(invRef, {
                PartID: txData.PartID,
                OnHand: newTotal,
                Location: txData.Location || '-',
                LastUpdated: timestamp
            });
        }

        // 3. Create Transaction Doc
        const txRef = doc(collection(db, 'transactions'));
        batch.set(txRef, {
            ...txData,
            Date: timestamp,
            CreatedBy: txData.CreatedBy || 'System',
            ManualEntry: false,
            Abnormal: false,
            AbnormalReason: ''
        });

        // 4. Commit if we created the batch
        if (!providedBatch) {
            await batch.commit();
        }
    },

    /**
     * Cancels an existing transaction (rollback inventory change).
     * @param {string} txId - Transaction document ID
     * @param {boolean} isFromHistoryTable - Whether the doc is in 'inventory_history' or 'transactions'
     * @param {string} reason - Reason for cancellation
     * @param {Object} user - User performing the cancellation
     */
    cancelTransaction: async (txId, isFromHistoryTable, reason, user) => {
        const timestamp = serverTimestamp();
        const batch = writeBatch(db);
        
        const collectionName = isFromHistoryTable ? 'inventory_history' : 'transactions';
        const txRef = doc(db, collectionName, txId);
        const txSnap = await getDoc(txRef);
        
        if (!txSnap.exists()) {
            throw new Error('Transaction not found');
        }
        
        const txData = txSnap.data();
        if (txData.Status === 'CANCELLED') {
            throw new Error('Transaction is already cancelled');
        }
        
        const qtyToRevert = Number(txData.Change !== undefined ? Math.abs(txData.Change) : (txData.Quantity || 0));
        let typeToRevert = '';
        if (isFromHistoryTable) {
            typeToRevert = (txData.Type === 'IN' || txData.Change > 0) ? 'In' : 'Out';
        } else {
            typeToRevert = txData.Type;
        }
        
        const partID = txData.PartID;

        const invRef = doc(db, 'inventory', partID);
        const invSnap = await getDoc(invRef);
        
        let currentOnHand = invSnap.exists() ? Number(invSnap.data().OnHand || 0) : 0;
        
        if (typeToRevert === 'In') {
            currentOnHand -= qtyToRevert;
        } else if (typeToRevert === 'Out') {
            currentOnHand += qtyToRevert;
        }
        
        if (invSnap.exists()) {
            batch.update(invRef, {
                OnHand: currentOnHand,
                LastUpdated: timestamp
            });
        }
        
        batch.update(txRef, {
            Status: 'CANCELLED',
            CancelReason: reason,
            CancelledAt: timestamp,
            CancelledBy: user?.uid || 'System'
        });
        
        await batch.commit();
    }
};
