from odoo import http
from odoo.http import request
import datetime
import logging

_logger = logging.getLogger(__name__)

class MainDashboardAPI(http.Controller):

    @http.route('/api/main_dashboard/data', type='json', auth='user', cors='*', methods=['POST', 'OPTIONS'])
    def get_main_dashboard_data(self):
        user = request.env.user
        employee = request.env['hr.employee'].sudo().search([('user_id', '=', user.id)], limit=1)
        
        # 1. To-Do & Approvals
        activities = request.env['mail.activity'].sudo().search([('user_id', '=', user.id)])
        todo_count = len(activities)
        
        leaves_to_approve = request.env['hr.leave'].sudo().search_count([('state', '=', 'confirm')]) if employee else 0
        
        # 2. Sales KPIs (This month)
        today = datetime.date.today()
        first_day = today.replace(day=1)
        sales_this_month = request.env['sale.order'].sudo().search([
            ('state', 'in', ['sale', 'done']),
            ('date_order', '>=', first_day)
        ])
        revenue_this_month = sum(sales_this_month.mapped('amount_total'))
        
        # 3. Manufacturing & PLM
        bom_count = request.env['mrp.bom'].sudo().search_count([('active', '=', True)])
        production_orders = request.env['mrp.production'].sudo().search_count([('state', 'not in', ['done', 'cancel'])])
        
        return {
            'status': 'success',
            'data': {
                'user_name': user.name,
                'department': employee.department_id.name if employee and employee.department_id else '소속 없음',
                'todo_count': todo_count,
                'leaves_to_approve': leaves_to_approve,
                'revenue_this_month': revenue_this_month,
                'sales_count': len(sales_this_month),
                'bom_count': bom_count,
                'production_orders': production_orders,
                'recent_activities': [
                    {'id': a.id, 'summary': a.summary or a.res_name, 'date': str(a.date_deadline)} 
                    for a in activities[:5]
                ]
            }
        }
