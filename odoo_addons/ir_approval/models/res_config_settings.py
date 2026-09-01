from odoo import models, fields

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    company_seal = fields.Image(related='company_id.company_seal', readonly=False)

