import React from 'react';
import { AlertTriangle, Info, Trash2 } from 'lucide-react';

export interface CustomConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  secondaryConfirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
  isAlertOnly?: boolean;
  onConfirm: () => void;
  onSecondaryConfirm?: () => void;
  onCancel: () => void;
}

export const CustomConfirmModal: React.FC<CustomConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  secondaryConfirmLabel,
  cancelLabel = 'Cancel',
  isDanger = false,
  isAlertOnly = false,
  onConfirm,
  onSecondaryConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="custom-modal-backdrop" onClick={onCancel}>
      <div
        className={`custom-modal-card ${isDanger ? 'danger' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '16px' }}>
          <div className={`custom-modal-icon-box ${isDanger ? 'danger' : ''}`}>
            {isDanger ? <Trash2 size={22} /> : isAlertOnly ? <Info size={22} /> : <AlertTriangle size={22} />}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="custom-modal-title">{title}</h3>
            <p className="custom-modal-message">{message}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center', marginTop: '22px' }}>
          {!isAlertOnly && (
            <button
              type="button"
              className="custom-modal-cancel-btn"
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
          )}

          {secondaryConfirmLabel && onSecondaryConfirm && (
            <button
              type="button"
              className="custom-modal-cancel-btn"
              style={{ background: 'rgba(244, 63, 94, 0.12)', color: '#f43f5e', borderColor: 'rgba(244, 63, 94, 0.3)' }}
              onClick={onSecondaryConfirm}
            >
              {secondaryConfirmLabel}
            </button>
          )}

          <button
            type="button"
            className={`custom-modal-confirm-btn ${isDanger ? 'danger' : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
