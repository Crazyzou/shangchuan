// 燕山丰快捷上传 - 业务逻辑（托管于 GitHub）
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
            // 创建面板容器
            this.panel = Utils.createElement('div', { id: 'yt-helper-panel', class: 'visible' });

            // 创建面板头部
            const header = Utils.createElement('div', { class: 'panel-header' });
            const title = Utils.createElement('h3', { class: 'panel-title' }, 'YouTube 自动上传助手');
            const closeBtn = Utils.createElement('button', { class: 'panel-close' }, '×');
            Utils.appendChildren(header, title, closeBtn);

            // 创建面板内容容器
            const content = Utils.createElement('div', { class: 'panel-content' });

            // 创建文件列表区域
            const fileListContainer = Utils.createElement('div', { class: 'file-list-container' });
            const fileListTitle = Utils.createElement('div', { class: 'file-list-title' }, '待处理文件列表');
            this.fileListContainer = Utils.createElement('div', { class: 'file-list' });

            Utils.appendChildren(fileListContainer, fileListTitle, this.fileListContainer);
            content.appendChild(fileListContainer);

            // 创建状态跟踪区域
            const statusContainer = Utils.createElement('div', { class: 'status-container' });
            const statusTitle = Utils.createElement('div', { class: 'status-title' }, '上传处理流程');
            const statusList = Utils.createElement('div', { class: 'status-list' });

            // 创建状态步骤
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

                this.statusItems[step.step] = {
                    element: item,
                    title: titleEl,
                    desc: descEl,
                    icon: icon
                };
            });

            Utils.appendChildren(statusContainer, statusTitle, statusList);
            content.appendChild(statusContainer);

            // 创建日志区域
            this.createLogSection(content);

            // 创建链接汇总区域
            const linksContainer = Utils.createElement('div', { class: 'links-container' });
            const linksTitle = Utils.createElement('div', { class: 'links-title' }, '处理完成的视频链接');
            const linksSummary = Utils.createElement('div', { class: 'links-summary' });
            this.linksList = Utils.createElement('div', { class: 'links-list' });
            this.copyAllBtn = Utils.createElement('button', { class: 'copy-all-btn' }, '复制所有链接到剪贴板');

            Utils.appendChildren(linksSummary, this.linksList, this.copyAllBtn);
            Utils.appendChildren(linksContainer, linksTitle, linksSummary);
            content.appendChild(linksContainer);

            // 创建操作按钮区域
            const actions = Utils.createElement('div', { class: 'panel-actions' });
            const startBtn = Utils.createElement('button', {
                class: 'panel-btn panel-btn-primary',
                id: 'start-process'
            }, '🚀 开始处理');
            const resetBtn = Utils.createElement('button', {
                class: 'panel-btn panel-btn-secondary',
                id: 'reset-process'
            }, '🔄 重置流程');

            Utils.appendChildren(actions, startBtn, resetBtn);

            // 组装完整面板
            Utils.appendChildren(this.panel, header, content, actions);
            document.body.appendChild(this.panel);

            // 启用拖动功能
            this.enableDrag(this.panel, header);
        }

        enableDrag(element, dragHandle) {
            let isDragging = false;
            let offsetX, offsetY;

            dragHandle.addEventListener('mousedown', (e) => {
                if (e.target.closest('.panel-close')) return;

                isDragging = true;
                const elementRect = element.getBoundingClientRect();
                offsetX = e.clientX - elementRect.left;
                offsetY = e.clientY - elementRect.top;

                element.style.transition = 'none';
                element.style.willChange = 'transform';
                document.body.style.userSelect = 'none';

                e.preventDefault();
            });

            const handleMove = (e) => {
                if (!isDragging) return;

                requestAnimationFrame(() => {
                    const x = e.clientX - offsetX;
                    const y = e.clientY - offsetY;

                    const maxX = window.innerWidth - element.offsetWidth;
                    const maxY = window.innerHeight - element.offsetHeight;

                    element.style.left = `${Math.min(Math.max(0, x), maxX)}px`;
                    element.style.top = `${Math.min(Math.max(0, y), maxY)}px`;
                    element.style.right = 'auto';
                });
            }

            const stopMoving = () => {
                if (isDragging) {
                    isDragging = false;
                    element.style.transition = 'all 0.3s ease';
                    element.style.willChange = 'auto';
                    document.body.style.userSelect = '';
                }
            }

            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', stopMoving);

            dragHandle.addEventListener('dragstart', (e) => {
                e.preventDefault();
            });
        }

        setupEventListeners() {
            this.panel.addEventListener('click', (e) => {
                const target = e.target;

                if (target.closest('.panel-close')) {
                    this.panel.classList.remove('visible');
                } else if (target.closest('#start-process')) {
                    startProcessing();
                } else if (target.closest('#reset-process')) {
                    this.resetProcess();
                }
            });

            // 复制所有链接
            this.copyAllBtn.addEventListener('click', () => {
                const linkItems = this.linksList.querySelectorAll('.link-item');
                const categoryTitles = this.linksList.querySelectorAll('.category-title');

                let clipboardText = '';
                let currentCategory = '';

                this.linksList.childNodes.forEach(child => {
                    if (child.classList && child.classList.contains('category-title')) {
                        currentCategory = child.textContent;
                        clipboardText += `${currentCategory}\n`;
                    } else if (child.classList && child.classList.contains('link-item')) {
                        const languageCode = child.querySelector('.language-code')?.textContent || '';
                        const url = child.querySelector('.link-url')?.textContent || '';

                        if (languageCode && url) {
                            clipboardText += `${languageCode}\n${url}\n`;
                        } else {
                            const name = child.querySelector('.link-name')?.textContent || '';
                            if (name && url) {
                                clipboardText += `${name}: ${url}\n`;
                            }
                        }
                    }
                });

                GM_setClipboard(clipboardText.trim(), 'text');
                this.showNotification('✅ 已复制所有链接到剪贴板（按品类分组）');
            });
        }

        resetProcess() {
            isProcessing = false;
            titleProcessed = false;
            currentFileIndex = 0;
            processedLinks = [];

            this.linksList.innerHTML = '';

            Object.keys(this.statusItems).forEach(step => {
                const item = this.statusItems[step];
                item.element.classList.remove(STATUS.ACTIVE, STATUS.COMPLETED, STATUS.FAILED);
                item.icon.textContent = (Object.keys(this.statusItems).indexOf(step) + 1).toString();
                item.desc.textContent = '等待处理...';
            });

            Object.keys(this.fileItems).forEach(fileName => {
                const item = this.fileItems[fileName];
                item.element.classList.remove('active', 'completed', 'failed');
                item.status.textContent = '';
            });

            this.showNotification('🔄  流程已重置');
        }

        updateFileList(files) {
            while (this.fileListContainer.firstChild) {
                this.fileListContainer.removeChild(this.fileListContainer.firstChild);
            }
            this.fileItems = {};

            files.forEach(file => {
                const fileItem = Utils.createElement('div', {
                    class: 'file-item',
                    'data-filename': file.name
                });

                const fileName = Utils.createElement('div', { class: 'file-name' }, file.name);
                const fileStatus = Utils.createElement('div', { class: 'file-status' }, file.status);

                Utils.appendChildren(fileItem, fileName, fileStatus);
                this.fileListContainer.appendChild(fileItem);

                this.fileItems[file.name] = {
                    element: fileItem,
                    name: fileName,
                    status: fileStatus
                };

                this.updateFileStatus(file.name, Utils.normalizeStatus(file.status));
            });
        }

        updateFileStatus(fileName, status) {
            const fileItem = this.fileItems[fileName];
            if (!fileItem) return;

            fileItem.element.classList.remove(
                STATUS.ACTIVE,
                STATUS.COMPLETED,
                STATUS.FAILED,
                STATUS.PENDING,
                STATUS.UPLOADING,
                STATUS.PROCESSING
            );

            fileItem.element.classList.add(status);
            fileItem.status.textContent = Utils.getStatusDisplayText(status);
        }

        updateStatus(step, status, description = '') {
            const item = this.statusItems[step];
            if (!item) return;

            item.element.classList.remove(STATUS.ACTIVE, STATUS.COMPLETED, STATUS.FAILED);
            item.desc.textContent = description || item.desc.textContent;

            if (status === STATUS.ACTIVE) {
                item.element.classList.add(STATUS.ACTIVE);
                item.desc.textContent = description || '处理中...';
            } else if (status === STATUS.COMPLETED) {
                item.element.classList.add(STATUS.COMPLETED);
                item.icon.textContent = '✓';
                item.desc.textContent = description || '已完成';
            } else if (status === STATUS.FAILED) {
                item.element.classList.add(STATUS.FAILED);
                item.icon.textContent = '×';
                item.desc.textContent = description || '失败';
            }

            item.element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        showNotification(message) {
            const notification = Utils.createElement('div', { class: 'panel-notification' }, message);
            document.body.appendChild(notification);

            setTimeout(() => {
                notification.remove();
            }, 3000);
        }

        addProcessedLink(fileName, url) {
            const match = fileName.match(/^([A-Z]{2})([A-Za-z]+)(\d*)\./i);
            if (!match) {
                const linkItem = Utils.createElement('div', { class: 'link-item' });
                const linkName = Utils.createElement('div', { class: 'link-name' }, fileName);
                const linkUrl = Utils.createElement('div', { class: 'link-url' }, url);
                Utils.appendChildren(linkItem, linkName, linkUrl);
                this.linksList.appendChild(linkItem);
                return;
            }

            const languageCode = match[1].toLowerCase();
            const category = match[2].toLowerCase();

            if (!this.linksList.querySelector(`.category-title[data-category="${category}"]`)) {
                const categoryTitle = Utils.createElement('div', {
                    class: 'category-title',
                    'data-category': category
                }, category);
                this.linksList.appendChild(categoryTitle);
            }

            const linkItem = Utils.createElement('div', { class: 'link-item' });
            const languageCodeEl = Utils.createElement('div', { class: 'language-code' }, languageCode);
            const linkUrl = Utils.createElement('div', { class: 'link-url' }, url);

            Utils.appendChildren(linkItem, languageCodeEl, linkUrl);
            this.linksList.appendChild(linkItem);

            this.linksList.scrollTop = this.linksList.scrollHeight;
        }

        createLogSection(contentContainer) {
            this.logContainer = Utils.createElement('div', { class: 'log-container' });
            const logTitle = Utils.createElement('div', { class: 'log-title' }, '处理日志');
            this.logToggle = Utils.createElement('span', { class: 'log-toggle' }, '显示详细');
            this.logContent = Utils.createElement('div', { class: 'log-content' });

            Utils.appendChildren(logTitle, this.logToggle);
            Utils.appendChildren(this.logContainer, logTitle, this.logContent);

            let linksContainer = contentContainer.querySelector('.links-container');
            if (!linksContainer) {
                contentContainer.appendChild(this.logContainer);
            } else {
                if (linksContainer.parentNode === contentContainer) {
                    contentContainer.insertBefore(this.logContainer, linksContainer);
                } else {
                    contentContainer.appendChild(this.logContainer);
                }
            }

            logTitle.addEventListener('click', () => {
                this.logContent.classList.toggle('expanded');
                this.logToggle.textContent = this.logContent.classList.contains('expanded') ? '隐藏详细' : '显示详细';
            });
        }

        addLog(message, type = 'info') {
            const logItem = Utils.createElement('div', {
                class: `log-item ${type}`
            }, `[${new Date().toLocaleTimeString()}] ${message}`);

            this.logContent.appendChild(logItem);

            if (this.logContent.classList.contains('expanded')) {
                this.logContent.scrollTop = this.logContent.scrollHeight;
            }

            if (type === 'error') {
                this.logContent.classList.add('expanded');
                this.logToggle.textContent = '隐藏详细';
            }
        }

        addAILog(message, type = 'info') {
            this.addLog(message, type);
        }
    }

    // ===================== AI标题处理器 =====================
    class AITitleProcessor {
        constructor() {
            this.apiKey = "6869437c-0d6b-42ee-8c6d-4c865ca9b475";
            this.apiUrl = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
        }

        async processTitle(originalTitle, controlPanel) {
            try {
                controlPanel.addAILog('开始解析标题...');

                const { languageCode, appName } = this.extractTitleParts(originalTitle);
                if (!languageCode || !appName) {
                    throw new Error('标题格式不符合要求（示例: ESCUSTOMUSE1）');
                }

                const languageName = LANGUAGE_MAP[languageCode] || languageCode;
                controlPanel.addAILog(`识别到: 语言=${languageName}, 应用=${appName}`);

                const prompt = this.getDefaultPromptTemplate()
                    .replace(/{appName}/g, appName)
                    .replace(/{languageName}/g, languageName)
                    .replace(/{languageCode}/g, languageCode);

                controlPanel.addAILog(`请求AI生成标题: ${prompt}`);

                const aiTitle = await this.getAITitle(prompt);
                controlPanel.addAILog(`AI 生成标题: ${aiTitle}`);

                return `${languageCode}）${aiTitle}`;
            } catch (error) {
                controlPanel.addAILog(`处理失败: ${error.message}`, 'error');
                throw error;
            }
        }

        getDefaultPromptTemplate() {
            return `为{appName} App生成一个吸引人的{languageName}推广标题，并附上一句简短的推广文案。要求：
1. 标题要简洁有力，突出App的核心价值或独特卖点
2. 推广文案要能激发用户兴趣，控制在15字以内
3. 直接给出结果，不需要额外解释

示例格式:
[吸引人的标题] - [简短有力的推广文案]`;
        }

        extractTitleParts(title) {
            const cleanTitle = title.replace(/[^a-zA-Z0-9]/g, '');
            const match = cleanTitle.match(/^([A-Z]{2})([A-Za-z]+)(\d*)$/i);

            if (!match) {
                throw new Error(`标题格式无效，示例: "ESCUSTOMUSE1" → "ES"（语言）+ "CUSTOMUSE"（App）+ "1"（序号）`);
            }

            const languageCode = match[1].toUpperCase();
            const appName = match[2].replace(/[^a-zA-Z]/g, '').toLowerCase();
            const number = match[3] || '';

            return { languageCode, appName, number };
        }

        async getAITitle(prompt) {
            const data = {
                model: "ep-20250813143100-7b9vf",
                messages: [{ role: "user", content: prompt }]
            };

            const headers = {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json"
            };

            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`AI请求失败: ${response.status}`);
            }

            const result = await response.json();
            const content = result.choices?.[0]?.message?.content || '';
            return content.trim();
        }
    }

    // ===================== 主逻辑部分 =====================
    let isProcessing = false;
    let titleProcessed = false;
    let currentFileIndex = 0;
    let processedLinks = [];
    let controlPanel = null;

    function initScript() {
        if (window.location.hostname !== 'studio.youtube.com') return;

        controlPanel = new ControlPanel();
        removeLogoutButton();
        setupMutationObserver();
        monitorUploads();
    }

    function monitorUploads() {
        const checkInterval = setInterval(() => {
            const progressItems = Utils.safeQuerySelectorAll(DOM_SELECTORS.PROGRESS_ITEM);

            if (progressItems.length > 0) {
                const newFiles = progressItems.map(item => {
                    const name = item.querySelector('.progress-title').textContent.trim();
                    const status = item.querySelector('.progress-status-text').textContent.trim();
                    const progressBar = item.querySelector('.progress-bar');
                    const isUploaded = progressBar && progressBar.style.width === '100%';
                    return { name, status, element: item, isUploaded };
                });

                controlPanel.updateFileList(newFiles);

                newFiles.forEach(file => {
                    if (file.isUploaded && !processedLinks.some(l => l.name === file.name)) {
                        if (!isProcessing) {
                            startProcessing();
                        }
                    }
                });
            }
        }, 2000);
    }

    function startProcessing() {
        if (isProcessing) return;

        isProcessing = true;
        const progressItems = Utils.safeQuerySelectorAll(DOM_SELECTORS.PROGRESS_ITEM);

        if (progressItems.length === 0) {
            controlPanel.showNotification('⚠️  未找到上传文件');
            isProcessing = false;
            return;
        }

        currentFileIndex = 0;
        processNextFile();
    }

    async function processNextFile() {
        const progressItems = Utils.safeQuerySelectorAll(DOM_SELECTORS.PROGRESS_ITEM);

        if (currentFileIndex >= progressItems.length) {
            isProcessing = false;

            const allLinks = processedLinks.map(l => `${l.name}:  ${l.url}`).join('\n');
            GM_setClipboard(allLinks, 'text');

            controlPanel.showNotification('✅  所有文件处理完成，链接已复制到剪贴板');
            return;
        }

        const currentItem = progressItems[currentFileIndex];
        const fileName = currentItem.querySelector('.progress-title').textContent.trim();

        if (processedLinks.some(l => l.name === fileName)) {
            currentFileIndex++;
            processNextFile();
            return;
        }

        controlPanel.updateFileStatus(fileName, 'processing', true);

        const editButton = currentItem.querySelector(DOM_SELECTORS.EDIT_BUTTON);
        if (editButton) {
            editButton.click();
            await Utils.delay(DELAY.LONG);
            await processCurrentFile(fileName);
        } else {
            controlPanel.updateFileStatus(fileName, 'failed', false);
            currentFileIndex++;
            processNextFile();
        }
    }

    async function processCurrentFile(fileName) {
        try {
            await autoProcessTitle(fileName);
            await selectNotForKids();
            await clickContinueThreeTimes();
            await selectUnlistedOption();
            const link = await extractVideoLink();
            await clickSaveButton();


            processedLinks.push({ name: fileName, url: link });
            controlPanel.addProcessedLink(fileName, link);

            await Utils.delay(5000);
            await robustCloseDialog();

            controlPanel.updateFileStatus(fileName, 'completed', false);

        } catch (error) {
            console.error(`处理文件 ${fileName} 时出错:`, error);
            controlPanel.updateFileStatus(fileName, 'failed', false);
        } finally {
            currentFileIndex++;
            processNextFile();
        }
    }

    async function extractVideoLink() {
        controlPanel.updateStatus('link', STATUS.ACTIVE, '正在提取视频链接...');

        const maxAttempts = 30;
        let attempts = 0;

        while (attempts < maxAttempts) {
            const linkElement = document.querySelector('div.value.style-scope.ytcp-video-info a[href*="youtu"]');

            if (linkElement) {
                try {
                    const url = linkElement.href || linkElement.textContent.trim();
                    let videoId = '';

                    if (url.includes('youtube.com/shorts/')) {
                        videoId = url.split('youtube.com/shorts/')[1].split('?')[0];
                    }
                    else if (url.includes('youtu.be/')) {
                        videoId = url.split('youtu.be/')[1].split('?')[0];
                    }
                    else if (url.includes('youtube.com/watch?v=')) {
                        videoId = url.split('v=')[1].split('&')[0];
                    }
                    else {
                        const idMatch = url.match(/[a-zA-Z0-9_-]{11}/);
                        if (idMatch) videoId = idMatch[0];
                    }

                    if (videoId) {
                        const standardLink = `https://youtube.com/watch?v=${videoId}`;
                        controlPanel.updateStatus('link', STATUS.COMPLETED, `链接已提取: ${standardLink}`);
                        return standardLink;
                    }
                } catch (e) {
                    console.error('提取视频ID出错:', e);
                }
            }

            attempts++;
            await Utils.delay(1000);
        }

        throw new Error('提取视频链接超时');
    }

    async function autoProcessTitle(fileName) {
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
            attempts++;
            const textbox = document.querySelector(DOM_SELECTORS.TITLE_TEXTBOX);

            if (textbox) {
                try {
                    const currentContent = textbox.value || textbox.textContent || '';
                    const originalTitle = currentContent.trim();

                    if (originalTitle.includes('）')) {
                        controlPanel.updateStatus('title', STATUS.COMPLETED, '标题已处理（跳过）');
                        return;
                    }

                    const newTitle = await controlPanel.aiProcessor.processTitle(
                        originalTitle || fileName.replace(/\.[^/.]+$/, ""),
                        controlPanel
                    );

                    if (textbox.value) {
                        textbox.value = newTitle;
                        textbox.dispatchEvent(new Event('input', { bubbles: true }));
                    } else {
                        textbox.textContent = newTitle;
                        textbox.dispatchEvent(new Event('input', { bubbles: true }));
                    }

                    controlPanel.updateStatus('title', STATUS.COMPLETED, `AI标题: ${newTitle}`);
                    return;

                } catch (error) {
                    console.error('AI 标题处理失败:', error);
                    const match = (textbox.value || textbox.textContent || '').match(/^([A-Z]{2})/i);
                    if (match) {
                        const fallbackTitle = match[1] + ')';
                        if (textbox.value) {
                            textbox.value = fallbackTitle;
                            textbox.dispatchEvent(new Event('input', { bubbles: true }));
                        } else {
                            textbox.textContent = fallbackTitle;
                            textbox.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                        controlPanel.updateStatus('title', STATUS.COMPLETED, `回退标题: ${fallbackTitle}`);
                        return;
                    }
                }
            }

            await Utils.delay(DELAY.SHORT);
        }

        controlPanel.updateStatus('title', STATUS.FAILED, '无法处理标题');
    }

    async function selectNotForKids() {
        controlPanel.updateStatus('kids', STATUS.ACTIVE, '正在选择非儿童内容...');

        const radio = await Utils.waitForElement(DOM_SELECTORS.NOT_FOR_KIDS_RADIO, 5000);
        if (radio && radio.getAttribute('aria-checked') !== 'true') {
            radio.click();
            controlPanel.updateStatus('kids', STATUS.COMPLETED, '已设置为非儿童内容');
        } else {
            controlPanel.updateStatus('kids', STATUS.COMPLETED, '已是非儿童内容设置');
        }
        await Utils.delay(DELAY.SHORT);
    }

    async function clickContinueThreeTimes() {
        controlPanel.updateStatus('continue', STATUS.ACTIVE, '正在点击继续按钮...');

        let count = 0;
        let retryCount = 0;
        const maxRetries = 5;

        while (count < 3 && retryCount < maxRetries) {
            const button = await Utils.waitForElement(DOM_SELECTORS.NEXT_BUTTON, 3000);

            if (button && button.getAttribute('aria-disabled') === 'false') {
                try {
                    button.click();
                    count++;
                    controlPanel.updateStatus('continue', STATUS.ACTIVE, `点击继续 (${count}/3)`);

                    await Utils.delay(DELAY.LONG * 2);

                    const isPageResponsive = await Utils.checkPageResponsiveness();
                    if (!isPageResponsive) {
                        throw new Error('页面无响应');
                    }

                    retryCount = 0;
                } catch (error) {
                    console.error('点击继续按钮时出错:', error);
                    retryCount++;
                    await Utils.delay(DELAY.MEDIUM * 2);
                }
            } else {
                retryCount++;
                await Utils.delay(DELAY.MEDIUM);
            }
        }

        if (count < 3) {
            controlPanel.updateStatus('continue', STATUS.FAILED, `只成功点击了 ${count} 次继续按钮`);
        } else {
            controlPanel.updateStatus('continue', STATUS.COMPLETED, '成功点击3次继续按钮');
        }

        await Utils.delay(DELAY.LONG);
    }

    async function selectUnlistedOption() {
        controlPanel.updateStatus('visibility', STATUS.ACTIVE, '正在设置不公开列出...');

        let attempts = 0;
        const maxAttempts = 10;
        let success = false;

        while (attempts < maxAttempts && !success) {
            const radio = await Utils.waitForElement(DOM_SELECTORS.UNLISTED_RADIO, 2000);

            if (radio) {
                if (radio.getAttribute('aria-checked') === 'true') {
                    controlPanel.updateStatus('visibility', STATUS.COMPLETED, '已是不公开列出设置');
                    return;
                }

                try {
                    radio.click();
                    await Utils.delay(DELAY.SHORT);

                    if (radio.getAttribute('aria-checked') === 'true') {
                        success = true;
                        controlPanel.updateStatus('visibility', STATUS.COMPLETED, '已设置为不公开列出');
                    } else {
                        attempts++;
                        await Utils.delay(DELAY.MEDIUM);
                    }
                } catch (error) {
                    console.error('设置不公开列出时出错:', error);
                    attempts++;
                    await Utils.delay(DELAY.MEDIUM);
                }
            } else {
                const nextButton = await Utils.waitForElement(DOM_SELECTORS.NEXT_BUTTON, 1000);
                if (nextButton && nextButton.getAttribute('aria-disabled') === 'false') {
                    nextButton.click();
                    await Utils.delay(DELAY.LONG);
                }
                attempts++;
                await Utils.delay(DELAY.MEDIUM);
            }
        }

        if (!success) {
            controlPanel.updateStatus('visibility', STATUS.FAILED, '设置不公开列出失败');
        }
    }

    async function clickSaveButton() {
        const maxAttempts = 5;
        let attempts = 0;

        while (attempts < maxAttempts) {
            const saveButton = document.querySelector('button[aria-label="保存"]');

            if (saveButton && saveButton.getAttribute('aria-disabled') === 'false') {
                console.log("找到保存按钮，正在点击...");
                saveButton.click();
                return true;
            }

            attempts++;
            console.log(`尝试点击保存按钮 (${attempts}/${maxAttempts})...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        throw new Error("无法点击保存按钮：按钮未找到或不可点击");
    }

    async function robustCloseDialog() {
        const maxAttempts = 15;
        const interval = 500;

        for (let i = 0; i < maxAttempts; i++) {
            const closeButton = document.querySelector('ytcp-button#close-button button');
            if (closeButton) {
                closeButton.click();
                return;
            }

            const closeIconButton = document.querySelector('ytcp-icon-button#close-icon-button');
            if (closeIconButton) {
                closeIconButton.click();
                return;
            }

            const svgCloseButton = document.querySelector('ytcp-icon-button#close-icon-button yt-icon');
            if (svgCloseButton) {
                svgCloseButton.click();
                return;
            }

            await new Promise(resolve => setTimeout(resolve, interval));
        }
        console.error('Close button not found after waiting');
    }

    function removeLogoutButton() {
        document.querySelectorAll(DOM_SELECTORS.LOGOUT_CONTAINER)
            .forEach(link => link.closest('ytd-compact-link-renderer')?.remove());
    }

    function setupMutationObserver() {
        new MutationObserver(() => {
            removeLogoutButton();
        }).observe(document.body, { childList: true, subtree: true });
    }

    // ===================== 初始化执行 =====================
    const init = _.debounce(initScript, 500);
    window.addEventListener('load', init);
    document.addEventListener('DOMContentLoaded', init);
    console.log("github脚本已加载")
})();
