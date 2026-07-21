import logging
import csv
from io import StringIO
import threading
from odoo import models, fields, api, exceptions
from .google_drive_sync import send_to_google_drive

_logger = logging.getLogger(__name__)

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    def action_sync_all_existing_data(self):
        """
        기존에 생성된 주요 모듈의 데이터(Sale, Purchase, Manufacturing, Inventory)를 모두 구글 드라이브로 백업
        """
        models_to_sync = ['sale.order', 'purchase.order', 'mrp.production', 'stock.picking']
        total_synced = 0
        
        for model_name in models_to_sync:
            if model_name in self.env:
                records = self.env[model_name].search([])
                for record in records:
                    try:
                        app_name = record._get_app_name()
                        record_name = record.display_name or record.name or f"{record._name}_{record.id}"
                        safe_record_name = record_name.replace('/', '_').replace('\\', '_')
                        csv_data = record._get_csv_data()
                        
                        thread = threading.Thread(target=send_to_google_drive, args=(app_name, safe_record_name, csv_data))
                        thread.daemon = True
                        thread.start()
                        total_synced += 1
                    except Exception as e:
                        _logger.error("Failed to sync %s (ID: %s): %s", model_name, record.id, str(e))
        
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': '동기화 시작',
                'message': f'총 {total_synced}개의 기존 데이터 백업이 백그라운드에서 시작되었습니다.',
                'sticky': False,
            }
        }

    def action_sync_schema(self):
        """
        현재 동기화 중인 주요 모듈 모델의 필드 구조(스키마)를 구글 드라이브로 추출
        """
        models_to_extract = ['sale.order', 'purchase.order', 'mrp.production', 'stock.picking']
        
        for model_name in models_to_extract:
            if model_name in self.env:
                model_obj = self.env[model_name]
                
                output = StringIO()
                writer = csv.writer(output)
                writer.writerow(['Field Name', 'Field Label', 'Field Type', 'Required', 'Readonly', 'Help / Description'])
                
                for fname, field in model_obj._fields.items():
                    writer.writerow([
                        fname,
                        field.string or '',
                        field.type or '',
                        'Yes' if field.required else 'No',
                        'Yes' if field.readonly else 'No',
                        field.help or ''
                    ])
                
                csv_data = output.getvalue()
                app_name = "Schema"
                record_name = f"Schema_{model_name.replace('.', '_')}"
                
                thread = threading.Thread(target=send_to_google_drive, args=(app_name, record_name, csv_data))
                thread.daemon = True
                thread.start()

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': '스키마 동기화 시작',
                'message': f'{len(models_to_extract)}개 주요 모듈의 DB 구조 백업이 시작되었습니다.',
                'sticky': False,
            }
        }
