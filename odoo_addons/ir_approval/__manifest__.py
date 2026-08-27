{
    'name': 'IR Approval Integration',
    'version': '1.0',
    'category': 'Administration',
    'summary': 'mightyONE 전자결재 시스템 Odoo 통합 모듈',
    'description': """
        mightyONE 전자결재 앱과 연동되는 다단계 결재 시스템 Addon입니다.
        - 전자결재 요청 및 다단계 승인선 관리
        - 발주서(Purchase Order) 등 원본 문서와 결재 상태 동기화 기능
        - Odoo 내부에서 결재 현황 모니터링 뷰 제공
    """,
    'author': 'IR_Assistant',
    'website': 'http://www.mightyzap.com',
    'depends': ['base', 'purchase'],
    'data': [
        'security/ir.model.access.csv',
        'views/ir_approval_views.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
}
