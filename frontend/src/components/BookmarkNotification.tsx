/**
 * BookmarkNotification - Toast notification for bookmark actions
 */
import { bookmarkNotification } from '../stores/bookmarkStore';

export function BookmarkNotification() {
    const notification = bookmarkNotification.value;

    if (!notification) return null;

    return (
        <div class="bookmark-notification">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 3a2 2 0 0 0-2 2v14l7-4 7 4V5a2 2 0 0 0-2-2H5Z" />
            </svg>
            <span>{notification.message}</span>
            <style>{`
                .bookmark-notification {
                    position: fixed;
                    bottom: 80px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: linear-gradient(135deg, #f0a020 0%, #e08800 100%);
                    color: #1a1f2e;
                    padding: 10px 20px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 13px;
                    font-weight: 600;
                    box-shadow: 0 4px 20px rgba(240, 160, 32, 0.4);
                    z-index: 10000;
                    animation: slideUp 0.3s ease-out, fadeOut 0.3s ease-in 1.7s forwards;
                }
                
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateX(-50%) translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(-50%) translateY(0);
                    }
                }
                
                @keyframes fadeOut {
                    from {
                        opacity: 1;
                    }
                    to {
                        opacity: 0;
                    }
                }
            `}</style>
        </div>
    );
}
