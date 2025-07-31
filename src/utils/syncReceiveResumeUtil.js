import { isTabIdExists } from './tabCheck'
import { from, interval } from 'rxjs'
import { filter, switchMap, map, catchError, take } from 'rxjs/operators'

// import browser from 'webextension-polyfill';
// 抓取HTML简历
function liepinHeadhunterContect(html) {
    let telphone, email
  
    // 手机号的抓取
    telphone = document.querySelector('img.telphone')
    if (telphone) {
      // 老版的 liepin 界面，能够根据 img.telphone 选择出手机号码图片
      html = insertBase64(html, telphone, false, false)
    } else {
      // 新版的 liepin 界面，只能根据 img.connect-img 选择出联系方式图片
      // 然后再根据 sibling 上的 i 来判断是手机号还是邮箱
      document.querySelectorAll('img.connect-img').forEach(ele => {
        if (ele && ele.getAttribute('src') && /type=0/.test(ele.getAttribute('src'))) {
          // 由于图片 img 上的 src 属性在手机号和邮箱上是不同的
          html = insertBase64(html, ele, true, true)
        }
      })
    }
    // 邮箱的抓取
    email = document.querySelector('img.email')
    if (email) {
      html = insertBase64(html, email, false, false)
    } else {
      document.querySelectorAll('img.connect-img').forEach(ele => {
        if (ele && ele.getAttribute('src') && /type=1/.test(ele.getAttribute('src'))) {
          html = insertBase64(html, ele, true, false)
        }
      })
    }
    // logger.log('syncReceiveResume: liepinheadhunter html', html)
    return html
  }

// 全局函数定义
export const processHTML = async function() {
    let html = document.documentElement.outerHTML
    if (document.location.href.includes('h.liepin.com/resume/showresumedetail')) {
      // 点击「显示其他项目经历」按钮
      const button = document.querySelector('span.rd-info-other-link')
      if (button) {
        button.click()
        await window.delay(200)
        // 这里要重新获取 html
        html = liepinHeadhunterContect(document.documentElement.outerHTML)
        await window.delay(100)
        // 延迟100ms后滚动到最上面
        window.scrollTo(0, 0)
      } else {
        html = liepinHeadhunterContect(html)
      }
    }
    return html
  }
  // 用来实现等待检测
  // export const waitForSyncMessage = async (
  //   tabId, tabsObject, wait, requestId
  // ) => {
  //   if (wait) {
  //     const queryId = requestId || tabId
      
  //     try {
  //       // 检查标签页是否存在
  //       const tabExists = await isTabIdExists(tabId)
  //       if (!tabExists) {
  //         console.error('标签页不存在，无法显示确认弹窗')
  //         return false
  //       }
        
  //       // 将请求ID添加到tabsObject中
  //       tabsObject[queryId] = {
  //         timestamp: Date.now(),
  //         status: 'waiting'
  //       }
        
  //       // 直接发送消息到内容脚本，显示确认弹窗
  //       const response = await browser.tabs.sendMessage(tabId, {
  //         type: 'SHOW_RESUME_SYNC_CONFIRM',
  //         message: '是否同步此简历？',
  //         requestId: queryId
  //       })
        
  //       const confirmed = response && response.confirmed
        
  //       // 更新状态
  //       if (confirmed) {
  //         tabsObject[queryId] = {
  //           timestamp: Date.now(),
  //           status: 'confirmed'
  //         }
  //       }
        
  //       // 删除请求ID
  //       setTimeout(() => {
  //         delete tabsObject[queryId]
  //       }, 100)
        
  //       return confirmed
  //     } catch (error) {
  //       console.error('等待确认过程中出错:', error)
  //       delete tabsObject[queryId]
  //       return false
  //     }
  //   }
  //   return true
  // }


  export const waitForSyncMessage = async (
    tabId, tabsObject, wait, requestId
  ) => {
    if (wait) {
      const queryId = requestId || tabId
      return await new Promise(resolve => {
        const interval$ = interval(200)
          .pipe(
            switchMap(_ => from(isTabIdExists(tabId))),
            filter(isExist => queryId in tabsObject || !isExist)
          )
          .subscribe(isExist => {
            interval$.unsubscribe()
            delete tabsObject[queryId]
            resolve(isExist)
          })
      })
    }
    return true
  }