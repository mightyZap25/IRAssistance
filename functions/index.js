const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();

// 환경변수 또는 임시 Webhook URL 설정
// 실제 운영 환경에서는 firebase functions:config:set slack.webhook_url="..." 사용 권장
const SLACK_WEBHOOK_URL = functions.config().slack?.webhook_url || "YOUR_SLACK_WEBHOOK_URL"; 
const GOOGLE_CHAT_WEBHOOK_URL = functions.config().gchat?.webhook_url || "YOUR_GCHAT_WEBHOOK_URL";

/**
 * 이슈/테스트가 '완료(Completed/Resolved)' 상태로 변경될 때 메신저로 알림 전송
 * 대상 컬렉션: 'project_issues'
 */
exports.notifyIssueCompletion = functions.firestore
    .document('project_issues/{issueId}')
    .onUpdate(async (change, context) => {
        const newValue = change.after.data();
        const previousValue = change.before.data();

        // 상태가 '완료'로 변경된 경우에만 실행
        if (newValue.Status === '완료' && previousValue.Status !== '완료') {
            const issueId = context.params.issueId;
            const assignee = newValue.Assignee || '담당자 미정';
            const title = newValue.Title || '제목 없음';
            const projectId = newValue.ProjectID || 'N/A';

            const message = `
*✅ 이슈 완료 알림*
• *이슈 제목:* ${title}
• *담당자:* ${assignee}
• *프로젝트 ID:* ${projectId}
• *링크:* https://your-app-url.com/project/issues?id=${issueId}
            `;

            // Slack 전송 시도
            if (SLACK_WEBHOOK_URL !== "YOUR_SLACK_WEBHOOK_URL") {
                try {
                    await fetch(SLACK_WEBHOOK_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: message })
                    });
                    console.log(`Slack 알림 전송 완료: ${issueId}`);
                } catch (error) {
                    console.error("Slack 전송 실패:", error);
                }
            }

            // Google Chat 전송 시도
            if (GOOGLE_CHAT_WEBHOOK_URL !== "YOUR_GCHAT_WEBHOOK_URL") {
                try {
                    await fetch(GOOGLE_CHAT_WEBHOOK_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                        body: JSON.stringify({ text: message })
                    });
                    console.log(`Google Chat 알림 전송 완료: ${issueId}`);
                } catch (error) {
                    console.error("Google Chat 전송 실패:", error);
                }
            }
        }
        return null;
    });
