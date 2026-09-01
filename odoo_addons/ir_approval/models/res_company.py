from odoo import models, fields

class ResCompany(models.Model):
    _inherit = 'res.company'

    company_seal = fields.Image(string='회사 직인 (Company Seal)', max_width=512, max_height=512)

