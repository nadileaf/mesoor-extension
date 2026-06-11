import { useCallback, useState } from 'react';
import { CopyModalContext, CopyModalItem } from './copy-modal-context';

function CopyModalDialog({
  item,
  onClose,
}: {
  item: CopyModalItem;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(item.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textarea = document.createElement('textarea');
      textarea.value = item.content;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [item.content]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}
    >
      {/* 轻量遮罩：只覆盖左侧，不遮挡背景页面 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'transparent',
          cursor: 'default',
        }}
        onClick={onClose}
      />
      {/* 侧边栏面板 */}
      <div
        style={{
          position: 'relative',
          backgroundColor: '#ffffff',
          borderRadius: '16px 0 0 16px',
          boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.15)',
          width: '380px',
          maxWidth: '380px',
          height: 'calc(100% - 32px)',
          margin: '16px 16px 16px 0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {/* 标题区 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb',
          }}
        >
          <span
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#111827',
            }}
          >
            {item.title || '复制内容'}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#6b7280',
              fontSize: '20px',
              lineHeight: 1,
              padding: '4px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={e =>
              ((e.target as HTMLElement).style.backgroundColor = '#f3f4f6')
            }
            onMouseLeave={e =>
              ((e.target as HTMLElement).style.backgroundColor = 'transparent')
            }
          >
            ✕
          </button>
        </div>

        {/* 内容区 */}
        <div
          style={{
            padding: '16px 20px',
            flex: 1,
            overflow: 'auto',
          }}
        >
          <pre
            style={{
              margin: 0,
              padding: '12px 16px',
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              fontSize: '13px',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: '#374151',
              fontFamily:
                'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
              maxHeight: '400px',
              overflow: 'auto',
            }}
          >
            {item.content}
          </pre>
        </div>

        {/* 底部按钮 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '16px',
            padding: '16px 20px 20px',
            borderTop: '1px solid #e5e7eb',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              backgroundColor: '#ffffff',
              color: '#374151',
              fontSize: '14px',
              cursor: 'pointer',
              fontWeight: 500,
              transition: 'background-color 0.15s',
            }}
          >
            关闭
          </button>
          <button
            onClick={handleCopy}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: copied ? '#16a34a' : '#3b82f6',
              color: '#ffffff',
              fontSize: '14px',
              cursor: 'pointer',
              fontWeight: 500,
              transition: 'background-color 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {copied ? (
              <>
                <span style={{ fontSize: '16px' }}>✓</span>
                已复制
              </>
            ) : (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                复制
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CopyModalProvider({
  children,
}: {
  children?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<CopyModalItem | null>(null);

  const openModal = useCallback((item: Omit<CopyModalItem, 'id'>) => {
    const id = `modal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setCurrentItem({ ...item, id });
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setCurrentItem(null);
  }, []);

  return (
    <CopyModalContext.Provider
      value={{ openModal, closeModal, isOpen, currentItem }}
    >
      {children}
      {isOpen && currentItem && (
        <CopyModalDialog item={currentItem} onClose={closeModal} />
      )}
    </CopyModalContext.Provider>
  );
}
