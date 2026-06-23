import React, { useState, useEffect } from 'react';
import { db, auth as firebaseAuth, googleProvider } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from '../firebase';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, updateDoc, deleteDoc, where, limit } from '../firebase';
import { 
    Cloud, FileText, Search, File, Eye, Trash2, Edit3, Check, X, RefreshCw, 
    ExternalLink, Plus, FileSpreadsheet, Folder, ChevronRight, ArrowLeft, Key, AlertCircle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// 구글 API 권한 미승인 시 활용할 기본 가상 탐색 데이터
const INITIAL_DRIVE_DATA = {
    'root': [
        { id: 'f1', name: '01. 생산관리 및 계획', type: 'folder', size: '-', updatedAt: '2026-05-28', owner: '이영희 과장' },
        { id: 'f2', name: '02. 품질보증(QA) 자료', type: 'folder', size: '-', updatedAt: '2026-05-27', owner: '김민수 대리' },
        { id: 'f3', name: '03. 영업 수주 및 단가표', type: 'folder', size: '-', updatedAt: '2026-05-26', owner: '박동원 부장' },
        { 
            id: 'd1', 
            name: '전사 재고 실사 요약본.xlsx', 
            type: 'sheet', 
            size: '28 KB', 
            updatedAt: '2026-05-29', 
            owner: '시스템 관리자',
            googleLink: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUYptlbs74OgvE2upms/edit',
            content: '창고명,적재 품목,보유 수량,상태\n메인창고 A,프레임 바디,120,정상\n서브창고 B,모터 모듈,45,정상\n서브창고 C,컨트롤러 보드,12,부족(발주요망)\n불량대기소,리비전 PCB,8,검사대기'
        }
    ],
    'f1': [
        { 
            id: 'd101', 
            name: '2026년 5월 생산 계획서.xlsx', 
            type: 'sheet', 
            size: '14 KB', 
            updatedAt: '2026-05-28', 
            owner: '이영희 과장',
            googleLink: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUYptlbs74OgvE2upms/edit',
            content: '일자,목표 생산량,실적 수량,가동률,작업반장\n05-25,100,98,98%,박철수\n05-26,100,102,102%,이성민'
        }
    ],
    'f2': [],
    'f3': []
};

// 고정할 공유 폴더 ID 기본값
const DEFAULT_FOLDER_ID = '1aPZMTQhlxe_W-b9JA1bVp3qGowH1xQvj';

export default function GoogleDrivePage() {
    const { userProfile, currentUser } = useAuth();
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('drive');

    // 구글 드라이브 실시간 연동 상태
    const [folderId, setFolderId] = useState(() => localStorage.getItem('erp_gdrive_folder_id') || DEFAULT_FOLDER_ID);
    const [currentFolderId, setCurrentFolderId] = useState(folderId);
    const [pathHistory, setPathHistory] = useState([]);
    const [driveFiles, setDriveFiles] = useState([]);
    const [driveLoading, setDriveLoading] = useState(false);
    const [driveError, setDriveError] = useState(null);

    // 새 파일 작성 모달
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [templateType, setTemplateType] = useState('doc'); 
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [newFileName, setNewFileName] = useState('');
    const [newFileContent, setNewFileContent] = useState('');
    const [fileCategory, setFileCategory] = useState('local'); 
    const [googleLink, setGoogleLink] = useState('');

    // 파일 뷰어 모달
    const [activeViewFile, setActiveViewFile] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState('');

    // 폴더 설정 모달
    const [tempFolderId, setTempFolderId] = useState('');
    const [isConfigOpen, setIsConfigOpen] = useState(false);

    // 문서 작성 템플릿
    const templates = [
        { id: 't1', name: '생산 보고서 템플릿', type: 'doc', desc: '일일/주간 생산 진행률 및 이슈 기재 양식', defaultContent: '■ 일일 생산 업무 보고\n작성일자: 2026년   월   일\n작성자: \n\n1. 생산 현황 요약\n- 목표 수량: \n- 달성 수량: \n- 달성률: \n\n2. 주요 이슈 및 조치사항\n- \n- ' },
        { id: 't2', name: '품질 NCR(부적합 보고서) 템플릿', type: 'doc', desc: 'QA 검수 시 부적합 자재 발생 보고서 양식', defaultContent: '■ 부적합(NCR) 보고서\n문서번호: NCR-2026- \n발행부서: QA 품질보증팀\n\n1. 대상 품목 정보\n- 부품번호(Part No): \n- 품명: \n- 로트번호: \n\n2. 부적합 내용 설명\n- \n\n3. 시정 조치 요구 사항\n- ' },
        { id: 't3', name: '견적서 & 단가 검토서 템플릿', type: 'sheet', desc: '고객사 수주 및 협력사 단가 비교를 위한 시트 양식', defaultContent: '품명,수량,단가,공급가액,세액,비고\n원자재 A,100,5000,500000,50000,\n가공품 B,50,12000,600000,60000,\n합계,,,1100000,110000,' },
        { id: 't4', name: '자재 입출고 의뢰서 템플릿', type: 'sheet', desc: '부품 출고 및 창고 적재 요청 양식', defaultContent: '요청부서,자재코드,품명,수량,창고위치,승인여부\n생산부,P001,메인 프레임,20,A-12,대기' }
    ];

    // Firestore 로컬 파일 로드
    const fetchLocalFiles = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'workspace_files'), orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            const list = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                updatedAt: doc.data().createdAt?.toDate()?.toLocaleDateString() || '방금 전'
            }));
            setFiles(list);
        } catch (error) {
            console.error('Error fetching files:', error);
        } finally {
            setLoading(false);
        }
    };

    // 알림 생성 유틸
    const triggerWarningNotification = async (msg) => {
        if (!currentUser?.email) return;
        try {
            const ref = collection(db, 'notifications');
            const q = query(ref, where('userEmail', '==', currentUser.email), limit(10));
            const snapshot = await getDocs(q);
            const isDuplicate = snapshot.docs.some(doc => {
                const data = doc.data();
                return data.title === '구글 Workspace 연동 실패' && data.read === false;
            });

            if (!isDuplicate) {
                await addDoc(collection(db, 'notifications'), {
                    title: '구글 Workspace 연동 실패',
                    message: msg,
                    createdAt: serverTimestamp(),
                    read: false,
                    type: 'warning',
                    userEmail: currentUser.email
                });
            }
        } catch (e) {
            console.error("Firestore 알림 추가 실패:", e);
        }
    };

    // 구글 토큰 만료 여부 확인
    const isTokenExpired = () => {
        const token = localStorage.getItem('google_access_token');
        if (!token) return true;
        const expiresAt = localStorage.getItem('google_access_token_expires_at');
        if (!expiresAt) return true;
        return Date.now() > Number(expiresAt);
    };

    // 토큰이 만료되었거나 없을 시 사용자 제스처 컨텍스트 내에서 팝업을 띄워 갱신 처리
    const ensureValidToken = async () => {
        const token = localStorage.getItem('google_access_token');
        const expiresAt = localStorage.getItem('google_access_token_expires_at');
        const isExpired = !token || !expiresAt || Date.now() > Number(expiresAt);
        
        if (!isExpired) {
            return token;
        }
        
        try {
            setDriveLoading(true);
            const result = await signInWithPopup(firebaseAuth, googleProvider);
            const credential = GoogleAuthProvider.credentialFromResult(result);
            if (credential && credential.accessToken) {
                localStorage.setItem('google_access_token', credential.accessToken);
                localStorage.setItem('google_access_token_expires_at', Date.now() + 3500 * 1000);
                setDriveError(null);
                const activeId = folderId || DEFAULT_FOLDER_ID;
                fetchGoogleDriveFiles(activeId);
                return credential.accessToken;
            }
        } catch (error) {
            console.error('구글 토큰 갱신 실패:', error);
        } finally {
            setDriveLoading(false);
        }
        return null;
    };

    // 실시간 Google Drive API 연동 파일 조회
    const fetchGoogleDriveFiles = async (targetId) => {
        if (!targetId) {
            setDriveFiles([]);
            return;
        }
        setDriveLoading(true);
        setDriveError(null);

        const accessToken = localStorage.getItem('google_access_token');
        const expiresAt = localStorage.getItem('google_access_token_expires_at');
        const isExpired = !accessToken || !expiresAt || Date.now() > Number(expiresAt);
        
        // 액세스 토큰이 없는 상태 -> 알림함으로 알림 전송 후 가상 데이터 노출
        if (isExpired) {
            const virtualData = INITIAL_DRIVE_DATA[targetId] || [];
            const sortedVirtual = [...virtualData].sort((a, b) => {
                if (a.type === 'folder' && b.type !== 'folder') return -1;
                if (a.type !== 'folder' && b.type === 'folder') return 1;
                return a.name.localeCompare(b.name);
            });
            setDriveFiles(sortedVirtual);
            setDriveLoading(false);
            
            if (!accessToken) {
                setDriveError('구글 Workspace 인증 정보가 없습니다. 우측 상단의 [구글 연동 인증] 버튼을 누르시면 실시간 드라이브가 연동됩니다.');
            } else {
                setDriveError('구글 Workspace 인증이 만료되었습니다. 파일/폴더를 더블클릭하거나 우측 상단의 [구글 연동 인증] 버튼을 누르시면 자동으로 인증이 갱신됩니다.');
                triggerWarningNotification('구글 Workspace 연동 권한 인증 정보가 만료되었습니다. 재인증을 진행해 주세요.');
            }
            return;
        }

        try {
            const q = `'${targetId}' in parents and trashed = false`;
            const fields = 'files(id, name, mimeType, size, modifiedTime, owners, webViewLink)';
            const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}`;
            
            const res = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });

            if (!res.ok) {
                const errDetail = await res.text();
                if (res.status === 401) {
                    throw new Error(`구글 API 인증 토큰이 만료되었습니다. 다시 연동 인증을 해주세요. (상세: ${errDetail})`);
                }
                throw new Error(`구글 API 오류 (${res.status}): ${errDetail}`);
            }

            const data = await res.json();
            const mappedFiles = data.files.map(f => {
                let type = 'doc';
                if (f.mimeType === 'application/vnd.google-apps.folder') type = 'folder';
                else if (f.mimeType === 'application/vnd.google-apps.spreadsheet') type = 'sheet';

                return {
                    id: f.id,
                    name: f.name,
                    type: type,
                    size: f.size ? `${(f.size / 1024).toFixed(1)} KB` : '-',
                    updatedAt: new Date(f.modifiedTime).toLocaleDateString(),
                    owner: f.owners?.[0]?.displayName || '구글 사용자',
                    googleLink: f.webViewLink,
                    content: '실시간 구글 Workspace 동기화 문서입니다. 우측 편집 버튼을 눌러 본문 편집을 진행해 주세요.'
                };
            });

            // 폴더가 위로, 파일이 아래로 정렬되도록 순서 정비
            const sortedFiles = mappedFiles.sort((a, b) => {
                if (a.type === 'folder' && b.type !== 'folder') return -1;
                if (a.type !== 'folder' && b.type === 'folder') return 1;
                return a.name.localeCompare(b.name);
            });

            setDriveFiles(sortedFiles);
        } catch (err) {
            console.error("G-Drive API Error:", err);
            setDriveError(err.message);
            triggerWarningNotification(err.message);
            
            const fallbackData = INITIAL_DRIVE_DATA[targetId] || [];
            const sortedFallback = [...fallbackData].sort((a, b) => {
                if (a.type === 'folder' && b.type !== 'folder') return -1;
                if (a.type !== 'folder' && b.type === 'folder') return 1;
                return a.name.localeCompare(b.name);
            });
            setDriveFiles(sortedFallback);
        } finally {
            setDriveLoading(false);
        }
    };

    // 실시간 원클릭 인증 및 토큰 재획득 유틸
    const handleGoogleTokenRequest = async () => {
        try {
            setDriveLoading(true);
            const result = await signInWithPopup(firebaseAuth, googleProvider);
            const credential = GoogleAuthProvider.credentialFromResult(result);
            if (credential && credential.accessToken) {
                localStorage.setItem('google_access_token', credential.accessToken);
                localStorage.setItem('google_access_token_expires_at', Date.now() + 3500 * 1000);
                setDriveError(null);
                const activeId = folderId || DEFAULT_FOLDER_ID;
                fetchGoogleDriveFiles(activeId);
                alert('구글 Workspace 실시간 연동이 정상 활성화되었습니다!');
            } else {
                alert('연동 토큰을 가져오지 못했습니다.');
            }
        } catch (error) {
            console.error('OAuth 팝업 실패:', error);
            alert(`인증 승인 실패: ${error.message}`);
        } finally {
            setDriveLoading(false);
        }
    };

    // 초기 및 경로 변경 시 파일 갱신
    useEffect(() => {
        fetchLocalFiles();
    }, []);

    useEffect(() => {
        if (selectedCategory === 'drive') {
            const activeId = folderId || DEFAULT_FOLDER_ID;
            if (pathHistory.length === 0) {
                setPathHistory([{ id: activeId, name: '지정 공유 폴더' }]);
            }
            fetchGoogleDriveFiles(activeId);
        }
    }, [selectedCategory, folderId]);

    // 구글 폴더 연동 ID 설정 저장
    const handleSaveFolderConfig = (e) => {
        e.preventDefault();
        let idToSave = tempFolderId.trim();
        if (idToSave.includes('drive.google.com')) {
            const matches = idToSave.match(/\/folders\/([a-zA-Z0-9-_]+)/);
            if (matches && matches[1]) {
                idToSave = matches[1];
            }
        }
        
        if (idToSave) {
            setFolderId(idToSave);
            localStorage.setItem('erp_gdrive_folder_id', idToSave);
            setCurrentFolderId(idToSave);
            setPathHistory([{ id: idToSave, name: '지정 공유 폴더' }]);
            setIsConfigOpen(false);
            fetchGoogleDriveFiles(idToSave);
            alert('구글 드라이브 공유 폴더가 연동되었습니다.');
        } else {
            alert('올바른 폴더 ID 또는 공유 링크를 입력해 주세요.');
        }
    };

    // 연동 해제
    const handleDisconnectFolder = () => {
        if (window.confirm('구글 드라이브 폴더 연동을 기본 공유 폴더로 초기화하시겠습니까?')) {
            setFolderId(DEFAULT_FOLDER_ID);
            localStorage.setItem('erp_gdrive_folder_id', DEFAULT_FOLDER_ID);
            setCurrentFolderId(DEFAULT_FOLDER_ID);
            setPathHistory([{ id: DEFAULT_FOLDER_ID, name: '지정 공유 폴더' }]);
            fetchGoogleDriveFiles(DEFAULT_FOLDER_ID);
        }
    };

    // 구글 드라이브 연동 템플릿 목록 및 저장 경로용 상태값 추가
    const [googleTemplates, setGoogleTemplates] = useState([]);
    const [googleFolders, setGoogleFolders] = useState([]);
    const [selectedTargetFolder, setSelectedTargetFolder] = useState('');
    const [isFetchTemplatesLoading, setIsFetchTemplatesLoading] = useState(false);
    
    // 모달 내 폴더 브라우저 탐색용 상태값
    const [modalCurrentFolderId, setModalCurrentFolderId] = useState('root');
    const [modalPathHistory, setModalPathHistory] = useState([{ id: 'root', name: '내 드라이브' }]);

    // 템플릿 폴더(template) 및 하위 폴더 조회 로직
    const fetchTemplatesFromGoogleDrive = async () => {
        const accessToken = localStorage.getItem('google_access_token');
        const expiresAt = localStorage.getItem('google_access_token_expires_at');
        const isExpired = !accessToken || !expiresAt || Date.now() > Number(expiresAt);
        if (isExpired) return;
        
        setIsFetchTemplatesLoading(true);
        try {
            // 1. 'template' 이름을 가진 폴더의 ID 검색
            const folderQuery = "name = 'template' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
            const folderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)`;
            const folderRes = await fetch(folderUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (!folderRes.ok) throw new Error('구글 템플릿 폴더를 찾지 못했습니다.');
            const folderData = await folderRes.json();
            const templateFolder = folderData.files?.[0];

            if (templateFolder) {
                // 2. 해당 폴더 내의 모든 문서/스프레드시트 파일 조회
                const filesQuery = `'${templateFolder.id}' in parents and trashed = false`;
                const filesUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(filesQuery)}&fields=files(id,name,mimeType)`;
                const filesRes = await fetch(filesUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (filesRes.ok) {
                    const filesData = await filesRes.json();
                    const mapped = filesData.files.map(f => ({
                        id: f.id,
                        name: f.name,
                        type: f.mimeType === 'application/vnd.google-apps.spreadsheet' ? 'sheet' : 'doc',
                        mimeType: f.mimeType
                    }));
                    setGoogleTemplates(mapped);
                }
            }

            // 3. 구글 드라이브 내의 모든 폴더 목록 조회 (저장 위치 지정을 위함, parents 필드 포함하여 트리 구조 구성)
            const allFoldersQuery = "mimeType = 'application/vnd.google-apps.folder' and trashed = false";
            const allFoldersUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(allFoldersQuery)}&fields=files(id,name,parents)&pageSize=1000`;
            const foldersRes = await fetch(allFoldersUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (foldersRes.ok) {
                const foldersData = await foldersRes.json();
                // 템플릿(template) 폴더 자체는 저장 대상 목록에서 제외
                const filteredFolders = (foldersData.files || []).filter(f => f.name !== 'template');
                setGoogleFolders(filteredFolders);
            }
        } catch (error) {
            console.error("Error fetching templates from Google Drive:", error);
        } finally {
            setIsFetchTemplatesLoading(false);
        }
    };

    // 모달이 열릴 때 구글 템플릿 목록 로드
    useEffect(() => {
        if (isCreateModalOpen && fileCategory === 'drive') {
            fetchTemplatesFromGoogleDrive();
        }
    }, [isCreateModalOpen, fileCategory]);

    // 새 파일 생성 (로컬 및 구글 드라이브 복사 저장 지원)
    const handleCreateFile = async (e) => {
        e.preventDefault();
        if (!newFileName.trim()) return;

        if (fileCategory === 'local') {
            try {
                await addDoc(collection(db, 'workspace_files'), {
                    name: newFileName.endsWith(templateType === 'doc' ? '.docx' : '.xlsx') 
                        ? newFileName 
                        : `${newFileName}${templateType === 'doc' ? '.docx' : '.xlsx'}`,
                    type: templateType,
                    category: 'local',
                    content: newFileContent,
                    size: `${(new Blob([newFileContent]).size / 1024).toFixed(1)} KB`,
                    owner: userProfile?.name || currentUser?.email || '시스템 사용자',
                    createdAt: serverTimestamp()
                });
                setNewFileName('');
                setNewFileContent('');
                setSelectedTemplate('');
                setIsCreateModalOpen(false);
                fetchLocalFiles();
            } catch (error) {
                console.error('Error creating file:', error);
            }
        } else {
            // 구글 드라이브 템플릿 복제 저장 프로세스
            const accessToken = await ensureValidToken();
            if (!accessToken) {
                alert('구글 연동 인증이 만료되었습니다. 인증을 완료해 주세요.');
                return;
            }
            if (!selectedTemplate) {
                alert('템플릿을 선택해 주세요.');
                return;
            }
            if (!selectedTargetFolder) {
                alert('저장할 대상 폴더를 선택해 주세요.');
                return;
            }

            try {
                setDriveLoading(true);
                // drive.files.copy API 호출
                const targetFolderId = selectedTargetFolder;
                const copyUrl = `https://www.googleapis.com/drive/v3/files/${selectedTemplate}/copy`;
                const requestBody = {
                    name: newFileName,
                    parents: [targetFolderId]
                };

                const res = await fetch(copyUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!res.ok) {
                    const errText = await res.text();
                    throw new Error(`파일 복제 실패: ${errText}`);
                }

                alert('템플릿 파일이 구글 드라이브 내 지정 폴더에 성공적으로 저장되었습니다!');
                setNewFileName('');
                setSelectedTemplate('');
                setSelectedTargetFolder('');
                setIsCreateModalOpen(false);
                fetchGoogleDriveFiles(currentFolderId);
            } catch (error) {
                console.error("Error copying Google Drive template:", error);
                alert(error.message);
            } finally {
                setDriveLoading(false);
            }
        }
    };

    // 수정본 저장
    const handleSaveChanges = async () => {
        if (!activeViewFile) return;
        try {
            const docRef = doc(db, 'workspace_files', activeViewFile.id);
            await updateDoc(docRef, {
                content: editContent,
                size: `${(new Blob([editContent]).size / 1024).toFixed(1)} KB`
            });
            setIsEditing(false);
            setActiveViewFile(prev => ({ ...prev, content: editContent }));
            fetchLocalFiles();
        } catch (error) {
            console.error('Error updating file:', error);
        }
    };

    // 삭제
    const handleDeleteFile = async (id) => {
        if (!window.confirm('정말 이 파일을 삭제하시겠습니까?')) return;
        try {
            await deleteDoc(doc(db, 'workspace_files', id));
            if (activeViewFile?.id === id) {
                setActiveViewFile(null);
            }
            fetchLocalFiles();
        } catch (error) {
            console.error('Error deleting file:', error);
        }
    };

    // 폴더 클릭 시 진입 및 실시간 갱신
    const handleFolderClick = async (folderItem) => {
        const token = await ensureValidToken();
        if (!token) return;
        setCurrentFolderId(folderItem.id);
        setPathHistory(prev => [...prev, { id: folderItem.id, name: folderItem.name }]);
        fetchGoogleDriveFiles(folderItem.id);
    };

    // Breadcrumb 히스토리 이동
    const handleNavigatePath = async (pathIdx) => {
        const token = await ensureValidToken();
        if (!token) return;
        const targetPath = pathHistory[pathIdx];
        setCurrentFolderId(targetPath.id);
        setPathHistory(prev => prev.slice(0, pathIdx + 1));
        fetchGoogleDriveFiles(targetPath.id);
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* 상단 타이틀 */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                        <Cloud className="text-sky-500" size={28} />
                        Google Drive
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">
                        Google Drive 연동을 통해 전사 공유 폴더의 문서를 실시간으로 동기화하고 관리합니다.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            setFileCategory('local');
                            setSelectedTemplate('');
                            setNewFileName('');
                            setNewFileContent('');
                            setGoogleLink('');
                            // 모달 폴더 탐색기 시작점을 전체 루트가 아닌 지정 연동 공유 폴더로 초기화
                            const startFolderId = folderId || DEFAULT_FOLDER_ID;
                            setModalCurrentFolderId(startFolderId);
                            setModalPathHistory([{ id: startFolderId, name: '지정 공유 폴더' }]);
                            setIsCreateModalOpen(true);
                        }}
                        className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all"
                    >
                        <Plus size={14} />
                        신규 문서 작성 (템플릿)
                    </button>
                </div>
            </div>

            {/* 메인 렌더링 영역 */}
            {/* 구글 워크스페이스 실시간 폴더 연동 브라우저 */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                    {/* 브레드크럼 및 상단 컨트롤러 */}
                    <div className="bg-slate-50 border-b border-slate-100 px-6 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-1 text-xs font-bold text-slate-600">
                            <Cloud className="text-sky-500 mr-1" size={16} />
                            {pathHistory.map((path, idx) => (
                                <React.Fragment key={path.id}>
                                    {idx > 0 && <ChevronRight size={14} className="text-slate-300" />}
                                    <button 
                                        onClick={() => handleNavigatePath(idx)}
                                        className={`hover:text-sky-600 transition-colors ${idx === pathHistory.length - 1 ? 'text-slate-800 font-extrabold' : ''}`}
                                    >
                                        {path.name}
                                    </button>
                                </React.Fragment>
                            ))}
                        </div>

                        {pathHistory.length > 1 && (
                            <button
                                onClick={() => handleNavigatePath(pathHistory.length - 2)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs hover:bg-slate-100 transition-all font-semibold"
                            >
                                <ArrowLeft size={12} /> 상위 폴더
                            </button>
                        )}
                    </div>

                    {/* 구글 API 권한 만료 또는 비로그인 상태일 때 가이드 배너 */}
                    {driveError && (
                        <div className="bg-rose-50 border-b border-rose-200 px-6 py-4 flex flex-col gap-2 text-xs text-rose-800">
                            <div className="flex items-center gap-2 font-bold">
                                <AlertCircle size={18} className="text-rose-600 shrink-0" />
                                <span>구글 드라이브 연동 안내</span>
                            </div>
                            <p className="font-semibold text-slate-700 pl-6">{driveError}</p>
                        </div>
                    )}

                    {/* 폴더/파일 리스트 테이블 */}
                    <div className="flex-1 overflow-auto max-h-[60vh]">
                        {driveLoading ? (
                            <div className="flex flex-col items-center justify-center py-32">
                                <RefreshCw className="animate-spin text-sky-500 mb-3" size={32} />
                                <p className="text-slate-500 text-sm font-medium">구글 Workspace 드라이브에서 파일 목록을 가져오는 중입니다...</p>
                            </div>
                        ) : driveFiles.length === 0 ? (
                            <div className="p-16 text-center text-slate-400 font-semibold flex flex-col items-center justify-center">
                                <Folder size={36} className="text-slate-200 mb-2" />
                                폴더 내 파일이 비어 있거나 읽기 권한을 확인해 주세요.
                            </div>
                        ) : (
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100 font-black text-slate-500 uppercase tracking-wider">
                                        <th className="p-4 pl-6">이름</th>
                                        <th className="p-4">소유자</th>
                                        <th className="p-4">최종 수정일</th>
                                        <th className="p-4">크기</th>
                                        <th className="p-4 text-right pr-6">동작</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {driveFiles.map((item) => (
                                        <tr 
                                            key={item.id}
                                            onClick={async () => {
                                                if (item.type === 'folder') {
                                                    handleFolderClick(item);
                                                } else {
                                                    const token = await ensureValidToken();
                                                    if (!token) return;
                                                    setActiveViewFile(item);
                                                    setEditContent(item.content || '');
                                                    setIsEditing(false);
                                                }
                                            }}
                                            className="border-b border-slate-100 hover:bg-sky-50/40 cursor-pointer transition-colors group"
                                        >
                                            <td className="p-4 pl-6 font-bold text-slate-700 flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                                    item.type === 'folder' 
                                                    ? 'bg-amber-50 text-amber-500' 
                                                    : item.type === 'sheet' 
                                                    ? 'bg-emerald-50 text-emerald-600' 
                                                    : 'bg-sky-50 text-sky-600'
                                                }`}>
                                                    {item.type === 'folder' ? <Folder size={16} /> : item.type === 'sheet' ? <FileSpreadsheet size={16} /> : <FileText size={16} />}
                                                </div>
                                                <span className="group-hover:text-sky-600 transition-colors">{item.name}</span>
                                            </td>
                                            <td className="p-4 text-slate-500 font-medium">{item.owner}</td>
                                            <td className="p-4 text-slate-400 font-medium">{item.updatedAt}</td>
                                            <td className="p-4 text-slate-400 font-medium">{item.size}</td>
                                            <td className="p-4 text-right pr-6" onClick={(e)=>e.stopPropagation()}>
                                                {item.type !== 'folder' && (
                                                    <button 
                                                        onClick={() => {
                                                            setActiveViewFile(item);
                                                            setEditContent(item.content || '');
                                                            setIsEditing(false);
                                                        }}
                                                        className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-sky-600"
                                                        title="미리보기"
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>


            {/* 파일 열기 및 뷰어 모달 */}
            {activeViewFile && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-2" onClick={() => setActiveViewFile(null)}>
                    <div className="bg-white rounded-2xl max-w-7xl w-[94vw] max-h-[92vh] flex flex-col shadow-2xl animate-in fade-in-50 zoom-in-95 duration-200" onClick={(e)=>e.stopPropagation()}>
                        {/* 헤더 */}
                        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl shrink-0">
                            <div className="flex items-center gap-2">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                    activeViewFile.type === 'sheet' ? 'bg-emerald-50 text-emerald-600' : 'bg-sky-50 text-sky-600'
                                }`}>
                                    {activeViewFile.type === 'sheet' ? <FileSpreadsheet size={16} /> : <FileText size={16} />}
                                </div>
                                <div>
                                    <h2 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                                        {activeViewFile.name}
                                    </h2>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                        작성자: {activeViewFile.owner} | 크기: {activeViewFile.size} | 최종 수정: {activeViewFile.updatedAt}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setActiveViewFile(null)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>

                        {/* 내용 공간 */}
                        <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
                            {isEditing ? (
                                <textarea
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                    className="w-full h-[500px] p-4 bg-white border border-slate-300 rounded-xl font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none shadow-inner"
                                />
                            ) : (
                                <div className="bg-white border border-slate-200 rounded-xl p-1 shadow-sm min-h-[72vh] flex flex-col">
                                    {/* 구글 드라이브 파일의 경우 깨짐 없는 구글 공식 미리보기 preview iframe 로드 */}
                                    {(activeViewFile.googleLink || activeViewFile.id.length > 15) ? (
                                        <iframe
                                            src={
                                                activeViewFile.type === 'sheet'
                                                ? `https://docs.google.com/spreadsheets/d/${activeViewFile.id}/edit?rm=minimal`
                                                : `https://docs.google.com/document/d/${activeViewFile.id}/edit?rm=minimal`
                                            }
                                            className="w-full h-[75vh] min-h-[600px] border-0 rounded-lg bg-slate-100 shadow-inner"
                                            title="Google Workspace Editor"
                                            allow="autoplay; clipboard-read; clipboard-write"
                                        />
                                    ) : activeViewFile.type === 'sheet' ? (
                                        <div className="p-4 overflow-auto">
                                            <table className="w-full border-collapse text-left text-xs">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-200">
                                                        {(activeViewFile.content || '').split('\n')[0]?.split(',').map((header, idx) => (
                                                            <th key={idx} className="p-3 font-black text-slate-600 border-r border-slate-200 last:border-r-0">
                                                                {header}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(activeViewFile.content || '').split('\n').slice(1).map((row, rowIdx) => (
                                                        <tr key={rowIdx} className="border-b border-slate-100 hover:bg-slate-50">
                                                            {row.split(',').map((cell, cellIdx) => (
                                                                <td key={cellIdx} className="p-3 text-slate-700 border-r border-slate-100 last:border-r-0">
                                                                    {cell}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="p-6">
                                            <pre className="text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed">
                                                {activeViewFile.content || '문서 내용이 비어 있습니다.'}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* 푸터 */}
                        <div className="px-6 py-4 border-t border-slate-200 flex justify-between items-center bg-white rounded-b-2xl">
                            <div>
                                {activeViewFile.googleLink && (
                                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                                        구글 Workspace 동기화 문서 (직접 편집 모드)
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-2">
                                {activeViewFile.googleLink ? (
                                    <a
                                        href={activeViewFile.googleLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                                    >
                                        <ExternalLink size={14} />
                                        새 창에서 열기
                                    </a>
                                ) : (
                                    isEditing ? (
                                        <>
                                            <button
                                                onClick={() => setIsEditing(false)}
                                                className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50 flex items-center gap-1.5"
                                            >
                                                <X size={14} /> 취소
                                            </button>
                                            <button
                                                onClick={handleSaveChanges}
                                                className="px-4 py-2 bg-sky-500 text-white rounded-lg text-xs font-bold hover:bg-sky-600 flex items-center gap-1.5"
                                            >
                                                <Check size={14} /> 변경사항 저장
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5"
                                        >
                                            <Edit3 size={14} /> 본문 수정
                                        </button>
                                    )
                                )}
                                <button
                                    onClick={() => setActiveViewFile(null)}
                                    className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-white rounded-lg text-xs font-bold"
                                >
                                    닫기
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 신규 문서 작성 (템플릿) 모달 */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsCreateModalOpen(false)}>
                    <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl animate-in fade-in-50 zoom-in-95 duration-200 overflow-hidden" onClick={(e)=>e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                            <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
                                <FileText className="text-sky-500" size={18} />
                                신규 문서 작성 (템플릿)
                            </h2>
                            <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateFile} className="p-6 space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-600 block mb-1">저장 방식 선택</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFileCategory('local');
                                            setSelectedTemplate('');
                                        }}
                                        className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all ${
                                            fileCategory === 'local'
                                            ? 'bg-sky-50 border-sky-300 text-sky-800'
                                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        로컬 드라이브 저장
                                    </button>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            const token = await ensureValidToken();
                                            if (token) {
                                                setFileCategory('drive');
                                                setSelectedTemplate('');
                                                fetchTemplatesFromGoogleDrive();
                                            } else {
                                                alert('Google Workspace 연동을 승인하셔야 Google Drive 저장이 가능합니다.');
                                            }
                                        }}
                                        className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all ${
                                            fileCategory === 'drive'
                                            ? 'bg-sky-50 border-sky-300 text-sky-800'
                                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        Google Drive 저장
                                    </button>
                                </div>
                            </div>

                            {fileCategory === 'local' ? (
                                <>
                                    <div>
                                        <label className="text-xs font-bold text-slate-600 block mb-1">템플릿 선택</label>
                                        <select
                                            value={selectedTemplate}
                                            onChange={(e) => {
                                                const tId = e.target.value;
                                                setSelectedTemplate(tId);
                                                const found = templates.find(t => t.id === tId);
                                                if (found) {
                                                    setTemplateType(found.type);
                                                    setNewFileContent(found.defaultContent);
                                                }
                                            }}
                                            required
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-sky-400"
                                        >
                                            <option value="">템플릿을 선택하세요</option>
                                            {templates.map(t => (
                                                <option key={t.id} value={t.id}>{t.name} ({t.type === 'sheet' ? '스프레드시트' : '문서'})</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-600 block mb-1">새 파일 이름</label>
                                        <input
                                            type="text"
                                            placeholder="파일명 입력 (예: 일일업무보고)"
                                            value={newFileName}
                                            onChange={(e) => setNewFileName(e.target.value)}
                                            required
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-sky-400"
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div>
                                        <label className="text-xs font-bold text-slate-600 block mb-1">구글 드라이브 template 폴더 내 템플릿 문서</label>
                                        {isFetchTemplatesLoading ? (
                                            <div className="py-2 text-xs text-slate-400">템플릿 로딩 중...</div>
                                        ) : googleTemplates.length === 0 ? (
                                            <div className="py-2 text-xs text-rose-500 font-semibold">드라이브 내 template 폴더를 찾을 수 없거나 파일이 존재하지 않습니다. 먼저 구글 드라이브에 template 폴더를 생성하고 문서를 업로드해 주세요.</div>
                                        ) : (
                                            <select
                                                value={selectedTemplate}
                                                onChange={(e) => setSelectedTemplate(e.target.value)}
                                                required
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-sky-400"
                                            >
                                                <option value="">템플릿을 선택하세요</option>
                                                {googleTemplates.map(t => (
                                                    <option key={t.id} value={t.id}>{t.name}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>

                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                                        <div className="flex justify-between items-center">
                                            <label className="text-xs font-bold text-slate-700 block">저장할 대상 폴더 선택 (더블클릭 또는 이동 버튼으로 진입)</label>
                                            <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
                                                선택됨: {googleFolders.find(f => f.id === selectedTargetFolder)?.name || '선택 없음 (루트)'}
                                            </span>
                                        </div>

                                        {/* 모달 폴더 브레드크럼 */}
                                        <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 flex items-center gap-1 overflow-x-auto">
                                            {modalPathHistory.map((path, idx) => (
                                                <React.Fragment key={path.id}>
                                                    {idx > 0 && <ChevronRight size={10} className="text-slate-300 shrink-0" />}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setModalCurrentFolderId(path.id);
                                                            setModalPathHistory(prev => prev.slice(0, idx + 1));
                                                        }}
                                                        className={`hover:text-sky-600 shrink-0 ${idx === modalPathHistory.length - 1 ? 'text-slate-800 font-extrabold' : ''}`}
                                                    >
                                                        {path.name}
                                                    </button>
                                                </React.Fragment>
                                            ))}
                                        </div>

                                        {/* 폴더 리스트 영역 */}
                                        <div className="bg-white border border-slate-200 rounded-lg max-h-[160px] overflow-y-auto divide-y divide-slate-100 text-xs">
                                            {/* 위로 가기 버튼 (루트가 아닐 경우) */}
                                            {modalPathHistory.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const targetPath = modalPathHistory[modalPathHistory.length - 2];
                                                        setModalCurrentFolderId(targetPath.id);
                                                        setModalPathHistory(prev => prev.slice(0, -1));
                                                    }}
                                                    className="w-full text-left px-3 py-2 text-slate-500 hover:bg-slate-50 font-bold flex items-center gap-2"
                                                >
                                                    <ArrowLeft size={13} /> .. (상위 폴더로 이동)
                                                </button>
                                            )}

                                            {/* 현재 폴더 내의 하위 폴더들 목록만 출력 */}
                                            {(() => {
                                                const currentSubFolders = googleFolders.filter(f => {
                                                    // 부모 폴더 ID가 modalCurrentFolderId 인 항목 필터링
                                                    // Google API에서 root 폴더 밑인 경우 parents가 없을 수도 있고, 'root' 문자열이 포함될 수도 있으며, 
                                                    // parents 배열이 비어있으면 최상위 루트로 판단합니다.
                                                    if (modalCurrentFolderId === 'root') {
                                                        return !f.parents || f.parents.length === 0 || f.parents.includes('root');
                                                    }
                                                    return f.parents && f.parents.includes(modalCurrentFolderId);
                                                });

                                                if (currentSubFolders.length === 0) {
                                                    return (
                                                        <div className="p-4 text-center text-slate-400 font-medium text-[11px]">
                                                            이 폴더 내에 하위 폴더가 없습니다.
                                                        </div>
                                                    );
                                                }

                                                return currentSubFolders.map(folder => (
                                                    <div
                                                        key={folder.id}
                                                        onClick={() => setSelectedTargetFolder(folder.id)}
                                                        onDoubleClick={() => {
                                                            setSelectedTargetFolder(folder.id);
                                                            setModalCurrentFolderId(folder.id);
                                                            setModalPathHistory(prev => [...prev, { id: folder.id, name: folder.name }]);
                                                        }}
                                                        className={`px-3 py-2 flex items-center justify-between cursor-pointer transition-all ${
                                                            selectedTargetFolder === folder.id 
                                                            ? 'bg-sky-50 text-sky-800 font-bold' 
                                                            : 'hover:bg-slate-50 text-slate-700'
                                                        }`}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <Folder size={14} className={selectedTargetFolder === folder.id ? 'text-sky-500' : 'text-slate-400'} />
                                                            {folder.name}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedTargetFolder(folder.id);
                                                                setModalCurrentFolderId(folder.id);
                                                                setModalPathHistory(prev => [...prev, { id: folder.id, name: folder.name }]);
                                                            }}
                                                            className="text-[10px] bg-slate-100 hover:bg-sky-100 hover:text-sky-700 px-2 py-0.5 rounded font-bold transition-all text-slate-600"
                                                        >
                                                            진입
                                                        </button>
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-600 block mb-1">새 파일 이름</label>
                                        <input
                                            type="text"
                                            placeholder="저장할 새 파일명을 확장자 포함하여 입력하세요"
                                            value={newFileName}
                                            onChange={(e) => setNewFileName(e.target.value)}
                                            required
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-sky-400"
                                        />
                                    </div>
                                </>
                            )}

                            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-sky-500 text-white rounded-lg text-xs font-bold hover:bg-sky-600 shadow-sm"
                                >
                                    문서 생성 및 저장
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 3. 구글 공유 폴더 등록 설정 모달 */}
            {isConfigOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl animate-in fade-in-50 zoom-in-95 duration-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                            <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
                                <Cloud className="text-sky-500" size={18} />
                                Google Drive 전용 폴더 등록
                            </h2>
                            <button onClick={() => setIsConfigOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveFolderConfig} className="p-6 space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-600 block mb-1">구글 드라이브 폴더 ID 또는 공유 주소</label>
                                <input
                                    type="text"
                                    placeholder="https://drive.google.com/drive/folders/구글폴더ID 또는 폴더ID 입력"
                                    value={tempFolderId}
                                    onChange={(e) => setTempFolderId(e.target.value)}
                                    required
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-sky-400"
                                />
                            </div>

                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-2 leading-relaxed">
                                <p className="font-bold flex items-center gap-1">💡 구글 폴더 연동 준비 및 ID 획득 방법</p>
                                <ol className="list-decimal list-inside space-y-1.5 text-slate-600 ml-1">
                                    <li>구글 드라이브에 접속하여 전용으로 쓸 폴더를 생성합니다.</li>
                                    <li>해당 폴더 우클릭 ➔ <strong>[공유]</strong> 클릭</li>
                                    <li>일반 액세스를 <strong>'링크가 있는 모든 사용자'</strong>로 변경하고 권한을 설정합니다.</li>
                                    <li>브라우저 주소창의 URL 맨 끝에 있는 고유 ID 문자열을 복사하여 위 입력란에 붙여넣습니다. (혹은 전체 공유 링크 복사 후 입력)</li>
                                </ol>
                            </div>

                            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsConfigOpen(false)}
                                    className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-sky-500 text-white rounded-lg text-xs font-bold hover:bg-sky-600 shadow-sm"
                                >
                                    등록 및 연동
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
