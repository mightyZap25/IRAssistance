const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/pages/ProductionRequestsPage.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. 신규 의뢰 버튼에 data-tour 마커 연동
const targetBtn = `<button onClick={() => setIsCreateOpen(true)} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black flex items-center gap-2 shadow-lg"><Plus size={18}/>`;
const replacementBtn = `<button data-tour="pr-register-btn" onClick={() => setIsCreateOpen(true)} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black flex items-center gap-2 shadow-lg"><Plus size={18}/>`;

// 2. 탭 네비게이터에 data-tour 마커 연동
const targetTabs = `<div className="flex space-x-6">`;
const replacementTabs = `<div className="flex space-x-6" data-tour="pr-tabs">`;

// 3. 리스트 그리드 영역에 data-tour 마커 연동
const targetGrid = `<div className="flex-1 overflow-hidden">`;
const replacementGrid = `<div className="flex-1 overflow-hidden" data-tour="pr-list-row">`;

let normContent = content.replace(/\r\n/g, '\n');
let normTargetBtn = targetBtn.replace(/\r\n/g, '\n');
let normReplBtn = replacementBtn.replace(/\r\n/g, '\n');
let normTargetTabs = targetTabs.replace(/\r\n/g, '\n');
let normReplTabs = replacementTabs.replace(/\r\n/g, '\n');
let normTargetGrid = targetGrid.replace(/\r\n/g, '\n');
let normReplGrid = replacementGrid.replace(/\r\n/g, '\n');

// 탭의 중복 매칭을 막기 위해 index 기준으로 정교하게 치환
if (
    normContent.includes(normTargetBtn) && 
    normContent.includes(normTargetTabs) && 
    normContent.includes(normTargetGrid)
) {
    normContent = normContent.replace(normTargetBtn, normReplBtn);
    normContent = normContent.replace(normTargetTabs, normReplTabs);
    normContent = normContent.replace(normTargetGrid, normReplGrid);
    
    fs.writeFileSync(filePath, normContent.replace(/\n/g, '\r\n'), 'utf8');
    console.log("Successfully integrated data-tour markers into ProductionRequestsPage.jsx!");
} else {
    console.log("Failed to find targets in ProductionRequestsPage.jsx!");
}
