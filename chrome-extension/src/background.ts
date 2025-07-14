import { arrayBufferToBase64File, base64FileToFile } from './utils'
import { IBackgroundHttpResponse, IBackgroundRequest, IBackgroundResponse } from './types'
import { ii, isPlainObject } from 'vtils'
import { YAPIX } from './consts'

// Service worker needs to be activated immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// ==== 提供 HTTP Request 服务 ====
chrome.runtime.onMessage.addListener(
  (request: IBackgroundRequest, _, sendResponse: (response: IBackgroundResponse) => any) => {
    ii(async () => {
      switch (request.type) {
        case YAPIX.BACKGROUND_HTTP_REQUEST_TYPE:
          if (request.options.headers) {
            // Store original headers for later use
            const originalHeaders = { ...request.options.headers };
            // Add a special header to identify our requests
            request.options.headers[YAPIX.HTTP_HEADERS_KEY] = JSON.stringify(originalHeaders);
          }
          if (isPlainObject(request.options.body) && request.options.body[YAPIX.FILE_BODY_KEY] === true) {
            const YApiXFileBody = { ...request.options.body }
            delete YApiXFileBody[YAPIX.FILE_BODY_KEY]
            const formData = new FormData()
            for (const [key, value] of Object.entries(YApiXFileBody)) {
              if (isPlainObject(value) && value[YAPIX.BASE64_FILE_FLAG] === true) {
                formData.append(key, base64FileToFile(value))
              }
              else {
                formData.append(key, value as any)
              }
            }
            request.options.body = formData as any
          }

          // Make the fetch request
          const res = await fetch(request.options.url, request.options);

          // Process response headers
          const responseHeaders = new Headers(res.headers);
          // NOTE: Headers 内部使用小写存储键
          const headers = Object.fromEntries(responseHeaders.entries());

          // Process response body
          const arrayBuffer = await res.arrayBuffer();
          const name = 'file';
          const contentType = headers['content-type'] || 'application/octet-stream';
          const base64File = arrayBufferToBase64File(arrayBuffer, name, contentType);

          const { ok, status, statusText } = res;
          sendResponse({
            error: null,
            data: { ok, status, statusText, headers, base64File } as IBackgroundHttpResponse,
          });
          break;
        default:
          break;
      }
    }).catch(err => {
      sendResponse({
        error: String(err),
      });
    });
    return true;
  },
);

// In Manifest V3, we can't use blocking webRequest listeners
// Instead, we'll handle headers directly in the fetch request above
// Note: This means we lose some functionality related to modifying headers of requests
// not made through our extension's API
