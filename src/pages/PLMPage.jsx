import React from 'react';
import OdooBulkBOMSync from '../components/OdooBulkBOMSync';

export default function PLMPage() {
    return (
        <div className="p-6 max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold mb-6 text-slate-800">PLM (Odoo BOM 일괄 동기화)</h1>
            <OdooBulkBOMSync />
        </div>
    );
}
