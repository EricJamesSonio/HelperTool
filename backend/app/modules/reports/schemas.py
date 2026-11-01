from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class ReportPaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    payment_reference: str
    order_id: int
    cashier_user_id: int | None
    amount_minor: int
    payment_method: str
    posted_at: datetime


class ReportRefundRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    refund_reference: str
    order_id: int
    payment_id: int | None
    actor_user_id: int | None
    amount_minor: int
    method: str
    refunded_at: datetime


class DailySalesSummary(BaseModel):
    payment_count: int
    refund_count: int
    collected_minor: int
    refunded_minor: int
    net_collected_minor: int


class DailySalesReport(BaseModel):
    business_date: date
    timezone: str
    currency_code: str
    scope: str
    cashier_user_id: int | None
    period_start: datetime
    period_end: datetime
    summary: DailySalesSummary
    payments: list[ReportPaymentRead]
    refunds: list[ReportRefundRead]


class ReportPeriodRead(BaseModel):
    mode: Literal["daily", "weekly", "monthly", "custom"]
    start_date: date
    end_date: date
    timezone: str
    currency_code: str
    period_start: datetime
    period_end: datetime
    summary: DailySalesSummary
    payments: list[ReportPaymentRead]
    refunds: list[ReportRefundRead]


class ReportCalendarRead(BaseModel):
    timezone: str
    today: date
    earliest_date: date | None
    latest_date: date | None
    active_dates: list[date]