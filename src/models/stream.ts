import browser, {
  Cookies,
  Runtime,
} from "webextension-polyfill";
import { fromEventPattern, Observable } from "rxjs";
import { map, filter, share, tap } from "rxjs/operators";

interface ResumeSyncErrorMessage {
  status: number
  data: any
}

export interface ResumeSyncErrorMessageWrapper {
  response: ResumeSyncErrorMessage
}

export interface IMessage<TYPE extends string, P> {
  /**
   * @example: 493cf71f-26ea-451b-b8ad-39203d2abd9d
   */
  requestId: string;
  /**
   * @example: fetch | eval
   */
  type: TYPE;
  /**
   * @example: { ... }
   */
  payload: P;
  // tslint:disable-next-line:no-any
  reply?(response: any): void;
}

interface IEvalablePayload {
  /**
   * @example: 51job.com | zhaopin.com | global
   */
  ctx: string;
  /**
   * @example: (function (a,b,c) { ... })(1,2,3)
   */
  code: string;
}

interface IInitialStateRequest {}

interface IInitialStateResponse {
  [url: string]: number;
}

export type IResumeDownloadMessage = IMessage<"download", { origin: string }>;
export type SyncHtmlMessage = IMessage<
  "sync-html",
  { origin: string; html: string; url: string }
>;
export type IViewJobMessage = IMessage<
  "view-job",
  { origin: string; html: string; url: string; channel: string }
>;
export type IHistoryUpdate = IMessage<"history-update", { url: string }>;
export type IEvalableMessage = IMessage<"eval", IEvalablePayload>;
export type IEvalableReturnMessage = IMessage<"eval", Object>;
export type ILoginMessage = IMessage<
  "login",
  { origin: string; timestamp: number; url: string }
>;
export type IInitialStateRequestMessage = IMessage<
  "initLogin",
  IInitialStateRequest
>;
export type IInitialStateResponseMessage = IMessage<
  "initLogin",
  IInitialStateResponse
>;
export type msgPostPosition = IMessage<
  "post_position",
  { originData: string; origin: string; responseText?: string }
>;
export type IViewResumeEmailMessage = IMessage<
  "view-resume-send-mail",
  {
    url: string;
    company: string;
    jobdesc: string;
    consultant: string;
    tone: string;
    confidential: string;
  }
>;

export type CheckJobDesMessage = IMessage<
  "check-job-des",
  { language: string; location: string; jobdesc: string }
>;
// dashboardMessager收到dashboard用postMessage发来用户手动搜索的消息
// 然后发送ISearchMessage类型的消息给background
export type ISearchMessage = IMessage<
  "search",
  { searchWord: string; url: string }
>;

// background收到ISearchMessage之后发送ISearchMessageWithDashboardTabId给内容脚本search的message
export type ISearchMessageWithDashboardTabId = IMessage<
  "search-with-dashboard-tab-id",
  {
    searchWord: string;
    url: string;
    dashboardTabId: number; // dashboardTabId似乎可以通过tabs.query找到，之后也许可以把这个字段删掉
  }
>;

// search内容脚本返回给background的反馈消息以及background根据dashbaordTabId给dashboardMessager发送的消息
export type ISearchMessageFeedback = IMessage<
  "search-feedback",
  {
    isSuccess: boolean;
    dashboardTabId: number; // dashboardTabId似乎可以通过tabs.query找到，之后也许可以把这个字段删掉
    errorMsg?: string;
  }
>;

export type IReceiveZhaopinHTMLMessage = IMessage<
  "receive_zhaopin_html",
  Object
>;
export type InterviewWuyouChatMessage = IMessage<
  "interview_wuyou_chat_message",
  Object
>;
// 领英上同步简历时，background 向 syncReceiveResumeLinkedin 上发这种消息，用来获取页面的 html
export type IReceiveLinkedinHTMLMessage = IMessage<
  "receive_linkedin_html",
  Object
>;
export type IReceiveLiepinHTMLMessage = IMessage<"receive_liepin_html", Object>;

// dupeCheck发送给background开始查重的message
export type IDupeCheckTriggerMessage = IMessage<
  "dupe-check-trigger",
  {
    openId: string;
    tenant: string;
  }
>;

interface ISyncResumeBaseConfigSelectorDetail {
  selector: string;
  className?: string;
}

interface ISyncResumeBaseConfigSelector {
  maskSelectorPath: ISyncResumeBaseConfigSelectorDetail;
  closeButtonSelectorPath: ISyncResumeBaseConfigSelectorDetail;
  iframeSelectorPath?: ISyncResumeBaseConfigSelectorDetail;
}

export interface ISyncResumeBaseConfig {
  bindingSelector: ISyncResumeBaseConfigSelector;
}

// 通知dupeCheck开始手抓简历 -> dupeCheck按钮UI应该发生变化，现在一般用在lagou监听到json请求时
export type ISyncResumeStartMessage = IMessage<
  "sync-resume-start",
  {
    // tslint:disable-next-line:max-line-length
    type:
      | "lagou"
      | "other"
      | "shixiseng"
      | "bosszpRecommand"
      | "maimai"
      | "bosszpSearch"
      | "zhaopinRecommend"
      | "bossChat";
    baseConfig?: ISyncResumeBaseConfig;
  }
>;

// 手抓完成之后，给dupeCheck发送反馈 -> dupeCheck UI发生变化
export type ISyncResumeFeedbackMessage = IMessage<
  "sync-resume-feedback",
  {
    isSyncResumeError: boolean; // 手抓简历出错
    errorCode?: number; // 报错的错误码
    errorMessage?: string; // 报错的信息
    openId?: string;
    tenant?: string;
  }
>;

// 2022-04-18 职位刷新用接口
export type IRefreshJobMessage = IMessage<
  "refreshJob",
  {
    origin: string;
    account: string;
    title: string;
  }
>;

interface ISite {
  title: string;
  origin: string;
  account: string;
}

interface IRefreshError {
  statusCode: number;
  message: string;
}

interface IRefreshResponse {
  count: number;
}

export type IRefreshJobFeedBack = IMessage<
  "refreshJob-feedback",
  {
    site: ISite;
    loading: boolean;
    error?: IRefreshError;
    response: IRefreshResponse;
  }
>;

// 2022-03-09 这几个message都是给职位预填新版用的
interface IPrefillEventMessage {
  jobId: string;
  origin: string;
}

export interface IPrefillMessage {
  type: string;
  eventMessage: IPrefillEventMessage;
}

export type IPrefillFeedBackMessage = IMessage<
  "prefill-feedback",
  {
    isError: boolean;
    feedbackMessage: string;
  }
>;

interface PrefillConfig {
  displayName: string;
  value: string | string[];
  displayType: "input" | "arrayText" | "textarea";
  initialData: any;
}

export interface PrefillData {
  [field: string]: PrefillConfig;
}

export interface IPrefillData {
  url: string;
  data: PrefillData;
  type: string;
}

export interface ApiConfig {
  // socketHost: string,
  // socketPath: string,
  // syncResumeUrl: string,
  // syncResumeResultCheckUrl: string,
  // defaultAuthToken: string,
  // dashboardUrl: string,
  // connectionConfigUrl: string,
  declarativeNetRequestRulesUrl?: string;
  // prefillUrl: string,
  // avatarUrl?: string,
  // downloadLatestVersionUrl?: string
  // refreshUrl: string
  // preprocessContentUrl?: string
  // processWuyouRequestInfoUrl?: string,
  // popupUrl?: string
}

export interface ExtraConfig {
  socketDisabled: boolean;
  popUpAvatar: boolean;
  dupcheckStylePath?: string;
  refreshEnabled?: boolean;
  autoSyncResume?: boolean;
}

export interface BackGroundConfig {
  apiConfig: ApiConfig;
  extraConfig: ExtraConfig;
  // defaultTipUser?: TipUser
}

// liepin 特殊用户在调用 https://h.liepin.com/resumeview/getresumedetailcoreview.json 请求之后 -> 调用 sync-receive-resume
export type ILiepinContactImgMessage = IMessage<"liepin-contact-img", {}>;

// Linkedin页面变化通知给dupeCheck -> dupeCheck根据type的信息来决定UI变化，如果是resume那就显示按钮，如果是other就隐藏按钮
export type ILinkedInPageChangeMessage = IMessage<
  "linkedin-page-change",
  { type: "resume" | "other" }
>;

const onMessage = browser.runtime.onMessage;
export const message$: Observable<{
  message: IMessage<string, {}>;
  sender: Runtime.MessageSender;
}> = fromEventPattern(
  onMessage.addListener.bind(onMessage),
  onMessage.removeListener.bind(onMessage),
  (message, sender: Runtime.MessageSender) => ({ message, sender })
).pipe(
  tap((msg) => console.log("message$ send", msg)),
  share()
);

const onCookieChange = browser.cookies.onChanged;
const cookiesChange$: Observable<Cookies.OnChangedChangeInfoType> =
  fromEventPattern<Cookies.OnChangedChangeInfoType>(
    onCookieChange.addListener.bind(onCookieChange),
    onCookieChange.removeListener.bind(onCookieChange)
  ).pipe(share());

export function onCookiesChange$(domain: string): Observable<Cookies.Cookie> {
  return cookiesChange$.pipe(
    filter((info) => info.cookie.domain === domain),
    map((info) => info.cookie)
  );
}

export function getSpecifyDomainCookiesChange(
  domain: string
): Observable<Cookies.OnChangedChangeInfoType> {
  return cookiesChange$.pipe(
    filter((changeInfo) => changeInfo.cookie.domain === domain)
  );
}
