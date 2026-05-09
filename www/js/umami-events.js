(function () {
    const CLICK_EVENT_NAME = 'click';
    const MAX_TEXT_LENGTH = 80;

    function cleanText(value) {
        return (value || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, MAX_TEXT_LENGTH);
    }

    function getClickTarget(element) {
        return element.closest([
            'a',
            'button',
            '[role="button"]',
            'input[type="button"]',
            'input[type="submit"]',
            'input[type="reset"]',
            'label',
            'summary',
            'select',
            '[data-umami-click]'
        ].join(','));
    }

    function getSection(element) {
        const section = element.closest('section[id], nav, header, footer, main');
        if (!section) return '';
        if (section.id) return section.id;
        return section.tagName.toLowerCase();
    }

    function getLabel(element) {
        const explicitLabel = element.getAttribute('data-umami-click');
        if (explicitLabel) return cleanText(explicitLabel);

        const ariaLabel = element.getAttribute('aria-label') || element.getAttribute('title');
        if (ariaLabel) return cleanText(ariaLabel);

        if (element instanceof HTMLInputElement) {
            return cleanText(element.value || element.name || element.type);
        }

        const imageAlt = element.querySelector('img[alt]')?.getAttribute('alt');
        const text = cleanText(element.innerText || element.textContent);
        return text || cleanText(imageAlt) || element.tagName.toLowerCase();
    }

    function classifyHref(href) {
        if (!href) return 'none';
        if (href.startsWith('#')) return 'anchor';
        if (href.startsWith('mailto:')) return 'email';
        if (href.startsWith('tel:')) return 'phone';

        try {
            const url = new URL(href, window.location.href);
            if (url.origin === window.location.origin) return 'internal';
            return 'external';
        } catch (error) {
            return 'unknown';
        }
    }

    function getHref(element) {
        const link = element.closest('a[href]');
        return link ? link.getAttribute('href') : '';
    }

    function trackClick(element) {
        if (!window.umami || typeof window.umami.track !== 'function') return;

        const href = getHref(element);
        const hrefType = classifyHref(href);
        const label = getLabel(element);

        window.umami.track(CLICK_EVENT_NAME, {
            label,
            href: href ? href.slice(0, 220) : '',
            href_type: hrefType,
            tag: element.tagName.toLowerCase(),
            section: getSection(element),
            element_id: element.id || '',
            element_class: cleanText(element.className && typeof element.className === 'string' ? element.className : ''),
            page_path: window.location.pathname,
            page_title: cleanText(document.title),
            outbound: hrefType === 'external' ? 1 : 0
        });
    }

    document.addEventListener('click', function (event) {
        const target = event.target instanceof Element ? getClickTarget(event.target) : null;
        if (!target) return;
        trackClick(target);
    }, true);
})();
