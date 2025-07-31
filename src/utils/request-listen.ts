import browser, { Cookies, Runtime, WebRequest } from "webextension-polyfill";
import { fromEventPattern, Observable, Subscription } from "rxjs";
import { map, filter, share, tap, delay, withLatestFrom } from "rxjs/operators";
import { isNil } from "lodash-es";

export interface IFetchRequest {
  /**
   * @example: https://developer.mozilla.org
   */
  origin: string;
  /**
   * @example: https://rd5.zhaopin.com/api/custom/search/resumeListV2?_=1535510983922
   */
  url: string;
  /**
   * @example: POST
   */
  method: string;
  /**
   * @example: {
   *   x-custom-header: 'abc'
   * }
   */
  headers: { [name: string]: string };
  /**
   * @example: '{ "param": 1 }'
   */
  body: string | ArrayBuffer;
}

export interface IFetchResponse {
  req: IFetchRequest;
  /**
   * @example: 200 | 404 | 500
   */
  statusCode: number;
  /**
   * @example: {
   *   x-custom-header: 'abc'
   * }
   */
  headers: { [name: string]: string };
  /**
   * @example: '{ "param": 1 }'
   */
  body: string | ArrayBuffer;
  redirectedUrl?: string;
}

interface ResumeSyncErrorMessage {
  status: number;
  data: any;
}

export interface ResumeSyncErrorMessageWrapper {
  response: ResumeSyncErrorMessage;
}

export interface ResumeSyncCheckStruct {
  intervalSubInstances: Subscription[];
  isOver: boolean;
  isError: boolean;
  isClosed: boolean;
  errorMessage?: ResumeSyncErrorMessageWrapper;
}

export interface ResumeSyncCheckMap {
  [tabId: number]: ResumeSyncCheckStruct;
}

export interface ConnectionMap {
  [origin: string]: string;
}

export interface ISearchPrefillItem {
  condition: string;
  prefillWord: string;
  sessionKey: string;
}
export interface ISearchPrefill {
  // origin?: string,
  // method?: string,
  // headers?: { [name: string]: string },
  url: string;
  bodyParsed: {
    hashString: string;
    prefills: ISearchPrefillItem[];
    sessionStorageKey: string;
  };
  body: ArrayBuffer;
}

export interface IPositionPrefillItem {
  hjobId?: string;
  customerId?: string;
  bussinessName?: string;
  deptName?: string;
  deptId?: string;
  // 职位名称
  hjobTitle: string;
  ["hjobJobTitle[0]"]?: string;
  // 地区对应的code(部分平台是名称),单个传dq,有些平台只能选择一个地区
  // 各平台此参数传入的都不一样，猎聘:int类型id,前程无忧:string类型,例:'[["北京","东城区"], ["上海"]]',智联:没传这个
  dq?: string;
  // 地区对应的code(部分平台是名称)，多个传dqs,有些平台可以选择多个地区
  // 北极星:['北京', '安徽-合肥', '四川-成都'] 需要拆分开来选择
  // 大部分都是string[]类型，猎聘hr的是一个对象，[{cn:'河南省-石家庄-...', code: ..., en: ..., short: ...}]
  dqs?: string[];
  reportTo?: string;
  subordinateCnt?: string;
  // 薪资相关
  salaryMonthLow?: string;
  salaryMonthHigh?: string;
  salaryMonthNum?: string;
  jobHighlights?: string;
  ageLow?: string;
  ageHigh?: string;
  special?: string;
  // 学历对应的code(部分传入名称)
  eduLevelCode: string;
  eduLevelTz?: boolean;
  languageEnglish?: boolean;
  languageJapanese?: boolean;
  languageFrench?: boolean;
  languagePutong?: boolean;
  languageYueyu?: boolean;
  languageOther?: boolean;
  languageOtherContent?: string;
  // 正常language要求传这个参数，猎聘的是特殊的,不同网站传的不同
  // 前程:'[{'lang51': '其它', 'langOrigin': '母语'}]'(需要JSON.parse)
  languageRequire?: string;
  ["canSourceIndustry[0]"]?: string;
  ["canSourceIndustry[1]"]?: string;
  ["canSourceIndustry[2]"]?: string;
  ["canSourceIndustry[3]"]?: string;
  ["canSourceIndustry[4]"]?: string;
  // 职位描述
  detailDuty: string;
  ["skillTags[0]"]?: string;
  ["skillTags[1]"]?: string;
  ["skillTags[2]"]?: string;
  ["skillTags[3]"]?: string;
  ["skillTags[4]"]?: string;
  memo?: string;
  jobEmergencyLevelCode?: string;
  recruitReason?: string;
  searchDirection?: string;
  publish?: boolean;
  needPay?: boolean;
  hjobCloseDate?: string;
  privateJob?: boolean;
  filterApply?: boolean;
  inviteUsercEvaluate?: boolean;
  highSensitiveAgreement?: boolean;
  // 工作年限相关
  workYearLow?: string;
  workYearHigh?: string;
  // 如果年限是单个的话，传给workYear
  workYear?: string;
  // 职位性质相关
  employeesType?: string;
  // 专业需求相关,例:前程:"[{'交通运输类': 'EHRLayerCHK2608'}, {'计算机科学与技术类': 'EHRLayerCHK3702'}]"
  majorRequire?: string;
  // 过期时间(天数)
  expireDay?: string;
  // 传入选择器,需要JSON.parse一下,目前lagou使用这个
  selector?: string;
  // 猎聘企业端特用
  address?: string;
  // 邮箱参数,可能有多个，所以传过来一个json string,例:'[123@qq.com, 456@163.com]'
  email?: string;
  // 以下全是给智联rd5使用的,由于rd5字段和rd6不同，所以需要新增一些字段
  salaryMonthLowRd5?: string;
  salaryMonthHighRd5?: string;
  selectorRd5?: string;
  // 这个是新加的，为了增加一定后端的控制力
  waitTime?: number;
  headcount?: number;
  originData?: string;
  tenant?: string;
  listenedUrl?: string | string[];
  validateStrs?: string[];
}

export interface IPositionPrefill {
  url: string;
  bodyParsed: {
    hashString: string;
    data: IPositionPrefillItem;
  };
  body: ArrayBuffer;
  title?: string;
  shouldListen?: boolean;
}

export interface ISearchResumeItem {
  friendId?: number;
  friendSource?: number;
  encryptFriendId: string;
  name: string;
  updateTime?: number;
  selector?: string;
  waitTime?: number;
}

export interface ISearchResume {
  url: string;
  bodyParsed: {
    hashString: string;
    data: ISearchResumeItem;
  };
  body: ArrayBuffer;
  title?: string;
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
export type IViewResumeMessage = IMessage<
  "view-resume",
  { origin: string; html: string; url: string }
>;
export type IViewJobMessage = IMessage<
  "view-job",
  { origin: string; html: string; url: string; channel: string }
>;
export type IHistoryUpdate = IMessage<"history-update", { url: string }>;
export type IFetchRequestMessage = IMessage<"fetch", IFetchRequest>;
export type IFetchResponseMessage = IMessage<"fetch", IFetchResponse>;
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
export type ISearchPrefillMessage = IMessage<"search-prefill", ISearchPrefill>;
export type IPositionPrefillMessage = IMessage<
  "position-prefill",
  IPositionPrefill
>;
export type ISearchResumeMessage = IMessage<"search-resume", ISearchResume>;
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

// background返回给dupeCheck查重结果的message
export type IDupeCheckFeedbackMessage = IMessage<
  "dupe-check-feedback",
  {
    isDupeCheckError: boolean; // 简历查重出错
    dupeCheckResult?: boolean; // 简历查重返回的重复简历的openId
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
  socketHost: string;
  socketPath: string;
  syncResumeUrl: string;
  syncResumeResultCheckUrl: string;
  defaultAuthToken: string;
  dashboardUrl: string;
  connectionConfigUrl: string;
  declarativeNetRequestRulesUrl?: string;
  prefillUrl: string;
  avatarUrl?: string;
  downloadLatestVersionUrl?: string;
  refreshUrl: string;
  preprocessContentUrl?: string;
  processWuyouRequestInfoUrl?: string;
  popupUrl?: string;
}

export interface ExtraConfig {
  socketDisabled: boolean;
  popUpAvatar: boolean;
  dupcheckStylePath?: string;
  refreshEnabled?: boolean;
  autoSyncResume?: boolean;
}

// export interface BackGroundConfig {
//   apiConfig: ApiConfig
//   extraConfig: ExtraConfig
//   defaultTipUser?: TipUser
// }

// liepin 特殊用户在调用 https://h.liepin.com/resumeview/getresumedetailcoreview.json 请求之后 -> 调用 sync-receive-resume
export type ILiepinContactImgMessage = IMessage<"liepin-contact-img", {}>;

// Linkedin页面变化通知给dupeCheck -> dupeCheck根据type的信息来决定UI变化，如果是resume那就显示按钮，如果是other就隐藏按钮
export type ILinkedInPageChangeMessage = IMessage<
  "linkedin-page-change",
  { type: "resume" | "other" }
>;

// const onMessageExternal = browser.runtime.onMessageExternal
// export const messageExternal$: Observable<{ message: IMessage<string, {}>, sender: Runtime.MessageSender }> =
//   fromEventPattern(
//     onMessageExternal.addListener.bind(onMessageExternal),
//     onMessageExternal.removeListener.bind(onMessageExternal),
//     (message, sender: Runtime.MessageSender) => ({ message, sender })
//   )
//   .pipe(share())

const onMessage = browser.runtime.onMessage;
export const message$: Observable<{
  message: IMessage<string, {}>;
  sender: Runtime.MessageSender;
}> = fromEventPattern(
  onMessage.addListener.bind(onMessage),
  onMessage.removeListener.bind(onMessage),
  (message, sender: Runtime.MessageSender) => ({ message, sender })
).pipe(tap(), share());

const onCookieChange = browser.cookies.onChanged;
const cookiesChange$: Observable<Cookies.OnChangedChangeInfoType> =
  fromEventPattern<Cookies.OnChangedChangeInfoType>(
    onCookieChange.addListener.bind(onCookieChange),
    onCookieChange.removeListener.bind(onCookieChange)
  ).pipe(share());

// 把浏览器中的 webRequest.onHeadersReceived 等事件转换成 rxjs 的 Observable
export function install(urls: string[]) {
  const onHeadersReceived = browser.webRequest.onHeadersReceived;
  return fromEventPattern<WebRequest.OnHeadersReceivedDetailsType>(
    // tslint:disable-next-line:no-any
    (listen: any) =>
      onHeadersReceived.addListener(listen, {
        types: ["main_frame", "xmlhttprequest", "sub_frame"],
        urls,
      }),
    onHeadersReceived.removeListener.bind(onHeadersReceived)
  );
}

/**
 * 安装请求头监听器，监听匹配指定 URL 模式的网络请求，并可以修改请求头
 * @param urlPatterns 要监听的 URL 模式数组
 * @returns 返回一个 Observable，发出匹配的请求详情
 */
export function installOnBeforeSendHeaders(
  urlPatterns: string[]
): Observable<any> {
  return fromEventPattern(
    (handler) =>
      browser.webRequest.onBeforeSendHeaders.addListener(
        handler,
        { urls: urlPatterns },
        ["requestHeaders"]
      ),
    (handler) => browser.webRequest.onBeforeSendHeaders.removeListener(handler)
  ).pipe(share());
}

export function installOnBeforeRequest(urls: string[]) {
  const onBeforeRequest = browser.webRequest.onBeforeRequest;
  return fromEventPattern<WebRequest.OnBeforeRequestDetailsType>(
    (listener: any) =>
      onBeforeRequest.addListener(
        listener,
        { urls, types: ["main_frame", "xmlhttprequest", "sub_frame"] },
        ["requestBody"]
      ),
    onBeforeRequest.removeListener.bind(onBeforeRequest)
  );
}

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

// export const onViewZhaopinResumePage$ = fromEventPattern(
//   handler => browser.tabs.onUpdated.addListener(handler),
//   handler => browser.tabs.onUpdated.removeListener(handler)
// ).pipe(
//   filter(([tabId, changeInfo, tab]: [number, Tabs.OnUpdatedChangeInfoType, Tabs.Tab]) => {
//     const zhaopinRegexp = /^http(s)?:\/\/(rd6|rd5).zhaopin\.com\/resume\/detail\?(.+)/
//     const changeUrl = changeInfo.url
//     const currentTabUrl = tab.url
//     const eventByRefreshCurrentTab = !isNil(currentTabUrl) && zhaopinRegexp.test(currentTabUrl)
//     const eventByChangeToResumePage = !isNil(changeUrl) && zhaopinRegexp.test(changeUrl)
//     const isTabLoadedCompleted = changeInfo.status === 'complete'
//     return (eventByRefreshCurrentTab || eventByChangeToResumePage) && isTabLoadedCompleted
//   }),
// )

// 判断是否为领英-recruiterSearch发邮件页面
// export const linkedinRecruiterSearchResumeMailPage$ = fromEventPattern(
//   handler => browser.tabs.onUpdated.addListener(handler),
//   handler => browser.tabs.onUpdated.removeListener(handler)
// ).pipe(
//   filter(([tabId, changeInfo, tab]: [number, Tabs.OnUpdatedChangeInfoType, Tabs.Tab]) => {
//     // tslint:disable-next-line
//     const linkedinRegexp = /^https:\/\/www\.linkedin\.com\/talent\/profile\/[^\/?]+(\?.*?(&|\b)rightRail=composer(&|\b).*?)?$/;
//     // tslint:disable-next-line:max-line-length
//     const changeUrl = changeInfo.url
//     logger.info(changeUrl)
//     const currentTabUrl = tab.url
//     const eventByRefreshCurrentTab = !isNil(currentTabUrl) &&
//       linkedinRegexp.test(currentTabUrl)
//     const eventByChangeToResumePage = !isNil(changeUrl) &&
//       linkedinRegexp.test(changeUrl)
//     const isTabLoadedCompleted = changeInfo.status === 'complete'
//     const isTabChangedCompleted = tab.status === 'complete'
//     if ((eventByRefreshCurrentTab || eventByChangeToResumePage) && isTabLoadedCompleted && isTabChangedCompleted) {
//       logger.info('changeInfoTrigger', changeInfo);
//       logger.info('tabTrigger', tab);
//     }
//     return (eventByRefreshCurrentTab || eventByChangeToResumePage) && isTabLoadedCompleted && isTabChangedCompleted
//   }),
// )

// 判断是否为领英简历页面
// export const onViewLinkedinResumePage$ = fromEventPattern(
//   handler => browser.tabs.onUpdated.addListener(handler),
//   handler => browser.tabs.onUpdated.removeListener(handler)
// ).pipe(
//   filter(([tabId, changeInfo, tab]: [number, Tabs.OnUpdatedChangeInfoType, Tabs.Tab]) => {
//     // tslint:disable-next-line
//     const linkedinRegexp = /^https:\/\/www\.linkedin\.com\/in\/[^\/]+\/?$/;
//     // tslint:disable-next-line:max-line-length
//     // const linkedinResumePageRegexp = /(https|http):\/\/(www|cn)\.linkedin\.(com|cn)\/(injobs|incareer)\/in\/[^\/?]*?(\/.*)?/
//     const changeUrl = changeInfo.url
//     const currentTabUrl = tab.url
//     const eventByRefreshCurrentTab = !isNil(currentTabUrl) &&
//       linkedinRegexp.test(currentTabUrl)
//     const eventByChangeToResumePage = !isNil(changeUrl) &&
//       linkedinRegexp.test(changeUrl)

//     const isTabLoadedCompleted = changeInfo.status === 'complete'
//     const isTabChangedCompleted = tab.status === 'complete'
//     // tslint:disable-next-line:max-line-length
//     if ((eventByRefreshCurrentTab || eventByChangeToResumePage) && isTabLoadedCompleted && isTabChangedCompleted) {
//       logger.info('changeInfoTrigger', changeInfo);
//       logger.info('tabTrigger', tab);
//     }
//     return (eventByRefreshCurrentTab || eventByChangeToResumePage) && isTabLoadedCompleted && isTabChangedCompleted
//   }),
// )

// export const tabUpdate$ = fromEventPattern(
//   handler => browser.tabs.onUpdated.addListener(handler),
//   handler => browser.tabs.onUpdated.removeListener(handler)
// ).pipe(
//   filter(([tabId, _changeInfo, _tab]: [number, Tabs.OnUpdatedChangeInfoType, Tabs.Tab]) => !!tabId || tabId === 0),
//   map(([tabId, _changeInfo, _tab]: [number, Tabs.OnUpdatedChangeInfoType, Tabs.Tab]) => tabId)
// )

// export const tabRemoved$ = fromEventPattern(
//   handler => browser.tabs.onRemoved.addListener(handler),
//   handler => browser.tabs.onRemoved.removeListener(handler)
// ).pipe(
//   filter(([tabId, _removeInfo]: [number, Tabs.OnRemovedRemoveInfoType]) => !!tabId || tabId === 0),
//   map(([tabId, _removeInfo]: [number, Tabs.OnRemovedRemoveInfoType]) => tabId)
// )

// export const tabReplaced$ = fromEventPattern(
//   handler => browser.tabs.onReplaced.addListener(handler),
//   handler => browser.tabs.onReplaced.removeListener(handler)
// ).pipe(
//   filter(([_addedTabId, removedTabId]: [number, number]) => !!removedTabId || removedTabId === 0),
//   map(([_addedTabId, removedTabId]: [number, number]) => removedTabId)
// )
