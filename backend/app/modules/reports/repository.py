from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.payments.models import Payment
from app.modules.refunds.models import Refund


class ReportsRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_payments(
        self,
        start: datetime,
        end: datetime,
        cashier_user_id: int | None = None,
    ) -> list[Payment]:
        statement = select(Payment).where(
            Payment.posted_at >= start,
            Payment.posted_at < end,
        )

        if cashier_user_id is not None:
            statement = statement.where(
                Payment.cashier_user_id == cashier_user_id
            )

        statement = statement.order_by(
            Payment.posted_at.desc(),
            Payment.id.desc(),
        )

        return list(self._session.scalars(statement).all())

    def list_refunds(
        self,
        start: datetime,
        end: datetime,
        actor_user_id: int | None = None,
    ) -> list[Refund]:
        statement = select(Refund).where(
            Refund.refunded_at >= start,
            Refund.refunded_at < end,
        )

        if actor_user_id is not None:
            statement = statement.where(
                Refund.actor_user_id == actor_user_id
            )

        statement = statement.order_by(
            Refund.refunded_at.desc(),
            Refund.id.desc(),
        )

        return list(self._session.scalars(statement).all())

    def transaction_date_bounds(
        self,
    ) -> tuple[datetime | None, datetime | None]:
        payment_bounds = self._session.execute(
            select(
                func.min(Payment.posted_at),
                func.max(Payment.posted_at),
            )
        ).one()

        refund_bounds = self._session.execute(
            select(
                func.min(Refund.refunded_at),
                func.max(Refund.refunded_at),
            )
        ).one()

        starts = [
            value
            for value in (payment_bounds[0], refund_bounds[0])
            if value is not None
        ]

        ends = [
            value
            for value in (payment_bounds[1], refund_bounds[1])
            if value is not None
        ]

        if not starts:
            return None, None

        return min(starts), max(ends)

    def transaction_timestamps(self) -> list[datetime]:
        payment_dates = list(
            self._session.scalars(
                select(Payment.posted_at)
            ).all()
        )

        refund_dates = list(
            self._session.scalars(
                select(Refund.refunded_at)
            ).all()
        )

        return payment_dates + refund_dates