import React from 'react';
import { AlertTriangle, Info, Trash2 } from 'lucide-react';

export interface CustomConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
  isAlertOnly?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const CustomConfirmModal: React.FC<CustomConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDanger = false,
  isAlertOnly = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="custom-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        backgroundColor: 'rgba(3, 7, 18, 0.75)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onClick={onCancel}
    >
      <div
        className="custom-modal-card"
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'rgba(15, 23, 42, 0.95)',
          border: isDanger ? '1px solid rgba(244, 63, 94, 0.35)' : '1px solid var(--border-glass-bright)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: isDanger
            ? '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(244, 63, 94, 0.2)'
            : '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px var(--accent-glow)',
          animation: 'scaleUp 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '18px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: isDanger
                ? 'rgba(244, 63, 94, 0.15)'
                : 'rgba(16, 185, 129, 0.15)',
              border: isDanger
                ? '1px solid rgba(244, 63, 94, 0.35)'
                : '1px solid rgba(16, 185, 129, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: isDanger ? 'var(--rose-danger)' : 'var(--accent-light)',
            }}
          >
            {isDanger ? <Trash2 size={24} /> : isAlertOnly ? <Info size={24} /> : <AlertTriangle size={24} />}
          </div>

          <div style={{ flex: 1 }}>
            <h3
              style={{
                fontSize: '17px',
                fontWeight: 600,
                color: '#f8fafc',
                margin: '0 0 6px 0',
                fontFamily: 'var(--font-display)',
              }}
            >
              {title}
            </h3>
            <p
              style={{
                fontSize: '13.5px',
                lineHeight: 1.5,
                color: '#94a3b8',
                margin: 0,
              }}
            >
              {message}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '22px' }}>
          {!isAlertOnly && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-glass)',
                color: 'var(--text-secondary)',
                fontSize: '13.5px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              {cancelLabel}
            </button>
          )}

          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '9px 22px',
              borderRadius: '8px',
              background: isDanger
                ? 'linear-gradient(135deg, #e11d48, #be123c)'
                : 'var(--bg-outgoing-grad)',
              border: isDanger ? '1px solid #fb7185' : '1px solid rgba(255, 255, 255, 0.2)',
              color: 'white',
              fontSize: '13.5px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: isDanger
                ? '0 4px 14px rgba(225, 29, 72, 0.4)'
                : '0 4px 14px var(--accent-glow)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
