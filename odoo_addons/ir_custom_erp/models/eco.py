from odoo import models, fields, api

class IrEco(models.Model):
    _name = 'ir.eco'
    _description = 'Engineering Change Order (설계 변경)'
    
    name = fields.Char(string='ECO 번호', required=True, copy=False, readonly=True, index=True, default='New')
    
    eco_type = fields.Selection([
        ('part', '단일 부품/반제품 변경'),
        ('assembly', '제조품(완제품/반제품) 일괄 변경')
    ], string='ECO 유형', default='part', required=True)
    
    # 단일 부품 변경용 필드
    original_product_id = fields.Many2one('product.template', string='원본 부품 (Original)')
    new_product_id = fields.Many2one('product.template', string='신규 부품 (New Revision)')
    
    # 일괄 변경용 필터 필드 (Transient/Search Helper)
    filter_category = fields.Selection([('actuator', 'Actuator'), ('board', 'Board')], string='필터: 카테고리')
    filter_series_id = fields.Many2one('ir.custom.series', string='필터: 시리즈')
    
    # 일괄 변경 대상 제품들
    target_product_ids = fields.Many2many('product.template', 'ir_eco_target_product_rel', 'eco_id', 'product_id', 
                                          string='대상 제조품들', domain="[('x_manufacturing_type', '!=', False), ('active', '=', True)]")
    
    # BOM Tree 시각화 라인
    bom_line_ids = fields.One2many('ir.eco.bom.line', 'eco_id', string='BOM Tree (변경 영향도)')
    
    reason_for_change = fields.Text(string='변경 사유', required=True)
    
    approver_ids = fields.Many2many('res.users', string='결재자 목록')
    review_history = fields.Text(string='결재 히스토리', readonly=True)

    state = fields.Selection([
        ('draft', '작성 중 (Draft)'),
        ('review', '결재 진행 중 (Review)'),
        ('approved', '최종 승인/적용 완료 (Approved)'),
        ('rejected', '반려 (Rejected)')
    ], string='상태', default='draft', tracking=True)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', 'New') == 'New':
                vals['name'] = self.env['ir.sequence'].next_by_code('ir.eco') or 'ECO-0000'
        return super(IrEco, self).create(vals_list)

    @api.onchange('target_product_ids', 'original_product_id')
    def _onchange_generate_bom_tree(self):
        """대상 제품이 선택되면 BOM 트리를 전개하여 bom_line_ids 에 채웁니다."""
        # 기존 라인 삭제
        self.bom_line_ids = [(5, 0, 0)]
        
        lines = []
        if self.eco_type == 'part' and self.original_product_id:
            lines.append((0, 0, {
                'product_tmpl_id': self.original_product_id.id,
                'level': 0,
                'old_rev': self.original_product_id.x_rev,
                'new_rev': self.new_product_id.x_rev if self.new_product_id else '',
                'is_changed': True,
                'change_summary': '직접 변경 대상'
            }))
        elif self.eco_type == 'assembly' and self.target_product_ids:
            for product in self.target_product_ids:
                # 최상위 노드 추가
                lines.append((0, 0, {
                    'product_tmpl_id': product.id,
                    'level': 0,
                    'old_rev': product.x_rev,
                    'new_rev': self._calculate_next_rev(product.x_rev),
                    'is_changed': True,
                    'change_summary': '하위 변경으로 인한 리비전 자동 업'
                }))
                # 하위 BOM 전개 (간이 재귀)
                self._build_bom_tree(product, 1, lines)
                
        self.bom_line_ids = lines

    def _build_bom_tree(self, parent_product, level, lines_list):
        # 해당 제품의 BOM 찾기
        bom = self.env['mrp.bom'].search([('product_tmpl_id', '=', parent_product.id)], limit=1)
        if not bom:
            return
            
        for line in bom.bom_line_ids:
            child = line.product_tmpl_id
            # 진행중인 ECO가 있는지 스캔 (자기 자신이 변경 대상인지)
            pending_eco = self.env['ir.eco'].search([
                ('original_product_id', '=', child.id),
                ('state', 'in', ['draft', 'review'])
            ], limit=1)
            
            is_changed = bool(pending_eco)
            new_rev = pending_eco.new_product_id.x_rev if pending_eco else child.x_rev
            summary = '변경 예정 대기중' if pending_eco else ''
            
            lines_list.append((0, 0, {
                'product_tmpl_id': child.id,
                'level': level,
                'old_rev': child.x_rev,
                'new_rev': new_rev,
                'is_changed': is_changed,
                'change_summary': summary
            }))
            
            # 재귀 호출
            self._build_bom_tree(child, level + 1, lines_list)

    def _calculate_next_rev(self, current_rev):
        if not current_rev: return '1.1'
        parts = current_rev.split('.')
        if len(parts) == 2 and parts[1].isdigit():
            return f"{parts[0]}.{int(parts[1]) + 1}"
        return current_rev + "-1"

    def action_submit_for_review(self):
        self.ensure_one()
        if not self.approver_ids:
            # TODO: 결재자 선택 창을 띄울 수 있지만, 현재는 필수값 체크로 대체하거나 알림을 보냅니다.
            pass
        self.state = 'review'
        self.review_history = f"{self.review_history or ''}\n[{fields.Datetime.now()}] {self.env.user.name}: 상신됨"
        
        # Odoo Activity 생성 (알림)
        for approver in self.approver_ids:
            self.env['mail.activity'].create({
                'res_model_id': self.env['ir.model']._get('ir.eco').id,
                'res_id': self.id,
                'activity_type_id': 4, # Todo
                'summary': '설계 변경(ECO) 결재 요망',
                'user_id': approver.id,
            })

    def action_open_review_wizard_approve(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': '승인 사유 입력',
            'res_model': 'ir.eco.review.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {'default_eco_id': self.id, 'default_action_type': 'approve'}
        }
        
    def action_open_review_wizard_reject(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': '반려 사유 입력',
            'res_model': 'ir.eco.review.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {'default_eco_id': self.id, 'default_action_type': 'reject'}
        }

    def _process_approval(self, comment):
        self.ensure_one()
        self.review_history = f"{self.review_history or ''}\n[{fields.Datetime.now()}] {self.env.user.name} (승인): {comment or '사유 없음'}"
        
        # 모든 결재자가 승인했는지 확인하는 로직 (단순화를 위해 일단 바로 Approved 처리)
        self.state = 'approved'
        self._execute_cascading_engine()

    def _process_rejection(self, comment):
        self.ensure_one()
        self.review_history = f"{self.review_history or ''}\n[{fields.Datetime.now()}] {self.env.user.name} (반려): {comment or '사유 없음'}"
        self.state = 'rejected'
        
    def _execute_cascading_engine(self):
        """승인 시 모든 버전을 갈아끼우는 핵심 엔진"""
        if self.eco_type == 'part':
            # 부품 단일 적용 로직
            if self.original_product_id and self.new_product_id:
                self.original_product_id.active = False
                self.new_product_id.active = True
                self.new_product_id.default_code = self.original_product_id.default_code
        else:
            # 완제품 대상 Cascading 로직 (Bottom-Up)
            # 여기서는 선택된 완제품들의 하위 부품 중 pending_eco 가 있는 것들을 찾아서 교체하고, 상위 BOM을 복제합니다.
            # 실제 완벽한 재귀 교체는 방대하므로, 핵심 로직 구조만 구현
            for fg in self.target_product_ids:
                new_rev = self._calculate_next_rev(fg.x_rev)
                new_fg = fg.copy({
                    'active': True,
                    'x_rev': new_rev,
                    'default_code': fg.default_code,
                    'name': f"{fg.name.split(' (Rev')[0]} (Rev {new_rev})"
                })
                fg.active = False
                
                # 기존 BOM 복제하여 새 완제품에 연결
                old_bom = self.env['mrp.bom'].search([('product_tmpl_id', '=', fg.id)], limit=1)
                if old_bom:
                    new_bom = old_bom.copy({'product_tmpl_id': new_fg.id})
                    # 여기서 하위 부품의 신버전 매핑을 수행해야 함.
                    # (간소화: Pending 상태의 하위 부품을 찾아 BOM 라인 교체)
                    for line in new_bom.bom_line_ids:
                        pending_eco = self.env['ir.eco'].search([
                            ('original_product_id', '=', line.product_tmpl_id.id),
                            ('state', '=', 'approved') # 이미 교체된 부품
                        ], limit=1)
                        if pending_eco and pending_eco.new_product_id:
                            line.product_tmpl_id = pending_eco.new_product_id.id
