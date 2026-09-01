from odoo import models, fields

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    company_seal = fields.Image(related='company_id.company_seal', readonly=False)

    ir_approval_print_margin = fields.Integer(
        string='인쇄 상하좌우 여백 (mm)',
        config_parameter='ir_approval.print_margin',
        default=10,
        help="전자결재 문서 크롬 인쇄 미리보기 시 기본 여백입니다."
    )
    
    ir_approval_title_font_size = fields.Integer(
        string='문서 제목 폰트 크기 (px)',
        config_parameter='ir_approval.title_font_size',
        default=34,
        help="전자결재 문서 인쇄 시 중앙 상단 타이틀의 폰트 크기입니다."
    )
    
    ir_approval_title_align = fields.Selection([
        ('left', '왼쪽 정렬'),
        ('center', '가운데 정렬'),
        ('right', '오른쪽 정렬')
    ], string='문서 제목 정렬 위치', config_parameter='ir_approval.title_align', default='center')
    
    ir_approval_title_margin_top = fields.Integer(
        string='문서 제목 상단 여백 (px)', config_parameter='ir_approval.title_margin_top', default=0
    )
    
    ir_approval_title_letter_spacing = fields.Integer(
        string='문서 제목 글자 간격/너비 (px)', config_parameter='ir_approval.title_letter_spacing', default=0
    )
    
    ir_approval_approval_box_width = fields.Integer(
        string='결재칸 가로 너비 (px)',
        config_parameter='ir_approval.approval_box_width',
        default=250,
        help="전자결재 문서 우측 상단의 결재 도장칸 너비입니다."
    )
    
    ir_approval_approval_box_align = fields.Selection([
        ('left', '왼쪽 정렬'),
        ('center', '가운데 정렬'),
        ('right', '오른쪽 정렬')
    ], string='결재칸 정렬 위치', config_parameter='ir_approval.approval_box_align', default='right')
    
    ir_approval_approval_box_margin_top = fields.Integer(
        string='결재칸 상단 여백 (px)', config_parameter='ir_approval.approval_box_margin_top', default=0
    )
    
    ir_approval_approval_box_margin_right = fields.Integer(
        string='결재칸 우측 여백 (px)', config_parameter='ir_approval.approval_box_margin_right', default=0
    )
    
    ir_approval_content_margin_top = fields.Integer(
        string='본문 테이블 상단 여백 (px)', config_parameter='ir_approval.content_margin_top', default=20
    )
    
    ir_approval_content_min_height = fields.Integer(
        string='본문 상세내용칸 최소 높이 (px)', config_parameter='ir_approval.content_min_height', default=200
    )
