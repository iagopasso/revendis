'use client';

import { useState } from 'react';
import DigitalReceipt, { MOCK_DIGITAL_RECEIPT } from './receipts/DigitalReceipt';
import ThermalReceipt from './receipts/ThermalReceipt';

type SaleReceiptModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function SaleReceiptModal({ isOpen, onClose }: SaleReceiptModalProps) {
  const [tabIndex, setTabIndex] = useState(0);

  if (!isOpen) return null;

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-receipt" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Extrato da venda</h3>
          <button className="modal-close" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="receipt-tabs">
          <button className={tabIndex === 0 ? 'active' : ''} type="button" onClick={() => setTabIndex(0)}>
            Digital
          </button>
          <button className={tabIndex === 1 ? 'active' : ''} type="button" onClick={() => setTabIndex(1)}>
            Termico
          </button>
        </div>

        <div className="receipt-body">
          {tabIndex === 0 ? <DigitalReceipt receipt={MOCK_DIGITAL_RECEIPT} /> : <ThermalReceipt />}
        </div>

        <div className="modal-footer">
          <button className="button primary" type="button" onClick={handlePrint}>
            Baixar
          </button>
          <button className="button ghost" type="button" onClick={handlePrint}>
            Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
