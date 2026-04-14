import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { v4 as uuid } from 'uuid';
import './linkedin-email-dialog.css';

interface MailConfig {
  content: string;
  company: string;
  jobdesc: string;
  consultant: string;
  tone: string;
  confidential: string;
  link: string;
}

const LinkedInEmailDialog: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [mailConfig, setMailConfig] = useState<MailConfig>({
    content: '',
    company: '',
    jobdesc: '',
    consultant: '',
    tone: '专业礼貌',
    confidential: '保密，不透露',
    link: '',
  });

  useEffect(() => {
    console.log('[LinkedIn Email Dialog] 组件已挂载，注册事件监听器');

    const handleShow = (event: Event) => {
      const customEvent = event as CustomEvent;
      const config = customEvent.detail;
      console.log('[LinkedIn Email Dialog] 收到 show 事件:', config);
      setMailConfig(prev => ({ ...prev, ...config }));
      setIsVisible(true);
      setIsGenerating(false);
    };

    const handleGenerating = () => {
      console.log('[LinkedIn Email Dialog] 收到 generating 事件，显示 loading 状态');
      setIsVisible(true);
      setIsGenerating(true);
    };

    const handleMessage = (message: any) => {
      console.log('[LinkedIn Email Dialog] 收到消息:', message);
      if (message.type === 'update-mail-content') {
        console.log('[LinkedIn Email Dialog] 更新邮件内容，关闭 loading');
        setMailConfig(prev => ({ ...prev, ...message.payload }));
        setIsVisible(true);
        setIsGenerating(false);
      }
    };

    window.addEventListener('linkedin-email-show', handleShow);
    window.addEventListener('linkedin-email-generating', handleGenerating);
    browser.runtime.onMessage.addListener(handleMessage);
    console.log('[LinkedIn Email Dialog] 事件监听器注册完成');

    return () => {
      window.removeEventListener('linkedin-email-show', handleShow);
      window.removeEventListener(
        'linkedin-email-generating',
        handleGenerating
      );
      browser.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setMailConfig({ ...mailConfig, [name]: value });
  };

  const handleClose = () => {
    setIsVisible(false);
    setMailConfig({
      content: '',
      company: '',
      jobdesc: '',
      consultant: '',
      tone: '专业礼貌',
      confidential: '保密，不透露',
      link: '',
    });
  };

  const handleRegenerate = async () => {
    if (isGenerating) return;

    try {
      setIsGenerating(true);
      console.log('[LinkedIn Email Dialog] 重新生成邮件，使用数据:', mailConfig);
      
      const message = {
        requestId: uuid(),
        type: 'linkedin-email-generate',
        payload: {
          url: mailConfig.link,
          company: mailConfig.company,
          jobdesc: mailConfig.jobdesc,
          consultant: mailConfig.consultant,
          tone: mailConfig.tone,
          confidential: mailConfig.confidential,
        },
      };

      console.log('[LinkedIn Email Dialog] 发送重新生成消息:', message);
      await browser.runtime.sendMessage(message);
      
      // 不再使用超时自动关闭，等待 update-mail-content 消息
    } catch (error) {
      console.error('[LinkedIn Email] 重新生成失败:', error);
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = mailConfig.content;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      console.log('[LinkedIn Email] 邮件内容已复制');
    } catch (error) {
      console.error('[LinkedIn Email] 复制失败:', error);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="linkedin-email-dialog-root">
      <div className="linkedin-email-panel">
        <div className="linkedin-email-header">
          <h3>为您推荐 In Mail 写法</h3>
          <button className="close-button" onClick={handleClose}>
            &times;
          </button>
        </div>

        <div className="linkedin-email-content">
          {isGenerating ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p className="loading-text">正在生成邮件内容，大约一分钟，请稍候...</p>
              <div className="skeleton-form">
                <div className="skeleton-line skeleton-short"></div>
                <div className="skeleton-line skeleton-medium"></div>
                <div className="skeleton-line skeleton-long"></div>
                <div className="skeleton-line skeleton-medium"></div>
                <div className="skeleton-line skeleton-short"></div>
              </div>
            </div>
          ) : (
            <>
              <div className="form-item">
                <label className="form-label">是否保密:</label>
                <div className="switch-container">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={mailConfig.confidential === '保密，不透露'}
                      onChange={e => {
                        handleChange({
                          target: {
                            name: 'confidential',
                            value: e.target.checked
                              ? '保密，不透露'
                              : '公开，可透露',
                          },
                        } as React.ChangeEvent<HTMLInputElement>);
                      }}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <div className="form-item">
                <label className="form-label">文风:</label>
                <div className="radio-group">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="tone"
                      value="专业礼貌"
                      checked={mailConfig.tone === '专业礼貌'}
                      onChange={handleChange}
                    />
                    <span>专业礼貌</span>
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="tone"
                      value="简短直接"
                      checked={mailConfig.tone === '简短直接'}
                      onChange={handleChange}
                    />
                    <span>简短直接</span>
                  </label>
                </div>
              </div>

              <div className="form-item-full">
                <input
                  type="text"
                  name="company"
                  value={mailConfig.company}
                  onChange={handleChange}
                  placeholder="输入目标公司"
                  className="input-field"
                />
              </div>

              <div className="form-item-full">
                <input
                  type="text"
                  name="jobdesc"
                  value={mailConfig.jobdesc}
                  onChange={handleChange}
                  placeholder="输入职位名/贴入职位描述"
                  className="input-field"
                />
              </div>

              <div className="form-item-full">
                <input
                  type="text"
                  name="consultant"
                  value={mailConfig.consultant}
                  onChange={handleChange}
                  placeholder="顾问名"
                  className="input-field"
                />
              </div>

              <div className="form-item-full">
                <textarea
                  name="content"
                  value={mailConfig.content}
                  onChange={handleChange}
                  className="textarea-field"
                  rows={8}
                />
              </div>

              <div className="button-container">
                <button
                  className="button button-secondary"
                  onClick={handleRegenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? '生成中...' : '重新生成'}
                </button>
                <button className="button button-primary" onClick={handleCopy}>
                  复制粘贴
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const initEmailDialog = () => {
  const container = document.createElement('div');
  container.id = 'linkedin-email-dialog-root';
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(<LinkedInEmailDialog />);
};

if (!document.getElementById('linkedin-email-dialog-root')) {
  initEmailDialog();
}

export default LinkedInEmailDialog;
