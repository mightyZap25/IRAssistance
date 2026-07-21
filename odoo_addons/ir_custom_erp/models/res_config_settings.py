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
        기존에 생성된 주요 모듈의 데이터를 모델별로 1개의 통합 CSV로 묶어서 구글 드라이브로 백업
        """
        models_to_sync = ['sale.order', 'purchase.order', 'mrp.production', 'stock.picking']
        total_synced = 0
        
        for model_name in models_to_sync:
            if model_name in self.env:
                records = self.env[model_name].search([])
                if not records:
                    continue
                
                try:
                    output = StringIO()
                    writer = csv.writer(output)
                    
                    # 무거운 관계형 필드, 바이너리 필드 및 비저장 필드 제외 (동일한 로직)
                    safe_fields = []
                    for fname, field in self.env[model_name]._fields.items():
                        if field.type not in ('binary', 'one2many', 'many2many') and getattr(field, 'store', True):
                            safe_fields.append(fname)
                    
                    writer.writerow(safe_fields)
                    
                    # sudo() 권한으로 read() 실행하여 N+1 쿼리 방지 및 속도 극대화
                    records_sudo = records.sudo()
                    
                    try:
                        data_list = records_sudo.read(safe_fields)
                    except Exception as e:
                        _logger.error("Failed to read bulk fields: %s", str(e))
                        data_list = []
                        
                    for data in data_list:
                        row = []
                        for field in safe_fields:
                            val = data.get(field, '')
                            if isinstance(val, tuple) and len(val) == 2:
                                row.append(str(val[1]))
                            else:
                                row.append(str(val) if val is not False else '')
                        writer.writerow(row)
                    
                    csv_data = output.getvalue()
                    
                    app_name = records[0]._get_app_name()
                    record_name = f"BULK_ALL_{app_name}_Records"
                    
                    # Bulk 전송은 데이터가 크므로 별도 쓰레드에서 15초 타임아웃으로 전송
                    thread = threading.Thread(target=send_to_google_drive, args=(app_name, record_name, csv_data))
                    thread.daemon = True
                    thread.start()
                    total_synced += len(records)
                except Exception as e:
                    _logger.error("Failed to bulk sync %s: %s", model_name, str(e))
        
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': '통합 동기화 시작',
                'message': f'총 {total_synced}개의 기존 데이터가 모듈별 1개의 파일로 통합되어 구글 드라이브 백업을 시작합니다.',
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
