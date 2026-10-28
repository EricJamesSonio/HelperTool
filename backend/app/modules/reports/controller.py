from datetime import date
from typing import Literal

from app.modules.auth.principal import StaffPrincipal
from app.modules.reports.schemas import (
    DailySalesReport,
    ReportCalendarRead,
    ReportPeriodRead,
)
from app.modules.reports.service import ReportsService


class ReportsController:
    def __init__(self, service: ReportsService) -> None:
        self._service = service

    def daily(self, business_date: date) -> DailySalesReport:
        return self._service.get_daily_report(business_date)

    def my_daily(
        self,
        principal: StaffPrincipal,
    ) -> DailySalesReport:
        return self._service.get_my_daily_report(principal)

    def calendar(self) -> ReportCalendarRead:
        return self._service.get_calendar()

    def period(
        self,
        mode: Literal["daily", "weekly", "monthly", "custom"],
        selected_date: date,
        end_date: date | None,
    ) -> ReportPeriodRead:
        return self._service.get_period_report(
            mode=mode,
            selected_date=selected_date,
            end_date=end_date,
        )