import React from 'react';
import OdooBOMImportModal from '../components/OdooBOMImportModal';

export default function PLMPage() {
    return (
        <div className="p-6 max-w-5xl mx-auto min-h-[calc(100vh-64px)] flex flex-col">
            <OdooBOMImportModal 
                isOpen={true} 
                isInline={true}
                onClose={() => {}} 
                onImportSuccess={() => {
                    alert('설계 변경 내역이 성공적으로 적용되었습니다.');
                }}
                allParts={[]} 
            />
        </div>
    );
}
