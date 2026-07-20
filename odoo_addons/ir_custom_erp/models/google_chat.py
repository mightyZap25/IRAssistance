import re
import logging
from odoo import models, fields, api, _
from odoo.exceptions import UserError
from .google_chat_helper import send_chat_dm

_logger = logging.getLogger(__name__)

def clean_html(raw_html):
    """ HTML 태그를 제거하고 일반 텍스트로 변환합니다. """
    if not raw_html:
        return ""
    cleanr = re.compile('<[^<]+?>')
    cleantext = re.sub(cleanr, '', raw_html)
    return cleantext.strip()

class MailNotification(models.Model):
    _inherit = 'mail.notification'

    @api.model_create_multi
    def create(self, vals_list):
        records = super(MailNotification, self).create(vals_list)
        for record in records:
            try:
                # Odoo 시스템 알림 발생 시 구글 챗 DM 연동
                partner = record.res_partner_id
                user = partner.user_ids and partner.user_ids[0]
                
                # 본인이 작성한 글에 대한 알림은 제외하고, 이메일이 설정된 사용자에게만 발송
                if user and user.email and record.mail_message_id.author_id != partner:
                    author_name = record.mail_message_id.author_id.name or "시스템"
                    subject = record.mail_message_id.record_name or record.mail_message_id.subject or "Odoo 알림"
                    body_text = clean_html(record.mail_message_id.body)
                    
                    # 휴가 결재나 근무일정 등 특정 모델의 상태 변경은 각 모델 상속에서 더 이쁘게 보내므로, 
                    # 여기서는 일반 댓글/게시글/할일 중심의 알림만 처리하도록 필터링
                    model_name = record.mail_message_id.model
                    if model_name in ['hr.leave', 'hr.schedule.change']:
                        # 이 모델들은 아래 개별 상속에서 처리함
                        continue
                        
                    msg = f"🔔 *[Odoo 새 알림]*\n"
                    msg += f"👤 *발신자*: {author_name}\n"
                    msg += f"📄 *내용/대상*: {subject}\n"
                    if body_text:
                        msg += f"💬 *메시지*: {body_text[:150]}"
                        if len(body_text) > 150:
                            msg += "..."
                            
                    send_chat_dm(self.env, user.email, msg)
            except UserError as ue:
                raise ue
            except Exception as e:
                _logger.error("Failed to process Google Chat notification: %s", str(e))
        return records


class HrLeave(models.Model):
    _inherit = 'hr.leave'

    @api.model_create_multi
    def create(self, vals_list):
        records = super(HrLeave, self).create(vals_list)
        for rec in records:
            try:
                if rec.state in ['confirm', 'validate1']:
                    manager_emp = rec.employee_id.parent_id
                    if not manager_emp:
                        raise UserError(f"[{rec.employee_id.name}] 직원의 매니저가 설정되어 있지 않습니다!")
                    manager_email = manager_emp.work_email or (manager_emp.user_id and manager_emp.user_id.email)
                    if not manager_email:
                        raise UserError(f"매니저({manager_emp.name})의 직원 정보에 '업무 이메일'이 등록되어 있지 않습니다!")
                        
                    msg = f"📋 *[휴가 결재 요청]*\n"
                    msg += f"👤 *신청자*: {rec.employee_id.name}\n"
                    msg += f"📅 *기간*: {rec.date_from} ~ {rec.date_to} ({rec.number_of_days}일)\n"
                    msg += f"👉 Odoo에서 승인해 주세요."
                    send_chat_dm(self.env, manager_email, msg)
                elif rec.state == 'validate':
                    emp_email = rec.employee_id.work_email or (rec.employee_id.user_id and rec.employee_id.user_id.email)
                    if not emp_email:
                        raise UserError(f"신청자({rec.employee_id.name})의 직원 정보에 '업무 이메일'이 등록되어 있지 않습니다!")
                        
                    msg = f"✅ *[휴가 자동 승인]*\n"
                    msg += f"📅 *기간*: {rec.date_from} ~ {rec.date_to} ({rec.number_of_days}일)\n"
                    send_chat_dm(self.env, emp_email, msg)
            except UserError as ue:
                raise ue
            except Exception as e:
                _logger.error("Failed to send Google Chat DM for hr.leave create: %s", str(e))
        return records

    def write(self, vals):
        old_states = {rec.id: rec.state for rec in self}
        res = super(HrLeave, self).write(vals)
        if 'state' in vals:
            for rec in self:
                try:
                    old_state = old_states.get(rec.id)
                    new_state = rec.state
                    if old_state != new_state:
                        if new_state in ['confirm', 'validate1']:
                            manager_emp = rec.employee_id.parent_id
                            if not manager_emp:
                                raise UserError(f"[{rec.employee_id.name}] 직원의 매니저가 설정되어 있지 않습니다!")
                            manager_email = manager_emp.work_email or (manager_emp.user_id and manager_emp.user_id.email)
                            if not manager_email:
                                raise UserError(f"매니저({manager_emp.name})의 직원 정보에 '업무 이메일'이 등록되어 있지 않습니다!")
                                
                            msg = f"📋 *[휴가 결재 요청]*\n"
                            msg += f"👤 *신청자*: {rec.employee_id.name}\n"
                            msg += f"📅 *기간*: {rec.date_from} ~ {rec.date_to} ({rec.number_of_days}일)\n"
                            msg += f"👉 Odoo에서 승인해 주세요."
                            send_chat_dm(self.env, manager_email, msg)
                        elif new_state == 'validate':
                            emp_email = rec.employee_id.work_email or (rec.employee_id.user_id and rec.employee_id.user_id.email)
                            if not emp_email:
                                raise UserError(f"신청자({rec.employee_id.name})의 직원 정보에 '업무 이메일'이 등록되어 있지 않습니다!")
                                
                            msg = f"✅ *[휴가 승인 완료]*\n"
                            msg += f"📅 *기간*: {rec.date_from} ~ {rec.date_to} ({rec.number_of_days}일)\n"
                            send_chat_dm(self.env, emp_email, msg)
                        elif new_state == 'refuse':
                            emp_email = rec.employee_id.work_email or (rec.employee_id.user_id and rec.employee_id.user_id.email)
                            if not emp_email:
                                raise UserError(f"신청자({rec.employee_id.name})의 직원 정보에 '업무 이메일'이 등록되어 있지 않습니다!")
                                
                            msg = f"❌ *[휴가 반려 안내]*\n"
                            msg += f"📅 *기간*: {rec.date_from} ~ {rec.date_to}\n"
                            send_chat_dm(self.env, emp_email, msg)
                except UserError as ue:
                    raise ue
                except Exception as e:
                    _logger.error("Failed to send Google Chat DM for hr.leave write: %s", str(e))
        return res


class HrScheduleChange(models.Model):
    _inherit = 'hr.schedule.change'

    def action_confirm(self):
        res = super(HrScheduleChange, self).action_confirm()
        for rec in self:
            try:
                # 근무일정 결재 대기 알림 (승인권자/매니저 대상)
                manager_user = rec.employee_id.parent_id.user_id
                if manager_user and manager_user.email:
                    msg = f"📅 *[근무일정 변경 결재 요청]*\n"
                    msg += f"👤 *신청자*: {rec.employee_id.name}\n"
                    msg += f"🔄 *변경 스케줄*: {rec.requested_calendar_id.name}\n"
                    msg += f"📝 *사유*: {rec.reason or '없음'}\n\n"
                    msg += f"👉 Odoo 결재 대기 함에서 승인 처리 부탁드립니다."
                    send_chat_dm(self.env, manager_user.email, msg)
            except Exception as e:
                _logger.error("Failed to send Google Chat DM for hr.schedule.change confirm: %s", str(e))
        return res

    def action_approve(self):
        res = super(HrScheduleChange, self).action_approve()
        for rec in self:
            try:
                # 승인 완료 알림
                requester_user = rec.employee_id.user_id
                if requester_user and requester_user.email:
                    msg = f"✅ *[근무일정 변경 승인 완료]*\n"
                    msg += f"🔄 *변경된 스케줄*: {rec.requested_calendar_id.name}\n"
                    msg += f"🎉 요청하신 근무일정 변경이 최종 승인되었습니다."
                    send_chat_dm(self.env, requester_user.email, msg)
            except Exception as e:
                _logger.error("Failed to send Google Chat DM for hr.schedule.change approve: %s", str(e))
        return res

    def action_reject(self):
        res = super(HrScheduleChange, self).action_reject()
        for rec in self:
            try:
                # 반려 알림
                requester_user = rec.employee_id.user_id
                if requester_user and requester_user.email:
                    msg = f"❌ *[근무일정 변경 반려]*\n"
                    msg += f"🔄 *대상 스케줄*: {rec.requested_calendar_id.name}\n"
                    msg += f"⚠️ 요청하신 근무일정 변경이 반려되었습니다."
                    send_chat_dm(self.env, requester_user.email, msg)
            except Exception as e:
                _logger.error("Failed to send Google Chat DM for hr.schedule.change reject: %s", str(e))
        return res


class ProjectTask(models.Model):
    _inherit = 'project.task'

    @api.model_create_multi
    def create(self, vals_list):
        records = super(ProjectTask, self).create(vals_list)
        for rec in records:
            try:
                if rec.user_ids:
                    for user in rec.user_ids:
                        # 본인이 본인에게 할당한 경우는 제외
                        if user != self.env.user:
                            if not user.email:
                                raise UserError(f"할당된 담당자({user.name})의 계정에 이메일 주소가 없어 구글 챗을 발송할 수 없습니다.")
                            msg = f"📝 *[새로운 할 일 할당]*\n"
                            msg += f"👤 *할당자*: {self.env.user.name}\n"
                            msg += f"🎯 *작업명*: {rec.name}\n"
                            msg += f"📅 *마감일*: {rec.date_deadline or '미지정'}\n"
                            msg += f"👉 Odoo 프로젝트(할 일) 메뉴에서 상세 내용을 확인해 주세요."
                            send_chat_dm(self.env, user.email, msg)
            except UserError as ue:
                raise ue
            except Exception as e:
                _logger.error("Failed to send Google Chat DM for project.task create: %s", str(e))
        return records

    def write(self, vals):
        old_users_dict = {rec.id: set(rec.user_ids.ids) for rec in self}
        res = super(ProjectTask, self).write(vals)
        
        if 'user_ids' in vals:
            for rec in self:
                try:
                    new_users = set(rec.user_ids.ids)
                    old_users = old_users_dict[rec.id]
                    added_user_ids = new_users - old_users
                    if added_user_ids:
                        added_users = self.env['res.users'].browse(list(added_user_ids))
                        for user in added_users:
                            if user != self.env.user:
                                if not user.email:
                                    raise UserError(f"할당된 담당자({user.name})의 계정에 이메일 주소가 없어 구글 챗을 발송할 수 없습니다.")
                                msg = f"📝 *[할 일 추가 할당]*\n"
                                msg += f"👤 *할당자*: {self.env.user.name}\n"
                                msg += f"🎯 *작업명*: {rec.name}\n"
                                msg += f"📅 *마감일*: {rec.date_deadline or '미지정'}\n"
                                msg += f"👉 Odoo 프로젝트(할 일) 메뉴에서 상세 내용을 확인해 주세요."
                                send_chat_dm(self.env, user.email, msg)
                except UserError as ue:
                    raise ue
                except Exception as e:
                    _logger.error("Failed to send Google Chat DM for project.task write: %s", str(e))
        return res


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    def write(self, vals):
        old_user_dict = {rec.id: rec.user_id for rec in self}
        res = super(SaleOrder, self).write(vals)
        
        if 'user_id' in vals:
            for rec in self:
                old_user = old_user_dict.get(rec.id)
                new_user = rec.user_id
                if new_user and new_user != old_user and new_user.email and new_user != self.env.user:
                    try:
                        msg = f"💼 *[영업(Sale) 담당자 배정]*\n"
                        msg += f"👤 *배정자*: {self.env.user.name}\n"
                        msg += f"📄 *주문서*: {rec.name}\n"
                        msg += f"🏢 *고객사*: {rec.partner_id.name or '미지정'}\n"
                        msg += f"👉 Odoo 영업 메뉴에서 상세 내용을 확인해 주세요."
                        send_chat_dm(self.env, new_user.email, msg)
                    except Exception as e:
                        _logger.error("Failed to send DM for sale.order write: %s", str(e))
        return res


class MrpProduction(models.Model):
    _inherit = 'mrp.production'

    def write(self, vals):
        old_user_dict = {rec.id: rec.user_id for rec in self}
        res = super(MrpProduction, self).write(vals)
        
        if 'user_id' in vals:
            for rec in self:
                old_user = old_user_dict.get(rec.id)
                new_user = rec.user_id
                if new_user and new_user != old_user and new_user.email and new_user != self.env.user:
                    try:
                        msg = f"🏭 *[제조(MRP) 담당자 배정]*\n"
                        msg += f"👤 *배정자*: {self.env.user.name}\n"
                        msg += f"📄 *제조지시서*: {rec.name}\n"
                        msg += f"📦 *제품*: {rec.product_id.name or '미지정'}\n"
                        msg += f"👉 Odoo 제조 메뉴에서 상세 내용을 확인해 주세요."
                        send_chat_dm(self.env, new_user.email, msg)
                    except Exception as e:
                        _logger.error("Failed to send DM for mrp.production write: %s", str(e))
        return res


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    def write(self, vals):
        old_user_dict = {rec.id: rec.user_id for rec in self}
        res = super(PurchaseOrder, self).write(vals)
        
        if 'user_id' in vals:
            for rec in self:
                old_user = old_user_dict.get(rec.id)
                new_user = rec.user_id
                if new_user and new_user != old_user and new_user.email and new_user != self.env.user:
                    try:
                        msg = f"🛒 *[구매(Purchase) 담당자 배정]*\n"
                        msg += f"👤 *배정자*: {self.env.user.name}\n"
                        msg += f"📄 *발주서*: {rec.name}\n"
                        msg += f"🏢 *공급업체*: {rec.partner_id.name or '미지정'}\n"
                        msg += f"👉 Odoo 구매 메뉴에서 상세 내용을 확인해 주세요."
                        send_chat_dm(self.env, new_user.email, msg)
                    except Exception as e:
                        _logger.error("Failed to send DM for purchase.order write: %s", str(e))
        return res

