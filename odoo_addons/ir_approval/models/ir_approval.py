from odoo import models, fields, api, exceptions

class IrApprovalRequest(models.Model):
    _name = 'ir_approval.request'
    _description = '전자결재 문서'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'create_date desc'

    name = fields.Char(string='기안서 제목', required=True, tracking=True)
    doc_type = fields.Selection([
        ('GENERAL', '일반 기안서(자유양식)'),
        ('MASS_PROD_TRANSFER', '양산이관서'),
        ('EXPENSE_RESOLUTION', '지출결의서'),
        ('ECO', 'ECO 설계변경 기안'),
        ('ISSUE_REQUEST', '불출요청서'),
        ('ETC', '기타 기안')
    ], string='문서 종류', default='GENERAL', tracking=True)
    
    # [일반 기안 공통 필드]
    department_id = fields.Many2one('hr.department', string='기안부서')
    draft_date = fields.Date(string='기안일자', default=fields.Date.context_today)
    retention_period = fields.Selection([
        ('1', '1년'),
        ('3', '3년'),
        ('5', '5년'),
        ('10', '10년'),
        ('permanent', '영구')
    ], string='보존연한', default='5')

    # [양산이관서 전용 필드]
    transfer_no = fields.Char(string='양산이관 번호')
    transfer_date = fields.Date(string='발행일자', default=fields.Date.context_today)
    transfer_product_family = fields.Char(string='제품군')
    transfer_model = fields.Char(string='이관 모델(시리즈)')
    transfer_detail_model = fields.Char(string='세부 모델명')
    transfer_folder_path = fields.Char(string='양산이관 폴더 경로')
    transfer_dept_opinion = fields.Text(string='발행부서 의견')
    transfer_line_ids = fields.One2many('ir_approval.transfer.line', 'approval_id', string='양산이관 목록')
    
    # [지출결의서 전용 필드]
    expense_doc_no = fields.Char(string='문서번호')
    expense_approval_condition = fields.Char(string='결재조건')
    expense_receipt_type = fields.Selection([
        ('receipt', '영수'),
        ('invoice', '청구')
    ], string='영수/청구 구분')
    expense_user = fields.Char(string='사용자')
    expense_amount = fields.Float(string='사용금액(금액)')
    expense_job_title = fields.Char(string='직급')
    expense_dept = fields.Char(string='사용 부서')
    expense_date = fields.Date(string='날짜', default=fields.Date.context_today)
    expense_vendor = fields.Char(string='거래처명')
    expense_details = fields.Text(string='상세내용')
    expense_etc = fields.Text(string='기타')

    # [ECO 전용 필드 (상세 양식)]
    eco_spec_no = fields.Char(string='1. 시방No.')
    eco_issue_date = fields.Date(string='2. 발행일자', default=fields.Date.context_today)
    eco_applied_models_chk = fields.Char(string='3. 적용모델(제품군)', help="체크된 항목들을 쉼표로 구분하여 저장")
    eco_comm_method = fields.Char(string='4. Servo 통신 방법')
    eco_applied_model_text = fields.Char(string='5. 적용모델')
    eco_spec_type = fields.Selection([
        ('regular', '정규'),
        ('temp', '임시')
    ], string='6. 시방구분', default='regular')
    eco_change_reason = fields.Char(string='7. 변경사유')
    eco_publish_change = fields.Selection([
        ('yes', '예(Y)'),
        ('no', '아니오(N)')
    ], string='8. 공표사양 변경여부')
    eco_publish_change_detail = fields.Text(string='8-1. 변경내용(공표사양변경시)')
    eco_improvement_effect = fields.Text(string='9. 개선효과')
    eco_dept_opinion = fields.Text(string='10. 발행부서 의견')
    eco_revision_no = fields.Char(string='11. Revision No.')
    
    eco_line_ids = fields.One2many('ir_approval.eco.line', 'approval_id', string='설계변경 상세 리스트')

    # [불출요청서 전용 필드]
    issue_request_date = fields.Date(string='불출요청일', default=fields.Date.context_today)
    issue_customer = fields.Char(string='고객사')
    issue_purpose = fields.Char(string='사용목적')
    
    issue_line_ids = fields.One2many('ir_approval.issue.line', 'approval_id', string='불출 상세 리스트')

    # [공통/기타 필드]
    description = fields.Html(string='상세 내용')

    requestor_id = fields.Many2one('res.users', string='기안자', default=lambda self: self.env.user, required=True)
    status = fields.Selection([
        ('draft', '임시저장'),
        ('pending', '결재 진행 중'),
        ('approved', '최종 승인됨'),
        ('rejected', '반려됨'),
        ('cancel', '취소됨')
    ], string='결재 상태', default='draft', tracking=True)
    
    ref_model = fields.Char(string='참조 문서 모델 (예: purchase.order)')
    ref_id = fields.Integer(string='참조 문서 ID')
    ref_name = fields.Char(string='참조 문서 번호', compute='_compute_ref_name', store=True)

    step_ids = fields.One2many('ir_approval.step', 'approval_id', string='결재선')
    current_step_idx = fields.Integer(string='현재 결재 단계 인덱스', default=0)
    is_my_turn = fields.Boolean(string='내 차례 여부', compute='_compute_is_my_turn', search='_search_is_my_turn')
    current_approver_id = fields.Many2one('res.users', string='현재 결재자', compute='_compute_is_my_turn')

    @api.depends('status', 'current_step_idx', 'step_ids.approver_id')
    def _compute_is_my_turn(self):
        for record in self:
            is_mine = False
            cur_approver = False
            idx = record.current_step_idx or 0
            if record.status == 'pending' and record.step_ids and idx < len(record.step_ids):
                current_step = record.step_ids[idx]
                cur_approver = current_step.approver_id.id
                if cur_approver == self.env.uid:
                    is_mine = True
            record.is_my_turn = is_mine
            record.current_approver_id = cur_approver

    current_turn_display = fields.Char(string='결재 차례', compute='_compute_current_turn_display')

    @api.depends('status', 'current_approver_id')
    def _compute_current_turn_display(self):
        for record in self:
            if record.status == 'approved':
                record.current_turn_display = '결재 완료'
            elif record.status == 'rejected':
                record.current_turn_display = '반려됨'
            elif record.current_approver_id:
                record.current_turn_display = record.current_approver_id.name
            else:
                record.current_turn_display = '대기중'

    def _search_is_my_turn(self, operator, value):
        # ORM 검색 시 발생할 수 있는 모든 무한 루프(Recursion)를 원천 차단하기 위해 SQL 직접 조회
        self.env.cr.execute("SELECT id FROM ir_approval_request WHERE status = 'pending'")
        pending_ids = [row[0] for row in self.env.cr.fetchall()]
        
        records = self.browse(pending_ids)
        my_turn_ids = [r.id for r in records if r.is_my_turn]
        
        if operator == '=' and value:
            return [('id', 'in', my_turn_ids)]
        return [('id', 'not in', my_turn_ids)]

    @api.depends('ref_model', 'ref_id')
    def _compute_ref_name(self):
        for record in self:
            if record.ref_model and record.ref_id:
                target_record = self.env[record.ref_model].sudo().browse(record.ref_id)
                if target_record.exists():
                    record.ref_name = target_record.display_name or str(record.ref_id)
                else:
                    record.ref_name = '알 수 없음'
            else:
                record.ref_name = ''

    def write(self, vals):
        # 시스템 필드 업데이트는 허용
        allowed_fields = {'status', 'current_step_idx', 'message_follower_ids', 'message_ids', 'activity_ids', 'step_ids'}
        if any(field not in allowed_fields for field in vals):
            for record in self:
                if record.status in ['pending', 'approved']:
                    raise exceptions.UserError('결재 진행 중이거나 승인 완료된 문서는 수정할 수 없습니다.')
        return super().write(vals)

    def copy(self, default=None):
        default = dict(default or {})
        default.update({
            'status': 'draft',
            'current_step_idx': 0,
        })
        new_record = super().copy(default)
        for step in new_record.step_ids:
            step.write({'status': 'pending', 'comment': False})
        return new_record

    def action_draft(self):
        for record in self:
            if record.status != 'rejected':
                raise exceptions.UserError('반려된 문서만 다시 임시저장으로 돌릴 수 있습니다.')
            record.status = 'draft'
            record.current_step_idx = 0
            for step in record.step_ids:
                step.write({'status': 'pending', 'comment': False})

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if not vals.get('step_ids'):
                raise exceptions.UserError('결재선을 지정해야 문서를 저장할 수 있습니다.')
                
        records = super().create(vals_list)
        for record in records:
            # 결재자가 지정되어 있으면 저장 시 자동 상신 (저장=상신 통합)
            if record.step_ids and record.status == 'draft':
                record.action_submit()
        return records

    def action_submit(self):
        for record in self:
            if not record.step_ids:
                raise exceptions.UserError('결재선을 지정해야 상신할 수 있습니다.')
            record.status = 'pending'
            record.current_step_idx = 0
            # 진행 상태 초기화
            for step in record.step_ids:
                step.status = 'pending'
            
            # 첫 번째 결재자에게 알림 발송 (mail.activity)
            first_approver = record.step_ids[0].approver_id
            if first_approver:
                record.activity_schedule(
                    'mail.mail_activity_data_todo',
                    summary='결재 요청 (새 기안)',
                    note=f'새로운 결재 문서 "{record.name}" 승인이 필요합니다.',
                    user_id=first_approver.id
                )
                self.env['bus.bus']._sendone(first_approver.partner_id, 'simple_notification', {
                    'type': 'warning',
                    'title': '결재 알림',
                    'message': f'내 차례입니다: {record.name}',
                    'sticky': True
                })

    def action_approve(self):
        self.ensure_one()
        if self.status != 'pending':
            raise exceptions.UserError('진행 중인 결재 문서만 승인할 수 있습니다.')
        
        # 현재 결재 단계 확인
        if self.current_step_idx >= len(self.step_ids):
            return
            
        current_step = self.step_ids[self.current_step_idx]
        if current_step.approver_id != self.env.user and not self.env.is_admin():
            raise exceptions.UserError('현재 결재 차례가 아니거나 권한이 없습니다.')
        
        current_step.write({'status': 'approved'})
        
        # 현재 결재자의 할 일(Activity) 완료 처리
        self.activity_feedback(['mail.mail_activity_data_todo'])
        
        self.current_step_idx += 1

        # 모든 단계가 끝났다면 최종 승인 처리
        if self.current_step_idx >= len(self.step_ids):
            self.status = 'approved'
            self._sync_target_document('approved')
            
            # 기안자에게 최종 승인 알림
            target_user_id = self.requestor_id.id if self.requestor_id else self.create_uid.id
            if target_user_id:
                self.activity_schedule(
                    'mail.mail_activity_data_todo',
                    summary='결재 최종 승인',
                    note=f'기안하신 "{self.name}" 문서가 최종 승인되었습니다.',
                    user_id=target_user_id
                )
        else:
            # 다음 단계 결재자에게 알림 발송
            next_approver = self.step_ids[self.current_step_idx].approver_id
            if next_approver:
                self.activity_schedule(
                    'mail.mail_activity_data_todo',
                    summary='결재 요청 (다음 단계)',
                    note=f'이전 결재자가 승인했습니다. "{self.name}" 문서 결재가 필요합니다.',
                    user_id=next_approver.id
                )
                self.env['bus.bus']._sendone(next_approver.partner_id, 'simple_notification', {
                    'type': 'warning',
                    'title': '결재 알림',
                    'message': f'내 차례입니다: {self.name}',
                    'sticky': True
                })

    def action_reject(self):
        self.ensure_one()
        if self.status != 'pending':
            raise exceptions.UserError('진행 중인 결재 문서만 반려할 수 있습니다.')

        current_step = self.step_ids[self.current_step_idx]
        if current_step.approver_id != self.env.user and not self.env.is_admin():
            raise exceptions.UserError('현재 결재 차례가 아니거나 권한이 없습니다.')

        current_step.write({'status': 'rejected'})
        self.status = 'rejected'
        
        # 현재 결재자의 할 일(Activity) 완료 처리
        self.activity_feedback(['mail.mail_activity_data_todo'])
        
        self._sync_target_document('rejected')
        
        # 기안자에게 반려 알림
        target_user_id = self.requestor_id.id if self.requestor_id else self.create_uid.id
        if target_user_id:
            self.activity_schedule(
                'mail.mail_activity_data_todo',
                summary='결재 반려됨',
                note=f'기안하신 "{self.name}" 문서가 반려되었습니다.',
                user_id=target_user_id
            )

    def _sync_target_document(self, action_type):
        """결재 완료/반려 시 원본 Odoo 문서(예: Purchase Order) 상태 변경"""
        if not self.ref_model or not self.ref_id:
            return
            
        target_record = self.env[self.ref_model].sudo().browse(self.ref_id)
        if not target_record.exists():
            return

        if self.ref_model == 'purchase.order':
            if action_type == 'approved' and target_record.state in ['draft', 'sent']:
                target_record.button_confirm()
            elif action_type == 'rejected' and target_record.state not in ['done', 'cancel']:
                target_record.button_cancel()


class IrApprovalStep(models.Model):
    _name = 'ir_approval.step'
    _description = '결재선 단계'
    _order = 'sequence, id'

    approval_id = fields.Many2one('ir_approval.request', string='결재 문서', ondelete='cascade')
    sequence = fields.Integer(string='순서', default=10)
    approver_id = fields.Many2one('res.users', string='결재자', required=True)
    status = fields.Selection([
        ('pending', '대기'),
        ('approved', '승인'),
        ('rejected', '반려')
    ], string='결재 상태', default='pending')
    comment = fields.Text(string='결재 의견')


class IrApprovalEcoLine(models.Model):
    _name = 'ir_approval.eco.line'
    _description = '설계변경 리스트 내역'
    _order = 'id'

    approval_id = fields.Many2one('ir_approval.request', string='결재 문서', ondelete='cascade')
    name = fields.Char(string='품명', required=True)
    list_no = fields.Char(string='LIST No.')
    spec_before = fields.Char(string='수정 전 규격')
    spec_after = fields.Char(string='수정 후 규격')
    quantity = fields.Float(string='수량(EA)')
    apply_date_method = fields.Char(string='적용 일자(방법)')
    remarks = fields.Char(string='비고')


class IrApprovalIssueLine(models.Model):
    _name = 'ir_approval.issue.line'
    _description = '불출요청 리스트 내역'
    _order = 'id'

    approval_id = fields.Many2one('ir_approval.request', string='결재 문서', ondelete='cascade')
    item_no = fields.Char(string='품목번호')
    name = fields.Char(string='자재/제품명', required=True)
    quantity = fields.Float(string='수량')
    price_unit = fields.Float(string='공급가')
    price_subtotal = fields.Float(string='금액')
    remarks = fields.Char(string='비고')


class IrApprovalTransferLine(models.Model):
    _name = 'ir_approval.transfer.line'
    _description = '양산이관 리스트 내역'
    _order = 'id'

    approval_id = fields.Many2one('ir_approval.request', string='결재 문서', ondelete='cascade')
    list_no = fields.Char(string='No.')
    name = fields.Char(string='이관자료 목록', required=True)
    version = fields.Char(string='Version')
    transfer_finish_date = fields.Date(string='이관완료일자')
    remarks = fields.Char(string='비고')
