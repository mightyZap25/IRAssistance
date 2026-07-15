import re
import logging
from odoo import models, fields, api, _
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
            except Exception as e:
                _logger.error("Failed to process Google Chat notification in mail.notification: %s", str(e))
        return records


class HrLeave(models.Model):
    _inherit = 'hr.leave'

    def action_confirm(self):
        res = super(HrLeave, self).action_confirm()
        for rec in self:
            try:
                # 결재 신청 시 승인권자(매니저)에게 알림
                manager_user = rec.employee_id.parent_id.user_id
                if manager_user and manager_user.email:
                    msg = f"📋 *[휴가 결재 요청]*\n"
                    msg += f"👤 *신청자*: {rec.employee_id.name} ({rec.employee_id.department_id.name or '부서 없음'})\n"
                    msg += f"📅 *기간*: {rec.date_from} ~ {rec.date_to} ({rec.number_of_days}일)\n"
                    msg += f"📝 *사유*: {rec.name or '없음'}\n\n"
                    msg += f"👉 Odoo 결재 대기 함에서 확인 후 승인해 주세요."
                    send_chat_dm(self.env, manager_user.email, msg)
            except Exception as e:
                _logger.error("Failed to send Google Chat DM for hr.leave confirm: %s", str(e))
        return res

    def action_validate(self):
        res = super(HrLeave, self).action_validate()
        for rec in self:
            try:
                # 승인 완료 시 신청자에게 알림
                requester_user = rec.employee_id.user_id
                if requester_user and requester_user.email:
                    msg = f"✅ *[휴가 승인 완료]*\n"
                    msg += f"📅 *기간*: {rec.date_from} ~ {rec.date_to} ({rec.number_of_days}일)\n"
                    msg += f"🎉 요청하신 휴가가 승인 완료되었습니다."
                    send_chat_dm(self.env, requester_user.email, msg)
            except Exception as e:
                _logger.error("Failed to send Google Chat DM for hr.leave validate: %s", str(e))
        return res

    def action_refuse(self):
        res = super(HrLeave, self).action_refuse()
        for rec in self:
            try:
                # 반려 시 신청자에게 알림
                requester_user = rec.employee_id.user_id
                if requester_user and requester_user.email:
                    msg = f"❌ *[휴가 반려 안내]*\n"
                    msg += f"📅 *기간*: {rec.date_from} ~ {rec.date_to}\n"
                    msg += f"⚠️ 요청하신 휴가가 반려되었습니다. 세부 사유는 결재 라인을 확인해 주세요."
                    send_chat_dm(self.env, requester_user.email, msg)
            except Exception as e:
                _logger.error("Failed to send Google Chat DM for hr.leave refuse: %s", str(e))
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
