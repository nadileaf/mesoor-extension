import './dupe-check.css';

import { isNil } from 'lodash-es';
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  RefreshCw,
  Users,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Draggable from 'react-draggable';
import { filter } from 'rxjs/operators';
import { v4 as uuid } from 'uuid';
import browser from 'webextension-polyfill';
import { env$, wait$ } from '../../models/preference';
import {
  IDupeCheckTriggerMessage,
  ISyncResumeBaseConfig,
} from '../../models/stream';
import { delay } from '../../utils/index';
import {
  isISyncResumeFeedbackMessage,
  isISyncResumeStartMessage,
} from '../../utils/message-fileter';

// 个人版插件列表
const personalList = ['薪事力招聘', '易服智享'];

const isPersonalPlug = personalList.includes(
  browser.runtime.getManifest().name
);

// 组件状态接口
interface ModernDupeCheckState {
  isActive: boolean;
  isSynchronizingResume: boolean;
  isSynchronized: boolean;
  isCheckingDupe: boolean;
  isChecked: boolean;
  isSyncResumeError: boolean;
  isDupeCheckError: boolean;
  dupeCheckResult?: boolean;
  openId?: string;
  tenant?: string;
  isDragging: boolean;
  errorCode?: number;
  errorMessage?: string;
  env: string;
  wait: boolean;
  isConfirmSynchronize: boolean;
  requestId?: string;
}

// 确认同步消息接口
interface IConfirmSynchronizationMessage {
  requestId: string | undefined;
  type: string;
}

// 组件属性接口
interface DupeCheckProps {
  className?: string;
}

export const DupeCheck: React.FC<DupeCheckProps> = ({ className }) => {
  // 状态管理
  const [state, setState] = useState<ModernDupeCheckState>(() => {
    // 判断是否在支持的网站上激活
    const isActive = !(
      location.href.includes('easy.lagou.com') ||
      location.href.includes('passport.lagou.com') ||
      location.href.includes('hr.shixiseng.com') ||
      location.href.includes('linkedin.com') ||
      location.href.includes('zhipin.com') ||
      location.href.includes('maimai.cn') ||
      (location.href.includes('rd6.zhaopin.com') &&
        !location.href.includes('rd6.zhaopin.com/resume/detail')) ||
      location.href.includes('passport.zhaopin.com') ||
      location.href.includes('58.com') ||
      location.href.includes('attachment.zhaopin.com') ||
      location.href.includes('linkedin.cn') ||
      location.href.includes('51job.com') ||
      //   location.href.includes("51job.com/Revision/online/chat")) ||
      // location.href.includes("51job.com/Revision/online/talent/search") ||
      // location.href.includes("51job.com/Revision/online/talentRecommend") ||
      location.href.includes('duolie.com') ||
      location.href.includes('lpt.liepin.com') ||
      // 猎聘诚猎通沟通列表页面
      (location.href.includes('h.liepin.com') &&
        (location.href.includes('h.liepin.com/im/showmsgnewpage') ||
          location.href.includes('h.liepin.com/resume/showresumedetail')))
    );

    // const isActive = true;

    return {
      isActive,
      isSynchronizingResume: isActive,
      isSynchronized: false,
      isChecked: false,
      isCheckingDupe: false,
      isSyncResumeError: false,
      isDupeCheckError: false,
      isDragging: false,
      env: 'tip.mesoor.com',
      wait: true,
      isConfirmSynchronize: false,
    };
  });

  // Refs
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const dragRef = useRef<HTMLDivElement>(null);

  // 重置状态的辅助函数
  const resetState = useCallback(
    (
      updates: Partial<ModernDupeCheckState> | boolean,
      additionalState: Partial<ModernDupeCheckState> = {}
    ) => {
      if (typeof updates === 'object') {
        setState(prev => ({ ...prev, ...updates }));
        return;
      }

      // 如果是布尔值，则进行完整重置
      const isActive = updates;
      setState(prev => ({
        ...prev,
        isActive,
        isSynchronizingResume: isActive,
        isSynchronized: false,
        isChecked: false,
        isCheckingDupe: false,
        isSyncResumeError: false,
        isDupeCheckError: false,
        tenant: undefined,
        dupeCheckResult: undefined,
        isConfirmSynchronize: false,
        ...additionalState,
      }));
    },
    []
  );

  // 获取显示文本
  const getText = useCallback(() => {
    const {
      isActive,
      isSyncResumeError,
      isDupeCheckError,
      isCheckingDupe,
      isSynchronizingResume,
      isChecked,
      wait,
      dupeCheckResult,
      errorCode,
      errorMessage,
      isConfirmSynchronize,
    } = state;

    if (!isActive) return '未激活';

    if (isSyncResumeError && errorCode === 403) return '已到达资源限制';
    if (isSyncResumeError && errorCode === 480) return '简历解析出错';
    if (isSyncResumeError && errorCode === 666) return '同步简历超时';
    if (isSyncResumeError && errorCode === 430) {
      try {
        return errorMessage
          ? JSON.parse(errorMessage).message || '同步简历失败'
          : '同步简历失败';
      } catch {
        return '同步简历失败';
      }
    }
    if (isSyncResumeError) return '同步简历失败';

    if (isSynchronizingResume) {
      return wait
        ? isConfirmSynchronize
          ? '正在同步简历...'
          : '同步该简历?'
        : '正在同步简历...';
    }

    if (isCheckingDupe) return '正在检查...';
    if (isDupeCheckError) return '检查失败, 点击重试';

    if (isChecked) {
      if (dupeCheckResult === false) {
        return isPersonalPlug
          ? '不存在重复简历'
          : '不存在重复简历, 点击查看召乎上简历';
      } else {
        return isPersonalPlug
          ? '存在重复简历'
          : '存在重复简历, 点击查看召乎上简历';
      }
    }

    return '同步完成，点击查看人才库简历';
  }, [state]);

  // 获取图标
  const getIcon = useCallback(() => {
    const {
      isCheckingDupe,
      isSynchronizingResume,
      isConfirmSynchronize,
      wait,
      isSynchronized,
      isSyncResumeError,
      isDupeCheckError,
      isChecked,
      dupeCheckResult,
    } = state;

    // 同步错误状态
    if (isSyncResumeError || isDupeCheckError) {
      return <AlertCircle className="mesoor-icon mesoor-icon-red" />;
    }

    // 同步完成状态
    if (isSynchronized && !isCheckingDupe && !isChecked) {
      return <CheckCircle className="mesoor-icon mesoor-icon-green" />;
    }

    // 查重完成状态
    if (isChecked) {
      if (dupeCheckResult === false) {
        return <CheckCircle className="mesoor-icon mesoor-icon-green" />;
      } else {
        return <RefreshCw className="mesoor-icon mesoor-icon-orange" />;
      }
    }

    // 正在处理状态（同步中或查重中）
    if (
      isCheckingDupe ||
      (isSynchronizingResume && (wait ? isConfirmSynchronize : true))
    ) {
      return (
        <Loader2 className="mesoor-icon mesoor-icon-primary mesoor-icon-spin" />
      );
    }

    // 默认等待状态
    return <Users className="mesoor-icon mesoor-icon-violet" />;
  }, [state]);

  // 查重触发逻辑
  const dupeCheckTrigger = useCallback(async () => {
    resetState({ isCheckingDupe: true });
    const { openId, tenant } = state;

    const msg: IDupeCheckTriggerMessage = {
      requestId: uuid(),
      type: 'dupe-check-trigger',
      payload: {
        openId: openId!,
        tenant: tenant!,
      },
    };

    await browser.runtime.sendMessage(msg);
  }, [state, resetState]);

  // 确认同步逻辑
  const confirmSync = useCallback(() => {
    const message: IConfirmSynchronizationMessage = {
      type: 'confirm-synchronize',
      requestId: state.requestId,
    };

    browser.runtime.sendMessage(message);
    resetState({ isConfirmSynchronize: true });
  }, [state, resetState]);

  // 查看重复简历
  const viewDupeResume = useCallback(() => {
    const { dupeCheckResult, openId } = state;
    if (isNil(dupeCheckResult)) return;

    const secondaryDomain = 'mesoor.com';
    // 在浏览器环境中默认使用生产环境配置
    const hostEnv = secondaryDomain;

    window.open(
      `https://system.${hostEnv}/dashboard#/candidates/search?openid=${openId}`
    );
  }, [state]);

  // 查重重试
  const dupeCheckRetry = useCallback(() => {
    resetState({
      isChecked: false,
      isDupeCheckError: false,
    });
    dupeCheckTrigger();
  }, [resetState, dupeCheckTrigger]);

  // 主点击处理逻辑
  const handleClick = useCallback(() => {
    const {
      isChecked,
      isSynchronized,
      isDupeCheckError,
      dupeCheckResult,
      isCheckingDupe,
      isSyncResumeError,
      wait,
      isConfirmSynchronize,
      env,
      openId,
    } = state;

    // 查重失败时重试
    if (isDupeCheckError) {
      return dupeCheckRetry();
    }

    // 同步完成后的跳转逻辑
    if (isSynchronized && !isSyncResumeError && !isCheckingDupe && !isChecked) {
      if (isPersonalPlug) {
        const secondaryDomain = 'mesoor.com';
        window.open(
          `https://system.${secondaryDomain}/dashboard#/candidates/search?openid=${openId}`
        );
        return;
      }

      // 企业版跳转到简历详情页
      const url = `https://${env}/entity/${openId}?type=Resume`;
      window.open(url);
      return;
    }

    // 查重完成后查看结果
    if (isChecked && !isNil(dupeCheckResult)) {
      return viewDupeResume();
    }

    // 等待确认同步
    if (wait && !isConfirmSynchronize) {
      return confirmSync();
    }
  }, [state, dupeCheckRetry, viewDupeResume, confirmSync]);

  // 绑定点击遮罩关闭事件
  const bindClickToMask = useCallback(
    async (_type: string, baseConfig: ISyncResumeBaseConfig | undefined) => {
      let maskSelectorPath: string | undefined;
      let maskClassName: string | undefined;
      let iframeSelectorPath: string | undefined;

      if (baseConfig !== undefined) {
        maskSelectorPath = baseConfig.bindingSelector.maskSelectorPath.selector;
        maskClassName = baseConfig.bindingSelector.maskSelectorPath.className!;
        iframeSelectorPath =
          baseConfig.bindingSelector.iframeSelectorPath!.selector;
      }

      if (_type === 'lagou') {
        maskSelectorPath = 'div.react-modal-wrap.resume-dialog';
      }

      if (!maskSelectorPath) {
        console.error('no mask selector');
        return;
      }

      let mask: Element | null;
      let frameNode: HTMLIFrameElement | null = null;

      if (iframeSelectorPath) {
        frameNode = document.querySelector(
          iframeSelectorPath
        ) as HTMLIFrameElement;
        let cntA = 0;
        while (isNil(frameNode) && cntA < 10) {
          await delay(100);
          frameNode = document.querySelector(
            iframeSelectorPath
          ) as HTMLIFrameElement;
          cntA++;
        }
        if (isNil(frameNode)) return;
        mask = frameNode.contentDocument!.querySelector(maskSelectorPath);
      } else {
        mask = document.documentElement.querySelector(maskSelectorPath);
      }

      let cnt = 0;
      while (isNil(mask) && cnt < 10) {
        await delay(100);
        mask = iframeSelectorPath
          ? frameNode!.contentDocument!.querySelector(maskSelectorPath)
          : document.documentElement.querySelector(maskSelectorPath);
        cnt++;
      }

      if (isNil(mask)) return;

      mask.addEventListener('click', (e: Event) => {
        const target = e.target as HTMLElement;
        const className = target.className;

        if (
          className === 'react-modal-wrap resume-dialog' ||
          className.includes('el-dialog__wrapper') ||
          className.includes('dialog-layer') ||
          (maskClassName && className.includes(maskClassName))
        ) {
          resetState({ isActive: false });
        }
      });
    },
    [resetState]
  );

  // 绑定点击关闭按钮事件
  const bindClickToCloseButton = useCallback(
    async (_type: string, baseConfig: ISyncResumeBaseConfig | undefined) => {
      let closeButtonSelectorPath: string | undefined;
      let iframeSelectorPath: string | undefined;

      if (baseConfig !== undefined) {
        closeButtonSelectorPath =
          baseConfig.bindingSelector.closeButtonSelectorPath.selector;
        iframeSelectorPath =
          baseConfig.bindingSelector.iframeSelectorPath!.selector;
      }

      if (_type === 'lagou') {
        closeButtonSelectorPath = 'div.switch-close';
      }

      if (!closeButtonSelectorPath) {
        console.log('no close button selector');
        return;
      }

      let closeButton: Element | null;
      let frameNode: HTMLIFrameElement | null = null;

      if (iframeSelectorPath) {
        frameNode = document.querySelector(
          iframeSelectorPath
        ) as HTMLIFrameElement;
        let cntA = 0;
        while (isNil(frameNode) && cntA < 10) {
          await delay(100);
          frameNode = document.querySelector(
            iframeSelectorPath
          ) as HTMLIFrameElement;
          cntA++;
        }
        if (isNil(frameNode)) return;
        closeButton = frameNode.contentDocument!.querySelector(
          closeButtonSelectorPath
        );
      } else {
        closeButton = document.documentElement.querySelector(
          closeButtonSelectorPath
        );
      }

      let cnt = 0;
      while (isNil(closeButton) && cnt < 10) {
        await delay(100);
        closeButton = iframeSelectorPath
          ? frameNode!.contentDocument!.querySelector(closeButtonSelectorPath)
          : document.documentElement.querySelector(closeButtonSelectorPath);
        cnt++;
      }

      if (isNil(closeButton)) return;

      closeButton.addEventListener('click', () => {
        resetState({ isActive: false });
      });
    },
    [resetState]
  );

  // 消息监听 - 同步反馈
  const syncResumeFeedbackReceiver = useCallback(() => {
    const listener = (msg: any) => {
      if (!isISyncResumeFeedbackMessage(msg)) return;

      console.debug('syncResumeReceiver', msg);
      resetState({
        isSynchronizingResume: false,
        isSynchronized: true,
        ...msg.payload,
      });
    };

    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [resetState]);

  // 消息监听 - 同步开始
  const syncResumeStartReceiver = useCallback(() => {
    const listener = (msg: any) => {
      if (!isISyncResumeStartMessage(msg)) return;

      console.info('syncResumeStartReceiver: ', msg);
      resetState(true, { requestId: msg.requestId });

      if (msg.payload.type !== 'other') {
        bindClickToMask(msg.payload.type, msg.payload.baseConfig);
        bindClickToCloseButton(msg.payload.type, msg.payload.baseConfig);
      }
    };

    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [resetState, bindClickToMask, bindClickToCloseButton]);

  // 拖拽事件处理
  const handleDragStart = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    resetState({ isDragging: true });
  }, [resetState]);

  const handleDragStop = useCallback(() => {
    resetState({ isDragging: false });
  }, [resetState]);

  // 鼠标按下事件处理
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLButtonElement;
      if (target.getAttribute('id') === 'ignoreSync') {
        resetState({ isActive: false });
        return;
      }

      timeoutRef.current = setTimeout(() => {
        handleClick();
      }, 300);
    },
    [resetState, handleClick]
  );

  // 组件初始化和清理
  useEffect(() => {
    // 设置消息监听器
    const cleanup1 = syncResumeFeedbackReceiver();
    const cleanup2 = syncResumeStartReceiver();

    // 监听环境变量变化
    const envSubscription = env$
      .pipe(filter(env => !!env))
      .subscribe((env: string | undefined) => {
        if (env) resetState({ env });
      });

    // 监听等待状态变化
    const waitSubscription = wait$.subscribe(waitState => {
      if (waitState) resetState({ wait: waitState.isSyncWait });
    });

    // 清理函数
    return () => {
      cleanup1?.();
      cleanup2?.();
      envSubscription.unsubscribe();
      waitSubscription.unsubscribe();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [syncResumeFeedbackReceiver, syncResumeStartReceiver, resetState]);

  // 如果组件未激活，不渲染
  if (!state.isActive) {
    console.log('未激活', state.isActive);
    return null;
  }

  return (
    <Draggable
      nodeRef={dragRef}
      axis="y"
      handle=".drag-handle"
      defaultPosition={{ x: 0, y: 0 }}
      grid={[1, 1]}
      onStart={handleDragStart}
      onStop={handleDragStop}
      bounds="body"
    >
      <div
        ref={dragRef}
        className={`mesoor-extension-root mesoor-extension-container mesoor-transition ${
          state.isDragging ? 'dragging' : ''
        } ${className || ''}`}
      >
        <div
          className={`mesoor-card drag-handle ${
            state.isDragging ? 'dragging' : ''
          }`}
          onClick={handleClick}
          onMouseDown={handleMouseDown}
        >
          {/* 图标区域 */}
          <div className="mesoor-icon-container">{getIcon()}</div>

          {/* 文本区域 */}
          <div className="mesoor-text">{getText()}</div>

          {/* 确认按钮区域 - 只在需要用户确认时显示 */}
          {!state.isConfirmSynchronize &&
            state.wait &&
            !state.isSynchronized && (
              <div className="mesoor-buttons">
                <button
                  className="mesoor-button mesoor-button-primary"
                  onClick={e => {
                    e.stopPropagation();
                    confirmSync();
                  }}
                >
                  好的
                </button>
                <button
                  id="ignoreSync"
                  className="mesoor-button mesoor-button-ghost"
                  onClick={e => {
                    e.stopPropagation();
                    resetState({ isActive: false });
                  }}
                >
                  忽略
                </button>
              </div>
            )}
        </div>
      </div>
    </Draggable>
  );
};
