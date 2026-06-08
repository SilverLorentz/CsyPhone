export const STATUS_CARD_WIDTH_PX = 330;
export const STATUS_CARD_MIN_HEIGHT_PX = 220;
export const STATUS_CARD_MAX_HEIGHT_PX = 560;
export const STATUS_CARD_MAX_VIEWPORT_HEIGHT = 'calc(100vh - 120px)';
export const STATUS_CARD_VIEWPORT_WIDTH_PADDING_PX = 48;
export const STATUS_CARD_MEASURE_BUFFER_PX = 8;

export const STATUS_CARD_IFRAME_SHELL = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob: https:; font-src data: https:; media-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; worker-src 'none';">
<style>
html, body {
    margin: 0;
    padding: 0;
    background: transparent;
    overflow: hidden;
    width: max-content;
    height: max-content;
}
body {
    min-height: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
#root {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: max-content;
    max-width: none;
}
</style>
</head>
<body>
<div id="styles"></div>
<div id="root"></div>
<script>
(function () {
    var root = document.getElementById('root');
    var styles = document.getElementById('styles');
    var activeChannel = null;
    var resizeObserver = null;
    var activeTimeouts = [];
    var activeIntervals = [];
    var activeAnimationFrames = [];
    var nativeSetTimeout = window.setTimeout.bind(window);
    var nativeClearTimeout = window.clearTimeout.bind(window);
    var nativeSetInterval = window.setInterval.bind(window);
    var nativeClearInterval = window.clearInterval.bind(window);
    var nativeRequestAnimationFrame = window.requestAnimationFrame
        ? window.requestAnimationFrame.bind(window)
        : function (callback) { return nativeSetTimeout(function () { callback(Date.now()); }, 16); };
    var nativeCancelAnimationFrame = window.cancelAnimationFrame
        ? window.cancelAnimationFrame.bind(window)
        : nativeClearTimeout;

    function defineBlockedValue(target, name, value) {
        try {
            Object.defineProperty(target, name, {
                value: value,
                configurable: false,
                writable: false
            });
        } catch (error) {
            try {
                target[name] = value;
            } catch (ignored) {}
        }
    }

    function blockedNetwork() {
        return Promise.reject(new Error('Network requests are disabled inside status cards.'));
    }

    function BlockedConstructor() {
        throw new Error('This API is disabled inside status cards.');
    }

    defineBlockedValue(window, 'fetch', blockedNetwork);
    defineBlockedValue(window, 'XMLHttpRequest', BlockedConstructor);
    defineBlockedValue(window, 'WebSocket', BlockedConstructor);
    defineBlockedValue(window, 'EventSource', BlockedConstructor);
    defineBlockedValue(window, 'open', function () { return null; });
    defineBlockedValue(window, 'alert', function () {});
    defineBlockedValue(window, 'confirm', function () { return false; });
    defineBlockedValue(window, 'prompt', function () { return null; });
    defineBlockedValue(document, 'write', function () {});
    defineBlockedValue(document, 'writeln', function () {});

    if (window.navigator) {
        defineBlockedValue(window.navigator, 'sendBeacon', function () { return false; });
    }

    window.setTimeout = function (handler, timeout) {
        var args = Array.prototype.slice.call(arguments, 2);
        var timerId = nativeSetTimeout(function () {
            activeTimeouts = activeTimeouts.filter(function (id) { return id !== timerId; });
            if (typeof handler === 'function') {
                handler.apply(window, args);
            }
        }, timeout);
        activeTimeouts.push(timerId);
        return timerId;
    };

    window.clearTimeout = function (timerId) {
        activeTimeouts = activeTimeouts.filter(function (id) { return id !== timerId; });
        return nativeClearTimeout(timerId);
    };

    window.setInterval = function (handler, timeout) {
        var args = Array.prototype.slice.call(arguments, 2);
        var intervalId = nativeSetInterval(function () {
            if (typeof handler === 'function') {
                handler.apply(window, args);
            }
        }, timeout);
        activeIntervals.push(intervalId);
        return intervalId;
    };

    window.clearInterval = function (intervalId) {
        activeIntervals = activeIntervals.filter(function (id) { return id !== intervalId; });
        return nativeClearInterval(intervalId);
    };

    window.requestAnimationFrame = function (callback) {
        if (typeof callback !== 'function') return 0;
        var frameId = nativeRequestAnimationFrame(function (timestamp) {
            activeAnimationFrames = activeAnimationFrames.filter(function (id) { return id !== frameId; });
            callback(timestamp);
        });
        activeAnimationFrames.push(frameId);
        return frameId;
    };

    window.cancelAnimationFrame = function (frameId) {
        activeAnimationFrames = activeAnimationFrames.filter(function (id) { return id !== frameId; });
        return nativeCancelAnimationFrame(frameId);
    };

    function cleanupRuntime() {
        activeTimeouts.forEach(nativeClearTimeout);
        activeIntervals.forEach(nativeClearInterval);
        activeAnimationFrames.forEach(nativeCancelAnimationFrame);
        activeTimeouts = [];
        activeIntervals = [];
        activeAnimationFrames = [];

        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
    }

    function reportSize() {
        var nextWidth = Math.max(
            Math.ceil(root ? root.getBoundingClientRect().width || 0 : 0),
            document.documentElement.scrollWidth || 0,
            document.body.scrollWidth || 0,
            root ? root.scrollWidth || 0 : 0
        );
        var nextHeight = Math.max(
            Math.ceil(root ? root.getBoundingClientRect().height || 0 : 0),
            document.documentElement.scrollHeight || 0,
            document.body.scrollHeight || 0,
            root ? root.scrollHeight || 0 : 0
        );

        parent.postMessage(
            { type: 'preview-height', channel: activeChannel, width: nextWidth, height: nextHeight },
            '*'
        );
    }

    function scheduleReport() {
        nativeRequestAnimationFrame(function () {
            nativeRequestAnimationFrame(reportSize);
        });
    }

    function reconnectObserver() {
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }

        if (typeof ResizeObserver !== 'function') {
            nativeSetTimeout(scheduleReport, 0);
            return;
        }

        resizeObserver = new ResizeObserver(scheduleReport);

        if (document.body) {
            resizeObserver.observe(document.body);
        }

        if (root) {
            resizeObserver.observe(root);
        }
    }

    function isClassicInlineScript(node) {
        if (!node || node.tagName !== 'SCRIPT') return false;
        if (node.hasAttribute('src')) return false;

        var type = (node.getAttribute('type') || '').trim().toLowerCase();
        return !type
            || type === 'text/javascript'
            || type === 'application/javascript'
            || type === 'text/ecmascript'
            || type === 'application/ecmascript';
    }

    function collectAndRemoveScripts(parsed) {
        var scripts = [];
        Array.prototype.forEach.call(parsed.querySelectorAll('script'), function (node) {
            if (isClassicInlineScript(node)) {
                scripts.push(node.textContent || '');
            }

            if (node.parentNode) {
                node.parentNode.removeChild(node);
            }
        });
        return scripts;
    }

    function isJavaScriptUrl(value) {
        return /^\\s*javascript:/i.test(value || '');
    }

    function sanitizeTree(container) {
        if (!container || !container.querySelectorAll) return;

        Array.prototype.forEach.call(container.querySelectorAll('*'), function (node) {
            Array.prototype.slice.call(node.attributes || []).forEach(function (attr) {
                var name = attr.name.toLowerCase();
                var value = attr.value || '';

                if (name.indexOf('on') === 0) {
                    node.removeAttribute(attr.name);
                    return;
                }

                if ((name === 'href' || name === 'src' || name === 'xlink:href') && isJavaScriptUrl(value)) {
                    node.removeAttribute(attr.name);
                }
            });
        });
    }

    function shouldKeepHeadNode(node) {
        if (!node || !node.tagName) return false;
        var tagName = node.tagName.toUpperCase();
        if (tagName === 'SCRIPT' || tagName === 'BASE') return false;
        if (tagName === 'META' && /content-security-policy/i.test(node.getAttribute('http-equiv') || '')) return false;
        return true;
    }

    function runInlineScripts(scripts, allowScripts) {
        if (!allowScripts) return;

        scripts.forEach(function (code) {
            if (!code || !code.trim()) return;
            try {
                var script = document.createElement('script');
                script.text = code;
                root.appendChild(script);
            } catch (error) {
                console.warn('[StatusCard] Script execution failed:', error);
            }
        });
    }

    window.addEventListener('message', function (event) {
        if (!event.data || event.data.type !== 'preview-update') return;

        var html = typeof event.data.html === 'string' ? event.data.html : '';
        var allowScripts = event.data.allowScripts === true;
        activeChannel = typeof event.data.channel === 'string' ? event.data.channel : null;
        cleanupRuntime();

        try {
            var parsed = new DOMParser().parseFromString(html, 'text/html');
            var inlineScripts = collectAndRemoveScripts(parsed);
            var headNodes = [];

            if (parsed.head && parsed.head.children) {
                Array.prototype.forEach.call(parsed.head.children, function (node) {
                    if (shouldKeepHeadNode(node) && typeof node.outerHTML === 'string') {
                        headNodes.push(node.outerHTML);
                    }
                });
            }

            sanitizeTree(parsed.body);
            styles.innerHTML = headNodes.join('');
            root.innerHTML = parsed.body && parsed.body.innerHTML ? parsed.body.innerHTML : html;
            document.body.style.cssText = 'margin:0;background:transparent;overflow:hidden;min-height:0;display:inline-flex;align-items:center;justify-content:center;width:max-content;';

            if (parsed.body && parsed.body.getAttribute('style')) {
                document.body.style.cssText += parsed.body.getAttribute('style');
            }

            reconnectObserver();
            runInlineScripts(inlineScripts, allowScripts);
        } catch (error) {
            styles.innerHTML = '';
            root.textContent = html;
            document.body.style.cssText = 'margin:0;background:transparent;overflow:hidden;min-height:0;display:inline-flex;align-items:center;justify-content:center;width:max-content;';
            reconnectObserver();
        }

        scheduleReport();
    });

    window.addEventListener('pagehide', cleanupRuntime);
    window.addEventListener('beforeunload', cleanupRuntime);
    reconnectObserver();
    scheduleReport();
})();
</script>
</body>
</html>`;
