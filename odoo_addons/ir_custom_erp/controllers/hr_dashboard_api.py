from odoo import http
from odoo.http import request, logging
import datetime
import json
import werkzeug

_logger = logging.getLogger(__name__)

class HrDashboardAPI(http.Controller):

    @http.route('/api/fix_bom_loop', type='http', auth='user')
    def fix_bom_loop(self):
        """
        자재명세서(BOM) 무한 루프(순환 참조) 감지 및 삭제 스크립트
        """
        boms = request.env['mrp.bom'].sudo().search([])
        
        cycles_found = []
        
        def check_cycle(bom, visited):
            if bom.id in visited:
                return True
            visited.add(bom.id)
            for line in bom.bom_line_ids:
                # 라인의 제품(product_id)이나 템플릿(product_tmpl_id)에 연결된 자식 BOM 찾기
                child_boms = request.env['mrp.bom'].sudo().search([
                    '|',
                    ('product_id', '=', line.product_id.id),
                    ('product_tmpl_id', '=', line.product_tmpl_id.id)
                ])
                for cb in child_boms:
                    if check_cycle(cb, visited.copy()):
                        return True
            return False

        for bom in boms:
            if check_cycle(bom, set()):
                cycles_found.append(bom)
                
        if not cycles_found:
            return request.make_response("무한 루프(순환 참조)를 일으키는 BOM이 없습니다.", headers=[('Content-Type', 'text/html; charset=utf-8')])
            
        result_html = "<h3>무한 루프(순환 참조)가 감지된 BOM 목록:</h3><ul>"
        for cb in cycles_found:
            result_html += f"<li>[BOM ID: {cb.id}] {cb.product_tmpl_id.name}</li>"
            # 무한루프를 끊기 위해 해당 BOM 비활성화(삭제)
            cb.active = False
            
        result_html += "</ul><br/><b>위 BOM들을 자동으로 비활성화(보관 처리)하여 무한 루프를 끊었습니다. 이제 Odoo 자재명세서 화면이 정상 접속될 것입니다.</b>"
        
        return request.make_response(result_html, headers=[('Content-Type', 'text/html; charset=utf-8')])

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

        import pytz
        user_tz = pytz.timezone(user.tz or 'Asia/Seoul')
        
        def format_tz(dt):
            if not dt: return '--:--'
            return pytz.utc.localize(dt).astimezone(user_tz).strftime('%H:%M')

        check_in_str = format_tz(attendance.check_in) if attendance and attendance.check_in else '--:--'
        check_out_str = format_tz(attendance.check_out) if attendance and attendance.check_out else '--:--'
        
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
        # Odoo 19 hr_holidays 로직 연동 (현재 유효한 할당만 합산)
        leave_allocations = request.env['hr.leave.allocation'].search([
            ('employee_id', '=', employee.id),
            ('state', '=', 'validate'),
            '|', ('date_to', '=', False), ('date_to', '>=', today)
        ])
        # number_of_days_display 가 없는 버전을 대비해 number_of_days 도 고려
        total_allocated = sum(leave_allocations.mapped(lambda a: a.number_of_days_display if hasattr(a, 'number_of_days_display') else a.number_of_days))
        
        leaves = request.env['hr.leave'].search([
            ('employee_id', '=', employee.id),
            ('state', '=', 'validate'),
            ('date_from', '>=', f'{today.year}-01-01')
        ])
        total_taken = sum(leaves.mapped('number_of_days'))
        
        remaining_days = total_allocated - total_taken
        remaining_hours = remaining_days * 8 # 1일 8시간 기준

        # 4. 결재 대기 건수
        # 4-1. 내가 신청한 휴가 중 결재 대기 중인 것
        my_pending_leaves_count = 0
        if 'hr.leave' in request.env:
            my_pending_leaves_count = request.env['hr.leave'].search_count([
                ('state', 'in', ['confirm', 'validate1']),
                ('employee_id', '=', employee.id)
            ])

        # 4-2. 내가 결재해야 할 휴가 (부서장/관리자로 지정된 직원의 신청건 또는 전체 휴가 관리자)
        to_approve_count = 0
        if 'hr.leave' in request.env:
            try:
                domain = [('state', 'in', ['confirm', 'validate1'])]
                if not user.has_group('hr_holidays.group_hr_holidays_user'):
                    domain += ['|', ('employee_id.parent_id.user_id', '=', user.id), ('employee_id.leave_manager_id.user_id', '=', user.id)]
                to_approve_count = request.env['hr.leave'].sudo().search_count(domain)
            except Exception as e:
                _logger.error(f"Error fetching to_approve_count: {e}")

        pending_approvals = my_pending_leaves_count + to_approve_count

        # 5. 신청 가능한 휴가/근태 분류 (hr.leave.type) 가져오기
        leave_types_records = request.env['hr.leave.type'].search([('active', '=', True)])
        leave_types = [{'id': lt.id, 'name': lt.name} for lt in leave_types_records]

        return {
            'employee_id': employee.id,
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
            'leave_types': leave_types,
        }

    @http.route('/api/hr_dashboard/clock', type='json', auth='user')
    def toggle_clock(self):
        employee = request.env.user.employee_id
        if not employee:
            return {'error': '직원 정보 없음'}
            
        attendance = request.env['hr.attendance'].search([
            ('employee_id', '=', employee.id),
            ('check_out', '=', False)
        ], limit=1)
        
        try:
            if attendance:
                # 퇴근 (현재 시간을 UTC로 저장)
                attendance.sudo().write({'check_out': datetime.datetime.utcnow()})
            else:
                # 출근
                request.env['hr.attendance'].sudo().create({
                    'employee_id': employee.id,
                    'check_in': datetime.datetime.utcnow()
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
        employee = request.env.user.employee_id
        if not employee:
            return {'events': events}
        
        # 1. 일반 휴가 (hr.leave) - 모든 직원 표시
        leaves = request.env['hr.leave'].search([
            ('state', '=', 'validate'),
            ('date_from', '<=', end_date),
            ('date_to', '>=', start_date)
        ])
        
        seen_events = set()
        for leave in leaves:
            event_key = f"{leave.employee_id.id}_{leave.date_from.strftime('%Y-%m-%d')}"
            if event_key in seen_events:
                continue
            seen_events.add(event_key)
            
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

    @http.route('/api/hr_dashboard/submit_request', type='json', auth='user')
    def submit_leave_request(self, type, formData):
        employee = request.env.user.employee_id
        if not employee:
            return {'error': '직원 정보 없음'}
            
        # Odoo hr.leave 에 레코드 생성
        try:
            # formData에서 전달받은 type(실제로는 hr.leave.type의 ID)을 사용
            leave_type_id = int(formData.get('type')) if formData.get('type') else False
            if not leave_type_id:
                leave_type_id = request.env['hr.leave.type'].search([], limit=1).id
            
            # startDate와 endDate 파싱
            start_dt = datetime.datetime.strptime(formData.get('startDate'), '%Y-%m-%d') if formData.get('startDate') else datetime.datetime.now()
            end_dt = datetime.datetime.strptime(formData.get('endDate'), '%Y-%m-%d') if formData.get('endDate') else datetime.datetime.now()
            
            request.env['hr.leave'].sudo().create({
                'employee_id': employee.id,
                'holiday_status_id': leave_type_id,
                'request_date_from': start_dt.date(),
                'request_date_to': end_dt.date(),
                'name': formData.get('reason', ''),
            })
            return {'success': True}
        except Exception as e:
            return {'error': str(e)}

    @http.route('/api/hr_dashboard/pending_list', type='json', auth='user')
    def get_pending_list(self):
        """결재 대기 상세 목록: 내가 신청한 것 + 내가 결재해야 할 것"""
        user = request.env.user
        employee = user.employee_id
        if not employee:
            return {'my_requests': [], 'to_approve': []}

        import pytz
        user_tz = pytz.timezone(user.tz or 'Asia/Seoul')

        def fmt_date(dt):
            if not dt: return ''
            if isinstance(dt, datetime.datetime):
                return pytz.utc.localize(dt).astimezone(user_tz).strftime('%Y-%m-%d')
            return dt.strftime('%Y-%m-%d')

        def leave_state_label(state):
            mapping = {
                'draft': '임시저장',
                'confirm': '결재대기',
                'validate1': '1차승인',
                'validate': '승인완료',
                'refuse': '반려'
            }
            return mapping.get(state, state)

        # 내가 신청한 휴가 중 결재 대기 중인 목록
        my_leaves = []
        if 'hr.leave' in request.env:
            records = request.env['hr.leave'].search([
                ('state', 'in', ['confirm', 'validate1']),
                ('employee_id', '=', employee.id)
            ], order='date_from asc', limit=20)
            for r in records:
                my_leaves.append({
                    'id': r.id,
                    'name': r.name or (r.holiday_status_id.name if r.holiday_status_id else '휴가'),
                    'leave_type': r.holiday_status_id.name if r.holiday_status_id else '',
                    'date_from': fmt_date(r.date_from),
                    'date_to': fmt_date(r.date_to),
                    'number_of_days': r.number_of_days,
                    'state': leave_state_label(r.state),
                    'state_raw': r.state,
                })

        # 내가 결재해야 할 휴가 목록 (부서장/관리자로 지정된 직원의 신청건 또는 휴가 관리자)
        to_approve = []
        if 'hr.leave' in request.env:
            try:
                domain = [('state', 'in', ['confirm', 'validate1'])]
                if not user.has_group('hr_holidays.group_hr_holidays_user'):
                    domain += ['|', ('employee_id.parent_id.user_id', '=', user.id), ('employee_id.leave_manager_id.user_id', '=', user.id)]
                    
                records = request.env['hr.leave'].sudo().search(domain, order='date_from asc', limit=20)
                for r in records:
                    to_approve.append({
                        'id': r.id,
                        'employee_name': r.employee_id.name if r.employee_id else '',
                        'department': r.employee_id.department_id.name if r.employee_id and r.employee_id.department_id else '',
                        'name': r.name or (r.holiday_status_id.name if r.holiday_status_id else '휴가'),
                        'leave_type': r.holiday_status_id.name if r.holiday_status_id else '',
                        'date_from': fmt_date(r.date_from),
                        'date_to': fmt_date(r.date_to),
                        'number_of_days': r.number_of_days,
                        'state': leave_state_label(r.state),
                        'state_raw': r.state,
                    })
            except Exception as e:
                _logger.error(f"Error fetching to_approve list: {e}")

        return {
            'my_requests': my_leaves,
            'to_approve': to_approve,
        }

    @http.route('/api/hr_dashboard/action_leave', type='json', auth='user')
    def action_leave(self, leave_id, action_type):
        """휴가 결재 대기 목록에서 즉시 승인/반려 처리"""
        try:
            leave = request.env['hr.leave'].sudo().browse(int(leave_id))
            if not leave.exists():
                return {'error': '해당 휴가 신청건을 찾을 수 없습니다.'}
            
            if action_type == 'approve':
                leave.action_approve()
            elif action_type == 'refuse':
                leave.action_refuse()
            else:
                return {'error': '알 수 없는 동작입니다.'}
            
            return {'success': True}
        except Exception as e:
            return {'error': f"오류 발생: {str(e)}"}
