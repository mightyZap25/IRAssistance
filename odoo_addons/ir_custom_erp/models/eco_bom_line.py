from odoo import models, fields, api

class EcoBomLine(models.Model):
    _name = 'ir.eco.bom.line'
    _description = 'ECO BOM Tree Line'
    
    eco_id = fields.Many2one('ir.eco', string='ECO', ondelete='cascade', index=True)
    product_tmpl_id = fields.Many2one('product.template', string='부품/반제품')
    level = fields.Integer(string='레벨', default=0)
    
    bom_id = fields.Many2one('mrp.bom', string='적용 BOM')
    
    old_rev = fields.Char(string='기존 리비전')
    new_rev = fields.Char(string='신규 리비전')
    
    is_changed = fields.Boolean(string='변경 여부', default=False)
    change_summary = fields.Char(string='변경 내역 요약')
    
    # 계층 표현을 위한 필드
    display_name_tree = fields.Char(string='품목 계층', compute='_compute_display_name_tree')
    
    @api.depends('product_tmpl_id', 'level')
    def _compute_display_name_tree(self):
        for line in self:
            prefix = "--- " * line.level
            name = line.product_tmpl_id.display_name if line.product_tmpl_id else 'Unknown'
            line.display_name_tree = f"{prefix}{name}"
