from odoo import models, fields

class CustomSeries(models.Model):
    _name = 'ir.custom.series'
    _description = '제조품 시리즈 (Series)'
    
    name = fields.Char(string='시리즈명', required=True)
    active = fields.Boolean(default=True)

class CustomCommType(models.Model):
    _name = 'ir.custom.comm.type'
    _description = '통신 타입 (Communication Type)'
    
    name = fields.Char(string='통신 타입', required=True)
    active = fields.Boolean(default=True)

class CustomStrokeType(models.Model):
    _name = 'ir.custom.stroke.type'
    _description = '스트로크 타입 (Stroke Type)'
    
    name = fields.Char(string='스트로크 타입', required=True)
    active = fields.Boolean(default=True)
