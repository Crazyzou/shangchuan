// 燕山丰快捷上传 - 业务逻辑 (标题定制优化版)
(function () {
    'use strict';

    // ===================== 配置区域 =====================
    // 【重要】每次更新 GitHub 请修改此版本号
    const SCRIPT_VERSION = '1.2.0'; 

    const CONFIG = {
        SELECTORS: {
            PROGRESS_ITEM: '#progress-list .row',
            EDIT_BUTTON: '#progress-list .edit-button',
            TITLE_INPUT: '#textbox[slot="input"][contenteditable="true"], ytcp-video-title input, #container.ytcp-video-title input',
            NOT_FOR_KIDS: 'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
            NEXT_BUTTON: 'ytcp-button#next-button, button[aria-label="继续"], button[aria-label="Continue"]',
            UNLISTED: 'tp-yt-paper-radio-button[name="UNLISTED"]',
            SAVE_BUTTON: 'ytcp-button#done-button, ytcp-button[aria-label="保存"], button[aria-label="保存"]',
            CLOSE_BUTTON: 'ytcp-button#close-button, ytcp-icon-button#close-icon-button, button[aria-label="关闭"]'
        },
        DELAYS: {
            TINY: 300,
            SHORT: 600,
            MEDIUM: 1000,
            LONG: 1500
        },
        // 语言映射表，可自行补充需要的语言代码
        LANG_MAP: {
            'ES': '西班牙语', 'US': '英语', 'CN': '中文', 'FR': '法语', 'DE': '德语',
            'JP': '日语', 'BR': '葡萄牙语', 'KR': '韩语', 'GB': '英语', 'RU': '俄语',
            'IT': '意大利语', 'AR': '阿拉伯语', 'IN': '印地语', 'ID': '印尼语', 'TR': '土耳其语'
        },
        // 【可自定义】标题时间格式，YYYY=年 MM=月 DD=日 HH=时 mm=分 ss=秒
        TITLE_TIME_FORMAT: 'YYYY-MM-DD HH:mm'
    };

    // ===================== 工具函数库 =====================
    const $ = (sel, parent = document) => parent.querySelector(sel);
    const $$ = (sel, parent = document) => Array.from(parent.querySelectorAll(sel));
    
    const Utils = {
        createEl(tag, attrs = {}, text = '') {
            const el = document.createElement(tag);
            Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
            if (text) el.textContent = text;
            return el;
        },

        delay(ms) {
            return new Promise(r => setTimeout(r, ms));
        },

        async waitFor(selector, timeout = 5000, parent = document) {
            const start = Date.now();
            while (Date.now() - start < timeout) {
                const el = $(selector, parent);
                if (el) return el;
                await this.delay(150);
            }
            return null;
        },

        click(el) {
            if (!el) return false;
            (el.querySelector('button') || el).click();
            return true;
        },

        // 【新增】时间格式化工具，适配标题时间生成
        formatTime(format = CONFIG.TITLE_TIME_FORMAT, date = new Date()) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');

            return format
                .replace('YYYY', year)
                .replace('MM', month)
                .replace('DD', day)
                .replace('HH', hours)
                .replace('mm', minutes)
                .replace('ss', seconds);
        },

        // 【新增】从文件名提取语言代码，兼容原命名规则
        extractLangCode(fileName) {
            // 匹配文件名开头的2位字母语言代码（支持大小写）
            const cleanName = fileName.replace(/\.[^/.]+$/, '').trim(); // 去掉文件后缀
            const langMatch = cleanName.match(/^([A-Za-z]{2})/i);
            
            if (!langMatch) return null;
            const langCode = langMatch[1].toUpperCase();
            // 验证是否在语言映射表中，避免无效代码
            return CONFIG.LANG_MAP[langCode] ? langCode : null;
        }
    };

    // ===================== 样式注入 (精简美化版) =====================
    GM_addStyle(`
        #yt-helper-panel {
            position: fixed; top: 20px; right: 20px; z-index: 9999;
            width: 340px; background: #fff; border-radius: 12px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.12);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            overflow: hidden; user-select: none;
            display: flex; flex-direction: column;
            max-height: 85vh;
        }
        .panel-header {
            background: #202124; color: #fff; padding: 12px 16px;
            display: flex; align-items: center; justify-content: space-between;
        }
        .panel-title { font-size: 15px; font-weight: 600; margin: 0; display: flex; align-items: center; gap: 8px; }
        .panel-title .version { 
            font-size: 11px; background: #3c4043; padding: 2px 6px; border-radius: 4px; 
            color: #8ab4f8; font-weight: 500;
        }
        .panel-close {
            background: transparent; border: none; color: #9aa0a6; font-size: 20px;
            cursor: pointer; width: 28px; height: 28px; padding: 0; line-height: 1;
        }
        .panel-content { padding: 0; overflow-y: auto; flex: 1; }
        .panel-content::-webkit-scrollbar { width: 6px; }
        .panel-content::-webkit-scrollbar-thumb { background: #dadce0; border-radius: 3px; }
        
        /* 通用区块 */
        .section { padding: 12px 16px; border-bottom: 1px solid #f1f3f4; }
        .section-title { font-size: 12px; font-weight: 600; color: #5f6368; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
        
        /* 文件列表 */
        .file-list { display: flex; flex-direction: column; gap: 6px; }
        .file-item {
            display: flex; justify-content: space-between; align-items: center;
            padding: 8px 10px; background: #f8f9fa; border-radius: 6px; font-size: 13px;
        }
        .file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 8px; color: #202124; }
        .file-status { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
        .file-status.completed { background: #e6f4ea; color: #137333; }
        .file-status.processing, .file-status.active { background: #e8f0fe; color: #1a73e8; }
        .file-status.failed { background: #fce8e6; color: #c5221f; }

        /* 进度条 */
        .steps { display: flex; justify-content: space-between; margin-top: 4px; }
        .step {
            display: flex; flex-direction: column; align-items: center; flex: 1;
        }
        .step-dot {
            width: 18px; height: 18px; border-radius: 50%; background: #e8eaed;
            display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; color: #5f6368;
            transition: all 0.2s;
        }
        .step.active .step-dot { background: #1a73e8; color: #fff; transform: scale(1.1); }
        .step.completed .step-dot { background: #34a853; color: #fff; }
        .step-line { height: 2px; background: #e8eaed; flex: 1; margin: 8px 4px 0; position: relative; top: -10px; }
        
        /* 链接区域 */
        .links-box { background: #f1f3f4; border-radius: 8px; padding: 10px; max-height: 150px; overflow-y: auto; }
        .link-item { font-size: 12px; margin-bottom: 6px; display: flex; flex-direction: column; }
        .link-item:last-child { margin-bottom: 0; }
        .link-name { color: #5f6368; margin-bottom: 2px; }
        .link-url { color: #1a73e8; word-break: break-all; text-decoration: none; }
        
        /* 底部按钮 */
        .panel-footer { padding: 12px 16px; background: #fff; display: flex; gap: 10px; }
        .btn {
            flex: 1; padding: 10px 0; border: none; border-radius: 8px; font-size: 14px; font-weight: 600;
            cursor: pointer; transition: background 0.2s;
        }
        .btn-primary { background: #1a73e8; color: #fff; }
        .btn-primary:hover { background: #1765cc; }
        .btn-secondary { background: #f1f3f4; color: #5f6368; }
        .btn-secondary:hover { background: #e8eaed; }
        
        /* 简单通知 */
        .yt-toast {
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: #202124; color: #fff; padding: 10px 20px; border-radius: 8px;
            font-size: 14px; z-index: 10001; animation: fadeIn 0.2s;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
    `);

    // ===================== 主控制面板类 =====================
    class ControlPanel {
        constructor() {
            this.panel = null;
            this.fileItems = {};
            this.currentStepIndex = 0;
            this.steps = ['标题', '儿童', '继续', '可见性', '链接', '保存'];
            this.init();
        }

        init() {
            this.createPanel();
            this.setupDrag();
        }

        createPanel() {
            // 主容器
            this.panel = Utils.createEl('div', { id: 'yt-helper-panel' });

            // 头部
            const header = Utils.createEl('div', { class: 'panel-header' });
            const title = Utils.createEl('div', { class: 'panel-title' });
            // ✅ 修复1：替换innerHTML为DOM创建
            const titleText = document.createTextNode('🎬 上传助手 ');
            const versionSpan = Utils.createEl('span', { class: 'version' }, `v${SCRIPT_VERSION}`);
            title.appendChild(titleText);
            title.appendChild(versionSpan);
            
            const closeBtn = Utils.createEl('button', { class: 'panel-close' }, '×');
            closeBtn.onclick = () => this.panel.style.display = 'none';
            header.appendChild(title);
            header.appendChild(closeBtn);

            // 内容区
            const content = Utils.createEl('div', { class: 'panel-content' });

            // 1. 文件列表区
            const secFiles = Utils.createEl('div', { class: 'section' });
            // ✅ 修复2：替换innerHTML为DOM创建
            const fileTitle = Utils.createEl('div', { class: 'section-title' }, '待处理文件');
            secFiles.appendChild(fileTitle);
            
            this.fileListContainer = Utils.createEl('div', { class: 'file-list' });
            secFiles.appendChild(this.fileListContainer);
            content.appendChild(secFiles);

            // 2. 流程进度区 (简化为横向 dots)
            const secProgress = Utils.createEl('div', { class: 'section' });
            // ✅ 修复3：替换innerHTML为DOM创建
            const progressTitle = Utils.createEl('div', { class: 'section-title' }, '当前进度');
            secProgress.appendChild(progressTitle);
            
            this.stepsContainer = Utils.createEl('div', { class: 'steps' });
            this.renderSteps();
            secProgress.appendChild(this.stepsContainer);
            content.appendChild(secProgress);

            // 3. 链接区
            const secLinks = Utils.createEl('div', { class: 'section' });
            // ✅ 修复4：替换innerHTML为DOM创建
            const linkTitle = Utils.createEl('div', { class: 'section-title' }, '已完成链接');
            secLinks.appendChild(linkTitle);
            
            this.linksContainer = Utils.createEl('div', { class: 'links-box' });
            secLinks.appendChild(this.linksContainer);
            content.appendChild(secLinks);

            // 底部
            const footer = Utils.createEl('div', { class: 'panel-footer' });
            const btnStart = Utils.createEl('button', { class: 'btn btn-primary' }, '开始处理');
            const btnReset = Utils.createEl('button', { class: 'btn btn-secondary' }, '重置');
            btnStart.onclick = () => startProcessing();
            btnReset.onclick = () => this.reset();
            footer.appendChild(btnStart);
            footer.appendChild(btnReset);

            this.panel.appendChild(header);
            this.panel.appendChild(content);
            this.panel.appendChild(footer);
            document.body.appendChild(this.panel);
        }

        renderSteps() {
            this.stepsContainer.innerHTML = '';
            this.steps.forEach((text, index) => {
                if (index > 0) {
                    this.stepsContainer.appendChild(Utils.createEl('div', { class: 'step-line' }));
                }
                const step = Utils.createEl('div', { class: 'step', 'data-index': index });
                const dot = Utils.createEl('div', { class: 'step-dot' }, (index + 1).toString());
                step.appendChild(dot);
                this.stepsContainer.appendChild(step);
            });
        }

        setStep(index, status = 'active') { // status: active, completed
            const dots = this.stepsContainer.querySelectorAll('.step');
            dots.forEach((dot, i) => {
                dot.classList.remove('active', 'completed');
                if (i < index) dot.classList.add('completed');
                if (i === index) dot.classList.add(status);
            });
        }

        updateFiles(files) {
            this.fileListContainer.innerHTML = '';
            this.fileItems = {};
            files.forEach(f => {
                const item = Utils.createEl('div', { class: 'file-item', 'data-name': f.name });
                const name = Utils.createEl('div', { class: 'file-name' }, f.name);
                const status = Utils.createEl('div', { class: 'file-status' }, f.status || '等待中');
                item.appendChild(name);
                item.appendChild(status);
                this.fileListContainer.appendChild(item);
                this.fileItems[f.name] = { el: item, statusEl: status };
            });
        }

        setFileStatus(name, status) {
            const map = { 'processing': '处理中', 'completed': '已完成', 'failed': '失败' };
            const item = this.fileItems[name];
            if (!item) return;
            item.statusEl.textContent = map[status] || status;
            item.statusEl.className = `file-status ${status}`;
        }

        addLink(name, url) {
            const wrap = Utils.createEl('div', { class: 'link-item' });
            wrap.appendChild(Utils.createEl('div', { class: 'link-name' }, name));
            const a = Utils.createEl('a', { class: 'link-url', href: url, target: '_blank' }, url);
            wrap.appendChild(a);
            this.linksContainer.appendChild(wrap);
            this.linksContainer.scrollTop = this.linksContainer.scrollHeight;
        }

        reset() {
            this.renderSteps();
            this.linksContainer.innerHTML = '';
            this.toast('已重置');
        }

        toast(msg) {
            const t = Utils.createEl('div', { class: 'yt-toast' }, msg);
            document.body.appendChild(t);
            setTimeout(() => t.remove(), 2500);
        }

        setupDrag() {
            const header = this.panel.querySelector('.panel-header');
            let isDrag = false, startX, startY, startLeft, startTop;

            header.addEventListener('mousedown', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                isDrag = true;
                startX = e.clientX;
                startY = e.clientY;
                const rect = this.panel.getBoundingClientRect();
                startLeft = rect.left;
                startTop = rect.top;
                this.panel.style.transition = 'none';
            });

            window.addEventListener('mousemove', (e) => {
                if (!isDrag) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                this.panel.style.left = `${startLeft + dx}px`;
                this.panel.style.top = `${startTop + dy}px`;
                this.panel.style.right = 'auto';
            });

            window.addEventListener('mouseup', () => {
                isDrag = false;
                this.panel.style.transition = '';
            });
        }
    }

    // ===================== 业务逻辑 =====================
    let controlPanel = null;
    let isProcessing = false;
    let processedLinks = [];

    // 初始化
    function init() {
        if (window.location.hostname !== 'studio.youtube.com') return;
        controlPanel = new ControlPanel();
        monitorUploads();
    }

    function monitorUploads() {
        setInterval(() => {
            const rows = $$(CONFIG.SELECTORS.PROGRESS_ITEM);
            if (rows.length > 0) {
                const files = rows.map(item => ({
                    name: item.querySelector('.progress-title')?.textContent.trim() || '未知文件',
                    status: item.querySelector('.progress-status-text')?.textContent.trim() || '上传中',
                    element: item
                }));
                controlPanel.updateFiles(files);
            }
        }, 1500);
    }

    async function startProcessing() {
        if (isProcessing) return;
        const rows = $$(CONFIG.SELECTORS.PROGRESS_ITEM);
        if (rows.length === 0) return controlPanel.toast('⚠️ 没有找到文件');
        
        isProcessing = true;
        processedLinks = [];
        
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const fileName = row.querySelector('.progress-title')?.textContent.trim();
            
            // 跳过已处理
            if (processedLinks.find(l => l.name === fileName)) continue;

            controlPanel.setFileStatus(fileName, 'processing');
            
            // 点击编辑
            const editBtn = $(CONFIG.SELECTORS.EDIT_BUTTON, row);
            if (editBtn) {
                editBtn.click();
                await Utils.delay(CONFIG.DELAYS.MEDIUM);
                await processFile(fileName);
            } else {
                controlPanel.setFileStatus(fileName, 'failed');
            }
        }

        isProcessing = false;
        controlPanel.toast('✅ 全部处理完成');
        
        // 复制所有链接
        if (processedLinks.length > 0) {
            const text = processedLinks.map(l => `${l.name}: ${l.url}`).join('\n');
            GM_setClipboard(text, 'text');
        }
    }

    async function processFile(fileName) {
        try {
            // 1. 标题处理（核心修改：按需求生成 语言）时间 格式）
            controlPanel.setStep(0);
            await processTitle(fileName);
            controlPanel.setStep(0, 'completed');

            // 2. 儿童设置
            controlPanel.setStep(1);
            const kidsBtn = await Utils.waitFor(CONFIG.SELECTORS.NOT_FOR_KIDS, 4000);
            if (kidsBtn && kidsBtn.getAttribute('aria-checked') !== 'true') kidsBtn.click();
            await Utils.delay(CONFIG.DELAYS.TINY);
            controlPanel.setStep(1, 'completed');

            // 3. 三次下一步
            controlPanel.setStep(2);
            for (let k = 0; k < 3; k++) {
                const btn = await Utils.waitFor(CONFIG.SELECTORS.NEXT_BUTTON, 5000);
                if (btn) {
                    // 等待按钮可点击
                    let tries = 0;
                    while (btn.getAttribute('aria-disabled') === 'true' && tries < 10) {
                        await Utils.delay(300);
                        tries++;
                    }
                    btn.click();
                    await Utils.delay(CONFIG.DELAYS.SHORT);
                }
            }
            controlPanel.setStep(2, 'completed');

            // 4. 不公开列出
            controlPanel.setStep(3);
            const unlisted = await Utils.waitFor(CONFIG.SELECTORS.UNLISTED, 5000);
            if (unlisted) {
                if (unlisted.getAttribute('aria-checked') !== 'true') unlisted.click();
                await Utils.delay(CONFIG.DELAYS.TINY);
            }
            controlPanel.setStep(3, 'completed');

            // 5. 获取链接
            controlPanel.setStep(4);
            const link = await getVideoLink();
            controlPanel.setStep(4, 'completed');

            // 6. 保存
            controlPanel.setStep(5);
            const saveBtn = await Utils.waitFor(CONFIG.SELECTORS.SAVE_BUTTON, 5000);
            if (saveBtn) saveBtn.click();
            controlPanel.setStep(5, 'completed');

            // 完成
            processedLinks.push({ name: fileName, url: link });
            controlPanel.addLink(fileName, link);
            controlPanel.setFileStatus(fileName, 'completed');

            // 关闭弹窗
            await Utils.delay(CONFIG.DELAYS.LONG);
            const closeBtn = $(CONFIG.SELECTORS.CLOSE_BUTTON);
            if (closeBtn) closeBtn.click();

        } catch (err) {
            console.error(err);
            controlPanel.setFileStatus(fileName, 'failed');
            controlPanel.toast(`❌ ${fileName} 处理失败`);
        }
    }

    // ===================== 【核心修改】标题处理函数 =====================
    async function processTitle(fileName) {
        const input = await Utils.waitFor(CONFIG.SELECTORS.TITLE_INPUT, 3000);
        if (!input) return;
        
        // 1. 提取语言代码
        const langCode = Utils.extractLangCode(fileName);
        // 兜底：提取不到语言时，默认用「未知」
        const finalLang = langCode || '未知';

        // 2. 生成处理时间（当前执行时间）
        const processTime = Utils.formatTime();

        // 3. 拼接最终标题：语言）时间
        const finalTitle = `${finalLang}）${processTime}`;

        // 4. 写入输入框，触发input事件保证页面识别
        if (input.value !== undefined) {
            input.value = finalTitle;
        } else {
            input.textContent = finalTitle;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));

        // 日志记录，方便排查
        controlPanel.toast(`✅ 标题已生成: ${finalTitle}`);
    }

    async function getVideoLink() {
        for (let i = 0; i < 30; i++) {
            // 尝试多种选择器，兼容不同页面结构
            const a = document.querySelector('a[href*="youtu.be"], a[href*="watch?v="]');
            if (a && a.href) {
                let url = a.href;
                // 标准化链接格式
                const idMatch = url.match(/(youtu\.be\/|watch\?v=)([a-zA-Z0-9_-]{11})/);
                if (idMatch) return `https://youtube.com/watch?v=${idMatch[2]}`;
                return url;
            }
            await Utils.delay(500);
        }
        throw new Error('获取链接超时');
    }

    // 安全启动，避免重复初始化
    const safeInit = _.debounce(init, 800);
    window.addEventListener('load', safeInit);
    if (document.readyState === 'complete') init();

})();
