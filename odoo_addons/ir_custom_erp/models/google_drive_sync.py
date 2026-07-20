import requests
import json
import threading
import logging
import csv
from io import StringIO
from odoo import models, api

_logger = logging.getLogger(__name__)

# 사용자가 알려준 Google Apps Script 웹 앱 URL
WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbzXnkjOb9Z6IfkDKrVbWhjZIn8TWrnjmEMHmcmrVVXafRB2j8SGOX5AYu66W-WWQ3v8/exec"

def send_to_google_drive(app_name, record_name, csv_data):
    """
    별도의 쓰레드에서 실행되어 Odoo 저장 속도에 영향을 주지 않음
    """
    try:
        payload = {
            "app_name": app_name,
            "record_name": record_name,
            "csv_data": csv_data
        }
        headers = {'Content-Type': 'application/json'}
        # 타임아웃 15초 설정하여 스레드가 영원히 대기하는 것 방지
        response = requests.post(WEBHOOK_URL, data=json.dumps(payload), headers=headers, timeout=15)
        
        if response.status_code != 200:
            _logger.error("Failed to sync %s (%s) to Google Drive: %s", app_name, record_name, response.text)
        else:
            _logger.info("Successfully synced %s (%s) to Google Drive.", app_name, record_name)
    except Exception as e:
        _logger.error("Error syncing %s (%s) to Google Drive: %s", app_name, record_name, str(e))


class GoogleDriveSyncMixin(models.AbstractModel):
    _name = 'google.drive.sync.mixin'
    _description = 'Google Drive Sync Mixin (Background Webhook)'

    def _get_app_name(self):
        if self._name == 'sale.order': return 'Sales'
        if self._name == 'purchase.order': return 'Purchase'
        if self._name == 'mrp.production': return 'Manufacturing'
        if self._name == 'stock.picking': return 'Inventory'
        return 'Other'

    def _get_csv_data(self):
        """
        현재 레코드의 안전한 필드(스칼라 및 Many2one)만 Flatten하여 단일 행 CSV 문자열로 변환
        """
        output = StringIO()
        writer = csv.writer(output)
        
        # 무거운 관계형 필드 및 바이너리 필드 제외 (무한 로딩/성능 저하 방지)
        safe_fields = []
        for fname, field in self._fields.items():
            if field.type not in ('binary', 'one2many', 'many2many'):
                safe_fields.append(fname)
        
        # 필드명 헤더 생성
        writer.writerow(safe_fields)
        
        for record in self:
            row = []
            for field in safe_fields:
                try:
                    val = getattr(record, field)
                    if isinstance(val, models.Model):
                        # Many2one 필드일 경우
                        row.append(str(val.display_name) if val else '')
                    else:
                        row.append(str(val) if val is not False else '')
                except Exception as e:
                    row.append(f"Error: {str(e)}")
            writer.writerow(row)
            
        return output.getvalue()

    def _trigger_drive_sync(self):
        """
        레코드별로 데이터를 추출하여 백그라운드 쓰레드로 웹훅 전송
        """
        for record in self:
            try:
                app_name = record._get_app_name()
                record_name = record.display_name or record.name or f"{record._name}_{record.id}"
                
                # 파일명에 슬래시나 특수문자가 들어가면 에러가 날 수 있으므로 치환
                safe_record_name = record_name.replace('/', '_').replace('\\', '_')
                
                csv_data = record._get_csv_data()
                
                # 백그라운드 쓰레드 실행
                thread = threading.Thread(target=send_to_google_drive, args=(app_name, safe_record_name, csv_data))
                thread.daemon = True
                thread.start()
            except Exception as e:
                _logger.error("Failed to prepare sync for %s: %s", record._name, str(e))


class SaleOrderDriveSync(models.Model):
    _name = 'sale.order'
    _inherit = ['sale.order', 'google.drive.sync.mixin']

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        records._trigger_drive_sync()
        return records

    def write(self, vals):
        res = super().write(vals)
        self._trigger_drive_sync()
        return res


class PurchaseOrderDriveSync(models.Model):
    _name = 'purchase.order'
    _inherit = ['purchase.order', 'google.drive.sync.mixin']

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        records._trigger_drive_sync()
        return records

    def write(self, vals):
        res = super().write(vals)
        self._trigger_drive_sync()
        return res


class MrpProductionDriveSync(models.Model):
    _name = 'mrp.production'
    _inherit = ['mrp.production', 'google.drive.sync.mixin']

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        records._trigger_drive_sync()
        return records

    def write(self, vals):
        res = super().write(vals)
        self._trigger_drive_sync()
        return res


class StockPickingDriveSync(models.Model):
    _name = 'stock.picking'
    _inherit = ['stock.picking', 'google.drive.sync.mixin']

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        records._trigger_drive_sync()
        return records

    def write(self, vals):
        res = super().write(vals)
        self._trigger_drive_sync()
        return res
