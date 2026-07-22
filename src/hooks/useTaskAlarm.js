import { useEffect, useRef } from 'react';
import { db, collection, query, where, onSnapshot, addDoc, serverTimestamp, updateDoc, doc } from '../database';
import { pollGoogleCalendarToTasks } from '../services/calendarService';

export function useTaskAlarm(currentUser) {
    const lastCheckedRef = useRef(new Date());

    // 구글 테스크 폴링 (5분 주기)
    useEffect(() => {
        if (!currentUser) return;
        
        // 초기 1회 실행
        pollGoogleCalendarToTasks(currentUser.uid);
        
        // 5분마다 백그라운드 동기화 (구글 캘린더 -> ERP)
        const intervalId = setInterval(() => {
            pollGoogleCalendarToTasks(currentUser.uid);
        }, 1000 * 60 * 5); // 5분마다

        return () => clearInterval(intervalId);
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser) return;

        // 인덱스 에러 방지를 위해 간단한 쿼리로 본인 Task만 가져온 후 메모리에서 필터링
        const q = query(
            collection(db, 'personal_tasks'),
            where('ownerUid', '==', currentUser.uid)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const now = new Date();
            snapshot.docs.forEach(async (docSnapshot) => {
                const task = docSnapshot.data();
                
                // 알람 조건 메모리에서 체크
                if (!task.alarmEnabled || task.status === 'completed' || task.alarmSent || !task.dueDate) return;

                const dueDate = task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate);
                
                // 마감 시간 10분 전이거나 이미 지났는데 알람을 안 보낸 경우
                const timeDiff = dueDate.getTime() - now.getTime();
                const tenMinutes = 10 * 60 * 1000;

                if (timeDiff <= tenMinutes) {
                    // (생략: 알림 발송 로직 동일)
                    // 1. 브라우저 알림 발송
                    sendBrowserNotification(task.title, dueDate);

                    // 2. DB 알림 테이블에 기록 (Header에서 보이게)
                    await addDoc(collection(db, 'notifications'), {
                        userEmail: currentUser.email,
                        title: '📅 Task 마감 임박',
                        message: `[${task.title}] 업무 마감이 10분 이내입니다.`,
                        read: false,
                        type: 'task_alarm',
                        createdAt: serverTimestamp()
                    });

                    // 3. 알람 발송 완료 처리 (중복 방지)
                    await updateDoc(doc(db, 'personal_tasks', docSnapshot.id), {
                        alarmSent: true
                    });
                }
            });
        });

        return () => unsubscribe();
    }, [currentUser]);

    const sendBrowserNotification = (title, dueDate) => {
        const body = `[${title}] 마감: ${dueDate.toLocaleTimeString()}`;
        
        // Electron 빌드 환경: IPC를 통해 main process에서 네이티브 알림 사용 (빌드 후에도 안정적)
        if (window.electronAPI?.showNotification) {
            window.electronAPI.showNotification('I-Link: Task 알람', body);
            return;
        }

        // 웹 브라우저 환경 fallback: Web Notification API
        if (!("Notification" in window)) return;

        const trigger = () => {
            new Notification("I-Link: Task 알람", {
                body,
                icon: '/favicon.ico'
            });
        };

        if (Notification.permission === "granted") {
            trigger();
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") trigger();
            });
        }
    };
}
