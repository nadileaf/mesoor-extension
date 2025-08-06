/**
 * 递归查找JSON对象中指定key的值
 * @param obj 要搜索的JSON对象
 * @param key 要查找的键名
 * @returns 如果找到键，则返回对应的值；否则返回undefined
 */
function findValueByKey(obj: any, key: string): any {
  // 基本情况：如果obj不是对象或为null，则无法继续搜索
  if (obj === null || typeof obj !== 'object') {
    return undefined;
  }

  // 检查当前对象是否包含目标key
  if (Object.prototype.hasOwnProperty.call(obj, key)) {
    return obj[key];
  }

  // 递归搜索对象的所有属性
  for (const k in obj) {
    // 跳过原型链上的属性
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      const value = obj[k];

      // 如果属性值是对象或数组，递归搜索
      if (value !== null && typeof value === 'object') {
        const result = findValueByKey(value, key);
        // 只有当找到结果时才返回，避免提前返回undefined
        if (result !== undefined) {
          return result;
        }
      }
    }
  }

  // 如果所有递归都没有找到结果，返回undefined
  return undefined;
}

/**
 * 递归查找JSON对象中指定key的所有值
 * @param obj 要搜索的JSON对象
 * @param key 要查找的键名
 * @returns 包含所有找到的值的数组
 */
function findAllValuesByKey(obj: any, key: string): any[] {
  const results: any[] = [];

  // 递归辅助函数
  function search(current: any) {
    // 基本情况：如果current不是对象或为null，则无法继续搜索
    if (current === null || typeof current !== 'object') {
      return;
    }

    // 检查当前对象是否包含目标key
    if (Object.prototype.hasOwnProperty.call(current, key)) {
      results.push(current[key]);
    }

    // 递归搜索对象的所有属性
    for (const k in current) {
      if (Object.prototype.hasOwnProperty.call(current, k)) {
        const value = current[k];
        if (value !== null && typeof value === 'object') {
          search(value);
        }
      }
    }
  }

  search(obj);
  return results;
}

export { findAllValuesByKey, findValueByKey };
