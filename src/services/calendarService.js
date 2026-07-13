const CALENDAR_SUMMARY = 'I-Link ERP';
const API_BASE = 'https://www.googleapis.com/calendar/v3';
import { db, collection, query, where, getDocs, updateDoc, doc, addDoc, serverTimestamp } from '../firebase';

function getAccessToken() {
    return localStorage.getItem('google_access_token');
}

/**
 * 전용 캘린더를 찾거나 없으면 생성합니다.
 */
export async function getOrCreateCalendar() {
    const token = getAccessToken();
    if (!token) throw new Error('No Google Access Token');

    // 1. 캘린더 목록 조회
    if (token === 'mock_access_token') {
        return 'mock_calendar_id';
    }

    const listRes = await fetch(`${API_BASE}/users/me/calendarList`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!listRes.ok) {
        if (listRes.status === 401 || listRes.status === 403) {
            console.warn("[Calendar] 캘린더 접근 권한이 없거나 토큰이 만료되었습니다. 캘린더 동기화가 비활성화됩니다.");
            return null;
        }
        throw new Error('Failed to fetch calendar list');
    }
    
    const listData = await listRes.json();
    let erpCal = listData.items?.find(c => c.summary === CALENDAR_SUMMARY);
    
    // 2. 없으면 생성
    if (!erpCal) {
        const createRes = await fetch(`${API_BASE}/calendars`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ summary: CALENDAR_SUMMARY, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
        });
        if (!createRes.ok) throw new Error('Failed to create calendar');
        erpCal = await createRes.json();
    }
    
    return erpCal.id;
}

/**
 * Google Event ID 규칙: [a-v0-9]{5,1024}. Task ID를 소문자로 변환하고 특수기호 제거
 */
function formatEventId(taskId) {
    let formatted = taskId.toLowerCase().replace(/[^a-v0-9]/g, '0');
    if (formatted.length < 5) formatted = formatted.padEnd(5, 'a');
    return formatted;
}

/**
 * Task 데이터를 구글 캘린더에 동기화합니다.
 */
export async function syncTaskToGoogleCalendar(taskId, taskData) {
    try {
        const token = getAccessToken();
        if (!token) return;

        if (token === 'mock_access_token') {
            console.log("[Calendar MOCK] Task synced successfully (mock):", formatEventId(taskId));
            return formatEventId(taskId);
        }

        const calendarId = await getOrCreateCalendar();
        if (!calendarId) return;
        const gEventId = formatEventId(taskId);

        // Date 설정. dueDate, startDate, endDate 등 상황에 맞게 처리
        let start, end;
        if (taskData.startDate && taskData.endDate) {
            // 종일 일정 (다일)
            start = { date: taskData.startDate.split('T')[0] };
            // 구글 캘린더 종일 일정의 endDate는 포함되지 않는(Exclusive) 날짜여야 하므로 하루를 더해줍니다.
            const eDate = new Date(taskData.endDate);
            eDate.setDate(eDate.getDate() + 1);
            end = { date: eDate.toISOString().split('T')[0] };
        } else if (taskData.dueDate) {
            // 특정 시간 일정
            const d = taskData.dueDate instanceof Date ? taskData.dueDate : new Date(taskData.dueDate);
            start = { dateTime: d.toISOString() };
            end = { dateTime: new Date(d.getTime() + 60 * 60 * 1000).toISOString() }; // 기본 1시간
        } else {
            // 기본값: 오늘 종일
            const d = new Date();
            const dateStr = d.toISOString().split('T')[0];
            start = { date: dateStr };
            end = { date: dateStr };
        }

        const eventBody = {
            summary: `[Task] ${taskData.title}`,
            description: taskData.description || 'I-Link ERP에서 연동된 태스크입니다.',
            start,
            end,
            // 완료된 태스크는 투명도(transparency)를 'transparent'로 하거나, 취소선 표시를 원하면 상태를 변경
            status: 'confirmed',
            colorId: taskData.status === 'completed' ? '8' : (taskData.priority === 'urgent' ? '11' : '9') // 색상으로 상태 구분
        };

        // Update (PUT) - ID를 명시하면 없으면 생성, 있으면 수정됨
        const updateRes = await fetch(`${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${gEventId}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventBody)
        });

        if (!updateRes.ok) {
            console.error("[Calendar] Failed to sync task", await updateRes.text());
        } else {
            console.log("[Calendar] Task synced successfully:", gEventId);
            return gEventId;
        }
    } catch (e) {
        console.error("[Calendar] Sync error:", e);
    }
}

/**
 * Task 삭제 시 구글 캘린더 이벤트도 삭제합니다.
 */
export async function deleteTaskFromGoogleCalendar(taskId) {
    try {
        const token = getAccessToken();
        if (!token) return;
        
        if (token === 'mock_access_token') {
            console.log("[Calendar MOCK] Task deleted successfully from calendar.");
            return;
        }

        const calendarId = await getOrCreateCalendar();
        if (!calendarId) return;
        const gEventId = formatEventId(taskId);

        const res = await fetch(`${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${gEventId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok || res.status === 410 || res.status === 404) {
            console.log("[Calendar] Task deleted successfully from calendar.");
        }
    } catch (e) {
        console.error("[Calendar] Delete error:", e);
    }
}

/**
 * 구글 캘린더의 일정을 ERP 테스크로 폴링 동기화합니다.
 */
export async function pollGoogleCalendarToTasks(ownerUid) {
    if (!ownerUid) return;
    try {
        const token = getAccessToken();
        if (!token) return;

        const calendarId = await getOrCreateCalendar();
        if (!calendarId) return;
        
        // 최근 30일(또는 전체) 이벤트 fetch (성능을 위해 한달치만)
        const timeMin = new Date();
        timeMin.setDate(timeMin.getDate() - 30);
        
        const res = await fetch(`${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${timeMin.toISOString()}&singleEvents=true&maxResults=500`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) return;
        const data = await res.json();
        const gEvents = data.items || [];
        
        const q = query(collection(db, 'personal_tasks'), where('ownerUid', '==', ownerUid));
        const erpSnap = await getDocs(q);
        const erpTasks = erpSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        for (const gEvent of gEvents) {
            const matchingErp = erpTasks.find(e => e.googleEventId === gEvent.id || formatEventId(e.id) === gEvent.id);
            
            let startDate = null;
            let dueDate = null;
            if (gEvent.start?.dateTime) startDate = new Date(gEvent.start.dateTime);
            else if (gEvent.start?.date) startDate = new Date(gEvent.start.date);
            
            if (gEvent.end?.dateTime) dueDate = new Date(gEvent.end.dateTime);
            else if (gEvent.end?.date) {
                const d = new Date(gEvent.end.date);
                d.setDate(d.getDate() - 1); // 종일 일정의 endDate는 다음날 자정이므로 하루를 빼줌
                dueDate = d;
            }

            const isCompleted = gEvent.colorId === '8' || gEvent.status === 'cancelled';
            const status = isCompleted ? 'completed' : 'todo';
            const priority = gEvent.colorId === '11' ? 'urgent' : 'medium';
            
            let summary = gEvent.summary || '제목 없음';
            if (summary.startsWith('[Task] ')) summary = summary.replace('[Task] ', '');

            // 캘린더에서 삭제된 일정(cancelled) 처리
            if (gEvent.status === 'cancelled') {
                if (matchingErp) {
                    await updateDoc(doc(db, 'personal_tasks', matchingErp.id), { status: 'completed', updatedAt: serverTimestamp() });
                }
                continue;
            }

            if (matchingErp) {
                let isChanged = false;
                if (matchingErp.status !== status) isChanged = true;
                if (matchingErp.title !== summary) isChanged = true;
                
                const gDueStr = dueDate ? dueDate.toDateString() : '';
                const eDueStr = matchingErp.dueDate?.toDate ? matchingErp.dueDate.toDate().toDateString() : (matchingErp.dueDate ? new Date(matchingErp.dueDate).toDateString() : '');
                if (gDueStr !== eDueStr) isChanged = true;
                
                if (isChanged) {
                    await updateDoc(doc(db, 'personal_tasks', matchingErp.id), {
                        title: summary,
                        status: status,
                        dueDate: dueDate || matchingErp.dueDate,
                        updatedAt: serverTimestamp()
                    });
                }
            } else {
                await addDoc(collection(db, 'personal_tasks'), {
                    ownerUid,
                    assigneeUid: ownerUid,
                    googleEventId: gEvent.id,
                    title: summary,
                    description: gEvent.description || '',
                    status: status,
                    priority: priority,
                    subtasks: [],
                    startDate: startDate || new Date(),
                    dueDate: dueDate || new Date(),
                    alarmEnabled: false,
                    alarmSent: false,
                    recurring: 'none',
                    createdAt: serverTimestamp()
                });
            }
        }
    } catch (e) {
        console.error("[Calendar] Polling Sync Error:", e);
    }
}
