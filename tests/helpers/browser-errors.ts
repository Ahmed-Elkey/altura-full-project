import type { Page } from '@playwright/test';

export function watchBrowserErrors(page: Page) {
  const anonymousRefreshUrls = new Set<string>();
  const consoleErrors: Array<{ text: string; url: string }> = [];
  const failures: string[] = [];
  const pageErrors: string[] = [];
  const httpErrors: string[] = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    const commerceOrigin = url.origin === 'http://127.0.0.1:4000' || url.origin === new URL(page.url()).origin;
    const expectedRefresh = commerceOrigin && url.pathname === '/api/v1/auth/refresh' && response.request().method() === 'POST' && response.status() === 401;
    if (expectedRefresh) anonymousRefreshUrls.add(response.url());
    else if (url.hostname === '127.0.0.1' && response.status() >= 400) httpErrors.push(`${response.request().method()} ${url.pathname}: ${response.status()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push({ text: message.text(), url: message.location().url });
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText || '';
    // Navigation legitimately cancels Next.js prefetches. Other local failures remain failures.
    if (request.url().startsWith('http://127.0.0.1') && !(request.url().includes('_rsc=') && failure.includes('ERR_ABORTED'))) failures.push(`${request.url()}: ${failure}`);
  });
  return {
    unexpected: () => [
      ...consoleErrors.filter((error) => !(anonymousRefreshUrls.has(error.url) && /401 \(Unauthorized\)/.test(error.text))).map((error) => `${error.url}: ${error.text}`),
      ...pageErrors, ...failures, ...httpErrors,
    ],
    expectedAnonymousRefreshes: () => anonymousRefreshUrls.size,
  };
}
