from odoo import models, fields, api
import re

class ProductTemplate(models.Model):
    _inherit = 'product.template'

    # 기존 Firebase 시스템에서 사용되던 커스텀 필드 매핑
    x_category = fields.Selection([
        ('기구부품(M)', '기구부품(M)'),
        ('전자부품(E)', '전자부품(E)'),
        ('구매품(O)', '구매품(O)')
    ], string='분류 (Category)', default='기구부품(M)')

    x_class = fields.Selection([
        ('Part (I)', 'Part (I)'),
        ('Assembly (A)', 'Assembly (A)')
    ], string='클래스 (Class)', default='Part (I)')

    x_part_type_code = fields.Selection([
        ('A', 'Assembly Sub'), ('P', 'Plastic'), ('S', 'Sheet metal'),
        ('T', 'Turning cut'), ('D', 'Die casting/Sinter'), ('E', 'Extrusion'),
        ('R', 'Rubber/Silicon'), ('B', 'Board-PCB'), ('X', 'Bearing/Screw/Bond'),
        ('C', 'Motor/Sol/Switch'), ('W', 'Wire/Harness'), ('Q', 'Analog/Digital Dev'),
        ('M', 'Electric Module'), ('L', 'Oil/Grease'), ('V', 'Bag/Sticker')
    ], string='타입 코드 (PartTypeCode)', default='A')
    
    x_rev = fields.Char(string='리비전 (Rev)', default='1.0')
    x_maker = fields.Many2one('res.partner', string='메이커 (Maker)')
    x_manufacturer = fields.Many2one('res.partner', string='제조사 (Manufacturer)')
    x_mpn = fields.Char(string='MPN')
    x_owner = fields.Char(string='담당자 (Owner)')
    x_is_overseas = fields.Boolean(string='해외 수입 여부 (IsOverseas)', default=False)
    x_datasheet = fields.Char(string='데이터시트 URL (Datasheet)')
    x_master_part_id = fields.Char(string='마스터 부품 ID (MasterPartID)')
    
    x_process_type = fields.Selection([
        ('가공', '가공'),
        ('구매', '구매'),
        ('조립', '조립'),
        ('외주', '외주')
    ], string='공정 타입 (ProcessType)', default='가공')
    x_material = fields.Char(string='재질 (Material)')
    x_grade = fields.Char(string='등급 (Grade)')
    x_color = fields.Char(string='색상 (Color)')
    
    # Safety Fields
    x_safety_ce = fields.Boolean(string='CE 인증', default=False)
    x_safety_rohs = fields.Boolean(string='ROHS 인증', default=False)
    x_safety_ul = fields.Boolean(string='UL 인증', default=False)
    x_safety_kc = fields.Boolean(string='KC 인증', default=False)
    x_safety_reach = fields.Boolean(string='REACH 인증', default=False)

    # === 제조품(완제품/반제품) 스펙 ===
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

    def action_create_eco(self):
        self.ensure_one()
        return {
            'name': '설계 변경 (ECO) 기안',
            'type': 'ir.actions.act_window',
            'res_model': 'ir.eco.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_product_tmpl_id': self.id,
                'active_id': self.id
            }
        }

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            # 제조품 (완제품/반제품) 채번 로직
            if vals.get('x_manufacturing_type'):
                mfg_type = vals.get('x_manufacturing_type')
                category = vals.get('x_finished_category')
                
                prefix = 'IR'
                if mfg_type == 'finished':
                    prefix += '-FG'
                    if category == 'actuator':
                        prefix += '-ACT'
                    elif category == 'board':
                        prefix += '-BRD'
                else:
                    prefix += '-SG'
                
                seq = self.env['ir.sequence'].next_by_code('ir.mfg.product.seq') or '0000'
                vals['default_code'] = f"{prefix}-{seq}"
                
            # 부품 (Part) 채번 로직
            elif not vals.get('default_code'):
                # 1. Prefix 추출 로직
                cat = vals.get('x_category', '기구부품(M)')
                cat_match = re.search(r'\((.*?)\)', cat)
                cat_code = cat_match.group(1) if cat_match else 'M'

                cls = vals.get('x_class', 'Part (I)')
                cls_match = re.search(r'\((.*?)\)', cls)
                cls_code = cls_match.group(1) if cls_match else 'I'

                type_code = vals.get('x_part_type_code', 'A')

                prefix = f"IR{cat_code}{cls_code}{type_code}"

                # 2. DB에서 해당 Prefix를 가진 가장 큰 default_code(품번) 조회
                self.env.cr.execute("""
                    SELECT default_code 
                    FROM product_template 
                    WHERE default_code LIKE %s 
                    ORDER BY default_code DESC 
                    LIMIT 1
                """, (prefix + '%',))
                res = self.env.cr.fetchone()

                # 3. 시퀀스 + 1 채번
                next_seq = 1
                if res and res[0]:
                    last_code = res[0]
                    seq_str = last_code[len(prefix):]
                    if seq_str.isdigit():
                        next_seq = int(seq_str) + 1

                # 4. 포맷팅 및 할당
                new_part_id = f"{prefix}{next_seq:04d}"
                vals['default_code'] = new_part_id
                
                if not vals.get('x_master_part_id'):
                    vals['x_master_part_id'] = new_part_id
                    
        return super(ProductTemplate, self).create(vals_list)
