import React from 'react'
import { X } from 'lucide-react'

interface ModalProps {
    isOpen: boolean
    onClose: () => void
    title: string
    children: React.ReactNode
    footer?: React.ReactNode
    size?: 'sm' | 'md' | 'lg'
}

export function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: ModalProps) {
    if (!isOpen) return null

    const maxWidths = {
        sm: '24rem',
        md: '32rem',
        lg: '48rem',
    }

    return (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal-content" style={{ maxWidth: maxWidths[size] }}>
                <div className="modal-header">
                    <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        className="btn btn-ghost btn-icon"
                        aria-label="Close modal"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="modal-body">
                    {children}
                </div>
                {footer && (
                    <div className="modal-footer">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    )
}

interface ConfirmModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    title: string
    message: string
    confirmLabel?: string
    isLoading?: boolean
}

export function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Delete', isLoading }: ConfirmModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            size="sm"
            footer={
                <>
                    <button className="btn btn-secondary" onClick={onClose} disabled={isLoading}>
                        Cancel
                    </button>
                    <button className="btn btn-danger" onClick={onConfirm} disabled={isLoading}>
                        {isLoading ? <span className="spinner" /> : null}
                        {confirmLabel}
                    </button>
                </>
            }
        >
            <p style={{ color: 'var(--text-secondary)' }}>{message}</p>
        </Modal>
    )
}
