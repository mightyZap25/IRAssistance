import requests
import json
import threading
import logging
import csv
from io import StringIO
from odoo import models, api

_logger = logging.getLogger(__name__)

# 사용자가 알려준 Google Apps Script 웹 앱 URL
WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxTyElWhAWRULd9vqv8Nzw5CmigJj1xA8moFAWqtcf9igsuFDMXpX3gNzawwtbEj-P8KQ/exec"

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
        # 타임아웃을 0.5초로 극단적으로 짧게 설정하여 Odoo 화면 무한 로딩 방지
        requests.post(WEBHOOK_URL, data=json.dumps(payload), headers=headers, timeout=0.5)
    except requests.exceptions.Timeout:
        # 데이터는 이미 전송되었으나 구글의 응답이 0.5초를 넘긴 것 뿐이므로 무시함
        pass
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
        
        safe_fields = []
        for fname, field in self._fields.items():
            if field.type not in ('binary', 'one2many', 'many2many'):
                safe_fields.append(fname)
        
        writer.writerow(safe_fields)
        
        # sudo()를 통해 필드 접근 권한 오류 방지
        records_sudo = self.sudo()
        try:
            data_list = records_sudo.read(safe_fields)
        except Exception as e:
            _logger.error("Failed to read fields: %s", str(e))
            data_list = []
            
        if data_list:
            data = data_list[0]
            row = []
            for field in safe_fields:
                val = data.get(field, '')
                # Many2one 필드 등 (id, name) 튜플 형태인 경우 name만 추출
                if isinstance(val, tuple) and len(val) == 2:
                    row.append(str(val[1]))
                else:
                    row.append(str(val) if val is not False else '')
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
                
                # 쓰레드를 사용하여 백그라운드 전송 (Odoo 메인 트랜잭션을 0.1초도 지연시키지 않음!)
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
