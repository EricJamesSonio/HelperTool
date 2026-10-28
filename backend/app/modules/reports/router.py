from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from app.modules.reports.dependencies import ReportsControllerDep
from app.modules.reports.schemas import (
    DailySalesReport,
    ReportCalendarRead,
    ReportPeriodRead,
)
from app.pipeline.auth import RequireAdmin, RequireStaff

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get(
    "/daily",
    response_model=DailySalesReport,
)
def get_daily_report(
    staff: RequireAdmin,
    controller: ReportsControllerDep,
    business_date: date = Query(...),
) -> DailySalesReport:
    return controller.daily(business_date)


@router.get(
    "/my-daily",
    response_model=DailySalesReport,
)
def get_my_daily_report(
    staff: RequireStaff,
    controller: ReportsControllerDep,
) -> DailySalesReport:
    return controller.my_daily(staff)


@router.get(
    "/calendar",
    response_model=ReportCalendarRead,
)
def get_report_calendar(
    staff: RequireAdmin,
    controller: ReportsControllerDep,
) -> ReportCalendarRead:
    return controller.calendar()


@router.get(
    "/period",
    response_model=ReportPeriodRead,
)
def get_period_report(
    staff: RequireAdmin,
    controller: ReportsControllerDep,
    mode: Literal["daily", "weekly", "monthly", "custom"] = Query(...),
    selected_date: date = Query(...),
    end_date: date | None = Query(None),
) -> ReportPeriodRead:
    try:
        return controller.period(
            mode=mode,
            selected_date=selected_date,
            end_date=end_date,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc