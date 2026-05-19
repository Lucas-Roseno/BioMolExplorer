import React from 'react';

type LoadingOverlayProps = {
    isLoading: boolean;
    message?: string;
    children?: React.ReactNode;
};

export default function LoadingOverlay({ isLoading, message = "Processing, please wait...", children }: LoadingOverlayProps) {
    if (!isLoading) return null;

    return (
        <div id="loading-overlay" style={{ 
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            padding: '40px',
            zIndex: 9999
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div className="loader"></div>
                <p style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold' }}>{message}</p>
            </div>
            {children && (
                <div style={{ 
                    width: '100%', 
                    maxWidth: '1000px', 
                    maxHeight: '70vh', 
                    overflow: 'auto',
                    borderRadius: '10px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                    backgroundColor: '#1e1e1e',
                    border: '1px solid #444'
                }}>
                    {children}
                </div>
            )}
        </div>
    );
}
