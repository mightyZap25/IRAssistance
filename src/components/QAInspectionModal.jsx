import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, XCircle, AlertTriangle, Camera, Package, Info, CheckCircle2, Cloud, ExternalLink, FileText } from 'lucide-react';
import { updateDoc, doc, collection, getDocs, addDoc, serverTimestamp, writeBatch, getDoc, query, where } from '../firebase';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import clsx from 'clsx';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const MOCKUP_COLORS = ['#f43f5e', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6'];

export default function QAInspectionModal({ item, isOpen, onClose, onRefresh }) {
    const { userProfile } = useAuth();
    const [passedQty, setPassedQty] = useState('');
    const [failedQty, setFailedQty] = useState('');
    const [defects, setDefects] = useState([]);
    const [currentDefectType, setCurrentDefectType] = useState('');
    const [currentDefectQty, setCurrentDefectQty] = useState('');
    const [currentDefectNote, setCurrentDefectNote] = useState('');
    const [loading, setLoading] = useState(false);

    // 신규 입력 항목
    const [inspectionMethod, setInspectionMethod] = useState('Full'); // Full (전수) | Sample (샘플)
    const [handlingType, setHandlingType] = useState('Return'); // Return (반품) | SpecialAcceptance (특채)
    const [specialAcceptanceCondition, setSpecialAcceptanceCondition] = useState('');
    
    // 추가 품질 정보 항목
    const [lotNumber, setLotNumber] = useState('');
    const [drawingNo, setDrawingNo] = useState('');
    const [inspectionTool, setInspectionTool] = useState('Vernier Calipers');
    const [defectPhotoUrl, setDefectPhotoUrl] = useState('');
    const [partDatasheet, setPartDatasheet] = useState('');
    
    // DB에서 마스터 불량 유형 로드
    const [dbDefectTypes, setDbDefectTypes] = useState([]);

    const [googleSheetLink, setGoogleSheetLink] = useState('');
    const [isSheetCreated, setIsSheetCreated] = useState(false);
    
    // 예시 템플릿 보기용 모달 플래그
    const [showPreview, setShowPreview] = useState(false);

    useEffect(() => {
        if (isOpen && item) {
            setPassedQty((item.PassedQty !== undefined ? item.PassedQty : item.Qty || 0).toString());
            setFailedQty((item.FailedQty || 0).toString());
            setDefects(item.Defects || []);
            setInspectionMethod(item.InspectionMethod || 'Full');
            setHandlingType(item.HandlingType || 'Return');
            setSpecialAcceptanceCondition(item.SpecialAcceptanceCondition || '');
            setGoogleSheetLink(item.GoogleSheetLink || '');
            setIsSheetCreated(!!item.GoogleSheetLink);
            setShowPreview(false);

            setLotNumber(item.LotNumber || '');
            setDrawingNo(item.DrawingNo || '');
            setInspectionTool(item.InspectionTool || 'Vernier Calipers');
            setDefectPhotoUrl(item.DefectPhotoUrl || '');
            setPartDatasheet('');
            
            // Fetch associated part's datasheet
            if (item.PartID) {
                const partIdStr = String(item.PartID);
                const partDocRef = doc(db, 'parts', partIdStr);
                getDoc(partDocRef).then(snap => {
                    if (snap.exists()) {
                        setPartDatasheet(snap.data().Datasheet || '');
                    } else {
                        getDocs(query(collection(db, 'parts'), where('PartID', '==', partIdStr))).then(qSnap => {
                            if (!qSnap.empty) {
                                setPartDatasheet(qSnap.docs[0].data().Datasheet || '');
                            }
                        });
                    }
                }).catch(err => {
                    console.error("Error fetching part datasheet:", err);
                });
            }
            
            // 로드 qa_defect_codes
            getDocs(collection(db, 'qa_defect_codes')).then(snap => {
                const list = [];
                snap.forEach(doc => {
                    const data = doc.data();
                    if (data.category === 'Receiving') {
                        list.push(data.name);
                    }
                });
                // 없으면 기본 리스트 바인딩
                setDbDefectTypes(list.length > 0 ? list : ['치수 불량', '외관 스크래치', '파손/크랙', '조립 불량', '도금/도장 불량', '이물질/오염', '포장 불량', '기타']);
            });
        }
    }, [isOpen, item]);

    if (!isOpen || !item) return null;

    const handlePassedQtyChange = (e) => {
        const val = parseInt(e.target.value) || 0;
        setPassedQty(val.toString());
        const remain = item.Qty - val;
        setFailedQty(Math.max(0, remain).toString());
    };

    const handleFailedQtyChange = (e) => {
        const val = parseInt(e.target.value) || 0;
        setFailedQty(val.toString());
        const remain = item.Qty - val;
        setPassedQty(Math.max(0, remain).toString());
    };

    const addDefect = () => {
        if (!currentDefectType) return alert('불량 종류를 선택해주세요.');
        const dq = parseInt(currentDefectQty) || 0;
        if (dq <= 0) return alert('불량 수량을 1개 이상 입력해주세요.');

        setDefects([...defects, { type: currentDefectType, qty: dq, note: currentDefectNote }]);
        setCurrentDefectType('');
        setCurrentDefectNote('');
        setCurrentDefectQty('');
    };

    const removeDefect = (index) => {
        setDefects(defects.filter((_, i) => i !== index));
    };

    // Google Sheets 성적서 임시 저장 및 링크 제공
    const handlePreCreateSheet = async () => {
        const token = localStorage.getItem('google_access_token');
        if (!token) {
            return alert('구글 연동 계정이 로그인되어 있지 않습니다. 오피스의 [파일 연동] 페이지에서 연동해 주세요.');
        }

        // 기존에 이미 생성된 시트 링크가 있는 경우, 신규 생성하지 않고 기존 시트를 바로 열어줍니다.
        if (googleSheetLink) {
            window.open(googleSheetLink, '_blank');
            setShowPreview(true);
            return;
        }

        setLoading(true);
        try {
            const createUrl = 'https://www.googleapis.com/drive/v3/files';
            const createRes = await fetch(createUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: `수입검사성적서_${item.PartName}_${item.PONumber}`,
                    mimeType: 'application/vnd.google-apps.spreadsheet',
                    parents: ['1oXv2DwVuvLiVSvhbS02aVydwoClztkrd'] // 구글 드라이브 지정 폴더에 생성
                })
            });

            if (!createRes.ok) throw new Error('구글 시트 생성 실패');
            const fileData = await createRes.json();
            const spreadsheetId = fileData.id;
            const docUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

            // 임시 데이터 채워넣기 (Sheet1 범위로 고정 명시)
            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:D35?valueInputOption=USER_ENTERED`;
            const defectsList = defects?.map(d => `${d.type} (${d.qty}개) - ${d.note || ''}`).join(', ') || '없음';
            const def1 = defects[0] || { type: '', qty: '', note: '' };
            const def2 = defects[1] || { type: '', qty: '', note: '' };
            const def3 = defects[2] || { type: '', qty: '', note: '' };

            const values = [
                ['', '', '', ''],
                ['수 입 검 사 성 적 서', '', '', ''],
                ['', '', '', ''],
                ['', '', '', ''],
                ['발주 번호', item.PONumber, '공급사', item.VendorName],
                ['품목 번호', item.PartID, '품목명', item.PartName],
                ['검사 일시', new Date().toLocaleString(), '검사자', userProfile?.name || 'QA Manager'],
                ['제조 LOT 번호', lotNumber || 'N/A', '도면 번호/Rev', drawingNo || 'N/A'],
                ['사용 계측기', inspectionTool || 'N/A', '성적서 번호', `RI-${item.PONumber}-${Date.now().toString().slice(-4)}`],
                ['', '', '', ''],
                ['[1. 검사 수량 및 합격 정보]', '', '', ''],
                ['총 입고 수량', '검사 방법', '합격 수량', '불량 수량'],
                [`${item.Qty} EA`, inspectionMethod === 'Sample' ? 'Sample 검사' : '전수 검사', `${passedQty || 0} EA`, `${failedQty || 0} EA`],
                ['최종 판정', (parseInt(failedQty) || 0) > 0 ? '불합격 포함' : '합격 (PASS)', '', ''],
                ['', '', '', ''],
                ['[2. 부적합 내용 및 조치 내역]', '', '', ''],
                ['불량 유형', '불량 수량', '상세 메모', '비고'],
                [def1.type, def1.qty, def1.note, ''],
                [def2.type, def2.qty, def2.note, ''],
                [def3.type, def3.qty, def3.note, ''],
                ['부적합 조치방안', (parseInt(failedQty) || 0) > 0 ? (handlingType === 'SpecialAcceptance' ? `특채 승인 (특채조건: ${specialAcceptanceCondition})` : '공급업체 반품 처리') : 'N/A', '', ''],
                ['', '', '', ''],
                ['위와 같이 수입검사 결과를 보고합니다.', '', '', ''],
                [new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }), '', '', ''],
                ['', '', '', ''],
                ['', '', `검사자:   ${userProfile?.name || 'QA Manager'}   (서명/인)`, '']
            ];

            const writeRes = await fetch(updateUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    range: 'Sheet1!A1:D35',
                    majorDimension: 'ROWS',
                    values: values
                })
            });

            if (!writeRes.ok) {
                // 한글 브라우저 등에서 '시트1'로 생성되었을 경우 재시도
                const retryUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/%EC%8B%9C%ED%8A%B81!A1:D35?valueInputOption=USER_ENTERED`;
                const writeResRetry = await fetch(retryUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        range: '시트1!A1:D35',
                        majorDimension: 'ROWS',
                        values: values
                    })
                });
                if (!writeResRetry.ok) {
                    const errDetail = await writeResRetry.text();
                    throw new Error(`시트 템플릿 데이터 기입 실패: ${errDetail}`);
                }
            }

            // 구글 시트 디자인 및 포맷팅 (batchUpdate)
            try {
                const isFailed = (parseInt(failedQty) || 0) > 0;
                const batchUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
                const batchRequests = [
                    // 1. 컬럼 너비 설정 (A4 가로폭에 딱 맞게 총 600px로 세부 분할)
                    {
                        updateDimensionProperties: {
                            range: { sheetId: 0, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
                            properties: { pixelSize: 110 },
                            fields: 'pixelSize'
                        }
                    },
                    {
                        updateDimensionProperties: {
                            range: { sheetId: 0, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
                            properties: { pixelSize: 190 },
                            fields: 'pixelSize'
                        }
                    },
                    {
                        updateDimensionProperties: {
                            range: { sheetId: 0, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 },
                            properties: { pixelSize: 110 },
                            fields: 'pixelSize'
                        }
                    },
                    {
                        updateDimensionProperties: {
                            range: { sheetId: 0, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 },
                            properties: { pixelSize: 190 },
                            fields: 'pixelSize'
                        }
                    },
                    // 1.2. 행 높이 설정 (A4 세로 인쇄 범위에 맞게 넓고 여유롭게 비율 조정, 총 높이 약 760px)
                    { updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 20 }, fields: 'pixelSize' } },
                    { updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 1, endIndex: 3 }, properties: { pixelSize: 25 }, fields: 'pixelSize' } },
                    { updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 15 }, fields: 'pixelSize' } },
                    { updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 4, endIndex: 9 }, properties: { pixelSize: 28 }, fields: 'pixelSize' } }, // 메타데이터 5줄
                    { updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 9, endIndex: 10 }, properties: { pixelSize: 15 }, fields: 'pixelSize' } },
                    { updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 10, endIndex: 12 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } }, // 섹션 1 헤더 & 표 헤더
                    { updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 12, endIndex: 13 }, properties: { pixelSize: 40 }, fields: 'pixelSize' } }, // 수량 데이터
                    { updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 13, endIndex: 14 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } }, // 최종 판정
                    { updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 14, endIndex: 15 }, properties: { pixelSize: 15 }, fields: 'pixelSize' } },
                    { updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 15, endIndex: 17 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } }, // 섹션 2 헤더 & 표 헤더
                    { updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 17, endIndex: 20 }, properties: { pixelSize: 26 }, fields: 'pixelSize' } }, // 불량 리스트 3줄
                    { updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 20, endIndex: 21 }, properties: { pixelSize: 40 }, fields: 'pixelSize' } }, // 부적합 조치방안
                    { updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 21, endIndex: 22 }, properties: { pixelSize: 15 }, fields: 'pixelSize' } },
                    { updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 22, endIndex: 24 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } }, // 하단 문구 & 날짜
                    { updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 24, endIndex: 25 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } }, // spacer
                    { updateDimensionProperties: { range: { sheetId: 0, dimension: 'ROWS', startIndex: 25, endIndex: 26 }, properties: { pixelSize: 35 }, fields: 'pixelSize' } }, // 서명
                    // 2. 셀 병합 (mergeCells)
                    {
                        // 타이틀 영역 병합 A2:D3 (Row 1-2)
                        mergeCells: {
                            range: { sheetId: 0, startRowIndex: 1, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 4 },
                            mergeType: 'MERGE_ALL'
                        }
                    },
                    {
                        // 수량 정보 헤더 A11:D11 (Row 10)
                        mergeCells: {
                            range: { sheetId: 0, startRowIndex: 10, endRowIndex: 11, startColumnIndex: 0, endColumnIndex: 4 },
                            mergeType: 'MERGE_ALL'
                        }
                    },
                    {
                        // 최종 판정 값 B14:D14 (Row 13)
                        mergeCells: {
                            range: { sheetId: 0, startRowIndex: 13, endRowIndex: 14, startColumnIndex: 1, endColumnIndex: 4 },
                            mergeType: 'MERGE_ALL'
                        }
                    },
                    {
                        // 부적합 정보 헤더 A16:D16 (Row 15)
                        mergeCells: {
                            range: { sheetId: 0, startRowIndex: 15, endRowIndex: 16, startColumnIndex: 0, endColumnIndex: 4 },
                            mergeType: 'MERGE_ALL'
                        }
                    },
                    {
                        // Defect 1 Memo merge C22:D22 (now Row 17)
                        mergeCells: { range: { sheetId: 0, startRowIndex: 17, endRowIndex: 18, startColumnIndex: 2, endColumnIndex: 4 }, mergeType: 'MERGE_ALL' }
                    },
                    {
                        // Defect 2 Memo merge C23:D23 (now Row 18)
                        mergeCells: { range: { sheetId: 0, startRowIndex: 18, endRowIndex: 19, startColumnIndex: 2, endColumnIndex: 4 }, mergeType: 'MERGE_ALL' }
                    },
                    {
                        // Defect 3 Memo merge C24:D24 (now Row 19)
                        mergeCells: { range: { sheetId: 0, startRowIndex: 19, endRowIndex: 20, startColumnIndex: 2, endColumnIndex: 4 }, mergeType: 'MERGE_ALL' }
                    },
                    {
                        // 조치 방안 값 B25:D25 (Row 20)
                        mergeCells: {
                            range: { sheetId: 0, startRowIndex: 20, endRowIndex: 21, startColumnIndex: 1, endColumnIndex: 4 },
                            mergeType: 'MERGE_ALL'
                        }
                    },
                    {
                        // 하단 보고 문구 (Row 22)
                        mergeCells: {
                            range: { sheetId: 0, startRowIndex: 22, endRowIndex: 23, startColumnIndex: 0, endColumnIndex: 4 },
                            mergeType: 'MERGE_ALL'
                        }
                    },
                    {
                        // 하단 날짜 (Row 23)
                        mergeCells: {
                            range: { sheetId: 0, startRowIndex: 23, endRowIndex: 24, startColumnIndex: 0, endColumnIndex: 4 },
                            mergeType: 'MERGE_ALL'
                        }
                    },
                    {
                        // 하단 서명 (Row 25, Col 2-3)
                        mergeCells: {
                            range: { sheetId: 0, startRowIndex: 25, endRowIndex: 26, startColumnIndex: 2, endColumnIndex: 4 },
                            mergeType: 'MERGE_ALL'
                        }
                    },
                    // 3. 테두리 (Borders) 적용
                    // 타이틀 블록 (A2:D3)
                    {
                        updateBorders: {
                            range: { sheetId: 0, startRowIndex: 1, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 4 },
                            top: { style: 'SOLID', width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } },
                            bottom: { style: 'SOLID', width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } },
                            left: { style: 'SOLID', width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } },
                            right: { style: 'SOLID', width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } }
                        }
                    },
                    // 메타데이터 블록 (A5:D9)
                    {
                        updateBorders: {
                            range: { sheetId: 0, startRowIndex: 4, endRowIndex: 9, startColumnIndex: 0, endColumnIndex: 4 },
                            top: { style: 'SOLID', width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } },
                            bottom: { style: 'SOLID', width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } },
                            left: { style: 'SOLID', width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } },
                            right: { style: 'SOLID', width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } },
                            innerHorizontal: { style: 'SOLID', width: 1, color: { red: 0.85, green: 0.85, blue: 0.85 } },
                            innerVertical: { style: 'SOLID', width: 1, color: { red: 0.85, green: 0.85, blue: 0.85 } }
                        }
                    },
                    // 섹션 1 테이블 블록 (A11:D14)
                    {
                        updateBorders: {
                            range: { sheetId: 0, startRowIndex: 10, endRowIndex: 14, startColumnIndex: 0, endColumnIndex: 4 },
                            top: { style: 'SOLID', width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } },
                            bottom: { style: 'SOLID', width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } },
                            left: { style: 'SOLID', width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } },
                            right: { style: 'SOLID', width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } },
                            innerHorizontal: { style: 'SOLID', width: 1, color: { red: 0.85, green: 0.85, blue: 0.85 } },
                            innerVertical: { style: 'SOLID', width: 1, color: { red: 0.85, green: 0.85, blue: 0.85 } }
                        }
                    },
                    // 섹션 2 테이블 블록 (A16:D21)
                    {
                        updateBorders: {
                            range: { sheetId: 0, startRowIndex: 15, endRowIndex: 21, startColumnIndex: 0, endColumnIndex: 4 },
                            top: { style: 'SOLID', width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } },
                            bottom: { style: 'SOLID', width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } },
                            left: { style: 'SOLID', width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } },
                            right: { style: 'SOLID', width: 1, color: { red: 0.7, green: 0.7, blue: 0.7 } },
                            innerHorizontal: { style: 'SOLID', width: 1, color: { red: 0.85, green: 0.85, blue: 0.85 } },
                            innerVertical: { style: 'SOLID', width: 1, color: { red: 0.85, green: 0.85, blue: 0.85 } }
                        }
                    },
                    // 4. 타이틀 영역 스타일 (A2:D3)
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 1, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 4 },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: { red: 0.90, green: 0.92, blue: 0.98 },
                                    horizontalAlignment: 'CENTER',
                                    verticalAlignment: 'MIDDLE',
                                    textFormat: {
                                        fontSize: 16,
                                        bold: true,
                                        foregroundColor: { red: 0.12, green: 0.15, blue: 0.35 }
                                    }
                                }
                            },
                            fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)'
                        }
                    },
                    // 5. 기본 텍스트 정렬 및 스타일 (A5:D9 - 메타데이터 영역)
                    // - 라벨 (A, C열)
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 4, endRowIndex: 9, startColumnIndex: 0, endColumnIndex: 1 },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: { red: 0.96, green: 0.96, blue: 0.98 },
                                    horizontalAlignment: 'CENTER',
                                    verticalAlignment: 'MIDDLE',
                                    textFormat: { fontSize: 10, bold: true, foregroundColor: { red: 0.3, green: 0.3, blue: 0.3 } }
                                }
                            },
                            fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)'
                        }
                    },
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 4, endRowIndex: 9, startColumnIndex: 2, endColumnIndex: 3 },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: { red: 0.96, green: 0.96, blue: 0.98 },
                                    horizontalAlignment: 'CENTER',
                                    verticalAlignment: 'MIDDLE',
                                    textFormat: { fontSize: 10, bold: true, foregroundColor: { red: 0.3, green: 0.3, blue: 0.3 } }
                                }
                            },
                            fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)'
                        }
                    },
                    // - 값 (B, D열)
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 4, endRowIndex: 9, startColumnIndex: 1, endColumnIndex: 2 },
                            cell: {
                                userEnteredFormat: {
                                    horizontalAlignment: 'LEFT',
                                    verticalAlignment: 'MIDDLE',
                                    textFormat: { fontSize: 10 }
                                }
                            },
                            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)'
                        }
                    },
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 4, endRowIndex: 9, startColumnIndex: 3, endColumnIndex: 4 },
                            cell: {
                                userEnteredFormat: {
                                    horizontalAlignment: 'LEFT',
                                    verticalAlignment: 'MIDDLE',
                                    textFormat: { fontSize: 10 }
                                }
                            },
                            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)'
                        }
                    },
                    // 6. 섹션 1 헤더 스타일 (A11:D11)
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 10, endRowIndex: 11, startColumnIndex: 0, endColumnIndex: 4 },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: { red: 0.88, green: 0.96, blue: 0.94 },
                                    horizontalAlignment: 'LEFT',
                                    verticalAlignment: 'MIDDLE',
                                    textFormat: {
                                        fontSize: 10,
                                        bold: true,
                                        foregroundColor: { red: 0.05, green: 0.35, blue: 0.30 }
                                    }
                                }
                            },
                            fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)'
                        }
                    },
                    // 7. 섹션 1 표 헤더 스타일 (A12:D12)
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 11, endRowIndex: 12, startColumnIndex: 0, endColumnIndex: 4 },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 },
                                    horizontalAlignment: 'CENTER',
                                    verticalAlignment: 'MIDDLE',
                                    textFormat: { fontSize: 9, bold: true, foregroundColor: { red: 0.2, green: 0.2, blue: 0.2 } }
                                }
                            },
                            fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)'
                        }
                    },
                    // 8. 섹션 1 표 데이터 스타일 (A13:D13)
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 12, endRowIndex: 13, startColumnIndex: 0, endColumnIndex: 4 },
                            cell: {
                                userEnteredFormat: {
                                    horizontalAlignment: 'CENTER',
                                    verticalAlignment: 'MIDDLE',
                                    textFormat: { fontSize: 10 }
                                }
                            },
                            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)'
                        }
                    },
                    // - 합격수량 (C열) 폰트강조
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 12, endRowIndex: 13, startColumnIndex: 2, endColumnIndex: 3 },
                            cell: {
                                userEnteredFormat: {
                                    textFormat: { fontSize: 10, bold: true, foregroundColor: { red: 0.05, green: 0.45, blue: 0.40 } }
                                }
                            },
                            fields: 'userEnteredFormat(textFormat)'
                        }
                    },
                    // - 불량수량 (D열) 폰트강조
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 12, endRowIndex: 13, startColumnIndex: 3, endColumnIndex: 4 },
                            cell: {
                                userEnteredFormat: {
                                    textFormat: {
                                        fontSize: 10,
                                        bold: true,
                                        foregroundColor: isFailed ? { red: 0.75, green: 0.05, blue: 0.20 } : { red: 0.2, green: 0.2, blue: 0.2 }
                                    }
                                }
                            },
                            fields: 'userEnteredFormat(textFormat)'
                        }
                    },
                    // 9. 최종판정 행 스타일 (A14:D14)
                    // - 라벨 (A열)
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 13, endRowIndex: 14, startColumnIndex: 0, endColumnIndex: 1 },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: { red: 0.96, green: 0.96, blue: 0.98 },
                                    horizontalAlignment: 'CENTER',
                                    verticalAlignment: 'MIDDLE',
                                    textFormat: { fontSize: 10, bold: true }
                                }
                            },
                            fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)'
                        }
                    },
                    // - 판정 결과 값 (B~D열 병합된 셀)
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 13, endRowIndex: 14, startColumnIndex: 1, endColumnIndex: 4 },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: isFailed ? { red: 1.0, green: 0.94, blue: 0.95 } : { red: 0.94, green: 0.99, blue: 0.95 },
                                    horizontalAlignment: 'CENTER',
                                    verticalAlignment: 'MIDDLE',
                                    textFormat: {
                                        fontSize: 10,
                                        bold: true,
                                        foregroundColor: isFailed ? { red: 0.75, green: 0.05, blue: 0.20 } : { red: 0.05, green: 0.45, blue: 0.40 }
                                    }
                                }
                            },
                            fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)'
                        }
                    },
                    // 10. 섹션 2 헤더 스타일 (A16:D16 - now Row 15)
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 15, endRowIndex: 16, startColumnIndex: 0, endColumnIndex: 4 },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: { red: 0.99, green: 0.95, blue: 0.85 },
                                    horizontalAlignment: 'LEFT',
                                    verticalAlignment: 'MIDDLE',
                                    textFormat: {
                                        fontSize: 10,
                                        bold: true,
                                        foregroundColor: { red: 0.55, green: 0.30, blue: 0.05 }
                                    }
                                }
                            },
                            fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)'
                        }
                    },
                    // 11. 섹션 2 데이터 행 표 헤더 스타일 (A17:D17 - now Row 16)
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 16, endRowIndex: 17, startColumnIndex: 0, endColumnIndex: 4 },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 },
                                    horizontalAlignment: 'CENTER',
                                    verticalAlignment: 'MIDDLE',
                                    textFormat: { fontSize: 9, bold: true, foregroundColor: { red: 0.2, green: 0.2, blue: 0.2 } }
                                }
                            },
                            fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)'
                        }
                    },
                    // 12. 섹션 2 불량 리스트 데이터 행 스타일 (A18:C20 - now Rows 17-19)
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 17, endRowIndex: 20, startColumnIndex: 0, endColumnIndex: 2 },
                            cell: {
                                userEnteredFormat: {
                                    horizontalAlignment: 'CENTER',
                                    verticalAlignment: 'MIDDLE',
                                    textFormat: { fontSize: 10 }
                                }
                            },
                            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)'
                        }
                    },
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 17, endRowIndex: 20, startColumnIndex: 2, endColumnIndex: 4 },
                            cell: {
                                userEnteredFormat: {
                                    horizontalAlignment: 'LEFT',
                                    verticalAlignment: 'MIDDLE',
                                    textFormat: { fontSize: 10 }
                                }
                            },
                            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)'
                        }
                    },
                    // 12.2. 섹션 2 조치방안 행 스타일 (A21:D21 - now Row 20)
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 20, endRowIndex: 21, startColumnIndex: 0, endColumnIndex: 1 },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: { red: 0.96, green: 0.96, blue: 0.98 },
                                    horizontalAlignment: 'CENTER',
                                    verticalAlignment: 'MIDDLE',
                                    textFormat: { fontSize: 10, bold: true, foregroundColor: { red: 0.3, green: 0.3, blue: 0.3 } }
                                }
                            },
                            fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)'
                        }
                    },
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 20, endRowIndex: 21, startColumnIndex: 1, endColumnIndex: 4 },
                            cell: {
                                userEnteredFormat: {
                                    horizontalAlignment: 'LEFT',
                                    verticalAlignment: 'MIDDLE',
                                    textFormat: { fontSize: 10 }
                                }
                            },
                            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)'
                        }
                    },
                    // 13. 하단 안내 및 서명 서식
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 22, endRowIndex: 23, startColumnIndex: 0, endColumnIndex: 4 },
                            cell: {
                                userEnteredFormat: {
                                    horizontalAlignment: 'CENTER',
                                    verticalAlignment: 'MIDDLE',
                                    textFormat: { fontSize: 11, bold: true, foregroundColor: { red: 0.2, green: 0.2, blue: 0.2 } }
                                }
                            },
                            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)'
                        }
                    },
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 23, endRowIndex: 24, startColumnIndex: 0, endColumnIndex: 4 },
                            cell: {
                                userEnteredFormat: {
                                    horizontalAlignment: 'CENTER',
                                    verticalAlignment: 'MIDDLE',
                                    textFormat: { fontSize: 10, foregroundColor: { red: 0.3, green: 0.3, blue: 0.3 } }
                                }
                            },
                            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)'
                        }
                    },
                    {
                        repeatCell: {
                            range: { sheetId: 0, startRowIndex: 25, endRowIndex: 26, startColumnIndex: 2, endColumnIndex: 4 },
                            cell: {
                                userEnteredFormat: {
                                    horizontalAlignment: 'RIGHT',
                                    verticalAlignment: 'MIDDLE',
                                    textFormat: { fontSize: 11, bold: true, foregroundColor: { red: 0.1, green: 0.1, blue: 0.1 } }
                                }
                            },
                            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)'
                        }
                    }
                ];

                // 불량 발생 시, F열 4행에 구글 시트 3D Pie Chart 동적 생성 및 위치
                if (isFailed && defects.length > 0) {
                    const chartEndRow = 17 + Math.min(3, defects.length);
                    batchRequests.push({
                        addChart: {
                            chart: {
                                spec: {
                                    title: "부적합 유형 비율 분석",
                                    titleTextFormat: {
                                        fontFamily: "Arial",
                                        fontSize: 11,
                                        bold: true,
                                        foregroundColor: { red: 0.1, green: 0.1, blue: 0.1 }
                                    },
                                    pieChart: {
                                        threeDimensional: true,
                                        legendPosition: "RIGHT_LEGEND",
                                        domain: {
                                            sourceRange: {
                                                sources: [
                                                    {
                                                        sheetId: 0,
                                                        startRowIndex: 17,
                                                        endRowIndex: chartEndRow,
                                                        startColumnIndex: 0,
                                                        endColumnIndex: 1
                                                    }
                                                ]
                                            }
                                        },
                                        series: {
                                            sourceRange: {
                                                sources: [
                                                    {
                                                        sheetId: 0,
                                                        startRowIndex: 17,
                                                        endRowIndex: chartEndRow,
                                                        startColumnIndex: 1,
                                                        endColumnIndex: 2
                                                    }
                                                ]
                                            }
                                        }
                                    }
                                },
                                position: {
                                    overlayPosition: {
                                        anchorCell: {
                                            sheetId: 0,
                                            rowIndex: 4,
                                            columnIndex: 5
                                        },
                                        offsetXPixels: 25,
                                        offsetYPixels: 0,
                                        widthPixels: 330,
                                        heightPixels: 240
                                    }
                                }
                            }
                        }
                    });
                }

                const formatRes = await fetch(batchUpdateUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        requests: batchRequests
                    })
                });

                if (!formatRes.ok) {
                    console.warn('구글 시트 스타일 포맷팅 적용 실패 (데이터 기입은 완료됨):', await formatRes.text());
                }
            } catch (styleErr) {
                console.error('구글 시트 스타일링 중 오류 발생:', styleErr);
            }

            // 구글 시트 링크 즉시 DB 업데이트하여 중복 생성 방지
            try {
                await updateDoc(doc(db, 'receiving', item.id), {
                    GoogleSheetLink: docUrl
                });
            } catch (dbErr) {
                console.error('구글 시트 링크 DB 업데이트 실패:', dbErr);
            }

            setGoogleSheetLink(docUrl);
            setIsSheetCreated(true);
            
            // 템플릿 생성 시 바로 팝업(Preview)을 띄워서 사용자에게 보여줌
            setShowPreview(true);
        } catch (err) {
            console.error(err);
            alert(`오류: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitWithSheet = async (e) => {
        e.preventDefault();
        const pQty = parseInt(passedQty) || 0;
        const fQty = parseInt(failedQty) || 0;
        const targetQty = item.Qty || 0;

        if (pQty + fQty !== targetQty) {
            return alert(`합격 수량(${pQty})과 불량 수량(${fQty})의 합이 총 입고 수량(${targetQty})과 일치해야 합니다.`);
        }

        if (fQty > 0) {
            if (defects.length === 0) {
                return alert('불량 수량이 1개 이상일 경우, 반드시 불량 사유를 1개 이상 등록해야 합니다.');
            }
            const totalDefectQty = defects.reduce((sum, d) => sum + (d.qty || 0), 0);
            if (totalDefectQty !== fQty) {
                return alert(`입력하신 총 불량 수량(${fQty})과 등록된 불량 상세 수량의 합(${totalDefectQty})이 일치하지 않습니다.`);
            }
            if (handlingType === 'SpecialAcceptance' && !specialAcceptanceCondition) {
                return alert('특채로 처리하는 경우 특채 조건을 반드시 입력해야 합니다.');
            }
        }

        if (!googleSheetLink) {
            return alert('수입검사성적서 작성이 완료되지 않았습니다. 먼저 성적서를 생성하고 작성해 주세요.');
        }

        if (!window.confirm('검사 결과 및 작성된 구글 시트 링크를 저장하고 검사를 완료하시겠습니까?')) return;

        setLoading(true);
        try {
            const batch = writeBatch(db);
            const receivingRef = doc(db, 'receiving', item.id);

            // 1. Update Receiving Document
            batch.update(receivingRef, {
                Status: 'INSPECTION_COMPLETE',
                PassedQty: pQty,
                FailedQty: fQty,
                Defects: defects,
                InspectionMethod: inspectionMethod,
                HandlingType: fQty > 0 ? handlingType : 'None',
                SpecialAcceptanceCondition: (fQty > 0 && handlingType === 'SpecialAcceptance') ? specialAcceptanceCondition : '',
                GoogleSheetLink: googleSheetLink,
                LotNumber: lotNumber,
                DrawingNo: drawingNo,
                InspectionTool: inspectionTool,
                MeasuredSpec: '',
                MeasuredValue: '',
                DefectPhotoUrl: defectPhotoUrl,
                InspectedAt: serverTimestamp(),
                InspectedBy: userProfile?.uid || 'Unknown'
            });

            // 2. If FailedQty > 0, create a Return (NCR) document
            if (fQty > 0) {
                const returnRef = doc(collection(db, 'returns'));
                batch.set(returnRef, {
                    ReceivingID: item.id,
                    PO_ID: item.PO_ID,
                    PONumber: item.PONumber,
                    PartID: item.PartID,
                    PartName: item.PartName,
                    VendorName: item.VendorName,
                    Qty: fQty,
                    Defects: defects,
                    HandlingType: handlingType,
                    SpecialAcceptanceCondition: handlingType === 'SpecialAcceptance' ? specialAcceptanceCondition : '',
                    GoogleSheetLink: googleSheetLink,
                    LotNumber: lotNumber,
                    DrawingNo: drawingNo,
                    InspectionTool: inspectionTool,
                    MeasuredSpec: '',
                    MeasuredValue: '',
                    DefectPhotoUrl: defectPhotoUrl,
                    Status: handlingType === 'SpecialAcceptance' ? 'SPECIAL_ACCEPTED' : 'WAITING_RETURN',
                    CreatedAt: serverTimestamp(),
                    CreatedBy: userProfile?.uid || 'Unknown'
                });
            }

            await batch.commit();
            alert('성적서 저장 및 검사 처리가 완료되었습니다.');
            onRefresh && await onRefresh();
            onClose();
        } catch (error) {
            console.error("QA Inspection Failed:", error);
            alert('검사 처리 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const content = (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-4 flex justify-between items-center shrink-0 border-b border-indigo-500/20 shadow-md">
                    <div>
                        <h2 className="text-sm md:text-base font-black text-white tracking-tight flex items-center gap-2">
                            <CheckCircle2 size={20} className="text-teal-400 drop-shadow-[0_0_8px_rgba(20,184,166,0.5)]" />
                            QA 입고 검사 (Receiving Inspection)
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-slate-350 hover:text-white transition-all active:scale-95">
                        <X size={15} />
                    </button>
                </div>

                <form id="qaForm" onSubmit={handleSubmitWithSheet} className="flex-1 overflow-y-auto p-4 bg-slate-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                        
                        {/* Left Column: Info & Summary */}
                        <div className="space-y-4">
                            {/* Item Info Summary */}
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3.5 hover:shadow-md transition-all duration-300">
                                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0 border border-indigo-100">
                                    <Package size={20} className="text-indigo-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-black text-indigo-600 mb-0.5 tracking-wider">{item.PONumber}</p>
                                    <h3 className="text-sm font-black text-slate-900 leading-snug truncate">{item.PartName}</h3>
                                    <p className="text-xs text-slate-500 mt-1 font-bold">공급사: <span className="text-slate-700">{item.VendorName}</span></p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">입고 수량</p>
                                    <p className="text-2xl font-black text-slate-905 tracking-tight">{item.Qty} <span className="text-xs font-bold text-slate-500">EA</span></p>
                                </div>
                            </div>

                            {/* 검사기준서 (도면/문서 PDF) 보기 버튼 */}
                            {partDatasheet ? (
                                <a 
                                    href={partDatasheet} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 hover:border-indigo-300 rounded-xl text-xs font-black shadow-sm transition-all duration-200 active:scale-[0.98] select-none"
                                >
                                    <FileText size={14} className="text-indigo-600 shrink-0" />
                                    <span>검사기준서 (도면/문서 PDF 보기)</span>
                                </a>
                            ) : (
                                <div className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-50 text-slate-400 border border-slate-200 rounded-xl text-xs font-bold select-none cursor-not-allowed">
                                    <FileText size={14} className="text-slate-350 shrink-0" />
                                    <span>등록된 검사기준서 (PDF) 없음</span>
                                </div>
                            )}

                            {/* Receiving Request Details */}
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300">
                                <h4 className="text-[10px] font-black text-slate-400 border-b border-slate-100 pb-2 mb-3 uppercase tracking-wider">입고 신청 상세 내역</h4>
                                <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-xs">
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 mb-0.5 uppercase">Part ID</p>
                                        <p className="font-bold text-slate-700 truncate">{item.PartID || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 mb-0.5 uppercase">입고 일시</p>
                                        <p className="font-bold text-slate-700 truncate">{item.ReceivedAt?.toDate ? item.ReceivedAt.toDate().toLocaleString() : '-'}</p>
                                    </div>
                                    <div className="col-span-2 mt-1">
                                        <p className="text-[9px] font-black text-slate-400 mb-1.5 uppercase">Invoice Memo</p>
                                        <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-100 min-h-[50px] shadow-inner">
                                            <p className="font-bold text-slate-600 text-[11px] leading-relaxed">{item.InvoiceMemo || '작성된 전달 사항 없음'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* 검사 기본 정보 및 품질 추적 */}
                            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm hover:shadow-md hover:shadow-slate-100/50 hover:border-slate-350 transition-all duration-300 space-y-4 focus-within:ring-2 focus-within:ring-indigo-500/10">
                                <h4 className="text-[10px] font-black text-slate-400 border-b border-slate-100 pb-1.5 uppercase tracking-wider">검사 기본 정보 및 품질 추적</h4>
                                <div className="grid grid-cols-2 gap-3.5">
                                    <div>
                                        <label className="block text-[9px] font-black text-slate-400 mb-1.5 uppercase">제조 LOT 번호</label>
                                        <input 
                                            type="text" 
                                            value={lotNumber} 
                                            onChange={e => setLotNumber(e.target.value)} 
                                            placeholder="LOT No 입력" 
                                            className="w-full bg-white border border-slate-200 hover:border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all duration-200"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-black text-slate-400 mb-1.5 uppercase">도면 번호/리비전</label>
                                        <input 
                                            type="text" 
                                            value={drawingNo} 
                                            onChange={e => setDrawingNo(e.target.value)} 
                                            placeholder="DWG / Rev 입력" 
                                            className="w-full bg-white border border-slate-200 hover:border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all duration-200"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-black text-slate-400 mb-1.5 uppercase">사용 계측기</label>
                                        <select 
                                            value={inspectionTool} 
                                            onChange={e => setInspectionTool(e.target.value)} 
                                            className="w-full bg-white border border-slate-200 hover:border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all duration-200"
                                        >
                                            <option value="Vernier Calipers">버니어 캘리퍼스 (Vernier Calipers)</option>
                                            <option value="Micrometer">마이크로미터 (Micrometer)</option>
                                            <option value="Height Gauge">하이트 게이지 (Height Gauge)</option>
                                            <option value="Pin Gauge">핀 게이지 (Pin Gauge)</option>
                                            <option value="Profile Projector">투영기 (Profile Projector)</option>
                                            <option value="Visual Inspection">육안 검사 (Visual / No Tool)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-black text-slate-400 mb-1.5 uppercase tracking-wider">검사 방법</label>
                                        <div className="flex gap-2">
                                            <button 
                                                type="button" 
                                                onClick={() => setInspectionMethod('Full')} 
                                                className={clsx("flex-1 py-2 text-xs font-black rounded-lg border transition-all duration-200 active:scale-[0.98]", inspectionMethod === 'Full' ? "bg-teal-50 border-teal-200 text-teal-600" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50")}
                                            >
                                                전수
                                            </button>
                                            <button 
                                                type="button" 
                                                onClick={() => setInspectionMethod('Sample')} 
                                                className={clsx("flex-1 py-2 text-xs font-black rounded-lg border transition-all duration-200 active:scale-[0.98]", inspectionMethod === 'Sample' ? "bg-teal-50 border-teal-200 text-teal-600" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50")}
                                            >
                                                샘플
                                            </button>
                                        </div>
                                    </div>

                                    {parseInt(failedQty) > 0 && (
                                        <div className="col-span-2 grid grid-cols-2 gap-3.5 pt-3.5 border-t border-dashed border-slate-100">
                                            <div>
                                                <label className="block text-[9px] font-black text-slate-400 mb-1.5 uppercase tracking-wider">불량품 처리 방식</label>
                                                <div className="flex gap-2">
                                                    <button 
                                                        type="button" 
                                                        onClick={() => setHandlingType('Return')} 
                                                        className={clsx("flex-1 py-2 text-xs font-black rounded-lg border transition-all duration-200 active:scale-[0.98]", handlingType === 'Return' ? "bg-rose-50 border-rose-200 text-rose-600" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50")}
                                                    >
                                                        반품
                                                    </button>
                                                    <button 
                                                        type="button" 
                                                        onClick={() => setHandlingType('SpecialAcceptance')} 
                                                        className={clsx("flex-1 py-2 text-xs font-black rounded-lg border transition-all duration-200 active:scale-[0.98]", handlingType === 'SpecialAcceptance' ? "bg-amber-50 border-amber-200 text-amber-600" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50")}
                                                    >
                                                        특채
                                                    </button>
                                                </div>
                                            </div>
                                            {handlingType === 'SpecialAcceptance' && (
                                                <div>
                                                    <label className="block text-[9px] font-black text-slate-400 mb-1.5 uppercase tracking-wider">특채 조건 (필수)</label>
                                                    <input 
                                                        type="text" 
                                                        value={specialAcceptanceCondition}
                                                        onChange={e => setSpecialAcceptanceCondition(e.target.value)}
                                                        placeholder="특채 조건/사유 입력"
                                                        className="w-full bg-white border border-slate-200 hover:border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all duration-200"
                                                        required
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {/* 안내 문구 */}
                            <div className="bg-blue-50/60 p-3.5 rounded-xl border border-blue-100 flex items-start gap-2.5 shadow-sm">
                                <Info size={15} className="text-blue-600 mt-0.5 shrink-0" />
                                <p className="text-xs text-blue-900 font-semibold leading-relaxed">
                                    합격품은 <b>'적재 대기'</b> 상태가 되며, 불량품은 즉각 <b>'부적합품'</b> 목록으로 이관되어 반품/폐기 프로세스를 타게 됩니다.
                                </p>
                            </div>
                        </div>

                        {/* Right Column: QA Inputs Form */}
                        <div className="space-y-4">
                            {/* Qty Input */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-gradient-to-b from-white to-teal-50/20 p-3 rounded-xl border border-teal-100 hover:border-teal-200 hover:shadow-md hover:shadow-teal-500/5 transition-all duration-300 shadow-sm relative overflow-hidden">
                                    <label className="text-[10px] font-black text-teal-700 flex items-center gap-1 mb-1.5">
                                        <CheckCircle size={12} className="text-teal-600" /> 합격 수량 (Passed)
                                    </label>
                                    <input 
                                        type="number" 
                                        min="0" 
                                        max={item.Qty}
                                        value={passedQty} 
                                        onChange={handlePassedQtyChange} 
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-lg font-black text-teal-600 text-center focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition-all duration-200"
                                        required 
                                    />
                                </div>
                                <div className="bg-gradient-to-b from-white to-rose-50/20 p-3 rounded-xl border border-rose-100 hover:border-rose-200 hover:shadow-md hover:shadow-rose-500/5 transition-all duration-300 shadow-sm relative overflow-hidden">
                                    <label className="text-[10px] font-black text-rose-700 flex items-center gap-1 mb-1.5">
                                        <XCircle size={12} className="text-rose-600" /> 불량 수량 (Failed)
                                    </label>
                                    <input 
                                        type="number" 
                                        min="0" 
                                        max={item.Qty}
                                        value={failedQty} 
                                        onChange={handleFailedQtyChange} 
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-lg font-black text-rose-600 text-center focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 transition-all duration-200"
                                        required 
                                    />
                                </div>
                            </div>

                            {/* Defect Entry Section */}
                            {parseInt(failedQty) > 0 && (
                                <div className="bg-white p-4 rounded-xl border border-rose-200 hover:border-rose-350 hover:shadow-md hover:shadow-rose-500/5 transition-all duration-300 shadow-sm space-y-3 focus-within:ring-2 focus-within:ring-rose-500/10">
                                    <h3 className="text-xs font-black text-rose-800 flex items-center gap-1.5">
                                        <AlertTriangle size={14} /> 불량 사유 등록 (NCR 연계)
                                    </h3>
                                    
                                    <div className="flex gap-1.5 items-start">
                                        <div className="w-1/3">
                                            <select 
                                                value={currentDefectType} 
                                                onChange={e => setCurrentDefectType(e.target.value)}
                                                className="w-full bg-white border border-slate-200 hover:border-slate-300 rounded-lg p-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 transition-all duration-200"
                                            >
                                                <option value="">유형</option>
                                                {dbDefectTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>
                                        <div className="w-16">
                                            <input 
                                                type="number" 
                                                min="1"
                                                value={currentDefectQty}
                                                onChange={e => setCurrentDefectQty(e.target.value)}
                                                placeholder="수량"
                                                className="w-full bg-white border border-slate-200 hover:border-slate-300 rounded-lg p-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 transition-all duration-200 text-center"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <input 
                                                type="text" 
                                                value={currentDefectNote}
                                                onChange={e => setCurrentDefectNote(e.target.value)}
                                                placeholder="메모(선택)"
                                                className="w-full bg-white border border-slate-200 hover:border-slate-300 rounded-lg p-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 transition-all duration-200"
                                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addDefect())}
                                            />
                                        </div>
                                        <button 
                                            type="button" 
                                            onClick={addDefect}
                                            className="p-1.5 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-700 whitespace-nowrap"
                                        >
                                            추가
                                        </button>
                                    </div>

                                    {defects.length > 0 ? (
                                        <div className="space-y-1.5">
                                            {defects.map((d, idx) => (
                                                <div key={idx} className="flex justify-between items-center bg-rose-50 border border-rose-100 rounded-lg px-2 py-1 text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <span className="px-1.5 py-0.5 bg-rose-200 text-rose-800 rounded text-[10px] font-black">{d.type}</span>
                                                        <span className="font-black text-rose-600">{d.qty}개</span>
                                                        <span className="text-slate-700 truncate max-w-[120px]">{d.note || '-'}</span>
                                                    </div>
                                                    <button type="button" onClick={() => removeDefect(idx)} className="text-rose-400 hover:text-rose-600">
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-2 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                                            <p className="text-[10px] text-slate-400 font-bold">등록된 불량 사유가 없습니다. (1개 이상 필수)</p>
                                        </div>
                                    )}

                                    {/* 불량 사진 등록 */}
                                    <div className="pt-2 border-t border-slate-100">
                                        <label className="block text-[9px] font-black text-slate-400 mb-1 uppercase">불량 현물 사진 URL</label>
                                        <input 
                                            type="url" 
                                            value={defectPhotoUrl} 
                                            onChange={e => setDefectPhotoUrl(e.target.value)} 
                                            placeholder="https://drive.google.com/..." 
                                            className="w-full bg-white border border-slate-200 hover:border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 transition-all duration-200"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* 성적서 구글 시트 연동 */}
                            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm hover:shadow-md hover:shadow-slate-100/50 hover:border-slate-350 transition-all duration-300 space-y-4 focus-within:ring-2 focus-within:ring-indigo-500/10">
                                <h4 className="text-[10px] font-black text-slate-400 border-b border-slate-100 pb-1.5 uppercase tracking-wider">성적서 구글 시트 연동</h4>
                                <div className="bg-gradient-to-br from-indigo-50/10 to-emerald-50/10 p-3.5 rounded-xl border border-indigo-200/80 shadow-inner space-y-3">
                                    <div className="flex justify-between items-center">
                                        <label className="block text-[9px] font-black text-indigo-750 uppercase tracking-wider">📝 성적서 구글 시트 연동</label>
                                        {isSheetCreated && (
                                            <span className="text-[9px] font-black text-emerald-600 bg-emerald-50/80 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1 select-none">
                                                <CheckCircle2 size={10} /> 연동 완료
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-2.5 items-center">
                                        <button
                                            type="button"
                                                onClick={handlePreCreateSheet}
                                                className={clsx(
                                                    "px-4 py-2 text-white rounded-lg text-xs font-black transition-all duration-300 flex items-center gap-1.5 shadow-md active:scale-[0.98] shrink-0",
                                                    isSheetCreated 
                                                        ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200/50" 
                                                        : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200/50 animate-pulse"
                                                )}
                                            >
                                                {isSheetCreated ? (
                                                    <>
                                                        <ExternalLink size={13} /> 구글 시트 열기
                                                    </>
                                                ) : (
                                                    <>
                                                        <Cloud size={13} /> 구글 시트 생성
                                                    </>
                                                )}
                                            </button>
                                            
                                            <div className="flex-1">
                                                <input
                                                    type="url"
                                                    value={googleSheetLink}
                                                    onChange={e => setGoogleSheetLink(e.target.value)}
                                                    placeholder="작성된 성적서 Google Sheet 링크 연동"
                                                    className="w-full bg-white border border-slate-200 hover:border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all duration-200"
                                                    required
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </form>

                <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-3 shrink-0">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 bg-slate-100 text-slate-600 font-black text-sm rounded-xl hover:bg-slate-200 transition-colors">
                        취소
                    </button>
                    <button type="submit" form="qaForm" disabled={loading || !googleSheetLink} className="px-8 py-2.5 bg-slate-800 text-white font-black text-sm rounded-xl hover:bg-slate-900 shadow-md flex items-center gap-2 disabled:opacity-50">
                        {loading ? '처리중...' : (
                            <>
                                <CheckCircle2 size={16} />
                                검사 완료 확정
                            </>
                        )}
                    </button>
                </div>

            </div>

            {/* ─── 시트 생성 직후 보여줄 지능형 예시 템플릿 팝업 ─── */}
            {showPreview && (
                <div className="fixed inset-0 bg-slate-955/80 z-[20000] flex items-center justify-center p-6 backdrop-blur-md">
                    <div className="bg-slate-900 rounded-3xl w-full max-w-4xl shadow-2xl p-6 border border-slate-800 flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-4">
                            <div>
                                <h3 className="text-base font-black text-white flex items-center gap-2">
                                    <CheckCircle2 size={18} className="text-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.3)]" />
                                    수입검사성적서 시트 생성 완료 (A4 미리보기)
                                </h3>
                                <p className="text-xs text-slate-400 font-medium mt-1">구글 시트 템플릿 영역(A1:D35)에 자동 반영된 성적서 문서 레이아웃입니다.</p>
                            </div>
                            <button onClick={() => setShowPreview(false)} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        {/* 시트 서식 미리보기 목업 작업대 캠버스 */}
                        <div className="flex-1 overflow-auto bg-slate-950 p-6 flex justify-center items-start gap-6 min-h-[520px] shadow-inner border border-slate-950 rounded-2xl">
                            {/* A4 Sheet Mockup Canvas */}
                            <div className="bg-white w-[595px] min-h-[842px] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5),_0_2px_8px_rgba(0,0,0,0.2)] border border-slate-200/50 rounded-sm flex flex-col justify-between shrink-0 select-none text-slate-800 font-sans">
                                
                                <div className="space-y-6">
                                    {/* Document Header Title */}
                                    <div className="text-center pb-2 border-b-4 double border-slate-950">
                                        <h2 className="text-lg font-black tracking-[0.3em] text-slate-900 uppercase">수 입 검 사 성 적 서</h2>
                                    </div>
                                    
                                    {/* Metadata Box Grid */}
                                    <table className="w-full border-collapse border border-slate-400 text-[10px] mb-4 font-medium">
                                        <tbody>
                                            <tr>
                                                <td className="border border-slate-400 bg-slate-50 px-2 py-1.5 font-bold text-center w-24 text-slate-600">발주 번호</td>
                                                <td className="border border-slate-400 px-2 py-1.5 w-44 font-semibold text-slate-800">{item.PONumber}</td>
                                                <td className="border border-slate-400 bg-slate-50 px-2 py-1.5 font-bold text-center w-24 text-slate-600">공급사</td>
                                                <td className="border border-slate-400 px-2 py-1.5 font-semibold text-slate-800">{item.VendorName}</td>
                                            </tr>
                                            <tr>
                                                <td className="border border-slate-400 bg-slate-50 px-2 py-1.5 font-bold text-center text-slate-600">품목 번호</td>
                                                <td className="border border-slate-400 px-2 py-1.5 font-semibold text-slate-800">{item.PartID}</td>
                                                <td className="border border-slate-400 bg-slate-50 px-2 py-1.5 font-bold text-center text-slate-600">품목명</td>
                                                <td className="border border-slate-400 px-2 py-1.5 truncate max-w-[150px] font-semibold text-slate-800">{item.PartName}</td>
                                            </tr>
                                            <tr>
                                                <td className="border border-slate-400 bg-slate-50 px-2 py-1.5 font-bold text-center text-slate-600">검사 일시</td>
                                                <td className="border border-slate-400 px-2 py-1.5 font-semibold text-slate-800">{new Date().toLocaleString()}</td>
                                                <td className="border border-slate-400 bg-slate-50 px-2 py-1.5 font-bold text-center text-slate-600">검사자</td>
                                                <td className="border border-slate-400 px-2 py-1.5 font-semibold text-slate-800">{userProfile?.name || 'QA Manager'}</td>
                                            </tr>
                                            <tr>
                                                <td className="border border-slate-400 bg-slate-50 px-2 py-1.5 font-bold text-center text-slate-600">제조 LOT</td>
                                                <td className="border border-slate-400 px-2 py-1.5 font-semibold text-slate-800">{lotNumber || 'N/A'}</td>
                                                <td className="border border-slate-400 bg-slate-50 px-2 py-1.5 font-bold text-center text-slate-600">도면 번호/Rev</td>
                                                <td className="border border-slate-400 px-2 py-1.5 font-semibold text-slate-800">{drawingNo || 'N/A'}</td>
                                            </tr>
                                            <tr>
                                                <td className="border border-slate-400 bg-slate-50 px-2 py-1.5 font-bold text-center text-slate-600">사용 계측기</td>
                                                <td className="border border-slate-400 px-2 py-1.5 font-semibold text-slate-800" colSpan="3">{inspectionTool}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    
                                    {/* Section 1 */}
                                    <div>
                                        <div className="font-bold text-slate-900 mb-1.5 text-[10px] tracking-wide">[1. 검사 수량 및 합격 정보]</div>
                                        <table className="w-full border-collapse border border-slate-400 text-[10px] text-center">
                                            <thead>
                                                <tr className="bg-slate-50 font-bold text-slate-600">
                                                    <th className="border border-slate-400 p-1.5 w-1/4">총 입고 수량</th>
                                                    <th className="border border-slate-400 p-1.5 w-1/4">검사 방법</th>
                                                    <th className="border border-slate-400 p-1.5 w-1/4 text-teal-700">합격 수량</th>
                                                    <th className="border border-slate-400 p-1.5 w-1/4 text-rose-700">불량 수량</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td className="border border-slate-400 p-2 font-black">{item.Qty} EA</td>
                                                    <td className="border border-slate-400 p-2">{inspectionMethod === 'Sample' ? 'Sample 검사' : '전수 검사'}</td>
                                                    <td className="border border-slate-400 p-2 text-teal-600 font-black">{passedQty || 0} EA</td>
                                                    <td className="border border-slate-400 p-2 text-rose-600 font-black">{failedQty || 0} EA</td>
                                                </tr>
                                                <tr>
                                                    <td className="border border-slate-400 p-2 font-bold bg-slate-50 text-slate-600">최종 판정</td>
                                                    <td className="border border-slate-400 p-2 font-black text-left pl-3" colSpan="3">
                                                        <span className={parseInt(failedQty) > 0 ? "text-rose-600" : "text-teal-600"}>
                                                            {parseInt(failedQty) > 0 ? "불합격 포함" : "합격 (PASS)"}
                                                        </span>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Section 2 */}
                                    <div>
                                        <div className="font-bold text-slate-900 mb-1.5 text-[10px] tracking-wide">[2. 부적합 내용 및 조치 내역]</div>
                                        <table className="w-full border-collapse border border-slate-400 text-[10px] text-center mb-2">
                                            <thead>
                                                <tr className="bg-slate-50 font-bold text-slate-600">
                                                    <th className="border border-slate-400 p-1.5">불량 유형</th>
                                                    <th className="border border-slate-400 p-1.5 w-24">불량 수량</th>
                                                    <th className="border border-slate-400 p-1.5 text-left pl-3">상세 메모</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {defects.length > 0 ? (
                                                    <>
                                                        {defects.map((d, idx) => (
                                                            <tr key={idx}>
                                                                <td className="border border-slate-400 p-2 text-rose-600 font-bold">{d.type}</td>
                                                                <td className="border border-slate-400 p-2">{d.qty} EA</td>
                                                                <td className="border border-slate-400 p-2 text-left pl-3 truncate max-w-[200px]">{d.note || '-'}</td>
                                                            </tr>
                                                        ))}
                                                        {defects.length < 3 && Array.from({ length: 3 - defects.length }).map((_, idx) => (
                                                            <tr key={`empty-${idx}`}>
                                                                <td className="border border-slate-400 p-2 text-slate-400">-</td>
                                                                <td className="border border-slate-400 p-2 text-slate-400">-</td>
                                                                <td className="border border-slate-400 p-2 text-slate-400 text-left pl-3">-</td>
                                                            </tr>
                                                        ))}
                                                    </>
                                                ) : (
                                                    Array.from({ length: 3 }).map((_, idx) => (
                                                        <tr key={`empty-all-${idx}`}>
                                                            <td className="border border-slate-400 p-2 text-slate-400">-</td>
                                                            <td className="border border-slate-400 p-2 text-slate-400">-</td>
                                                            <td className="border border-slate-400 p-2 text-slate-400 text-left pl-3">-</td>
                                                        </tr>
                                                    ))
                                                )}
                                                <tr>
                                                    <td className="border border-slate-400 p-2 font-bold bg-slate-50 text-slate-600">부적합 조치방안</td>
                                                    <td className="border border-slate-400 p-2 text-left pl-3 font-semibold" colSpan="2">
                                                        {parseInt(failedQty) > 0 ? (handlingType === 'SpecialAcceptance' ? `특채 승인 (특채조건: ${specialAcceptanceCondition})` : '공급업체 반품 처리') : 'N/A'}
                                                    </td>
                                                </tr>
                                                {parseInt(failedQty) > 0 && defectPhotoUrl && (
                                                    <tr>
                                                        <td className="border border-slate-400 p-2 font-bold bg-slate-50 text-slate-600">불량 증빙 사진</td>
                                                        <td className="border border-slate-400 p-2 text-left pl-3 font-semibold" colSpan="2">
                                                            <a href={defectPhotoUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">불량 사진 링크 바로가기</a>
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* A4 Footer with Signature */}
                                <div className="text-center pt-8 border-t border-slate-200 mt-8 flex flex-col items-center shrink-0">
                                    <p className="text-slate-800 font-bold text-[11px]">위와 같이 수입검사 결과를 보고합니다.</p>
                                    <p className="text-slate-500 text-[10px] mt-1">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                    <div className="w-full flex justify-end mt-8 pr-4">
                                        <p className="text-slate-900 font-black text-[11px]">
                                            검사자 : <span className="underline underline-offset-4 px-2 font-bold">{userProfile?.name || 'QA Manager'}</span> (서명/인)
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Floating Chart Analysis Widget to the right of A4 wrapper */}
                            {parseInt(failedQty) > 0 && (() => {
                                const chartData = defects.map(d => ({
                                    name: d.type,
                                    value: parseInt(d.qty) || 0
                                }));
                                return (
                                    <div className="w-[200px] bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col items-center shrink-0 self-start mt-4 shadow-lg">
                                        <p className="font-black text-[10px] text-slate-400 mb-3 text-center uppercase tracking-wider">불량 유형 비율 분석</p>
                                        <div className="relative w-28 h-28 flex items-center justify-center bg-slate-950 rounded-full shadow-inner border border-slate-800">
                                            <div className="absolute inset-0">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart>
                                                        <Pie
                                                            data={chartData}
                                                            cx="50%"
                                                            cy="50%"
                                                            innerRadius={28}
                                                            outerRadius={40}
                                                            paddingAngle={2}
                                                            dataKey="value"
                                                            stroke="none"
                                                        >
                                                            {chartData.map((entry, index) => (
                                                                <Cell key={`cell-${index}`} fill={MOCKUP_COLORS[index % MOCKUP_COLORS.length]} />
                                                            ))}
                                                        </Pie>
                                                        <Tooltip contentStyle={{ fontSize: '8px', borderRadius: '6px', padding: '2px 6px' }} />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            </div>
                                            <div className="text-center z-10 pointer-events-none">
                                                <p className="text-sm font-black text-rose-500 leading-none">{(parseInt(failedQty) / item.Qty * 100).toFixed(1)}%</p>
                                                <p className="text-[6px] text-slate-400 font-bold mt-0.5">총 불량률</p>
                                            </div>
                                        </div>
                                        <div className="mt-4 w-full space-y-1.5 text-[9px] font-semibold text-slate-350">
                                            {defects.slice(0, 4).map((d, idx) => (
                                                <div key={idx} className="flex justify-between items-center">
                                                    <span className="flex items-center gap-1.5 truncate max-w-[110px]">
                                                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: MOCKUP_COLORS[idx % MOCKUP_COLORS.length] }}></span>
                                                        {d.type}
                                                    </span>
                                                    <span className="shrink-0 text-slate-500">{d.qty}개 ({(d.qty / failedQty * 100).toFixed(0)}%)</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="flex gap-3 justify-end mt-5 pt-4 border-t border-slate-800">
                            <button
                                onClick={() => setShowPreview(false)}
                                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-black text-xs rounded-xl transition-all"
                            >
                                닫기
                            </button>
                            <button
                                onClick={() => {
                                    window.open(googleSheetLink, '_blank');
                                    setShowPreview(false);
                                }}
                                className="px-6 py-2.5 bg-indigo-600 text-white font-black text-xs rounded-xl hover:bg-indigo-700 flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all duration-200 active:scale-95"
                            >
                                <ExternalLink size={14} />
                                구글 시트 바로 열기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return createPortal(content, document.body);
}
