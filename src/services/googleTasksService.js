import { fetchDrive } from './googleService';
import { db, collection, query, where, getDocs, getDoc, updateDoc, doc, addDoc, serverTimestamp, deleteDoc } from '../database';

const TASKS_API_BASE = 'https://tasks.googleapis.com/tasks/v1';
const TASKLIST_NAME = 'mightyONE Tasks';

/**
 * 전용 할 일 목록(TaskList)을 찾거나 없으면 생성합니다.
 */
export const getOrCreateTaskList = async () => {
    // 사용자의 기본 할 일 목록('@default')을 사용합니다.
    return '@default';
};

/**
 * ERP 할 일을 구글 테스크에 생성하거나 업데이트합니다.
 */
export const syncTaskToGoogleTasks = async (taskData) => {
    try {
        const listId = await getOrCreateTaskList();
        if (!listId) return null;

        // 구글 테스크 본문(notes) 포맷팅
        let formattedNotes = '';
        
        // 우선순위 매핑
        const priorityMap = { low: '낮음', medium: '보통', high: '높음', urgent: '긴급' };
        if (taskData.priority) {
            formattedNotes += `🚀 우선순위: ${priorityMap[taskData.priority] || taskData.priority}\n`;
        }
        
        // 시작일 처리
        if (taskData.startDate) {
            const sdObj = new Date(taskData.startDate);
            if (!isNaN(sdObj.getTime())) {
                const sdStr = sdObj.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
                formattedNotes += `📅 시작일: ${sdStr}\n`;
            }
        }
        
        // 소유자 및 담당자 이름 조회 및 추가
        let ownerName = taskData.ownerUid || '';
        let assigneeName = taskData.assigneeUid || '';
        
        try {
            if (taskData.ownerUid) {
                const ownerDoc = await getDoc(doc(db, 'users', taskData.ownerUid));
                if (ownerDoc.exists()) ownerName = ownerDoc.data().displayName || ownerName;
            }
            if (taskData.assigneeUid) {
                const assigneeDoc = await getDoc(doc(db, 'users', taskData.assigneeUid));
                if (assigneeDoc.exists()) assigneeName = assigneeDoc.data().displayName || assigneeName;
            }
        } catch (e) {
            console.warn("Failed to fetch user for task notes:", e);
        }
        
        formattedNotes += `👑 소유자 : ${ownerName}\n`;
        formattedNotes += `🙋‍♂️ 담당자: ${assigneeName}\n`;
        
        // 설명(메모) HTML 태그 제거 및 줄바꿈 보존
        let description = taskData.description || taskData.content || taskData.notes || '';
        let plainDesc = description
            .replace(/<p>/gi, '')
            .replace(/<\/p>/gi, '\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]*>?/gm, '') // 나머지 태그 제거
            .trim();

        formattedNotes += `✨ NOTE \n   💬 - ${plainDesc} -`;

        // 하위 테스크(자체 기능으로 이동됨에 따라 노트에서는 제거)

        const taskPayload = {
            title: taskData.title || '제목 없음',
            notes: formattedNotes,
            status: taskData.status === 'completed' ? 'completed' : 'needsAction'
        };

        if (taskData.dueDate) {
            const dateObj = new Date(taskData.dueDate);
            if (!isNaN(dateObj.getTime())) taskPayload.due = dateObj.toISOString();
        }

        let result;
        if (taskData.googleTaskId) {
            result = await fetchDrive(`${TASKS_API_BASE}/lists/${listId}/tasks/${taskData.googleTaskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: taskData.googleTaskId, ...taskPayload })
            });
        } else {
            result = await fetchDrive(`${TASKS_API_BASE}/lists/${listId}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskPayload)
            });
        }

        const mainTaskId = result.id;

        // ----------------------------------------------------
        // 네이티브 하위 테스크(Subtasks) 처리 로직
        // ----------------------------------------------------
        if (taskData.subtasks) {
            // 1. 해당 리스트의 모든 테스크를 가져와서 메인 테스크에 속한 자식들만 필터링
            const allReq = await fetchDrive(`${TASKS_API_BASE}/lists/${listId}/tasks?showCompleted=true&showHidden=true`);
            const allItems = allReq.items || [];
            const existingNativeSubtasks = allItems.filter(t => t.parent === mainTaskId);
            const erpGIds = new Set(taskData.subtasks.map(s => s.googleTaskId).filter(Boolean));

            // 2. ERP에서 삭제된 하위 항목 구글에서도 삭제
            for (const nSub of existingNativeSubtasks) {
                if (!erpGIds.has(nSub.id)) {
                    await fetchDrive(`${TASKS_API_BASE}/lists/${listId}/tasks/${nSub.id}`, { method: 'DELETE' });
                }
            }

            // 3. 현재 ERP 하위 항목 생성 및 업데이트
            let updatedSubtasks = [];
            let subtasksChanged = false;

            for (const sub of taskData.subtasks) {
                const subPayload = {
                    title: sub.text || '제목 없음',
                    status: sub.completed ? 'completed' : 'needsAction',
                    notes: sub.link ? `링크: ${sub.link}` : ''
                };

                let subGId = sub.googleTaskId;
                if (subGId) {
                    await fetchDrive(`${TASKS_API_BASE}/lists/${listId}/tasks/${subGId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: subGId, ...subPayload })
                    });
                    updatedSubtasks.push(sub);
                } else {
                    const res = await fetchDrive(`${TASKS_API_BASE}/lists/${listId}/tasks?parent=${mainTaskId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(subPayload)
                    });
                    updatedSubtasks.push({ ...sub, googleTaskId: res.id });
                    subtasksChanged = true;
                }
            }

            // 4. 새로 생성된 googleTaskId가 있다면 ERP DB 갱신
            if (subtasksChanged && taskData.id) {
                await updateDoc(doc(db, 'personal_tasks', taskData.id), { subtasks: updatedSubtasks });
            }
        }

        return mainTaskId;
    } catch (error) {
        console.error("[Google Tasks] Failed to sync task:", error);
        return null;
    }
};

/**
 * 구글 테스크에서 할 일을 삭제합니다.
 */
export const deleteTaskFromGoogleTasks = async (googleTaskId) => {
    if (!googleTaskId) return;
    try {
        const listId = await getOrCreateTaskList();
        if (!listId) return;
        await fetchDrive(`${TASKS_API_BASE}/lists/${listId}/tasks/${googleTaskId}`, { method: 'DELETE' });
    } catch (error) {
        console.error("[Google Tasks] Failed to delete task:", error);
    }
};

/**
 * 구글 테스크의 최신 상태를 ERP로 폴링 동기화합니다.
 */
export const pollGoogleTasksToERP = async (ownerUid) => {
    if (!ownerUid) return;
    try {
        const listId = await getOrCreateTaskList();
        if (!listId) return;

        // 1. 구글 테스크 전체 가져오기 (완료된 것, 숨겨진 것 포함)
        const data = await fetchDrive(`${TASKS_API_BASE}/lists/${listId}/tasks?showCompleted=true&showHidden=true`);
        const gTasks = data.items || [];

        // 2. ERP 내 할 일 가져오기
        const q = query(collection(db, 'personal_tasks'), where('ownerUid', '==', ownerUid));
        const erpSnap = await getDocs(q);
        const erpTasks = erpSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const topLevelGTasks = gTasks.filter(t => !t.parent);
        const subLevelGTasks = gTasks.filter(t => t.parent);

        const gTaskIds = new Set(topLevelGTasks.map(t => t.id));

        // 3. 구글 테스크 -> ERP 병합 (신규 생성 또는 업데이트)
        for (const gTask of topLevelGTasks) {
            const matchingErp = erpTasks.find(e => e.googleTaskId === gTask.id);
            const erpStatus = gTask.status === 'completed' ? 'completed' : 'todo';
            
            // 1. 네이티브 하위 테스크 처리
            const nativeSubtasks = subLevelGTasks.filter(s => s.parent === gTask.id);
            let finalSubtasks = [];
            let subtasksModified = false;
            
            const existingErpSubtasks = matchingErp ? (matchingErp.subtasks || []) : [];
            
            for (const ns of nativeSubtasks) {
                const existingSub = existingErpSubtasks.find(s => s.googleTaskId === ns.id);
                const isCompleted = ns.status === 'completed';
                const linkExtracted = ns.notes ? ns.notes.replace('링크:', '').trim() : null;
                
                if (existingSub) {
                    if (existingSub.text !== ns.title || existingSub.completed !== isCompleted || existingSub.link !== linkExtracted) {
                        subtasksModified = true;
                    }
                    finalSubtasks.push({
                        ...existingSub,
                        text: ns.title,
                        completed: isCompleted,
                        link: linkExtracted || existingSub.link
                    });
                } else {
                    subtasksModified = true;
                    finalSubtasks.push({
                        id: Date.now() + Math.floor(Math.random() * 100000),
                        text: ns.title,
                        completed: isCompleted,
                        googleTaskId: ns.id,
                        link: linkExtracted
                    });
                }
            }

            if (finalSubtasks.length !== existingErpSubtasks.length) {
                subtasksModified = true;
            }

            // 2. 신규 포맷 파싱 (NOTE 이하 추출, 이모지 호환)
            let rawContent = gTask.notes || '';
            const noteMatch = rawContent.match(/NOTE[^\n]*\n\s*(?:💬\s*)?-\s*([\s\S]*?)(?:\s*-)?$/);
            
            if (noteMatch) {
                rawContent = noteMatch[1].trim();
                
                // 하위 할 일 텍스트가 섞여 들어왔다면 잘라내기
                const subtaskIdx = rawContent.indexOf('\n\n📋 하위 할 일');
                if (subtaskIdx !== -1) {
                    rawContent = rawContent.substring(0, subtaskIdx).trim();
                }
            } else {
                // 2. 구형 포맷 파싱 하위호환
                const separatorIdx = rawContent.indexOf('\n\n[ERP 상세 정보]');
                if (separatorIdx !== -1) {
                    rawContent = rawContent.substring(0, separatorIdx).trim();
                }
            }

            if (matchingErp) {
                // 변경점이 있는지 검사
                let isChanged = false;
                if (matchingErp.status !== erpStatus) isChanged = true;
                if (matchingErp.title !== gTask.title) isChanged = true;
                
                // content 또는 description 필드 검사
                const erpDesc = (matchingErp.description || matchingErp.content || '').trim();
                if (erpDesc !== rawContent) isChanged = true;
                
                // 마감일 변경 비교
                if (gTask.due) {
                    const gDue = new Date(gTask.due).toDateString();
                    const eDue = matchingErp.dueDate?.toDate ? matchingErp.dueDate.toDate().toDateString() : new Date(matchingErp.dueDate).toDateString();
                    if (gDue !== eDue) isChanged = true;
                }
                
                if (subtasksModified) isChanged = true;

                if (isChanged) {
                    await updateDoc(doc(db, 'personal_tasks', matchingErp.id), {
                        title: gTask.title || '제목 없음',
                        description: rawContent,
                        status: erpStatus,
                        subtasks: finalSubtasks,
                        dueDate: gTask.due ? new Date(gTask.due) : matchingErp.dueDate,
                        updatedAt: serverTimestamp()
                    });
                }
            } else {
                // 구글 테스크에서 새로 생성된 항목 -> ERP DB에 추가
                await addDoc(collection(db, 'personal_tasks'), {
                    ownerUid,
                    assigneeUid: ownerUid,
                    googleTaskId: gTask.id,
                    title: gTask.title || '제목 없음',
                    description: rawContent,
                    status: erpStatus,
                    priority: 'medium',
                    subtasks: finalSubtasks,
                    dueDate: gTask.due ? new Date(gTask.due) : new Date(),
                    alarmEnabled: false,
                    alarmSent: false,
                    recurring: 'none',
                    createdAt: serverTimestamp()
                });
            }
        }

        // 4. 구글 테스크에서 완전히 삭제된 항목을 ERP에서도 삭제
        // (단, googleTaskId가 매핑되어 있는 항목만 검사)
        for (const eTask of erpTasks) {
            if (eTask.googleTaskId && !gTaskIds.has(eTask.googleTaskId)) {
                await deleteDoc(doc(db, 'personal_tasks', eTask.id));
            }
        }

    } catch (error) {
        console.error("[Google Tasks] Polling Sync Error:", error);
    }
};
