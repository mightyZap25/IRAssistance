from odoo import models, fields, api

class EcoReviewWizard(models.TransientModel):
    _name = 'ir.eco.review.wizard'
    _description = 'ECO 결재 승인/반려 마법사'

    eco_id = fields.Many2one('ir.eco', string='ECO 문서', required=True)
    action_type = fields.Selection([('approve', '승인'), ('reject', '반려')], string='결재 액션', required=True)
    review_comment = fields.Text(string='결재 의견 (사유)', help="승인 또는 반려 사유를 자유롭게 입력하세요. 비워둘 수 있습니다.")

    def action_submit_review(self):
        self.ensure_one()
        # 원본 ECO 문서로 넘겨서 실제 로직 수행
        if self.action_type == 'approve':
            self.eco_id._process_approval(self.review_comment)
        else:
            self.eco_id._process_rejection(self.review_comment)
