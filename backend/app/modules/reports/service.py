from datetime import date, datetime, time, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.modules.auth.principal import StaffPrincipal
from app.modules.business_profile.repository import BusinessProfileRepository
from app.modules.reports.repository import ReportsRepository
from app.modules.reports.schemas import (
    DailySalesReport,
    DailySalesSummary,
    ReportCalendarRead,
    ReportPaymentRead,
    ReportPeriodRead,
    ReportRefundRead,
)

ReportMode = Literal["daily", "weekly", "monthly", "custom"]


class ReportsService:
    def __init__(
        self,
        repository: ReportsRepository,
        business_profiles: BusinessProfileRepository,
    ) -> None:
        self._repository = repository
        self._business_profiles = business_profiles

    def get_daily_report(
        self,
        business_date: date,
    ) -> DailySalesReport:
        return self._build_report(
            business_date=business_date,
            cashier_user_id=None,
            scope="ALL",
        )

    def get_my_daily_report(
        self,
        principal: StaffPrincipal,
    ) -> DailySalesReport:
        profile = self._business_profiles.get()
        business_timezone = self._timezone_for_profile(profile)

        today = datetime.now(timezone.utc).astimezone(
            business_timezone
        ).date()

        return self._build_report(
            business_date=today,
            cashier_user_id=principal.user_id,
            scope="OWN",
        )

    def get_calendar(self) -> ReportCalendarRead:
        profile = self._business_profiles.get()
        business_timezone = self._timezone_for_profile(profile)

        today = datetime.now(timezone.utc).astimezone(
            business_timezone
        ).date()

        def local_date(value: datetime) -> date:
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)

            return value.astimezone(business_timezone).date()

        active_dates = sorted({
            local_date(timestamp)
            for timestamp in self._repository.transaction_timestamps()
            if local_date(timestamp) <= today
        })

        return ReportCalendarRead(
            timezone=business_timezone.key,
            today=today,
            earliest_date=active_dates[0] if active_dates else None,
            latest_date=active_dates[-1] if active_dates else None,
            active_dates=active_dates,
        )

    def get_period_report(
        self,
        mode: ReportMode,
        selected_date: date,
        end_date: date | None = None,
    ) -> ReportPeriodRead:
        profile = self._business_profiles.get()
        business_timezone = self._timezone_for_profile(profile)

        today = datetime.now(timezone.utc).astimezone(
            business_timezone
        ).date()

        if mode == "daily":
            start_date = selected_date
            final_date = selected_date

        elif mode == "weekly":
            start_date = selected_date - timedelta(
                days=selected_date.weekday()
            )
            final_date = start_date + timedelta(days=6)

        elif mode == "monthly":
            start_date = selected_date.replace(day=1)

            if start_date.month == 12:
                next_month = start_date.replace(
                    year=start_date.year + 1,
                    month=1,
                )
            else:
                next_month = start_date.replace(
                    month=start_date.month + 1
                )

            final_date = next_month - timedelta(days=1)

        elif mode == "custom":
            if end_date is None:
                raise ValueError(
                    "An end date is required for a custom report."
                )

            start_date = selected_date
            final_date = end_date

        else:
            raise ValueError("Unsupported reporting period.")

        if start_date > final_date:
            raise ValueError(
                "The report start date must not exceed its end date."
            )

        if start_date > today:
            raise ValueError(
                "The report cannot begin in the future."
            )

        final_date = min(final_date, today)

        if (final_date - start_date).days > 366:
            raise ValueError(
                "A reporting period cannot exceed 367 calendar days."
            )

        period_start, period_end = self._utc_bounds(
            start_date,
            final_date,
            business_timezone,
        )

        payments = self._repository.list_payments(
            start=period_start,
            end=period_end,
        )

        refunds = self._repository.list_refunds(
            start=period_start,
            end=period_end,
        )

        return ReportPeriodRead(
            mode=mode,
            start_date=start_date,
            end_date=final_date,
            timezone=business_timezone.key,
            currency_code=(
                profile.currency_code if profile is not None else "PHP"
            ),
            period_start=period_start,
            period_end=period_end,
            summary=self._summary(payments, refunds),
            payments=[
                ReportPaymentRead.model_validate(payment)
                for payment in payments
            ],
            refunds=[
                ReportRefundRead.model_validate(refund)
                for refund in refunds
            ],
        )

    def _build_report(
        self,
        business_date: date,
        cashier_user_id: int | None,
        scope: str,
    ) -> DailySalesReport:
        profile = self._business_profiles.get()
        business_timezone = self._timezone_for_profile(profile)

        period_start, period_end = self._utc_bounds(
            business_date,
            business_date,
            business_timezone,
        )

        payments = self._repository.list_payments(
            start=period_start,
            end=period_end,
            cashier_user_id=cashier_user_id,
        )

        refunds = self._repository.list_refunds(
            start=period_start,
            end=period_end,
            actor_user_id=cashier_user_id,
        )

        return DailySalesReport(
            business_date=business_date,
            timezone=business_timezone.key,
            currency_code=(
                profile.currency_code if profile is not None else "PHP"
            ),
            scope=scope,
            cashier_user_id=cashier_user_id,
            period_start=period_start,
            period_end=period_end,
            summary=self._summary(payments, refunds),
            payments=[
                ReportPaymentRead.model_validate(payment)
                for payment in payments
            ],
            refunds=[
                ReportRefundRead.model_validate(refund)
                for refund in refunds
            ],
        )

    @staticmethod
    def _summary(payments, refunds) -> DailySalesSummary:
        collected_minor = sum(
            payment.amount_minor for payment in payments
        )

        refunded_minor = sum(
            refund.amount_minor for refund in refunds
        )

        return DailySalesSummary(
            payment_count=len(payments),
            refund_count=len(refunds),
            collected_minor=collected_minor,
            refunded_minor=refunded_minor,
            net_collected_minor=collected_minor - refunded_minor,
        )

    @staticmethod
    def _utc_bounds(
        start_date: date,
        end_date: date,
        business_timezone: ZoneInfo,
    ) -> tuple[datetime, datetime]:
        local_start = datetime.combine(
            start_date,
            time.min,
            tzinfo=business_timezone,
        )

        local_end = datetime.combine(
            end_date + timedelta(days=1),
            time.min,
            tzinfo=business_timezone,
        )

        return (
            local_start.astimezone(timezone.utc),
            local_end.astimezone(timezone.utc),
        )

    @staticmethod
    def _timezone_for_profile(profile) -> ZoneInfo:
        timezone_name = (
            profile.timezone if profile is not None else "Asia/Manila"
        )

        try:
            return ZoneInfo(timezone_name)
        except ZoneInfoNotFoundError as exc:
            raise ValueError(
                f"Business timezone is not available: {timezone_name}"
            ) from exc