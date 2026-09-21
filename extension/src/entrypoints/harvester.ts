export default defineUnlistedScript(() => {
  const readContent = (selectors: string[]): string | undefined => {
    for (const selector of selectors) {
      const content = document.querySelector(selector)?.getAttribute('content');
      if (typeof content === 'string' && content.length > 0) return content;
    }
    return undefined;
  };

  const payload = {
    name: readContent(['meta[property="og:site_name"]', 'meta[name="application-name"]']) ?? document.title,
    description: readContent(['meta[property="og:description"]', 'meta[name="description"]']),
    keywords: readContent(['meta[name="keywords"]']),
  };

  void chrome.runtime.sendMessage({ type: 'HARVEST_RESULT', payload });
});
