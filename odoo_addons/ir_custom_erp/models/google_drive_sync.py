import requests
import json
import threading
import logging
import csv
from io import StringIO
from odoo import models, api

_logger = logging.getLogger(__name__)

# 사용자가 알려준 Google Apps Script 웹 앱 URL
WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbyFGjsOG0VUIs2ujZI0PjMYlOWUN5LkyDQd6t8hN7xxhAJEeL0z79bItKG153k99J1Mpw/exec"

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
        # 백그라운드 쓰레드이므로 타임아웃을 넉넉히 주거나 제거하여 구글 스크립트가 온전히 실행되게 함
        requests.post(WEBHOOK_URL, data=json.dumps(payload), headers=headers, timeout=10)
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
        
        # 사용자의 요청에 따라 주요 필드를 맨 앞으로 배치 (순서대로)
        priority_fields = [
            'id',
            'order_id', 'picking_id', 'raw_material_production_id',
            'display_name',
            'state',
            'selected_seller_id',
            'product_uom_qty', 'product_qty', 'qty_done',
            'date_planned', 'date_order', 'date', 'date_approve',
            'currency_id',
            'price_unit',
            'price_subtotal', 'price_total'
        ]
        
        final_fields = []
        for pf in priority_fields:
            if pf in safe_fields:
                final_fields.append(pf)
                safe_fields.remove(pf)
                
        safe_fields = final_fields + safe_fields
        
        # Odoo DB에 저장된 공식 한글 라벨을 강제로 가져옴 (lang='ko_KR')
        fields_records = self.env['ir.model.fields'].sudo().with_context(lang='ko_KR').search([('model', '=', self._name), ('name', 'in', safe_fields)])
        field_labels = {record.name: record.field_description for record in fields_records}
        
        header_row = []
        for f in safe_fields:
            if f == 'id':
                header_row.append('id')
            else:
                label = field_labels.get(f) or self._fields[f].string or f
                header_row.append(str(label))
                
        writer.writerow(header_row)
        
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
                record_name = str(record.id)
                
                # 파일명에 슬래시나 특수문자가 들어가면 에러가 날 수 있으므로 치환
                safe_record_name = record_name.replace('/', '_').replace('\\', '_')
                
                csv_data = record._get_csv_data()
                
                # 쓰레드를 사용하여 백그라운드 전송 (Odoo 메인 트랜잭션을 0.1초도 지연시키지 않음!)
                thread = threading.Thread(target=send_to_google_drive, args=(app_name, safe_record_name, csv_data))
                thread.daemon = True
                thread.start()
            except Exception as e:
                _logger.error("Failed to prepare sync for %s: %s", record._name, str(e))


class SaleOrderLineDriveSync(models.Model):
    _name = 'sale.order.line'
    _inherit = ['sale.order.line', 'google.drive.sync.mixin']

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        records._trigger_drive_sync()
        return records

    def write(self, vals):
        res = super().write(vals)
        self._trigger_drive_sync()
        return res


class PurchaseOrderLineDriveSync(models.Model):
    _name = 'purchase.order.line'
    _inherit = ['purchase.order.line', 'google.drive.sync.mixin']

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


class StockMoveDriveSync(models.Model):
    _name = 'stock.move'
    _inherit = ['stock.move', 'google.drive.sync.mixin']

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        records._trigger_drive_sync()
        return records

    def write(self, vals):
        res = super().write(vals)
        self._trigger_drive_sync()
        return res
