import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Mail } from 'lucide-react';
import './dupe-check.css';

interface ConfirmState {
  isVisible: boolean;
  profileLink: string | null;
}

const LinkedInEmailConfirm: React.FC = () => {
  const [state, setState] = useState<ConfirmState>({
    isVisible: false,
    profileLink: null,
  });

  useEffect(() => {
    const handleShow = (event: Event) => {
      const customEvent = event as CustomEvent;
      setState({
        isVisible: true,
        profileLink: customEvent.detail.profileLink,
      });
    };

    window.addEventListener('linkedin-email-confirm', handleShow);
    return () =>
      window.removeEventListener('linkedin-email-confirm', handleShow);
  }, []);

  const handleConfirm = () => {
    const event = new CustomEvent('linkedin-email-confirmed', {
      detail: { profileLink: state.profileLink },
    });
    window.dispatchEvent(event);
    setState({ isVisible: false, profileLink: null });
  };

  const handleCancel = () => {
    setState({ isVisible: false, profileLink: null });
  };

  if (!state.isVisible) return null;

  return (
    <div className="mesoor-extension-root mesoor-extension-container">
      <div className="mesoor-card">
        <div className="mesoor-icon-container">
          <Mail className="mesoor-icon" />
        </div>
        <div className="mesoor-text">是否生成领英邮件？</div>
        <div className="mesoor-buttons">
          <button
            className="mesoor-button mesoor-button-primary"
            onClick={handleConfirm}
          >
            好的
          </button>
          <button
            className="mesoor-button mesoor-button-ghost"
            onClick={handleCancel}
          >
            忽略
          </button>
        </div>
      </div>
    </div>
  );
};

const initConfirmDialog = () => {
  const container = document.createElement('div');
  container.id = 'linkedin-email-confirm-root';
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(<LinkedInEmailConfirm />);
};

if (!document.getElementById('linkedin-email-confirm-root')) {
  initConfirmDialog();
}

export default LinkedInEmailConfirm;
