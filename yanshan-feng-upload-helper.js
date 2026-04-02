// 燕山丰快捷上传 - 业务逻辑（GitHub 托管）
(function () {
    'use strict';

    // ===================== 常量定义 =====================
    const DELAY = {
        SHORT: 500,
        MEDIUM: 800,
        LONG: 1000,
        EXTRA_LONG: 2000
    };

    const STATUS = {
        ACTIVE: 'active',
        COMPLETED: 'completed',
        FAILED: 'failed',
        PENDING: 'pending',
        UPLOADING: 'uploading',
        PROCESSING: 'processing'
    };

    const STATUS_DISPLAY_MAP = {
        '已达到每日上传数上限': STATUS.FAILED,
        '正在等待…': STATUS.PENDING,
        '正在等待...': STATUS.PENDING,
        '上传完成': STATUS.COMPLETED,
        '检查完毕': STATUS.COMPLETED,
        '上传中': STATUS.UPLOADING,
        '处理中': STATUS.PROCESSING,
        '失败': STATUS.FAILED,
        '错误': STATUS.FAILED
    };

    const LANGUAGE_MAP = {
        'ES': '西班牙语', 'US': '英语', 'CN': '中文', 'FR': '法语', 'DE': '德语',
        'JP': '日语', 'BR': '葡萄牙语', 'NL': '荷兰语', 'KR': '韩语', 'GB': '英语',
        'IT': '意大利语', 'RU': '俄语', 'AR': '阿拉伯语', 'IN': '印地语',
        'ID': '印尼语', 'TR': '土耳其语', 'SE': '瑞典语', 'FI': '芬兰语',
        'NO': '挪威语', 'DK': '丹麦语', 'PL': '波兰语', 'HU': '匈牙利语',
        'CZ': '捷克语', 'GR': '希腊语', 'PT': '葡萄牙语', 'TH': '泰语',
        'VN': '越南语', 'IL': '希伯来语', 'SA': '阿拉伯语', 'AE': '阿拉伯语',
        'SG': '英语', 'MY': '马来语', 'PH': '菲律宾语', 'TW': '中文(繁体)',
        'HK': '中文(繁体)', 'MO': '中文(繁体)', 'CA': '英语', 'CH': '德语',
        'BE': '荷兰语', 'ZA': '英语', 'MX': '西班牙语', 'CO': '西班牙语',
        'PE': '西班牙语', 'CL': '西班牙语', 'AT': '德语', 'IE': '英语',
        'NZ': '英语', 'AU': '英语'
    };

    const DOM_SELECTORS = {
        PROGRESS_LIST: '#progress-list',
        PROGRESS_ITEM: '#progress-list .row',
        EDIT_BUTTON: '#progress-list .edit-button',
        TITLE_TEXTBOX: '#textbox[slot="input"][contenteditable="true"], ytcp-video-title input, #container.ytcp-video-title input',
        NOT_FOR_KIDS_RADIO: 'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
        NEXT_BUTTON: 'ytcp-button#next-button, button[aria-label="继续"], button[aria-label="Continue"]',
        UNLISTED_RADIO: 'tp-yt-paper-radio-button[name="UNLISTED"]',
        SAVE_BUTTON: 'ytcp-button#done-button, ytcp-button[aria-label="保存"], button[aria-label="保存"]',
        SHARE_URL: '#share-url',
        COPY_BUTTON: 'ytcp-icon-button[aria-label="复制视频链接"]',
        UPLOAD_STATUS: 'ytcp-video-upload-progress .progress-label',
        CLOSE_PANEL_BUTTON: 'ytcp-button#close-button, button[aria-label="关闭"], ytcp-icon-button[aria-label="关闭"]',
        LOGOUT_CONTAINER: 'ytd-compact-link-renderer a[href*="logout"]',
    };

    // ===================== 工具函数 =====================
    const Utils = {
        createElement(tag, attributes = {}, textContent = '') {
            const el = document.createElement(tag);
            Object.entries(attributes).forEach(([attr, value]) => {
                el.setAttribute(attr, value);
            });
            if (textContent) el.textContent = textContent;
            return el;
        },

        appendChildren(parent, ...children) {
            children.forEach(child => {
                if (child) parent.appendChild(child);
            });
            return parent;
        },

        safeQuerySelector(selector, parent = document) {
            return parent.querySelector(selector);
        },

        safeQuerySelectorAll(selector, parent = document) {
            return Array.from(parent.querySelectorAll(selector));
        },

        clickElement(element) {
            if (!element) return false;
            const innerButton = element.querySelector('button') || element;
            innerButton.click();
            return true;
        },

        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        waitForElement(selector, timeout = 5000) {
            return new Promise((resolve) => {
                const startTime = Date.now();

                const check = () => {
                    const element = this.safeQuerySelector(selector);
                    if (element) {
                        resolve(element);
                    } else if (Date.now() - startTime >= timeout) {
                        resolve(null);
                    } else {
                        setTimeout(check, 200);
                    }
                };

                check();
            });
        },

        checkPageResponsiveness() {
            return new Promise((resolve) => {
                const timer = setTimeout(() => {
                    resolve(false);
                }, 10000);

                const check = () => {
                    if (document.querySelector('body:not([aria-busy="true"])')) {
                        clearTimeout(timer);
                        resolve(true);
                    }
                };

                check();
                const interval = setInterval(check, 500);

                setTimeout(() => {
                    clearInterval(interval);
                }, 10000);
            });
        },

        normalizeStatus(rawStatus) {
            if (STATUS_DISPLAY_MAP[rawStatus]) {
                return STATUS_DISPLAY_MAP[rawStatus];
            }

            for (const [key, value] of Object.entries(STATUS_DISPLAY_MAP)) {
                if (rawStatus.includes(key)) {
                    return value;
                }
            }

            return STATUS.PENDING;
        },

        getStatusDisplayText(status) {
            const statusTextMap = {
                [STATUS.ACTIVE]: "处理中...",
                [STATUS.COMPLETED]: "已完成",
                [STATUS.FAILED]: "失败",
                [STATUS.PENDING]: "等待中",
                [STATUS.UPLOADING]: "上传中...",
                [STATUS.PROCESSING]: "处理中..."
            };
            return statusTextMap[status] || status;
        }
    };

    // ===================== 控制面板类 =====================
    class ControlPanel {
        constructor() {
            this.panel = null;
            this.statusItems = {};
            this.fileItems = {};
            this.createPanel();
            this.setupEventListeners();
            this.aiProcessor = new AITitleProcessor();
        }

        createPanel() {
            this.panel = Utils.createElement('div', { id: 'yt-helper-panel', class: 'visible' });
            const header = Utils.createElement('div', { class: 'panel-header' });
            const title = Utils.createElement('h3', { class: 'panel-title' }, 'YouTube 自动上传助手');
            const closeBtn = Utils.createElement('button', { class: 'panel-close' }, '×');
            Utils.appendChildren(header, title, closeBtn);

            const content = Utils.createElement('div', { class: 'panel-content' });

            // 最后上传时间
            const lastUploadContainer = Utils.createElement('div', { class: 'last-upload-container' });
            const lastUploadTitle = Utils.createElement('div', { class: 'last-upload-title' }, '频道最后成功上传时间');
            this.lastUploadTimeEl = Utils.createElement('div', { class: 'last-upload-time' }, '暂无记录');
            Utils.appendChildren(lastUploadContainer, lastUploadTitle, this.lastUploadTimeEl);
            content.appendChild(lastUploadContainer);

            // 文件列表
            const fileListContainer = Utils.createElement('div', { class: 'file-list-container' });
            const fileListTitle = Utils.createElement('div', { class: 'file-list-title' }, '待处理文件列表');
            this.fileListContainer = Utils.createElement('div', { class: 'file-list' });
            Utils.appendChildren(fileListContainer, fileListTitle, this.fileListContainer);
            content.appendChild(fileListContainer);

            // 状态流程
            const statusContainer = Utils.createElement('div', { class: 'status-container' });
            const statusTitle = Utils.createElement('div', { class: 'status-title' }, '上传处理流程');
            const statusList = Utils.createElement('div', { class: 'status-list' });
            const steps = [
                { step: 'title', title: '标题处理', desc: '等待处理视频标题...' },
                { step: 'kids', title: '儿童内容设置', desc: '等待选择非儿童内容...' },
                { step: 'continue', title: '继续操作', desc: '等待点击继续按钮...' },
                { step: 'visibility', title: '视频可见性', desc: '等待设置不公开列出...' },
                { step: 'link', title: '获取视频链接', desc: '等待视频处理完成...' },
                { step: 'save', title: '保存视频', desc: '等待保存操作...' },
                { step: 'close', title: '关闭面板', desc: '正在关闭面板并重置流程...' }
            ];
            this.statusItems = {};
            steps.forEach((step, index) => {
                const item = Utils.createElement('div', { class: 'status-item', 'data-step': step.step });
                const icon = Utils.createElement('div', { class: 'status-icon' }, (index + 1).toString());
                const content = Utils.createElement('div', { class: 'status-content' });
                const titleEl = Utils.createElement('div', { class: 'status-step' }, step.title);
                const descEl = Utils.createElement('div', { class: 'status-desc' }, step.desc);
                Utils.appendChildren(content, titleEl, descEl);
                Utils.appendChildren(item, icon, content);
                statusList.appendChild(item);
                this.statusItems[step.step] = { element: item, title: titleEl, desc: descEl, icon: icon };
            });
            Utils.appendChildren(statusContainer, statusTitle, statusList);
            content.appendChild(statusContainer);

            // 日志
            this.createLogSection(content);

            // 链接汇总
            const linksContainer = Utils.createElement('div', { class: 'links-container' });
            const linksTitle = Utils.createElement('div', { class: 'links-title' }, '处理完成的视频链接');
            const linksSummary = Utils.createElement('div', { class: 'links-summary' });
            this.linksList = Utils.createElement('div', { class: 'links-list' });
            this.copyAllBtn = Utils.createElement('button', { class: 'copy-all-btn' }, '复制所有链接到剪贴板');
            Utils.appendChildren(linksSummary, this.linksList, this.copyAllBtn);
            Utils.appendChildren(linksContainer, linksTitle, linksSummary);
            content.appendChild(linksContainer);

            // 按钮
            const actions = Utils.createElement('div', { class: 'panel-actions' });
            const startBtn = Utils.createElement('button', { class: 'panel-btn panel-btn-primary', id: 'start-process' }, '🚀 开始处理');
            const resetBtn = Utils.createElement('button', { class: 'panel-btn panel-btn-secondary', id: 'reset-process' }, '🔄 重置流程');
            Utils.appendChildren(actions, startBtn, resetBtn);

            Utils.appendChildren(this.panel, header, content, actions);
            document.body.appendChild(this.panel);
            this.enableDrag(this.panel, header);
            this.loadLastUploadTime();
        }

        updateLastUploadTime() {
            const now = new Date();
            const timeStr = now.getFullYear() + '-' +
                String(now.getMonth() + 1).padStart(2, '0') + '-' +
                String(now.getDate()).padStart(2, '0') + ' ' +
                String(now.getHours()).padStart(2, '0') + ':' +
                String(now.getMinutes()).padStart(2, '0') + ':' +
                String(now.getSeconds()).padStart(2, '0');
            localStorage.setItem('ytLastSuccessUploadTime', timeStr);
            this.lastUploadTimeEl.textContent = timeStr;
        }

        loadLastUploadTime() {
            const saved = localStorage.getItem('ytLastSuccessUploadTime');
            if (saved) this.lastUploadTimeEl.textContent = saved;
        }

        enableDrag(element, dragHandle) {
            let isDragging = false;
            let offsetX, offsetY;
            dragHandle.addEventListener('mousedown', (e) => {
                if (e.target.closest('.panel-close')) return;
                isDragging = true;
                const rect = element.getBoundingClientRect();
                offsetX = e.clientX - rect.left;
                offsetY = e.clientY - rect.top;
                element.style.transition = 'none';
                document.body.style.userSelect = 'none';
                e.preventDefault();
            });
            const move = (e) => {
                if (!isDragging) return;
                requestAnimationFrame(() => {
                    const x = e.clientX - offsetX;
                    const y = e.clientY - offsetY;
                    const maxX = window.innerWidth - element.offsetWidth;
                    const maxY = window.innerHeight - element.offsetHeight;
                    element.style.left = Math.min(Math.max(0, x), maxX) + 'px';
                    element.style.top = Math.min(Math.max(0, y), maxY) + 'px';
                    element.style.right = 'auto';
                });
            };
            const stop = () => {
                isDragging = false;
                element.style.transition = 'all 0.3s ease';
                document.body.style.userSelect = '';
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', stop);
        }

        setupEventListeners() {
            this.panel.addEventListener('click', (e) => {
                const t = e.target;
                if (t.closest('.panel-close')) this.panel.classList.remove('visible');
                else if (t.closest('#start-process')) startProcessing();
                else if (t.closest('#reset-process')) this.resetProcess();
            });
            this.copyAllBtn.addEventListener('click', () => {
                let txt = '';
                this.linksList.childNodes.forEach(c => {
                    if (!c.classList) return;
                    if (c.classList.contains('category-title')) txt += '\n' + c.textContent.trim() + '\n';
                    else if (c.classList.contains('language-code')) txt += c.textContent.trim() + '\n';
                    else if (c.classList.contains('link-url')) txt += c.textContent.trim() + '\n';
                    else if (c.classList.contains('link-item')) {
                        const n = c.querySelector('.link-name')?.textContent.trim() || '';
                        const u = c.querySelector('.link-url')?.textContent.trim() || '';
                        if (n && u) txt += `${n}: ${u}\n`;
                    }
                });
                GM_setClipboard(txt.trim(), 'text');
                this.showNotification('✅ 已复制所有链接到剪贴板');
            });
        }

        resetProcess() {
            isProcessing = false;
            titleProcessed = false;
            currentFileIndex = 0;
            processedLinks = [];
            this.linksList.innerHTML = '';
            Object.keys(this.statusItems).forEach(s => {
                const i = this.statusItems[s];
                i.element.classList.remove('active', 'completed', 'failed');
                i.icon.textContent = Object.keys(this.statusItems).indexOf(s) + 1;
                i.desc.textContent = '等待处理...';
            });
            this.showNotification('🔄 流程已重置');
        }

        updateFileList(files) {
            this.fileListContainer.innerHTML = '';
            this.fileItems = {};
            files.forEach(f => {
                const item = Utils.createElement('div', { class: 'file-item', 'data-filename': f.name });
                const name = Utils.createElement('div', { class: 'file-name' }, f.name);
                const status = Utils.createElement('div', { class: 'file-status' });
                Utils.appendChildren(item, name, status);
                this.fileListContainer.appendChild(item);
                this.fileItems[f.name] = { element: item, name, status };
                this.updateFileStatus(f.name, Utils.normalizeStatus(f.status));
            });
        }

        updateFileStatus(name, status) {
            const i = this.fileItems[name];
            if (!i) return;
            i.element.classList.remove('active', 'completed', 'failed', 'pending', 'uploading', 'processing');
            i.element.classList.add(status);
            i.status.textContent = Utils.getStatusDisplayText(status);
        }

        updateStatus(step, status, desc = '') {
            const i = this.statusItems[step];
            if (!i) return;
            i.element.classList.remove('active', 'completed', 'failed');
            i.desc.textContent = desc || i.desc.textContent;
            if (status === 'active') { i.element.classList.add('active'); }
            else if (status === 'completed') { i.element.classList.add('completed'); i.icon.textContent = '✓'; }
            else if (status === 'failed') { i.element.classList.add('failed'); i.icon.textContent = '×'; }
        }

        showNotification(msg) {
            const n = Utils.createElement('div', { class: 'panel-notification' }, msg);
            document.body.appendChild(n);
            setTimeout(() => n.remove(), 3000);
        }

        addProcessedLink(file, url) {
            const m = file.match(/^([A-Z]{2})([A-Za-z]+)(\d*)\./i);
            if (!m) {
                const li = Utils.createElement('div', { class: 'link-item' });
                const n = Utils.createElement('div', { class: 'link-name' }, file);
                const u = Utils.createElement('div', { class: 'link-url' }, url);
                Utils.appendChildren(li, n, u);
                this.linksList.appendChild(li);
                return;
            }
            const lang = m[1].toLowerCase();
            const cat = m[2].toLowerCase();
            const sel = `.category-title[data-category="${cat}"]`;
            if (!this.linksList.querySelector(sel)) {
                const t = Utils.createElement('div', { class: 'category-title', 'data-category': cat }, cat);
                this.linksList.appendChild(t);
            }
            const catEl = this.linksList.querySelector(sel);
            let langEl = null;
            let s = catEl.nextElementSibling;
            while (s && !s.classList.contains('category-title')) {
                if (s.classList.contains('language-code') && s.textContent.trim() === lang) {
                    langEl = s;
                    break;
                }
                s = s.nextElementSibling;
            }
            if (langEl) {
                const u = Utils.createElement('div', { class: 'link-url' }, url);
                this.linksList.insertBefore(u, langEl.nextSibling);
            } else {
                const l = Utils.createElement('div', { class: 'language-code' }, lang);
                const u = Utils.createElement('div', { class: 'link-url' }, url);
                this.linksList.insertBefore(l, catEl.nextElementSibling);
                this.linksList.insertBefore(u, l.nextElementSibling);
            }
        }

        createLogSection(container) {
            this.logContainer = Utils.createElement('div', { class: 'log-container' });
            const title = Utils.createElement('div', { class: 'log-title' }, '处理日志');
            this.logToggle = Utils.createElement('span', { class: 'log-toggle' }, '显示详细');
            this.logContent = Utils.createElement('div', { class: 'log-content' });
            Utils.appendChildren(title, this.logToggle);
            Utils.appendChildren(this.logContainer, title, this.logContent);
            const links = container.querySelector('.links-container');
            if (links) container.insertBefore(this.logContainer, links);
            else container.appendChild(this.logContainer);
            title.addEventListener('click', () => {
                this.logContent.classList.toggle('expanded');
                this.logToggle.textContent = this.logContent.classList.contains('expanded') ? '隐藏详细' : '显示详细';
            });
        }

        addLog(msg, type = 'info') {
            const item = Utils.createElement('div', { class: `log-item ${type}` }, `[${new Date().toLocaleTimeString()}] ${msg}`);
            this.logContent.appendChild(item);
        }

        addAILog(msg, type = 'info') { this.addLog(msg, type); }
    }

    // ===================== AI 标题处理器 =====================
    class AITitleProcessor {
        constructor() {
            this.apiKey = "6869437c-0d6b-42ee-8c6d-4c865ca9b475";
            this.apiUrl = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
        }
        async processTitle(title, panel) {
            panel.addAILog('开始解析标题...');
            const { languageCode, appName } = this.extract(title);
            const langName = LANGUAGE_MAP[languageCode] || languageCode;
            const prompt = this.getDefaultPrompt().replace(/{appName}/g, appName).replace(/{languageName}/g, langName);
            const ai = await this.request(prompt);
            return `${languageCode}）${ai}`;
        }
        getDefaultPrompt() {
            return `为{appName} App生成一个吸引人的{languageName}推广标题+短文案，15字内，直接给结果。`;
        }
        extract(t) {
            const clean = t.replace(/[^a-zA-Z0-9]/g, '');
            const m = clean.match(/^([A-Z]{2})([A-Za-z]+)(\d*)$/i);
            if (!m) throw new Error('格式错误');
            return { languageCode: m[1].toUpperCase(), appName: m[2].toLowerCase() };
        }
        async request(p) {
            const res = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: "doubao-1-5-pro-32k-250115", messages: [{ role: "user", content: p }] })
            });
            const j = await res.json();
            return j.choices?.[0]?.message?.content?.trim() || '标题生成失败';
        }
    }

    // ===================== 主逻辑 =====================
    let isProcessing = false, titleProcessed = false, currentFileIndex = 0, processedLinks = [];
    let controlPanel = null;

    function init() {
        if (location.hostname !== 'studio.youtube.com') return;
        controlPanel = new ControlPanel();
        removeLogout();
        observe();
        monitor();
    }

    function monitor() {
        setInterval(() => {
            const items = Utils.safeQuerySelectorAll(DOM_SELECTORS.PROGRESS_ITEM);
            if (items.length === 0) return;
            const files = items.map(i => {
                const name = i.querySelector('.progress-title').textContent.trim();
                const status = i.querySelector('.progress-status-text').textContent.trim();
                const bar = i.querySelector('.progress-bar');
                const done = bar && bar.style.width === '100%';
                return { name, status, element: i, isUploaded: done };
            });
            controlPanel.updateFileList(files);
            files.forEach(f => {
                if (f.isUploaded && !processedLinks.some(x => x.name === f.name) && !isProcessing) startProcessing();
            });
        }, 2000);
    }

    function startProcessing() {
        if (isProcessing) return;
        isProcessing = true;
        currentFileIndex = 0;
        processNext();
    }

    async function processNext() {
        const items = Utils.safeQuerySelectorAll(DOM_SELECTORS.PROGRESS_ITEM);
        if (currentFileIndex >= items.length) { isProcessing = false; controlPanel.showNotification('✅ 全部完成'); return; }
        const item = items[currentFileIndex];
        const name = item.querySelector('.progress-title').textContent.trim();
        if (processedLinks.some(x => x.name === name)) { currentFileIndex++; processNext(); return; }
        controlPanel.updateFileStatus(name, 'processing');
        const edit = item.querySelector(DOM_SELECTORS.EDIT_BUTTON);
        if (edit) { edit.click(); await Utils.delay(1000); await processFile(name); }
        else { controlPanel.updateFileStatus(name, 'failed'); currentFileIndex++; processNext(); }
    }

    async function processFile(name) {
        try {
            await autoTitle(name);
            await noKids();
            await next3();
            await unlisted();
            const link = await getLink();
            await save();
            processedLinks.push({ name, url: link });
            controlPanel.addProcessedLink(name, link);
            await Utils.delay(5000);
            await closeDialog();
            controlPanel.updateFileStatus(name, 'completed');
            controlPanel.updateLastUploadTime();
        } catch (e) {
            console.error(e);
            controlPanel.updateFileStatus(name, 'failed');
        } finally {
            currentFileIndex++;
            processNext();
        }
    }

    async function autoTitle(file) {
        for (let i = 0; i < 10; i++) {
            const box = document.querySelector(DOM_SELECTORS.TITLE_TEXTBOX);
            if (!box) { await Utils.delay(500); continue; }
            const val = (box.value || box.textContent || '').trim();
            if (val.includes('）')) { controlPanel.updateStatus('title', 'completed', '已处理'); return; }
            try {
                const ai = await controlPanel.aiProcessor.processTitle(val || file, controlPanel);
                if (box.value) { box.value = ai; box.dispatchEvent(new Event('input', { bubbles: true })); }
                else { box.textContent = ai; box.dispatchEvent(new Event('input', { bubbles: true })); }
                controlPanel.updateStatus('title', 'completed', ai);
                return;
            } catch (e) {
                const m = val.match(/^([A-Z]{2})/);
                if (m) {
                    const fall = m[1] + ')';
                    if (box.value) box.value = fall; else box.textContent = fall;
                    box.dispatchEvent(new Event('input', { bubbles: true }));
                    controlPanel.updateStatus('title', 'completed', fall);
                    return;
                }
            }
        }
        controlPanel.updateStatus('title', 'failed');
    }

    async function noKids() {
        controlPanel.updateStatus('kids', 'active');
        const r = await Utils.waitForElement(DOM_SELECTORS.NOT_FOR_KIDS_RADIO, 5000);
        if (r && r.getAttribute('aria-checked') !== 'true') r.click();
        controlPanel.updateStatus('kids', 'completed', '已设置非儿童');
        await Utils.delay(500);
    }

    async function next3() {
        controlPanel.updateStatus('continue', 'active');
        let c = 0;
        while (c < 3) {
            const b = await Utils.waitForElement(DOM_SELECTORS.NEXT_BUTTON, 3000);
            if (b && b.getAttribute('aria-disabled') === 'false') { b.click(); c++; await Utils.delay(1500); }
            else await Utils.delay(800);
        }
        controlPanel.updateStatus('continue', 'completed');
    }

    async function unlisted() {
        controlPanel.updateStatus('visibility', 'active');
        for (let i = 0; i < 10; i++) {
            const r = await Utils.waitForElement(DOM_SELECTORS.UNLISTED_RADIO, 2000);
            if (r) {
                if (r.getAttribute('aria-checked') === 'true') break;
                r.click();
                await Utils.delay(500);
                if (r.getAttribute('aria-checked') === 'true') break;
            } else {
                const n = await Utils.waitForElement(DOM_SELECTORS.NEXT_BUTTON, 1000);
                if (n && n.getAttribute('aria-disabled') === 'false') { n.click(); await Utils.delay(1000); }
            }
        }
        controlPanel.updateStatus('visibility', 'completed', '不公开');
    }

    async function getLink() {
        controlPanel.updateStatus('link', 'active');
        for (let i = 0; i < 30; i++) {
            const a = document.querySelector('div.value a[href*="youtu"]');
            if (a) {
                const u = a.href || a.textContent.trim();
                let id = '';
                if (u.includes('shorts/')) id = u.split('shorts/')[1].split('?')[0];
                else if (u.includes('youtu.be/')) id = u.split('youtu.be/')[1].split('?')[0];
                else if (u.includes('v=')) id = u.split('v=')[1].split('&')[0];
                const final = `https://youtube.com/watch?v=${id}`;
                controlPanel.updateStatus('link', 'completed', final);
                return final;
            }
            await Utils.delay(1000);
        }
        throw new Error('获取链接超时');
    }

    async function save() {
        for (let i = 0; i < 5; i++) {
            const b = document.querySelector('button[aria-label="保存"]');
            if (b && b.getAttribute('aria-disabled') === 'false') { b.click(); return true; }
            await Utils.delay(1000);
        }
        throw new Error('保存失败');
    }

    async function closeDialog() {
        for (let i = 0; i < 15; i++) {
            const c = document.querySelector('ytcp-button#close-button button') || document.querySelector('ytcp-icon-button#close-icon-button');
            if (c) { c.click(); return; }
            await Utils.delay(500);
        }
    }

    function removeLogout() {
        document.querySelectorAll(DOM_SELECTORS.LOGOUT_CONTAINER).forEach(i => i.closest('ytd-compact-link-renderer')?.remove());
    }

    function observe() {
        new MutationObserver(() => removeLogout()).observe(document.body, { childList: true, subtree: true });
    }

    // 启动
    const run = _.debounce(init, 500);
    window.addEventListener('load', run);
    document.addEventListener('DOMContentLoaded', run);

    console.log('%c=== 燕山丰上传助手（远程逻辑）已加载 ==', 'color:#09f');
})();
