'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { IconCalendar, IconDollar, IconGift, IconTruck } from '../icons';

type DashboardRemindersActionsProps = {
  expiringCount: number;
  birthdaysCount: number;
  pendingCount: number;
  notDeliveredCount: number;
  expiringHref: string;
  birthdaysHref: string;
  pendingHref: string;
  notDeliveredHref: string;
};

export default function DashboardRemindersActions({
  expiringCount,
  birthdaysCount,
  pendingCount,
  notDeliveredCount,
  expiringHref,
  birthdaysHref,
  pendingHref,
  notDeliveredHref
}: DashboardRemindersActionsProps) {
  const router = useRouter();
  const [openBirthdayEmpty, setOpenBirthdayEmpty] = useState(false);
  const [openPendingEmpty, setOpenPendingEmpty] = useState(false);

  const handleBirthdayClick = () => {
    if (birthdaysCount <= 0) {
      setOpenBirthdayEmpty(true);
      return;
    }
    router.push(birthdaysHref);
  };

  const handlePendingClick = () => {
    if (pendingCount <= 0) {
      setOpenPendingEmpty(true);
      return;
    }
    router.push(pendingHref);
  };

  return (
    <>
      <div className="dashboard-reminders-grid">
        <Link className="dashboard-reminder-card" href={expiringHref}>
          <span className="dashboard-reminder-main">
            <span className="dashboard-reminder-icon">
              <IconCalendar />
            </span>
            <span>Produtos vencendo</span>
          </span>
          <strong className="dashboard-reminder-count">{expiringCount}</strong>
        </Link>

        <button type="button" className="dashboard-reminder-card" onClick={handleBirthdayClick}>
          <span className="dashboard-reminder-main">
            <span className="dashboard-reminder-icon">
              <IconGift />
            </span>
            <span>Aniversários na semana</span>
          </span>
          <strong className="dashboard-reminder-count">{birthdaysCount}</strong>
        </button>

        <button type="button" className="dashboard-reminder-card" onClick={handlePendingClick}>
          <span className="dashboard-reminder-main">
            <span className="dashboard-reminder-icon">
              <IconDollar />
            </span>
            <span>Pagamentos pendentes</span>
          </span>
          <strong className="dashboard-reminder-count">{pendingCount}</strong>
        </button>

        <Link className="dashboard-reminder-card" href={notDeliveredHref}>
          <span className="dashboard-reminder-main">
            <span className="dashboard-reminder-icon">
              <IconTruck />
            </span>
            <span>Pedidos não entregues</span>
          </span>
          <strong className="dashboard-reminder-count">{notDeliveredCount}</strong>
        </Link>
      </div>

      {openBirthdayEmpty ? (
        <div className="modal-backdrop" onClick={() => setOpenBirthdayEmpty(false)}>
          <div className="modal dashboard-reminder-empty-modal" onClick={(event) => event.stopPropagation()}>
            <div className="dashboard-reminder-empty-modal-header">
              <h3>Aniversários nesta semana</h3>
              <button type="button" onClick={() => setOpenBirthdayEmpty(false)} aria-label="Fechar">
                ✕
              </button>
            </div>

            <div className="dashboard-reminder-empty-content">
              <span className="dashboard-reminder-empty-icon">
                <IconGift />
              </span>
              <strong>Nenhum aniversário nesta semana</strong>
              <p>Preencha a data de aniversário dos seus clientes para que apareçam aqui.</p>
            </div>
          </div>
        </div>
      ) : null}

      {openPendingEmpty ? (
        <div className="modal-backdrop" onClick={() => setOpenPendingEmpty(false)}>
          <div className="modal dashboard-reminder-empty-modal" onClick={(event) => event.stopPropagation()}>
            <div className="dashboard-reminder-empty-modal-header">
              <h3>Pagamentos pendentes</h3>
              <button type="button" onClick={() => setOpenPendingEmpty(false)} aria-label="Fechar">
                ✕
              </button>
            </div>

            <div className="dashboard-reminder-empty-content">
              <span className="dashboard-reminder-empty-icon">
                <IconDollar />
              </span>
              <strong>Oba! Nenhum pagamento pendente.</strong>
              <p>Lembre-se de registrar os pagamentos das vendas para que apareçam aqui.</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
