from odoo import http
from odoo.http import request
import datetime

class HrDashboardAPI(http.Controller):

    @http.route('/api/hr_dashboard/data', type='json', auth='user')
    def get_dashboard_data(self):
        user = request.env.user
        employee = user.employee_id
        
        if not employee:
            # 관리자 등 직원 미매핑 시 기본값 반환
            return {
                'user_name': user.name,
                'today_date': datetime.date.today().strftime('%y-%m-%d (%a)'),
                'status_text': '직원 정보 없음',
                'check_in_time': '--:--',
                'check_out_time': '--:--',
                'worked_hours_week': 0,
                'worked_hours_percent': 0,
                'leave_taken_days': 0,
                'leave_total_days': 0,
                'leave_remaining_hours': 0,
                'pending_approvals': 0,
            }

        # 1. 오늘 근태 현황 확인
        today = datetime.date.today()
        attendance = request.env['hr.attendance'].search([
            ('employee_id', '=', employee.id),
            ('check_in', '>=', datetime.datetime.combine(today, datetime.time.min)),
            ('check_in', '<=', datetime.datetime.combine(today, datetime.time.max))
        ], limit=1)

        check_in_str = attendance.check_in.strftime('%H:%M') if attendance and attendance.check_in else '--:--'
        check_out_str = attendance.check_out.strftime('%H:%M') if attendance and attendance.check_out else '--:--'
        
        status = '출근 전입니다.'
        if attendance:
            if attendance.check_out:
                status = '퇴근 완료'
            else:
                status = '근무 중'

        # 2. 이번 주 근무 시간 계산 (가짜 데이터 대체 또는 실제 쿼리)
        # TODO: 실제 쿼리로 주간 누적 계산
        worked_hours_week = 32.6  # 예시: 32시간 40분
        
        # 3. 휴가 잔여일 계산 (일수 + 시간)
        # Odoo 19 hr_holidays 로직 연동
        leave_allocations = request.env['hr.leave.allocation'].search([
            ('employee_id', '=', employee.id),
            ('state', '=', 'validate')
        ])
        total_allocated = sum(leave_allocations.mapped('number_of_days'))
        
        leaves = request.env['hr.leave'].search([
            ('employee_id', '=', employee.id),
            ('state', '=', 'validate')
        ])
        total_taken = sum(leaves.mapped('number_of_days'))
        
        remaining_days = total_allocated - total_taken
        remaining_hours = remaining_days * 8 # 1일 8시간 기준

        # 4. 결재 대기 건수 (기본 휴가 신청서)
        pending_approvals = 0
        if 'hr.leave' in request.env:
            pending_approvals += request.env['hr.leave'].search_count([
                ('state', '=', 'confirm')
            ])
        # TODO: ECO나 다른 모델의 결재도 합산 가능

        return {
            'user_name': employee.name,
            'today_date': today.strftime('%y-%m-%d (%a)'),
            'status_text': status,
            'check_in_time': check_in_str,
            'check_out_time': check_out_str,
            'worked_hours_week': worked_hours_week,
            'worked_hours_percent': min((worked_hours_week / 40.0) * 100, 100),
            'leave_taken_days': total_taken,
            'leave_total_days': total_allocated,
            'leave_remaining_hours': remaining_hours,
            'pending_approvals': pending_approvals,
        }

    @http.route('/api/hr_dashboard/clock', type='json', auth='user')
    def toggle_clock(self):
        employee = request.env.user.employee_id
        if not employee:
            return {'error': '직원 정보 없음'}
            
        # Odoo 17/18 기본 출퇴근 로직 대신 직접 attendance 레코드 생성/수정
        attendance = request.env['hr.attendance'].search([
            ('employee_id', '=', employee.id),
            ('check_out', '=', False)
        ], limit=1)
        
        try:
            if attendance:
                # 퇴근
                attendance.sudo().write({'check_out': datetime.datetime.now()})
            else:
                # 출근
                request.env['hr.attendance'].sudo().create({
                    'employee_id': employee.id,
                    'check_in': datetime.datetime.now()
                })
                
            return {'success': True}
        except Exception as e:
            return {'error': str(e)}

    @http.route('/api/hr_dashboard/calendar_events', type='json', auth='user')
    def get_calendar_events(self, year, month):
        # 파라미터가 없으면 현재 월 사용
        if not year or not month:
            now = datetime.datetime.now()
            year, month = now.year, now.month
            
        # 검색 시작일 / 종료일 계산
        start_date = datetime.date(year, month, 1)
        next_month = month + 1 if month < 12 else 1
        next_year = year if month < 12 else year + 1
        end_date = datetime.date(next_year, next_month, 1) - datetime.timedelta(days=1)
        
        events = []
        
        # 1. 일반 휴가 (hr.leave)
        leaves = request.env['hr.leave'].search([
            ('state', '=', 'validate'),
            ('date_from', '<=', end_date),
            ('date_to', '>=', start_date)
        ])
        for leave in leaves:
            events.append({
                'id': f'leave_{leave.id}',
                'type': 'leave',
                'title': f'{leave.employee_id.name}',
                'start': leave.date_from.strftime('%Y-%m-%d'),
                'end': leave.date_to.strftime('%Y-%m-%d'),
                'icon': 'fa-umbrella',
                'color_class': 'text-primary'
            })
            
        # 2. 추가 근태 신청 내역 등은 제거됨 (Odoo 기본 hr.leave만 달력에 표시)
            
        return {'events': events}
