from odoo import models, fields, api

class EcoWizard(models.TransientModel):
    _name = 'ir.eco.wizard'
    _description = '설계 변경(ECO) 기안 마법사'

    product_tmpl_id = fields.Many2one('product.template', string='원본 부품', required=True)
    
    # 팝업에서 수정할 수 있는 커스텀 필드들
    x_category = fields.Selection([
        ('electronic', '전자 (Electronic)'),
        ('mechanical', '기구 (Mechanical)'),
        ('software', '소프트웨어 (Software)'),
        ('packaging', '포장재 (Packaging)'),
        ('consumable', '소모품 (Consumable)')
    ], string='분류 (Category)')
    
    x_class = fields.Selection([
        ('pcb', 'PCB (인쇄회로기판)'),
        ('ic', 'IC (직접회로)'),
        ('resistor', 'Resistor (저항)'),
        ('capacitor', 'Capacitor (커패시터)'),
        ('connector', 'Connector (커넥터)'),
        ('housing', 'Housing (하우징)'),
        ('screw', 'Screw (나사)'),
        ('label', 'Label (라벨)'),
        ('firmware', 'Firmware (펌웨어)')
    ], string='클래스 (Class)')
    
    x_maker = fields.Many2one('res.partner', string='제조사 (Maker)')
    x_manufacturer = fields.Many2one('res.partner', string='공급사 (Manufacturer)')
    x_mpn = fields.Char(string='제조사 파트넘버 (MPN)')
    x_is_overseas = fields.Boolean(string='해외 구매품 여부', default=False)
    x_owner = fields.Char(string='담당자 (Owner)')
    
    x_process_type = fields.Char(string='공정 타입 (Process Type)')
    x_material = fields.Char(string='재질 (Material)')
    x_grade = fields.Char(string='등급 (Grade)')
    x_color = fields.Char(string='색상 (Color)')
    
    x_safety_ce = fields.Boolean(string='CE')
    x_safety_rohs = fields.Boolean(string='RoHS')
    x_safety_ul = fields.Boolean(string='UL')
    x_safety_kc = fields.Boolean(string='KC')
    x_safety_reach = fields.Boolean(string='REACH')

    # 제조품 스펙 필드 추가
    x_manufacturing_type = fields.Selection([
        ('finished', '완제품 (Finished Good)'),
        ('semi_finished', '반제품 (Semi-Finished Good)')
    ], string='제조품 타입')
    x_finished_category = fields.Selection([
        ('actuator', 'Actuator (구동기)'),
        ('board', 'Board (제어보드)')
    ], string='완제품 카테고리')
    x_series_id = fields.Many2one('ir.custom.series', string='시리즈 (Series)')
    x_comm_type_id = fields.Many2one('ir.custom.comm.type', string='통신 타입')
    x_stroke_type_id = fields.Many2one('ir.custom.stroke.type', string='스트로크 타입 (Stroke)')
    x_mfg_extra_notes = fields.Text(string='기타 추가 스펙')

    x_rev = fields.Char(string='새 리비전 번호', required=True, help="기본적으로 +0.1 증가되어 제안되지만, 수동으로 수정 가능합니다.")
    reason_for_change = fields.Text(string='변경 사유', required=True)

    @api.model
    def default_get(self, fields_list):
        res = super(EcoWizard, self).default_get(fields_list)
        active_id = self.env.context.get('active_id')
        if active_id:
            product = self.env['product.template'].browse(active_id)
            
            # 리비전 자동 계산 (+0.1)
            current_rev = product.x_rev or '1.0'
            parts = current_rev.split('.')
            if len(parts) == 2 and parts[1].isdigit():
                next_rev = f"{parts[0]}.{int(parts[1]) + 1}"
            else:
                next_rev = current_rev + "-1"

            res.update({
                'product_tmpl_id': product.id,
                'x_rev': next_rev,
                'x_category': product.x_category,
                'x_class': product.x_class,
                'x_maker': product.x_maker.id if product.x_maker else False,
                'x_manufacturer': product.x_manufacturer.id if product.x_manufacturer else False,
                'x_mpn': product.x_mpn,
                'x_is_overseas': product.x_is_overseas,
                'x_owner': product.x_owner,
                'x_process_type': product.x_process_type,
                'x_material': product.x_material,
                'x_grade': product.x_grade,
                'x_color': product.x_color,
                'x_safety_ce': product.x_safety_ce,
                'x_safety_rohs': product.x_safety_rohs,
                'x_safety_ul': product.x_safety_ul,
                'x_safety_kc': product.x_safety_kc,
                'x_safety_reach': product.x_safety_reach,
                'x_manufacturing_type': product.x_manufacturing_type,
                'x_finished_category': product.x_finished_category,
                'x_series_id': product.x_series_id.id if product.x_series_id else False,
                'x_comm_type_id': product.x_comm_type_id.id if product.x_comm_type_id else False,
                'x_stroke_type_id': product.x_stroke_type_id.id if product.x_stroke_type_id else False,
                'x_mfg_extra_notes': product.x_mfg_extra_notes,
            })
        return res

    def action_submit_eco(self):
        self.ensure_one()
        original = self.product_tmpl_id
        
        # 2. 원본 부품을 복제하되 active=False로 숨겨서 생성
        new_product = original.copy({
            'active': False,
            'x_rev': self.x_rev,
            'name': f"{original.name} (Rev {self.x_rev})",
            # 팝업에서 수정한 값 덮어쓰기
            'x_category': self.x_category,
            'x_class': self.x_class,
            'x_maker': self.x_maker.id,
            'x_manufacturer': self.x_manufacturer.id,
            'x_mpn': self.x_mpn,
            'x_is_overseas': self.x_is_overseas,
            'x_owner': self.x_owner,
            'x_process_type': self.x_process_type,
            'x_material': self.x_material,
            'x_grade': self.x_grade,
            'x_color': self.x_color,
            'x_safety_ce': self.x_safety_ce,
            'x_safety_rohs': self.x_safety_rohs,
            'x_safety_ul': self.x_safety_ul,
            'x_safety_kc': self.x_safety_kc,
            'x_safety_reach': self.x_safety_reach,
            'x_manufacturing_type': self.x_manufacturing_type,
            'x_finished_category': self.x_finished_category,
            'x_series_id': self.x_series_id.id,
            'x_comm_type_id': self.x_comm_type_id.id,
            'x_stroke_type_id': self.x_stroke_type_id.id,
            'x_mfg_extra_notes': self.x_mfg_extra_notes,
        })
        
        # 3. ECO 기안 문서 생성
        eco_doc = self.env['ir.eco'].create({
            'original_product_id': original.id,
            'new_product_id': new_product.id,
            'reason_for_change': self.reason_for_change,
        })
        
        # 4. 새로 생성된 ECO 문서 화면으로 리다이렉트
        return {
            'type': 'ir.actions.act_window',
            'name': '설계 변경 (ECO)',
            'res_model': 'ir.eco',
            'res_id': eco_doc.id,
            'view_mode': 'form',
            'target': 'current',
        }
