// tslint:disable:no-any
import { Runtime } from 'webextension-polyfill';

import {
  ISearchMessageFeedback,
  ISyncResumeStartMessage,
  ISyncResumeFeedbackMessage,
} from '../models/stream';

export function isISyncResumeStartMessage(
  msg: any
): msg is ISyncResumeStartMessage {
  return msg.type === 'sync-resume-start';
}

export function isISyncResumeFeedbackMessage(
  msg: any
): msg is ISyncResumeFeedbackMessage {
  return msg.type === 'sync-resume-feedback';
}

// 当用户点击确认同步简历时，content将这个消息发给bg
export function isConfirmSynchronizationMessage(
  msg: any
): msg is { message: ISearchMessageFeedback; sender: Runtime.MessageSender } {
  return msg.message.type === 'confirm-synchronize';
}

// 当页面符合配置主动采集HTML，content将这个消息发给bg
export function isSyncHtmlMessage(
  msg: any
): msg is { message: ISearchMessageFeedback; sender: Runtime.MessageSender } {
  return msg.message.type === 'sync-html';
}
