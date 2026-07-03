{
    'name': 'IR Custom ERP Extension',
    'version': '1.0',
    'category': 'Custom',
    'summary': 'Custom fields and ID generation for Parts Management',
    'description': """
        Extends product.template to support custom fields and auto ID generation (Part ID).
    """,
    'depends': ['base', 'product', 'mrp', 'purchase', 'stock', 'hr_attendance', 'hr_holidays'],
    'data': [
        'security/ir.model.access.csv',
        'wizard/eco_wizard_views.xml',
        'wizard/eco_review_wizard_views.xml',
        'views/product_template_views.xml',
        'views/eco_views.xml',
        'views/mrp_bom_views.xml',
        'views/hr_dashboard_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'ir_custom_erp/static/src/css/hr_dashboard.css',
            'ir_custom_erp/static/src/js/hr_dashboard.js',
            'ir_custom_erp/static/src/xml/hr_dashboard.xml',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
