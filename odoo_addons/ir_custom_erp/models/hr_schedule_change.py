from odoo import models, fields, api, _
from odoo.exceptions import UserError

class HrScheduleChange(models.Model):
    _name = 'hr.schedule.change'
    _description = 'Working Schedule Change Request'
    _inherit = ['mail.thread', 'mail.activity.mixin']

    name = fields.Char(string='Reference', required=True, copy=False, readonly=True, default=lambda self: _('New'))
    
    employee_id = fields.Many2one('hr.employee', string='Employee', required=True, default=lambda self: self.env.user.employee_id, tracking=True)
    company_id = fields.Many2one('res.company', string='Company', required=True, default=lambda self: self.env.company)
    
    current_calendar_id = fields.Many2one('resource.calendar', string='Current Schedule', related='employee_id.resource_calendar_id', readonly=True)
    requested_calendar_id = fields.Many2one('resource.calendar', string='Requested Schedule', required=True, domain="[('company_id', 'in', [company_id, False])]", tracking=True)
    
    reason = fields.Text(string='Reason', required=True, tracking=True)
    
    state = fields.Selection([
        ('draft', 'Draft'),
        ('confirm', 'To Approve'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ], string='Status', default='draft', tracking=True)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', _('New')) == _('New'):
                vals['name'] = self.env['ir.sequence'].next_by_code('hr.schedule.change') or _('New')
        return super(HrScheduleChange, self).create(vals_list)

    def action_confirm(self):
        for rec in self:
            rec.state = 'confirm'

    def action_approve(self):
        for rec in self:
            if not rec.requested_calendar_id:
                raise UserError(_("Requested schedule is missing."))
            
            # Update Employee's resource calendar
            rec.employee_id.resource_calendar_id = rec.requested_calendar_id
            
            # Update Contract's resource calendar if there's an active contract
            if 'hr.contract' in self.env:
                contracts = self.env['hr.contract'].search([
                    ('employee_id', '=', rec.employee_id.id),
                    ('state', '=', 'open')
                ])
                for contract in contracts:
                    contract.resource_calendar_id = rec.requested_calendar_id
                
            rec.state = 'approved'

    def action_reject(self):
        for rec in self:
            rec.state = 'rejected'

    def action_draft(self):
        for rec in self:
            rec.state = 'draft'

class HrPendingApprovalsWizard(models.TransientModel):
    _name = 'hr.pending.approvals.wizard'
    _description = 'My Pending Approvals Wizard'

    def _default_leaves(self):
        if 'hr.leave' in self.env:
            return self.env['hr.leave'].search([
                ('state', '=', 'confirm'),
                ('employee_id', '=', self.env.user.employee_id.id)
            ]).ids
        return []

    def _default_schedules(self):
        return self.env['hr.schedule.change'].search([
            ('state', '=', 'confirm'),
            ('employee_id', '=', self.env.user.employee_id.id)
        ]).ids

    leave_ids = fields.Many2many('hr.leave', string='휴가 결재 대기', default=_default_leaves)
    schedule_ids = fields.Many2many('hr.schedule.change', string='근무일정 결재 대기', default=_default_schedules)
