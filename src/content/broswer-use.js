import browser from 'webextension-polyfill';

// 监听来自background的消息
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log(message);
  if (message.action) {
    switch (message.action) {
      case 'ping':
        sendResponse({ success: true });
        return true;
      case 'ScrollAction':
        const scrollResult = scrollPage(message);
        sendResponse(scrollResult);
        break;
      case 'ClickElementAction':
        const clickResult = simulateClick(message.xpath);
        sendResponse(clickResult);
        break;
      case 'SendKeyAction':
        const inputResult = simulateInput(message.xpath, message.value);
        sendResponse(inputResult);
        break;
      case 'GetDomTreeAction':
        const domTree = getDomTree();
        sendResponse(domTree);
        break;
      case 'HighlightElementsAction':
        const highlightResult = highlightElements(true);
        console.log(highlightResult);
        sendResponse(highlightResult);
        break;
      case 'RemoveHighlightAction':
        const removeHighlightResult = highlightElements(false);
        console.log('Removing highlights:', removeHighlightResult);
        sendResponse(removeHighlightResult);
        break;
      case 'ClearKeyAction':
        const clearResult = clearKey(message);
        sendResponse(clearResult);
        break;
      case 'KeypressAction':
        const keypressResult = simulateKeypress(message);
        sendResponse(keypressResult);
        break;
      default:
        console.warn('未知的消息类型:', {
          action: message.action,
          message: message,
        });
        sendResponse({
          success: false,
          error: `不支持的消息类型: ${message.action}`,
        });
    }
  } else {
    switch (message.type) {
      case 'receive_html':
        await window.delay(2000);
        const html = await window.processHTML();
        console.log('成功获取 HTML, 长度:', html.length);
        return {
          html,
          url: location.href,
          origin: location.origin,
        };
    }
  }
  return true;
});

// 检查元素是否可点击
function isClickable(element) {
  if (!element) return false;

  // 检查元素是否可见
  const style = window.getComputedStyle(element);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0'
  ) {
    return false;
  }

  // 检查元素是否启用
  if (element.disabled) {
    return false;
  }

  // 检查元素是否在视口内
  const rect = element.getBoundingClientRect();
  if (
    rect.right < 0 ||
    rect.bottom < 0 ||
    rect.left > window.innerWidth ||
    rect.top > window.innerHeight
  ) {
    return false;
  }

  // 检查元素是否被遮挡
  // 不需要检测遮挡：
  // 如果被遮挡就让他冒泡上去
  // const centerX = rect.left + rect.width / 2;
  // const centerY = rect.top + rect.height / 2;
  // const elementAtPoint = document.elementFromPoint(centerX, centerY);
  // if (!element.contains(elementAtPoint) && elementAtPoint !== element) {
  //     return false;
  // }

  return true;
}

// 查找最近的可点击父节点
function findClickableParent(element) {
  let currentElement = element;
  const maxDepth = 5; // 最多向上查找5层父节点
  let depth = 0;

  while (currentElement && depth < maxDepth) {
    if (isClickable(currentElement)) {
      return currentElement;
    }
    currentElement = currentElement.parentElement;
    depth++;
  }

  return null;
}

// 模拟点击
function simulateClick(xpath) {
  const element = getElementByXPath(xpath);
  if (!element) {
    console.warn('找不到要点击的元素:', {
      xpath: xpath,
      url: window.location.href,
      title: document.title,
    });
    return {
      success: false,
      error: `元素不存在: ${xpath}`,
    };
  }

  // 检查元素是否可点击，如果不可点击则查找可点击的父节点
  let targetElement = isClickable(element)
    ? element
    : findClickableParent(element);

  if (!targetElement) {
    return {
      success: false,
      error: `找不到可点击的元素或父节点: ${xpath}`,
    };
  }

  try {
    // 获取整个select组件
    const selectComponent = targetElement.closest('.ant-select');
    if (selectComponent) {
      console.log('检测到Select组件');
      const pos = selectComponent.getBoundingClientRect();

      // 计算点击位置（中心偏右上）
      const clickX = pos.left + pos.width * 0.75;
      const clickY = pos.top + pos.height * 0.25;

      // 1. 先触发Select组件的点击事件
      ['mouseenter', 'mouseover', 'mousedown', 'mouseup', 'click'].forEach(
        eventType => {
          const mouseEvent = new MouseEvent(eventType, {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: clickX,
            clientY: clickY,
          });
          selectComponent.dispatchEvent(mouseEvent);
        }
      );

      // 2. 聚焦到输入框
      element.focus();

      // 3. 模拟输入框的点击
      ['mousedown', 'mouseup', 'click'].forEach(eventType => {
        const mouseEvent = new MouseEvent(eventType, {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: clickX,
          clientY: clickY,
        });
        element.dispatchEvent(mouseEvent);
      });

      return { success: true };
    }

    // 如果不是Select组件，直接点击
    element.focus();
    // 依次派发 mousedown → mouseup → click 事件
    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
      const event = new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window,
      });
      element.dispatchEvent(event);
    });
    return { success: true };
  } catch (error) {
    console.error('点击元素时出错:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// 模拟输入
async function simulateInput(xpath, text) {
  try {
    const element = getElementByXPath(xpath);
    if (!element) {
      console.warn('找不到要输入的元素:', {
        xpath: xpath,
        text: text,
        url: window.location.href,
        title: document.title,
      });
      return {
        success: false,
        error: `元素不存在: ${xpath}`,
      };
    }

    // 检查是否是Ant Design的Select组件
    const isAntSelect =
      element.classList &&
      (element.classList.contains('ant-select-selection-search-input') ||
        (element.id && element.id.startsWith('rc_select')));

    const selectRoot = isAntSelect
      ? element.closest('.ant-select') || element.parentElement
      : null;

    console.log('元素信息:', {
      tagName: element.tagName,
      id: element.id,
      className: element.className,
      isAntSelect: isAntSelect,
      selectRoot: selectRoot ? selectRoot.className : null,
    });

    // 如果是Ant Design Select组件
    if (isAntSelect && selectRoot) {
      console.log('检测到Ant Design Select组件，使用特殊处理');

      // 1. 先点击打开Select组件
      const rect = selectRoot.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // 模拟点击打开下拉框
      ['mouseenter', 'mouseover', 'mousedown', 'mouseup', 'click'].forEach(
        eventType => {
          const mouseEvent = new MouseEvent(eventType, {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: centerX,
            clientY: centerY,
          });
          selectRoot.dispatchEvent(mouseEvent);
        }
      );

      // 等待下拉框打开
      await new Promise(resolve => setTimeout(resolve, 500));

      // 2. 聚焦元素
      element.focus();

      // 3. 清空当前值
      element.value = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));

      // 4. 直接设置完整文本
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));

      // 5. 触发变更事件
      element.dispatchEvent(new Event('change', { bubbles: true }));

      // 6. 等待下拉选项加载
      await new Promise(resolve => setTimeout(resolve, 10));

      // 7. 模拟回车键确认选择
      // 当确认选择时会导致页面执行「搜索候选人」操作，影响整个动作流处理时间，直接去掉了
      // element.dispatchEvent(new KeyboardEvent('keydown', {
      //     key: 'Enter',
      //     code: 'Enter',
      //     keyCode: 13,
      //     which: 13,
      //     bubbles: true
      // }));

      // 8. 等待选择完成
      await new Promise(resolve => setTimeout(resolve, 10));

      // 9. 按ESC键关闭下拉框
      element.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          which: 27,
          bubbles: true,
        })
      );

      // 10. 点击其他地方关闭下拉框
      document.body.click();

      // 11. 再等待一小段时间，让下拉框动画完成
      await new Promise(resolve => setTimeout(resolve, 5));

      console.log('Select组件输入完成:', text);
    } else {
      // 对于普通输入元素的处理
      console.log('处理普通输入元素');

      // 1. 聚焦元素
      element.focus();

      // 2. 设置值
      if (element.isContentEditable) {
        element.innerText = text;
      } else if (
        element.tagName === 'INPUT' ||
        element.tagName === 'TEXTAREA'
      ) {
        element.value = text;
      } else {
        console.warn('不支持的输入类型:', element.tagName);
        return {
          success: false,
          error: `不支持的输入类型: ${element.tagName}`,
        };
      }

      // 3. 触发完整的输入事件序列
      ['input', 'change'].forEach(eventType => {
        element.dispatchEvent(new Event(eventType, { bubbles: true }));
      });

      // 4. 等待API请求完成
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return {
      success: true,
      element: {
        tagName: element.tagName,
        id: element.id,
        className: element.className,
        value: element.value || text,
      },
    };
  } catch (error) {
    console.error('输入操作失败:', {
      xpath: xpath,
      text: text,
      error: error.message,
      url: window.location.href,
      title: document.title,
    });
    return {
      success: false,
      error: error.message,
    };
  }
}

function highlightElements(
  // 用来高亮的参数从 browser-use改出来的变量
  doHighlightElements = false
) {
  let highlightIndex = -1; // 不特别聚焦任何元素

  function highlightElement(element, index, parentIframe = null) {
    // Create or get highlight container
    let container = document.getElementById('playwright-highlight-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'playwright-highlight-container';
      container.style.position = 'fixed';
      container.style.pointerEvents = 'none';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.zIndex = '2147483647'; // Maximum z-index value
      document.documentElement.appendChild(container);
    }

    // Generate a color based on the index
    const colors = [
      '#FF0000',
      '#00FF00',
      '#0000FF',
      '#FFA500',
      '#800080',
      '#008080',
      '#FF69B4',
      '#4B0082',
      '#FF4500',
      '#2E8B57',
      '#DC143C',
      '#4682B4',
    ];
    const colorIndex = index % colors.length;
    const baseColor = colors[colorIndex];
    const backgroundColor = `${baseColor}1A`; // 10% opacity version of the color

    // Create highlight overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.border = `2px solid ${baseColor}`;
    overlay.style.backgroundColor = backgroundColor;
    overlay.style.pointerEvents = 'none';
    overlay.style.boxSizing = 'border-box';

    // Position overlay based on element
    const rect = element.getBoundingClientRect();
    let top = rect.top;
    let left = rect.left;

    // Adjust position if element is inside an iframe
    if (parentIframe) {
      const iframeRect = parentIframe.getBoundingClientRect();
      top += iframeRect.top;
      left += iframeRect.left;
    }

    overlay.style.top = `${top}px`;
    overlay.style.left = `${left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    // Create label
    const label = document.createElement('div');
    label.className = 'playwright-highlight-label';
    label.style.position = 'absolute';
    label.style.background = baseColor;
    label.style.color = 'white';
    label.style.padding = '1px 4px';
    label.style.borderRadius = '4px';
    label.style.fontSize = `${Math.min(12, Math.max(8, rect.height / 2))}px`; // Responsive font size
    label.textContent = index;

    // Calculate label position
    const labelWidth = 20; // Approximate width
    const labelHeight = 16; // Approximate height

    // Default position (top-right corner inside the box)
    let labelTop = top + 2;
    let labelLeft = left + rect.width - labelWidth - 2;

    // Adjust if box is too small
    if (rect.width < labelWidth + 4 || rect.height < labelHeight + 4) {
      // Position outside the box if it's too small
      labelTop = top - labelHeight - 2;
      labelLeft = left + rect.width - labelWidth;
    }

    // Ensure label stays within viewport
    if (labelTop < 0) labelTop = top + 2;
    if (labelLeft < 0) labelLeft = left + 2;
    if (labelLeft + labelWidth > window.innerWidth) {
      labelLeft = left + rect.width - labelWidth - 2;
    }

    label.style.top = `${labelTop}px`;
    label.style.left = `${labelLeft}px`;

    // Add to container
    container.appendChild(overlay);
    container.appendChild(label);

    // Store reference for cleanup
    element.setAttribute(
      'browser-user-highlight-id',
      `playwright-highlight-${index}`
    );

    return index + 1;
  }

  // 移除所有高亮效果
  function removeHighlight() {
    const container = document.getElementById('playwright-highlight-container');
    if (container) {
      container.remove();
    }
    // 清除所有元素上的 highlight-id 属性
    const highlightedElements = document.querySelectorAll(
      '[browser-user-highlight-id]'
    );
    highlightedElements.forEach(element => {
      element.removeAttribute('browser-user-highlight-id');
    });
  }

  // Helper function to generate XPath as a tree
  function getXPathTree(element, stopAtBoundary = true) {
    const segments = [];
    let currentElement = element;

    while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE) {
      // Stop if we hit a shadow root or iframe
      if (
        stopAtBoundary &&
        (currentElement.parentNode instanceof ShadowRoot ||
          currentElement.parentNode instanceof HTMLIFrameElement)
      ) {
        break;
      }

      let index = 0;
      let sibling = currentElement.previousSibling;
      while (sibling) {
        if (
          sibling.nodeType === Node.ELEMENT_NODE &&
          sibling.nodeName === currentElement.nodeName
        ) {
          index++;
        }
        sibling = sibling.previousSibling;
      }

      const tagName = currentElement.nodeName.toLowerCase();
      const xpathIndex = index > 0 ? `[${index + 1}]` : '';
      segments.unshift(`${tagName}${xpathIndex}`);

      currentElement = currentElement.parentNode;
    }

    return segments.join('/');
  }

  // Helper function to check if element is accepted
  // 排除一些图片或者脚本的节点
  // 黑名单
  function isElementAccepted(element) {
    const leafElementDenyList = new Set([
      'svg',
      'script',
      'style',
      'link',
      'meta',
    ]);
    return !leafElementDenyList.has(element.tagName.toLowerCase());
  }

  // Helper function to check if element is interactive
  function isInteractiveElement(element) {
    // Base interactive elements and roles
    const interactiveElements = new Set([
      'a',
      'button',
      'details',
      'embed',
      'input',
      'label',
      'menu',
      'menuitem',
      'object',
      'select',
      'textarea',
      'summary',
    ]);

    const interactiveRoles = new Set([
      'button',
      'menu',
      'menuitem',
      'link',
      'checkbox',
      'radio',
      'slider',
      'tab',
      'tabpanel',
      'textbox',
      'combobox',
      'grid',
      'listbox',
      'option',
      'progressbar',
      'scrollbar',
      'searchbox',
      'switch',
      'tree',
      'treeitem',
      'spinbutton',
      'tooltip',
      'a-button-inner',
      'a-dropdown-button',
      'click',
      'menuitemcheckbox',
      'menuitemradio',
      'a-button-text',
      'button-text',
      'button-icon',
      'button-icon-only',
      'button-text-icon-only',
      'dropdown',
      'combobox',
    ]);

    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute('role');
    const ariaRole = element.getAttribute('aria-role');
    const tabIndex = element.getAttribute('tabindex');

    // Basic role/attribute checks
    const hasInteractiveRole =
      interactiveElements.has(tagName) ||
      interactiveRoles.has(role) ||
      interactiveRoles.has(ariaRole) ||
      (tabIndex !== null && tabIndex !== '-1') ||
      element.getAttribute('data-action') === 'a-dropdown-select' ||
      element.getAttribute('data-action') === 'a-dropdown-button';

    if (hasInteractiveRole) return true;

    // Get computed style
    const style = window.getComputedStyle(element);

    // Check if element has click-like styling
    // const hasClickStyling = style.cursor === 'pointer' ||
    //     element.style.cursor === 'pointer' ||
    //     style.pointerEvents !== 'none';

    // Check for event listeners
    const hasClickHandler =
      element.onclick !== null ||
      element.getAttribute('onclick') !== null ||
      element.hasAttribute('ng-click') ||
      element.hasAttribute('@click') ||
      element.hasAttribute('v-on:click');

    // Helper function to safely get event listeners
    function getEventListeners(el) {
      try {
        // Try to get listeners using Chrome DevTools API
        return window.getEventListeners?.(el) || {};
      } catch (e) {
        // Fallback: check for common event properties
        const listeners = {};

        // List of common event types to check
        const eventTypes = [
          'click',
          'mousedown',
          'mouseup',
          'touchstart',
          'touchend',
          'keydown',
          'keyup',
          'focus',
          'blur',
        ];

        for (const type of eventTypes) {
          const handler = el[`on${type}`];
          if (handler) {
            listeners[type] = [
              {
                listener: handler,
                useCapture: false,
              },
            ];
          }
        }

        return listeners;
      }
    }

    // Check for click-related events on the element itself
    const listeners = getEventListeners(element);
    const hasClickListeners =
      listeners &&
      (listeners.click?.length > 0 ||
        listeners.mousedown?.length > 0 ||
        listeners.mouseup?.length > 0 ||
        listeners.touchstart?.length > 0 ||
        listeners.touchend?.length > 0);

    // Check for ARIA properties that suggest interactivity
    const hasAriaProps =
      element.hasAttribute('aria-expanded') ||
      element.hasAttribute('aria-pressed') ||
      element.hasAttribute('aria-selected') ||
      element.hasAttribute('aria-checked');

    // Check for form-related functionality
    const isFormRelated =
      element.form !== undefined ||
      element.hasAttribute('contenteditable') ||
      style.userSelect !== 'none';

    // Check if element is draggable
    const isDraggable =
      element.draggable || element.getAttribute('draggable') === 'true';

    return (
      hasAriaProps ||
      // hasClickStyling ||
      hasClickHandler ||
      hasClickListeners ||
      // isFormRelated ||
      isDraggable
    );
  }

  // Helper function to check if element is visible
  function isElementVisible(element) {
    const style = window.getComputedStyle(element);
    return (
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      style.opacity !== '0' &&
      element.offsetWidth > 0 &&
      element.offsetHeight > 0
    );
  }

  // Helper function to check if element is in viewport
  function isElementInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <=
        (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  // Helper function to check if element is the top element at its position
  function isTopElement(element) {
    // Find the correct document context and root element
    let doc = element.ownerDocument;

    // If we're in an iframe, elements are considered top by default
    if (doc !== window.document) {
      return true;
    }

    // For shadow DOM, we need to check within its own root context
    const shadowRoot = element.getRootNode();
    if (shadowRoot instanceof ShadowRoot) {
      const rect = element.getBoundingClientRect();
      const point = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };

      try {
        // Use shadow root's elementFromPoint to check within shadow DOM context
        const topEl = shadowRoot.elementFromPoint(point.x, point.y);
        if (!topEl) return false;

        // Check if the element or any of its parents match our target element
        let current = topEl;
        while (current && current !== shadowRoot) {
          if (current === element) return true;
          current = current.parentElement;
        }
        return false;
      } catch (e) {
        return true; // If we can't determine, consider it visible
      }
    }

    // Regular DOM elements
    const rect = element.getBoundingClientRect();
    const point = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };

    try {
      const topEl = document.elementFromPoint(point.x, point.y);
      if (!topEl) return false;

      let current = topEl;
      while (current && current !== document.documentElement) {
        if (current === element) return true;
        current = current.parentElement;
      }
      return false;
    } catch (e) {
      return true;
    }
  }

  // Helper function to check if text node is visible
  function isTextNodeVisible(textNode) {
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const rect = range.getBoundingClientRect();

    return (
      rect.width !== 0 &&
      rect.height !== 0 &&
      rect.top >= 0 &&
      rect.top <= window.innerHeight &&
      textNode.parentElement?.checkVisibility({
        checkOpacity: true,
        checkVisibilityCSS: true,
      })
    );
  }

  // Function to traverse the DOM and create nested JSON
  function buildDomTree(node, parentIframe = null) {
    if (!node) return null;

    // Special case for text nodes
    // 只有文本，没有标签
    if (node.nodeType === Node.TEXT_NODE) {
      const textContent = node.textContent.trim();
      if (textContent && isTextNodeVisible(node)) {
        return {
          type: 'TEXT_NODE',
          text: textContent,
          isVisible: true,
        };
      }
      return null;
    }

    // Check if element is accepted
    // 黑名单 是不是普通节点
    if (node.nodeType === Node.ELEMENT_NODE && !isElementAccepted(node)) {
      return null;
    }
    // data
    const nodeData = {
      tagName: node.tagName ? node.tagName.toLowerCase() : null,
      attributes: {},
      xpath:
        node.nodeType === Node.ELEMENT_NODE ? getXPathTree(node, true) : null,
      children: [],
    };

    // Copy all attributes if the node is an element
    // 把其余的元素属性都拿过来
    if (node.nodeType === Node.ELEMENT_NODE && node.attributes) {
      // Use getAttributeNames() instead of directly iterating attributes
      const attributeNames = node.getAttributeNames?.() || [];
      for (const name of attributeNames) {
        nodeData.attributes[name] = node.getAttribute(name);
      }
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      // 可交互
      const isInteractive = isInteractiveElement(node);
      // 可见（不管是否在视口内）
      const isVisible = isElementVisible(node);
      // 是否在视口内
      const isInViewport = isElementInViewport(node);
      // 无遮挡
      const isTop = isTopElement(node);

      nodeData.isInteractive = isInteractive;
      nodeData.isVisible = isVisible;
      nodeData.isInViewport = isInViewport;
      nodeData.isTopElement = isTop;

      // 只要元素可交互且可见就高亮，不管是否在视口内
      if (isInteractive && isVisible && isTop) {
        nodeData.highlightIndex = highlightIndex++;
        // 高亮索引
        if (doHighlightElements) {
          highlightElement(node, nodeData.highlightIndex, parentIframe);
        } else {
          removeHighlight();
        }
      }
    }

    // Only add iframeContext if we're inside an iframe
    // if (parentIframe) {
    //     nodeData.iframeContext = `iframe[src="${parentIframe.src || ''}"]`;
    // }

    // Only add shadowRoot field if it exists
    // 封装自己的 DOM 树
    if (node.shadowRoot) {
      nodeData.shadowRoot = true;
    }

    // Handle shadow DOM
    if (node.shadowRoot) {
      const shadowChildren = Array.from(node.shadowRoot.childNodes).map(child =>
        buildDomTree(child, parentIframe)
      );
      nodeData.children.push(...shadowChildren);
    }

    // Handle iframes
    if (node.tagName === 'IFRAME') {
      try {
        const iframeDoc = node.contentDocument || node.contentWindow.document;
        if (iframeDoc) {
          const iframeChildren = Array.from(iframeDoc.body.childNodes).map(
            child => buildDomTree(child, node)
          );
          nodeData.children.push(...iframeChildren);
        }
      } catch (e) {
        console.warn('Unable to access iframe:', node);
      }
    } else {
      const children = Array.from(node.childNodes).map(child =>
        buildDomTree(child, parentIframe)
      );
      nodeData.children.push(...children);
    }

    return nodeData;
  }

  const originalHTML = document.documentElement.outerHTML;
  const domTree = buildDomTree(document.body);
  return {
    domTree: domTree,
    originalHTML: originalHTML,
  };
}

function clearKey(message) {
  try {
    const element = getElementByXPath(message.xpath);
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      element.value = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      element.textContent = '';
    }
  } catch (error) {
    console.error('clearKey error:', error);
  }
}
function getElementByXPath(xpath) {
  return document.evaluate(
    xpath,
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  ).singleNodeValue;
}

// 模拟按键操作
function simulateKeypress(options) {
  try {
    // 支持的按键映射
    const keyMap = {
      enter: { key: 'Enter', code: 'Enter', keyCode: 13 }, // 回车键：表单提交、确认操作
      esc: { key: 'Escape', code: 'Escape', keyCode: 27 }, // ESC键：取消操作、关闭弹窗
      escape: { key: 'Escape', code: 'Escape', keyCode: 27 }, // Escape键：同上，兼容写法
      tab: { key: 'Tab', code: 'Tab', keyCode: 9 }, // Tab键：切换焦点
      space: { key: ' ', code: 'Space', keyCode: 32 }, // 空格键：选择项、滚动页面
      backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 }, // 退格键：删除前一个字符
      delete: { key: 'Delete', code: 'Delete', keyCode: 46 }, // 删除键：删除后一个字符
      arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 }, // 向上箭头：上移选择、滚动
      arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }, // 向下箭头：下移选择、滚动
      arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 }, // 向左箭头：左移光标
      arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 }, // 向右箭头：右移光标
    };

    // 确定目标元素
    let targetElement;
    if (options.data.xpath) {
      targetElement = getElementByXPath(options.data.xpath);
      if (!targetElement) {
        console.warn('找不到要操作的元素:', {
          xpath: options.data.xpath,
          url: window.location.href,
          title: document.title,
        });
        return {
          success: false,
          error: `元素不存在: ${options.xpath}`,
        };
      }
    } else {
      // 如果没有指定元素，则使用当前聚焦的元素或文档
      targetElement = document.activeElement || document;
    }

    // 确定要模拟的按键
    const keyName = (options.data.key || '').toLowerCase();
    const keyInfo = keyMap[keyName];

    if (!keyInfo) {
      console.warn('不支持的按键类型:', keyName);
      return {
        success: false,
        error: `不支持的按键类型: ${keyName}`,
      };
    }

    // 可选的修饰键
    const modifiers = {
      ctrlKey: options.ctrl || false,
      altKey: options.alt || false,
      shiftKey: options.shift || false,
      metaKey: options.meta || false,
    };

    // 聚焦元素（如果指定了元素）
    if (options.xpath) {
      targetElement.focus();
    }

    // 创建并分发键盘事件序列
    const eventTypes = ['keydown', 'keypress', 'keyup'];

    eventTypes.forEach(eventType => {
      // keypress 事件在某些按键上不会触发
      if (
        eventType === 'keypress' &&
        [
          'Tab',
          'Escape',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
        ].includes(keyInfo.key)
      ) {
        return;
      }

      const keyEvent = new KeyboardEvent(eventType, {
        key: keyInfo.key,
        code: keyInfo.code,
        keyCode: keyInfo.keyCode,
        which: keyInfo.keyCode,
        bubbles: true,
        cancelable: true,
        ...modifiers,
      });

      targetElement.dispatchEvent(keyEvent);
    });

    // 处理特殊按键的默认行为
    if (
      keyName === 'enter' &&
      targetElement.form &&
      targetElement.type !== 'textarea'
    ) {
      // 如果是表单中的输入框，回车可能需要提交表单
      console.log('检测到表单元素的回车键，可能需要提交表单');
    } else if (
      keyName === 'space' &&
      (targetElement.tagName === 'BUTTON' || targetElement.role === 'button')
    ) {
      // 如果是按钮，空格键可能需要触发点击
      targetElement.click();
    }

    return { success: true };
  } catch (error) {
    console.error('模拟按键时出错:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// 滚动页面到指定位置或元素
function scrollPage(options) {
  try {
    console.log('scrollPage', options);

    let scrollSuccess = false;

    if (options.xpath) {
      // 滚动到指定元素
      const element = getElementByXPath(options.xpath);
      if (!element) {
        return { success: false, message: '未找到指定元素' };
      }

      // 使用平滑滚动到元素位置
      element.scrollIntoView({
        behavior: options.smooth ? 'smooth' : 'auto',
        block: 'center',
      });

      scrollSuccess = true;
    } else if (options.positionX && options.positionY) {
      // 滚动到指定坐标
      window.scrollTo({
        top: options.positionY,
        left: options.positionX,
        behavior: options.smooth ? 'smooth' : 'auto',
      });

      scrollSuccess = true;
    } else if (options.bottom) {
      // 滚动到页面底部
      window.scrollTo({
        top:
          (document.documentElement.scrollHeight ||
            document.body.scrollHeight) - window.innerHeight,
        behavior: options.smooth ? 'smooth' : 'auto',
      });

      scrollSuccess = true;
    } else if (options.top) {
      // 滚动到页面顶部
      window.scrollTo({
        top: 0,
        behavior: options.smooth ? 'smooth' : 'auto',
      });

      scrollSuccess = true;
    } else if (options.scrollViewport) {
      // 滚动一个视窗高度
      const direction = options.scrollViewport === 'up' ? -1 : 1; // 向上为-1，向下为1
      window.scrollBy({
        top: window.innerHeight * direction,
        behavior: options.smooth ? 'smooth' : 'auto',
      });

      scrollSuccess = true;
    }

    return {
      success: scrollSuccess,
      message: scrollSuccess ? '滚动完成' : '未指定滚动目标',
      ...(scrollSuccess && {
        position: {
          x: window.scrollX,
          y: window.scrollY,
        },
      }),
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
}
// 抓取HTML简历

// browser.runtime.onMessage.addListener(async (message, sender) => {
//   console.warn('收到消息:', message.type)
//   if (message.type === 'receive_html') {
//     console.log('开始处理 HTML 抓取')
//     try {
//       await window.delay(2000)
//       const html = await window.processHTML()
//       console.log('成功获取 HTML, 长度:', html.length)
//       return {
//         html,
//         url: location.href,
//         origin: location.origin,
//       }
//     } catch (error) {
//       console.error('处理 HTML 时出错:', error)
//       return { error: error.message }
//     }
//   } else {
//     return
//   }
// })
