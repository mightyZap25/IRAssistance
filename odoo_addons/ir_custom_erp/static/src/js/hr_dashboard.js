/** @odoo-module **/

import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { rpc } from "@web/core/network/rpc";

export class HrDashboard extends Component {
    setup() {
        this.action = useService("action");
        this.notification = useService("notification");
        
        this.state = useState({
            data: {
                user_name: '',
                today_date: '',
                status_text: '로딩 중...',
                check_in_time: '--:--',
                check_out_time: '--:--',
                worked_hours_week: 0,
                worked_hours_percent: 0,
                leave_taken_days: 0,
                leave_total_days: 0,
                leave_remaining_hours: 0,
                pending_approvals: 0
            },
            calendar: {
                currentDate: new Date(),
                currentMonthStr: '',
                weeks: []
            },
            modal: {
                active: false,
                type: 'leave', // 'leave' or 'attendance'
                formData: {
                    type: '',
                    startDate: '',
                    endDate: '',
                    reason: ''
                }
            },
            // 결재대기 목록 패널
            pendingPanel: {
                open: false,
                my_requests: [],
                to_approve: [],
                loading: false,
            }
        });

        onWillStart(async () => {
            await this.loadData();
            await this.loadCalendarData();
            await this.loadPendingList();
        });
    }

    async loadData() {
        try {
            const result = await rpc("/api/hr_dashboard/data", {});
            if (result.error) {
                console.error(result.error);
                return;
            }
            Object.assign(this.state.data, result);
        } catch (e) {
            console.error("RPC Error:", e);
        }
    }

    async loadPendingList() {
        this.state.pendingPanel.loading = true;
        try {
            const result = await rpc("/api/hr_dashboard/pending_list", {});
            if (result) {
                this.state.pendingPanel.my_requests = result.my_requests || [];
                this.state.pendingPanel.to_approve = result.to_approve || [];

                // 내가 결재해야 할 건이 있으면 상단 알림 표시
                const toApproveCount = this.state.pendingPanel.to_approve.length;
                if (toApproveCount > 0) {
                    this.notification.add(
                        `결재 대기: ${toApproveCount}건의 휴가 신청이 귀하의 승인을 기다리고 있습니다.`,
                        {
                            type: 'warning',
                            title: '결재 대기 알림',
                            sticky: false,
                        }
                    );
                }
            }
        } catch (e) {
            console.error("RPC Error (PendingList):", e);
        } finally {
            this.state.pendingPanel.loading = false;
        }
    }

    async loadCalendarData() {
        try {
            const year = this.state.calendar.currentDate.getFullYear();
            const month = this.state.calendar.currentDate.getMonth() + 1;
            
            this.state.calendar.currentMonthStr = `${year}-${String(month).padStart(2, '0')}`;
            
            const result = await rpc("/api/hr_dashboard/calendar_events", { year, month });
            const events = result.events || [];
            
            this.generateCalendarGrid(year, month, events);
        } catch (e) {
            console.error("RPC Error (Calendar):", e);
        }
    }

    generateCalendarGrid(year, month, events) {
        // 1일의 요일과 마지막 날짜 구하기
        const firstDay = new Date(year, month - 1, 1).getDay();
        const lastDate = new Date(year, month, 0).getDate();
        
        // 이전 달 마지막 날짜 구하기
        const prevLastDate = new Date(year, month - 1, 0).getDate();
        
        let currentDay = 1;
        let nextMonthDay = 1;
        
        let weeks = [];
        let currentWeek = [];
        
        // 6주까지 채움 (최대)
        for (let row = 0; row < 6; row++) {
            currentWeek = [];
            for (let col = 0; col < 7; col++) {
                let cellDateStr = '';
                let displayNum = 0;
                let isCurrentMonth = false;
                
                if (row === 0 && col < firstDay) {
                    // 이전 달
                    displayNum = prevLastDate - firstDay + col + 1;
                    const py = month === 1 ? year - 1 : year;
                    const pm = month === 1 ? 12 : month - 1;
                    cellDateStr = `${py}-${String(pm).padStart(2, '0')}-${String(displayNum).padStart(2, '0')}`;
                } else if (currentDay <= lastDate) {
                    // 현재 달
                    displayNum = currentDay;
                    isCurrentMonth = true;
                    cellDateStr = `${year}-${String(month).padStart(2, '0')}-${String(displayNum).padStart(2, '0')}`;
                    currentDay++;
                } else {
                    // 다음 달
                    displayNum = nextMonthDay;
                    const ny = month === 12 ? year + 1 : year;
                    const nm = month === 12 ? 1 : month + 1;
                    cellDateStr = `${ny}-${String(nm).padStart(2, '0')}-${String(displayNum).padStart(2, '0')}`;
                    nextMonthDay++;
                }
                
                // 해당 날짜의 이벤트 매핑
                const dayEvents = events.filter(e => {
                    return e.start <= cellDateStr && e.end >= cellDateStr;
                });
                
                currentWeek.push({
                    dayNum: displayNum,
                    dateStr: cellDateStr,
                    isCurrentMonth: isCurrentMonth,
                    isWeekend: col === 0 || col === 6,
                    isSunday: col === 0,
                    events: dayEvents
                });
            }
            weeks.push(currentWeek);
            if (currentDay > lastDate) break;
        }
        
        this.state.calendar.weeks = weeks;
    }

    async prevMonth() {
        const d = this.state.calendar.currentDate;
        this.state.calendar.currentDate = new Date(d.getFullYear(), d.getMonth() - 1, 1);
        await this.loadCalendarData();
    }

    async nextMonth() {
        const d = this.state.calendar.currentDate;
        this.state.calendar.currentDate = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        await this.loadCalendarData();
    }

    async todayMonth() {
        this.state.calendar.currentDate = new Date();
        await this.loadCalendarData();
    }

    async _onClickClock() {
        if (this.state.data.check_in_time !== '--:--' && this.state.data.check_out_time === '--:--') {
            if (!window.confirm('정말 퇴근하시겠습니까? 퇴근 처리 후에는 취소할 수 없습니다.')) {
                return;
            }
        }
        
        try {
            const result = await rpc("/api/hr_dashboard/clock", {});
            if (result.success) {
                if (this.state.data.check_in_time !== '--:--' && this.state.data.check_out_time === '--:--') {
                    alert('퇴근 처리되었습니다 (Odoo 연동됨). 수고하셨습니다!');
                } else {
                    alert('출근 등록되었습니다 (Odoo 연동됨).');
                }
                await this.loadData();
            } else {
                alert('처리 실패: ' + (result.error || '알 수 없는 오류'));
            }
        } catch (e) {
            console.error("RPC Error:", e);
            alert('처리 실패: ' + e.message);
        }
    }

    _onClickLeaveRequest() {
        this.action.doAction({
            type: 'ir.actions.act_window',
            name: '휴가 신청',
            res_model: 'hr.leave',
            views: [[false, 'form']],
            view_mode: 'form',
            target: 'new',
            context: {
                default_employee_id: this.state.data.employee_id,
            }
        });
    }

    _onClickAttendanceRequest() {
        this.action.doAction({
            type: 'ir.actions.act_window',
            name: '근태 신청',
            res_model: 'hr.leave',
            views: [[false, 'form']],
            view_mode: 'form',
            target: 'new',
            context: {
                default_employee_id: this.state.data.employee_id,
            }
        });
    }

    _onClickScheduleChange() {
        this.action.doAction('ir_custom_erp.action_hr_schedule_change_modal', {
            additionalContext: {
                default_employee_id: this.state.data.employee_id,
            }
        });
    }

    _onClickPendingApprovals() {
        // 모달 팝업 대신 Odoo 기본 '관리 - 휴가' (결재 대기) 화면으로 이동
        this.action.doAction('hr_holidays.hr_leave_action_action_approve_department');
    }

    _onClickClosePendingPanel() {
        this.state.pendingPanel.open = false;
    }

    async _onClickApproveLeave(leaveId) {
        if (!confirm("해당 휴가 신청을 승인하시겠습니까?")) return;
        
        this.state.pendingPanel.loading = true;
        try {
            const result = await rpc("/api/hr_dashboard/action_leave", {
                leave_id: leaveId,
                action_type: 'approve'
            });
            
            if (result.error) {
                if (this.notification) this.notification.add(result.error, { type: "danger" });
            } else {
                if (this.notification) this.notification.add("휴가가 성공적으로 승인되었습니다.", { type: "success" });
                await this.loadPendingList();
                await this.loadData();
                if (this.render) this.render();
            }
        } catch (e) {
            if (this.notification) this.notification.add("승인 처리 중 오류가 발생했습니다.", { type: "danger" });
            console.error(e);
        } finally {
            this.state.pendingPanel.loading = false;
        }
    }

    async _onClickRefuseLeave(leaveId) {
        if (!confirm("해당 휴가 신청을 반려하시겠습니까?")) return;
        
        this.state.pendingPanel.loading = true;
        try {
            const result = await rpc("/api/hr_dashboard/action_leave", {
                leave_id: leaveId,
                action_type: 'refuse'
            });
            
            if (result.error) {
                if (this.notification) this.notification.add(result.error, { type: "danger" });
            } else {
                if (this.notification) this.notification.add("휴가가 성공적으로 반려되었습니다.", { type: "success" });
                await this.loadPendingList();
                await this.loadData();
                if (this.render) this.render();
            }
        } catch (e) {
            if (this.notification) this.notification.add("반려 처리 중 오류가 발생했습니다.", { type: "danger" });
            console.error(e);
        } finally {
            this.state.pendingPanel.loading = false;
        }
    }

    _onClickMyLeave(leaveId) {
        // 내 신청 상세 조회
        this.action.doAction({
            type: 'ir.actions.act_window',
            name: '내 휴가 신청',
            res_model: 'hr.leave',
            res_id: leaveId,
            views: [[false, 'form']],
            view_mode: 'form',
            target: 'current',
        });
    }

    closeModal() {
        this.state.modal.active = false;
    }

    async submitModal() {
        try {
            const result = await rpc("/api/hr_dashboard/submit_request", {
                type: this.state.modal.type,
                formData: this.state.modal.formData
            });
            if (result.success) {
                alert('신청이 성공적으로 완료되었습니다.');
                this.closeModal();
                await this.loadData();
            } else {
                alert('신청 실패: ' + (result.error || '알 수 없는 오류'));
            }
        } catch (e) {
            console.error("RPC Error:", e);
            alert('오류 발생: ' + e.message);
        }
    }
}

HrDashboard.template = "ir_custom_erp.HrDashboard";

// Register the component as an action in Odoo's registry
registry.category("actions").add("ir_custom_erp.hr_dashboard_action", HrDashboard);
