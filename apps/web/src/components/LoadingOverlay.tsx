import React from 'react';

type LoadingOverlayProps = {
    isLoading: boolean;
    message?: string;
};

export default function LoadingOverlay({ isLoading, message = "Processing, please wait..." }: LoadingOverlayProps) {
    if (!isLoading) return null;

    return (
        <div id="loading-overlay" style={{ display: 'flex' }}>
            <div className="loader"></div>
            <p>{message}</p>
        </div>
    );
}
