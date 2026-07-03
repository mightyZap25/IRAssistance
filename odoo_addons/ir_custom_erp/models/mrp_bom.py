from odoo import models, fields, api

class MrpBom(models.Model):
    _inherit = 'mrp.bom'

    x_bom_id = fields.Char(string='BOM ID', copy=False, readonly=True, index=True)
    x_bom_rev = fields.Char(string='BOM 리비전 (Rev)', default='1.0')
    x_owner = fields.Char(string='담당자 (Owner)')
    x_note = fields.Text(string='제조 특이사항')

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            # Odoo 기본 'code' 필드를 BOM ID(Reference)로 함께 사용하도록 동기화할 수도 있지만,
            # 별도의 x_bom_id 필드를 요구사항에 맞게 발급합니다.
            if not vals.get('x_bom_id'):
                # 기본 시퀀스로 'BOM-0001' 형태로 발급
                # 아직 'mrp.bom'용 시퀀스를 정의하지 않았다면 임시로 생성하거나 odoo 기본 시퀀스 사용
                vals['x_bom_id'] = self.env['ir.sequence'].next_by_code('mrp.bom.custom.seq') or 'New'
        
        records = super(MrpBom, self).create(vals_list)
        
        # 시퀀스가 등록되지 않아 'New'가 들어간 경우를 대비해, DB ID 기반으로 임시 발급
        for rec in records:
            if rec.x_bom_id == 'New':
                rec.x_bom_id = f"BOM-{rec.id:04d}"
                
        return records
