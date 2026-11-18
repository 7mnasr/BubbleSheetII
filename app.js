/* ========================================================================= */
/* SMART BUBBLE SHEET (البابل شيت الذكي) - CLEAN MASTER ENGINE v2.5           */
/* ========================================================================= */

const STORAGE_KEYS = {
    HOMEWORKS: 'sbs_homeworks_v2',
    MISTAKES: 'sbs_mistakes_v2',
    ACTIVE_ID: 'sbs_active_hw_id_v2',
    SETTINGS: 'sbs_settings_v2',
    USER_PROFILE: 'sbs_user_profile_v2',
    SUBJECT_ICONS: 'sbs_subject_icons_v2',
    TUTORIAL_DONE: 'sbs_tutorial_done_v2'
};

const CATEGORY_META = {
    homework: {
        label: 'واجب',
        plural: 'واجبات',
        icon: 'ph-book-bookmark',
        badgeClass: 'bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-blue-300'
    },
    practice: {
        label: 'تدريب',
        plural: 'تدريبات',
        icon: 'ph-target',
        badgeClass: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-300'
    },
    exam: {
        label: 'اختبار',
        plural: 'اختبارات',
        icon: 'ph-exam',
        badgeClass: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300'
    }
};

const AVAILABLE_SUBJECT_ICONS = [
    'ph-book-open', 'ph-atom', 'ph-flask', 'ph-dna', 'ph-function',
    'ph-calculator', 'ph-globe-hemisphere-east', 'ph-scroll', 'ph-translate',
    'ph-pencil-ruler', 'ph-compass', 'ph-lightning', 'ph-brain', 'ph-graduation-cap', 'ph-folder'
];

let appState = {
    homeworks: [],
    mistakes: [],
    activeHomeworkId: null,
    currentQuestionIndex: 0,
    solveMode: 'standard', // 'standard' | 'auto'
    hasUnsavedChanges: false,
    pendingUploadedJson: null,
    folderCategoryFilter: 'all',
    selectedIconSubject: null,
    resultsFilter: 'all',
    userProfile: null,
    subjectIcons: {},
    settings: {
        darkMode: false,
        colorTheme: 'blue'
    }
};

/* ========================================================================= */
/* INITIALIZATION & ROUTING                                                  */
/* ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
    loadStateFromStorage();
    applyThemeSettings();
    updateGlobalHeaderUI();
    generateAppleTouchIcon();

    const page = document.body.dataset.page || 'home';

    if (!appState.userProfile && page === 'home') {
        openModal('user-init-modal');
    } else if (!localStorage.getItem(STORAGE_KEYS.TUTORIAL_DONE) && page === 'home') {
        openTutorialFromStart();
    }

    if (page === 'home') {
        initHomePage();
    } else if (page === 'solve') {
        initSolvePage();
    } else if (page === 'results') {
        initResultsPage();
    } else if (page === 'homeworks') {
        initHomeworksPage();
    } else if (page === 'mistakes') {
        initMistakesPage();
    }
});

function navigateTo(pageName, params = {}) {
    const routes = {
        home: 'index.html',
        solve: 'solve.html',
        results: 'results.html',
        homeworks: 'homeworks.html',
        mistakes: 'mistakes.html',
        library: 'library.html'
    };

    if (params.hwId) {
        appState.activeHomeworkId = params.hwId;
        localStorage.setItem(STORAGE_KEYS.ACTIVE_ID, params.hwId);
    }

    const target = routes[pageName] || 'index.html';
    window.location.href = target;
}

function loadStateFromStorage() {
    try {
        const hwRaw = localStorage.getItem(STORAGE_KEYS.HOMEWORKS) || localStorage.getItem('sbs_homeworks_v1');
        const misRaw = localStorage.getItem(STORAGE_KEYS.MISTAKES) || localStorage.getItem('sbs_mistakes_v1');
        const setRaw = localStorage.getItem(STORAGE_KEYS.SETTINGS) || localStorage.getItem('sbs_settings_v1');
        const profRaw = localStorage.getItem(STORAGE_KEYS.USER_PROFILE) || localStorage.getItem('sbs_user_profile_v1');
        const iconsRaw = localStorage.getItem(STORAGE_KEYS.SUBJECT_ICONS) || localStorage.getItem('sbs_subject_icons_v1');

        appState.homeworks = hwRaw ? JSON.parse(hwRaw) : [];
        appState.mistakes = misRaw ? JSON.parse(misRaw) : [];
        appState.activeHomeworkId = localStorage.getItem(STORAGE_KEYS.ACTIVE_ID) || localStorage.getItem('sbs_active_hw_id_v1') || null;
        if (setRaw) appState.settings = { ...appState.settings, ...JSON.parse(setRaw) };
        if (profRaw) appState.userProfile = JSON.parse(profRaw);
        if (iconsRaw) appState.subjectIcons = JSON.parse(iconsRaw);
    } catch (e) {
        console.error('Error loading storage:', e);
    }
}

function saveStateToStorage() {
    try {
        localStorage.setItem(STORAGE_KEYS.HOMEWORKS, JSON.stringify(appState.homeworks));
        localStorage.setItem(STORAGE_KEYS.MISTAKES, JSON.stringify(appState.mistakes));
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(appState.settings));
        localStorage.setItem(STORAGE_KEYS.SUBJECT_ICONS, JSON.stringify(appState.subjectIcons));
        if (appState.userProfile) {
            localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(appState.userProfile));
        }
        if (appState.activeHomeworkId) {
            localStorage.setItem(STORAGE_KEYS.ACTIVE_ID, appState.activeHomeworkId);
        }
    } catch (e) {
        showToast('تنبيه: مساحة التخزين ممتلئة، يُنصح بتصدير نسخة احتياطية!', 'error');
    }
}

/* ========================================================================= */
/* SANITIZER & KATEX RENDERING                                               */
/* ========================================================================= */

function sanitizeRichHtml(dirtyHtml) {
    if (!dirtyHtml) return '';
    const template = document.createElement('template');
    template.innerHTML = dirtyHtml;

    const allowedTags = new Set([
        'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'CAPTION',
        'SVG', 'G', 'PATH', 'LINE', 'RECT', 'CIRCLE', 'ELLIPSE', 'POLYGON', 'POLYLINE', 'TEXT', 'TSPAN', 'DEFS', 'MARKER',
        'B', 'STRONG', 'I', 'EM', 'U', 'SUB', 'SUP', 'BR', 'P', 'SPAN', 'DIV', 'UL', 'OL', 'LI'
    ]);

    function cleanNode(node) {
        const children = Array.from(node.childNodes);
        children.forEach(child => {
            if (child.nodeType === Node.ELEMENT_NODE) {
                if (!allowedTags.has(child.tagName.toUpperCase())) {
                    child.remove();
                    return;
                }
                Array.from(child.attributes).forEach(attr => {
                    const name = attr.name.toLowerCase();
                    const val = attr.value.toLowerCase().trim();
                    if (name.startsWith('on') || val.startsWith('javascript:')) {
                        child.removeAttribute(attr.name);
                    }
                });
                cleanNode(child);
            }
        });
    }

    cleanNode(template.content);
    return template.innerHTML;
}

function renderMathInContainer(element) {
    if (!element) return;
    if (typeof renderMathInElement === 'function') {
        try {
            renderMathInElement(element, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true }
                ],
                throwOnError: false
            });
        } catch (e) {
            // Ignore malformed latex
        }
    }
}

/* ========================================================================= */
/* THEME & PROFILE MANAGEMENT                                                */
/* ========================================================================= */

function applyThemeSettings() {
    const html = document.documentElement;
    if (appState.settings.darkMode) {
        html.classList.add('dark');
    } else {
        html.classList.remove('dark');
    }
    html.setAttribute('data-color-theme', appState.settings.colorTheme || 'blue');

    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) {
        themeIcon.className = appState.settings.darkMode ? 'ph-bold ph-sun text-lg text-amber-400' : 'ph-bold ph-moon text-lg';
    }
}

function toggleTheme() {
    appState.settings.darkMode = !appState.settings.darkMode;
    applyThemeSettings();
    saveStateToStorage();
}

function applyColorTheme(themeName, persist = false) {
    appState.settings.colorTheme = themeName;
    applyThemeSettings();
    document.querySelectorAll('.edit-theme-btn').forEach(btn => {
        const isSel = btn.dataset.editTval === themeName;
        btn.classList.toggle('border-blue-900', isSel);
        btn.classList.toggle('bg-blue-50', isSel);
        btn.classList.toggle('dark:bg-blue-950/50', isSel);
    });
    if (persist) saveStateToStorage();
}

function updateGlobalHeaderUI() {
    const unmasteredCount = appState.mistakes.filter(m => !m.mastered).length;
    const badge = document.getElementById('mistakes-badge');
    if (badge) badge.textContent = unmasteredCount;

    const userNameEl = document.getElementById('header-user-name');
    if (userNameEl && appState.userProfile?.name) {
        userNameEl.textContent = appState.userProfile.name;
    }

    const welcomeHeading = document.getElementById('home-welcome-heading');
    if (welcomeHeading && appState.userProfile?.name) {
        welcomeHeading.textContent = `أهلاً بيك يا ${appState.userProfile.name}! 🚀`;
    }
}

function generateAppleTouchIcon() {
    const link = document.getElementById('apple-touch-icon-link');
    if (!link) return;
    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(0, 0, 180, 180);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 90px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✓', 90, 95);
    link.href = canvas.toDataURL('image/png');
}

/* ========================================================================= */
/* MODALS & ONBOARDING                                                       */
/* ========================================================================= */

function showUserInitStep(step) {
    ['ask', 'restore', 'new'].forEach(s => {
        const el = document.getElementById(`user-init-step-${s}`);
        if (el) el.classList.toggle('hidden', s !== step);
    });
}

function suggestThemeByGender(gender) {
    selectInitColorTheme(gender === 'female' ? 'pink' : 'blue');
}

function selectInitColorTheme(tval) {
    appState.settings.colorTheme = tval;
    applyThemeSettings();
    document.querySelectorAll('.init-theme-btn').forEach(btn => {
        const active = btn.dataset.tval === tval;
        btn.classList.toggle('border-blue-900', active);
        btn.classList.toggle('bg-blue-50', active);
        btn.classList.toggle('dark:bg-blue-950/50', active);
    });
}

function saveNewUserProfile(e) {
    e.preventDefault();
    const name = document.getElementById('init-user-name').value.trim();
    const genderEl = document.querySelector('input[name="init-gender"]:checked');
    if (!name || !genderEl) return;

    appState.userProfile = {
        name,
        gender: genderEl.value,
        createdAt: new Date().toISOString()
    };
    saveStateToStorage();
    updateGlobalHeaderUI();
    closeModal('user-init-modal');
    showToast(`أهلاً بيك يا ${name}! تم تجهيز حسابك بنجاح.`, 'success');

    if (!localStorage.getItem(STORAGE_KEYS.TUTORIAL_DONE)) {
        openTutorialFromStart();
    }
}

function openProfileSettingsModal() {
    if (appState.userProfile) {
        const nameInput = document.getElementById('edit-user-name');
        if (nameInput) nameInput.value = appState.userProfile.name || '';
        const genderRadio = document.querySelector(`input[name="edit-gender"][value="${appState.userProfile.gender || 'male'}"]`);
        if (genderRadio) genderRadio.checked = true;
    }
    applyColorTheme(appState.settings.colorTheme || 'blue', false);
    openModal('profile-settings-modal');
}

function updateExistingUserProfile(e) {
    e.preventDefault();
    const name = document.getElementById('edit-user-name').value.trim();
    const genderEl = document.querySelector('input[name="edit-gender"]:checked');
    if (!name) return;

    appState.userProfile = {
        ...(appState.userProfile || {}),
        name,
        gender: genderEl ? genderEl.value : 'male'
    };
    saveStateToStorage();
    updateGlobalHeaderUI();
    closeModal('profile-settings-modal');
    showToast('تم حفظ تعديلات ملفك الشخصي!', 'success');
}

function openTutorialFromStart() {
    goToTutorialStep(0);
    openModal('onboarding-modal');
}

function goToTutorialStep(step) {
    for (let i = 0; i <= 3; i++) {
        const el = document.getElementById(`tut-step-${i}`);
        if (el) el.classList.toggle('hidden', i !== step);
    }
}

function dismissTutorialForever() {
    localStorage.setItem(STORAGE_KEYS.TUTORIAL_DONE, '1');
    closeModal('onboarding-modal');
}

/* ========================================================================= */
/* HOME PAGE LOGIC                                                           */
/* ========================================================================= */

function initHomePage() {
    renderRecentHomeworks();
}

function openPromptModal() {
    openModal('prompt-modal');
}

function copyAIPrompt() {
    const text = document.getElementById('ai-prompt-text')?.innerText || '';
    navigator.clipboard.writeText(text).then(() => {
        showToast('تم نسخ البرومت! ابعته لـ Gemini مع صور الأسئلة والإجابات.', 'success');
    }).catch(() => {
        showToast('حدد النص وانسخه يدوياً.', 'info');
    });
}

function handleJsonFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const parsed = JSON.parse(ev.target.result);
            if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
                showToast('الملف غير صالح: تأكد إن جواه مصفوفة questions.', 'error');
                return;
            }
            appState.pendingUploadedJson = parsed;
            const titleEl = document.getElementById('json-drop-title');
            const subEl = document.getElementById('json-drop-subtitle');
            const iconEl = document.getElementById('json-drop-icon');
            if (titleEl) titleEl.textContent = `تم تحميل: ${file.name} (${parsed.questions.length} سؤال) ✅`;
            if (subEl) subEl.textContent = 'اكتب بيانات المادة والدرس تحت واضغط "ابدأ الحل الآن"';
            if (iconEl) iconEl.className = 'ph-bold ph-check-circle text-2xl text-emerald-600';
            showToast(`تم قراءة ${parsed.questions.length} سؤال بنجاح!`, 'success');
        } catch (err) {
            showToast('خطأ في قراءة ملف JSON. تأكد من سلامة الكود.', 'error');
        }
    };
    reader.readAsText(file);
}

function startSessionFromUploadedJson(e) {
    e.preventDefault();
    if (!appState.pendingUploadedJson) {
        showToast('من فضلك اختار ملف الـ JSON أولاً!', 'error');
        return;
    }

    const category = document.querySelector('input[name="json-session-category"]:checked')?.value || 'homework';
    const subject = document.getElementById('json-subject').value.trim();
    const book = document.getElementById('json-book').value.trim();
    const chapter = document.getElementById('json-chapter').value.trim();
    const lesson = document.getElementById('json-lesson').value.trim();

    if (!subject || !book || !chapter || !lesson) {
        showToast('من فضلك أكمل بيانات المادة والكتاب والوحدة والدرس.', 'error');
        return;
    }

    const normalizedQuestions = appState.pendingUploadedJson.questions.map((q, idx) => {
        const isEssay = (q.type || '').toLowerCase() === 'essay';
        return {
            id: `q_${Date.now()}_${idx}`,
            number: String(q.number ?? idx + 1),
            type: isEssay ? 'essay' : 'mcq',
            question_text: q.question_text || '',
            question_html: q.question_html || '',
            options: isEssay ? {} : (q.options || { 'أ': 'أ', 'ب': 'ب', 'ج': 'ج', 'د': 'د' }),
            correct_answer: isEssay ? '' : String(q.correct_answer || '').trim(),
            model_answer: isEssay ? (q.model_answer || '') : '',
            explanation: q.explanation || '',
            user_answer: null,
            essay_score: null,
            flagged: false,
            graded: false
        };
    });

    const newHw = {
        id: 'hw_' + Date.now(),
        category,
        subject,
        book,
        chapter,
        lesson,
        mode: 'ai_json',
        manualPhase: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'in_progress',
        questions: normalizedQuestions
    };

    appState.homeworks.unshift(newHw);
    saveStateToStorage();
    navigateTo('solve', { hwId: newHw.id });
}

function openManualSetupModal() {
    openModal('manual-setup-modal');
}

function createManualHomework(e) {
    e.preventDefault();
    const category = document.querySelector('input[name="manual-session-category"]:checked')?.value || 'homework';
    const subject = document.getElementById('man-subject').value.trim();
    const book = document.getElementById('man-book').value.trim();
    const chapter = document.getElementById('man-chapter').value.trim();
    const lesson = document.getElementById('man-lesson').value.trim();
    const qCount = Math.min(300, Math.max(1, parseInt(document.getElementById('man-qcount').value, 10) || 20));
    const lang = document.getElementById('man-lang').value;

    const optsObj = lang === 'en'
        ? { 'A': 'A', 'B': 'B', 'C': 'C', 'D': 'D' }
        : { 'أ': 'أ', 'ب': 'ب', 'ج': 'ج', 'د': 'د' };

    const questions = Array.from({ length: qCount }, (_, i) => ({
        id: `q_${Date.now()}_${i}`,
        number: String(i + 1),
        type: 'mcq',
        question_text: '',
        question_html: '',
        options: { ...optsObj },
        correct_answer: '',
        model_answer: '',
        explanation: '',
        user_answer: null,
        essay_score: null,
        flagged: false,
        graded: false
    }));

    const newHw = {
        id: 'hw_' + Date.now(),
        category,
        subject,
        book,
        chapter,
        lesson,
        mode: 'manual',
        manualPhase: 'student_solving',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'in_progress',
        questions
    };

    appState.homeworks.unshift(newHw);
    saveStateToStorage();
    closeModal('manual-setup-modal');
    navigateTo('solve', { hwId: newHw.id });
}

function renderRecentHomeworks() {
    const container = document.getElementById('homeworks-list-container');
    const countBadge = document.getElementById('total-homeworks-count');
    if (!container) return;

    if (countBadge) countBadge.textContent = `${appState.homeworks.length} جلسة`;

    if (appState.homeworks.length === 0) {
        container.innerHTML = `
            <div class="col-span-full bg-white dark:bg-slate-900 rounded-3xl p-8 border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
                <i class="ph-duotone ph-folder-open text-5xl text-slate-400"></i>
                <h4 class="font-extrabold text-base text-slate-700 dark:text-slate-200">مفيش جلسات متسجلة لسه</h4>
                <p class="text-xs text-slate-500">ارفع ملف أسئلة وإجابات أو ابدأ جلسة يدوية من فوق عشان تبدأ!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = appState.homeworks.slice(0, 6).map(hw => buildHomeworkCardHTML(hw)).join('');
}

function buildHomeworkCardHTML(hw) {
    const cat = CATEGORY_META[hw.category] || CATEGORY_META.homework;
    const total = hw.questions.length;
    const answered = hw.questions.filter(q => q.type === 'essay' ? q.essay_score !== null : Boolean(q.user_answer)).length;
    const pct = total ? Math.round((answered / total) * 100) : 0;

    let statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">جاري الحل (${answered}/${total})</span>`;
    if (hw.status === 'completed') {
        statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">مكتمل ✅</span>`;
    } else if (hw.status === 'partial') {
        statusBadge = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">تسليم جزئي (${answered}/${total})</span>`;
    }

    return `
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-blue-800 dark:hover:border-blue-600 transition-all flex flex-col justify-between gap-4">
            <div class="space-y-2">
                <div class="flex items-center justify-between gap-2 flex-wrap">
                    <div class="flex items-center gap-1.5">
                        <span class="px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold flex items-center gap-1 ${cat.badgeClass}">
                            <i class="ph-bold ${cat.icon}"></i> ${cat.label}
                        </span>
                        <span class="px-2.5 py-0.5 rounded-lg text-xs font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">${escapeHtml(hw.subject)}</span>
                    </div>
                    ${statusBadge}
                </div>
                <h4 class="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white line-clamp-1">${escapeHtml(hw.book)} • ${escapeHtml(hw.chapter)}</h4>
                <p class="text-xs font-bold text-slate-500 dark:text-slate-400">${escapeHtml(hw.lesson)} (${total} سؤال)</p>
            </div>

            <div class="space-y-2.5">
                <div class="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div class="h-full bg-blue-900 dark:bg-blue-500 rounded-full" style="width: ${pct}%"></div>
                </div>
                <div class="flex items-center justify-between gap-2">
                    <button onclick="openHomeworkSession('${hw.id}')" class="flex-1 py-2 px-3 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs flex items-center justify-center gap-1.5">
                        <i class="ph-bold ph-play"></i>
                        <span>${hw.status === 'completed' ? 'مراجعة النتيجة' : 'فتح الجلسة'}</span>
                    </button>
                    ${hw.status !== 'in_progress' ? `
                        <button onclick="viewHomeworkResults('${hw.id}')" class="py-2 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-extrabold text-xs" title="عرض النتيجة">
                            <i class="ph-bold ph-chart-bar"></i>
                        </button>
                    ` : ''}
                    <button onclick="deleteHomework('${hw.id}')" class="py-2 px-2.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors" title="حذف">
                        <i class="ph-bold ph-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function openHomeworkSession(hwId) {
    const hw = appState.homeworks.find(h => h.id === hwId);
    if (!hw) return;
    if (hw.status === 'completed') {
        navigateTo('results', { hwId });
    } else {
        navigateTo('solve', { hwId });
    }
}

function viewHomeworkResults(hwId) {
    navigateTo('results', { hwId });
}

function deleteHomework(hwId) {
    if (!confirm('متأكد إنك عايز تحذف الجلسة دي نهائياً؟')) return;
    appState.homeworks = appState.homeworks.filter(h => h.id !== hwId);
    saveStateToStorage();
    if (document.body.dataset.page === 'home') renderRecentHomeworks();
    if (document.body.dataset.page === 'homeworks') renderFoldersPage();
    showToast('تم حذف الجلسة.', 'info');
}

/* ========================================================================= */
/* SOLVE PAGE LOGIC                                                          */
/* ========================================================================= */

function getActiveHomework() {
    return appState.homeworks.find(h => h.id === appState.activeHomeworkId) || null;
}

function initSolvePage() {
    const hw = getActiveHomework();
    if (!hw) {
        navigateTo('home');
        return;
    }

    const cat = CATEGORY_META[hw.category] || CATEGORY_META.homework;
    const catBadge = document.getElementById('solve-category-badge');
    if (catBadge) {
        catBadge.textContent = cat.label;
        catBadge.className = `px-2 py-0.5 rounded-lg text-[11px] font-extrabold ${cat.badgeClass}`;
    }

    document.getElementById('solve-subject-badge').textContent = hw.subject;
    document.getElementById('solve-title').textContent = `${hw.book} • ${hw.chapter} • ${hw.lesson}`;

    const firstUnanswered = hw.questions.findIndex(q => q.type === 'essay' ? q.essay_score === null : !q.user_answer);
    appState.currentQuestionIndex = firstUnanswered >= 0 ? firstUnanswered : 0;

    updateManualPhaseUI(hw);
    renderActiveQuestion();
    renderQuestionMap();
    bindSolveKeyboardShortcuts();
}

function updateManualPhaseUI(hw) {
    const banner = document.getElementById('manual-phase-banner');
    const submitBtnText = document.getElementById('main-submit-btn-text');
    const instrText = document.getElementById('mcq-instruction-text');

    if (hw.mode !== 'manual') {
        if (banner) banner.classList.add('hidden');
        if (submitBtnText) submitBtnText.textContent = `تسليم ${(CATEGORY_META[hw.category] || CATEGORY_META.homework).label}`;
        return;
    }

    banner.classList.remove('hidden');
    const stepBadge = document.getElementById('manual-phase-step-badge');
    const titleEl = document.getElementById('manual-phase-title');
    const descEl = document.getElementById('manual-phase-desc');
    const switchBtn = document.getElementById('manual-phase-switch-btn');

    if (hw.manualPhase === 'student_solving') {
        banner.className = 'rounded-2xl p-3.5 sm:p-4 border-2 border-blue-800/30 bg-blue-50/80 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100 flex flex-wrap items-center justify-between gap-3 animate-pop';
        stepBadge.textContent = 'المرحلة ١ من ٢';
        titleEl.textContent = 'أنت الآن تسجّل إجاباتك إنت';
        descEl.textContent = 'اختر إجاباتك لكل سؤال، ولما تخلص اضغط الزرار لإدخال نموذج الإجابة الصح.';
        switchBtn.className = 'px-4 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm shadow-sm flex items-center gap-1.5 bg-blue-900 text-white hover:bg-blue-800';
        switchBtn.innerHTML = '<span>انتقل لإدخال الإجابات الصح</span><i class="ph-bold ph-arrow-left"></i>';
        if (submitBtnText) submitBtnText.textContent = 'الخطوة التالية: نموذج الإجابة';
        if (instrText) instrText.textContent = 'اختر إجابتك إنت (المرحلة الأولى):';
    } else {
        banner.className = 'rounded-2xl p-3.5 sm:p-4 border-2 border-emerald-600/40 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 flex flex-wrap items-center justify-between gap-3 animate-pop';
        stepBadge.textContent = 'المرحلة ٢ من ٢';
        titleEl.textContent = 'أنت الآن تدخل نموذج الإجابة الصح من الكتاب';
        descEl.textContent = 'ظلل الإجابة الصحيحة لكل سؤال عشان التطبيق يصححلك إجاباتك فوراً.';
        switchBtn.className = 'px-4 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm shadow-sm flex items-center gap-1.5 bg-slate-800 text-white hover:bg-slate-700';
        switchBtn.innerHTML = '<i class="ph-bold ph-arrow-right"></i><span>رجوع لتعديل إجاباتي</span>';
        if (submitBtnText) submitBtnText.textContent = 'اعتماد وتصحيح الآن';
        if (instrText) instrText.textContent = 'اختر الإجابة الصحيحة من نموذج الكتاب:';
    }
}

function handleManualPhaseAction() {
    const hw = getActiveHomework();
    if (!hw || hw.mode !== 'manual') return;
    hw.manualPhase = hw.manualPhase === 'student_solving' ? 'key_entry' : 'student_solving';
    appState.currentQuestionIndex = 0;
    saveStateToStorage();
    updateManualPhaseUI(hw);
    renderActiveQuestion();
    renderQuestionMap();
}

function setSolveMode(mode) {
    appState.solveMode = mode;
    const stdBtn = document.getElementById('mode-standard-btn');
    const autoBtn = document.getElementById('mode-auto-btn');
    if (mode === 'standard') {
        if (stdBtn) stdBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-white dark:bg-slate-700 text-blue-900 dark:text-white shadow-sm';
        if (autoBtn) autoBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-600 dark:text-slate-400 flex items-center gap-1';
    } else {
        if (autoBtn) autoBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-white dark:bg-slate-700 text-blue-900 dark:text-white shadow-sm flex items-center gap-1';
        if (stdBtn) stdBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-600 dark:text-slate-400';
    }
}

function renderActiveQuestion() {
    const hw = getActiveHomework();
    if (!hw) return;

    const idx = appState.currentQuestionIndex;
    const q = hw.questions[idx];
    if (!q) return;

    const numDisp = document.getElementById('q-number-display');
    const totDisp = document.getElementById('q-total-display');
    const typeBadge = document.getElementById('q-type-badge');
    if (numDisp) numDisp.textContent = `سؤال ${q.number}`;
    if (totDisp) totDisp.textContent = `(${idx + 1} من ${hw.questions.length})`;
    if (typeBadge) typeBadge.textContent = q.type === 'essay' ? 'سؤال مقالي' : 'اختيار من متعدد';

    const unsplitBtn = document.getElementById('unsplit-subq-btn');
    if (unsplitBtn) {
        unsplitBtn.classList.toggle('hidden', !q.parentGroupId);
    }

    const flagBtn = document.getElementById('flag-q-btn');
    const flagIcon = document.getElementById('flag-icon');
    if (flagBtn && flagIcon) {
        if (q.flagged) {
            flagBtn.className = 'px-3.5 py-2 rounded-xl text-xs font-extrabold border border-amber-400 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 transition-all flex items-center gap-1.5';
            flagIcon.className = 'ph-fill ph-flag text-base text-amber-600';
        } else {
            flagBtn.className = 'px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-all flex items-center gap-1.5';
            flagIcon.className = 'ph-bold ph-flag text-base';
        }
    }

    const attachBox = document.getElementById('retry-attachment-box');
    const textEl = document.getElementById('retry-q-text');
    const htmlEl = document.getElementById('retry-q-html');
    const imgWrap = document.getElementById('retry-q-img-wrap');
    const imgEl = document.getElementById('retry-q-img');

    const hasText = Boolean(q.question_text && q.question_text.trim());
    const hasHtml = Boolean(q.question_html && q.question_html.trim());
    const hasImg = Boolean(q.question_image);

    if (attachBox) {
        if (hasText || hasHtml || hasImg) {
            attachBox.classList.remove('hidden');
            if (textEl) {
                if (hasText) {
                    textEl.classList.remove('hidden');
                    textEl.textContent = q.question_text;
                    renderMathInContainer(textEl);
                } else {
                    textEl.classList.add('hidden');
                }
            }
            if (htmlEl) {
                if (hasHtml) {
                    htmlEl.classList.remove('hidden');
                    htmlEl.innerHTML = sanitizeRichHtml(q.question_html);
                    renderMathInContainer(htmlEl);
                } else {
                    htmlEl.classList.add('hidden');
                }
            }
            if (imgWrap && imgEl) {
                if (hasImg) {
                    imgWrap.classList.remove('hidden');
                    imgEl.src = q.question_image;
                } else {
                    imgWrap.classList.add('hidden');
                }
            }
        } else {
            attachBox.classList.add('hidden');
        }
    }

    const mcqContainer = document.getElementById('mcq-container');
    const essayContainer = document.getElementById('essay-container');

    if (q.type === 'essay') {
        if (mcqContainer) mcqContainer.classList.add('hidden');
        if (essayContainer) essayContainer.classList.remove('hidden');

        const modelTextEl = document.getElementById('essay-model-text');
        const overlayEl = document.getElementById('essay-reveal-overlay');
        const gradingBox = document.getElementById('essay-grading-box');

        if (modelTextEl) {
            modelTextEl.textContent = q.model_answer || 'لا يوجد نص للإجابة النموذجية.';
            renderMathInContainer(modelTextEl);
        }

        if (q.essay_score !== null) {
            if (modelTextEl) modelTextEl.classList.remove('essay-blur');
            if (overlayEl) overlayEl.classList.add('hidden');
            if (gradingBox) gradingBox.classList.remove('hidden');
        } else {
            if (modelTextEl) modelTextEl.classList.add('essay-blur');
            if (overlayEl) overlayEl.classList.remove('hidden');
            if (gradingBox) gradingBox.classList.add('hidden');
        }

        document.querySelectorAll('.essay-score-btn').forEach(btn => {
            const sc = parseFloat(btn.dataset.score);
            const active = q.essay_score === sc;
            btn.classList.toggle('bg-blue-900', active);
            btn.classList.toggle('text-white', active);
            btn.classList.toggle('border-blue-900', active);
        });
    } else {
        if (essayContainer) essayContainer.classList.add('hidden');
        if (mcqContainer) mcqContainer.classList.remove('hidden');

        const grid = document.getElementById('mcq-options-grid');
        if (grid) {
            const isKeyPhase = hw.mode === 'manual' && hw.manualPhase === 'key_entry';
            const selectedVal = isKeyPhase ? q.correct_answer : q.user_answer;
            const entries = Object.entries(q.options || {});

            grid.innerHTML = entries.map(([key, val]) => {
                const isSelected = selectedVal === key;
                const showLabelText = val && val.trim() !== key.trim();
                const activeClasses = isKeyPhase
                    ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-950 dark:text-emerald-100 ring-2 ring-emerald-500/40'
                    : 'border-blue-900 bg-blue-50 dark:bg-blue-950/50 text-blue-950 dark:text-blue-100 ring-2 ring-blue-600/30';
                const badgeClasses = isSelected
                    ? (isKeyPhase ? 'bg-emerald-600 text-white' : 'bg-blue-900 text-white')
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';

                return `
                    <button type="button" onclick="selectMcqOption('${escapeHtml(key)}')" class="p-4 rounded-2xl border-2 text-right flex items-center gap-3.5 transition-all animate-pop ${isSelected ? activeClasses : 'border-slate-200 dark:border-slate-800 hover:border-blue-800 dark:hover:border-blue-600 bg-white dark:bg-slate-900'}">
                        <span class="w-11 h-11 rounded-xl font-black text-lg flex items-center justify-center shrink-0 transition-colors ${badgeClasses}">
                            ${escapeHtml(key)}
                        </span>
                        <span class="rich-question-content font-bold text-sm sm:text-base leading-snug flex-1">
                            ${showLabelText ? escapeHtml(val) : `الاختيار (${escapeHtml(key)})`}
                        </span>
                    </button>
                `;
            }).join('');

            renderMathInContainer(grid);
        }
    }

    const prevBtn = document.getElementById('prev-q-btn');
    const nextBtn = document.getElementById('next-q-btn');
    if (prevBtn) prevBtn.disabled = idx === 0;
    if (nextBtn) nextBtn.disabled = idx === hw.questions.length - 1;

    updateSolveProgressHeader();
}

function selectMcqOption(optionKey) {
    const hw = getActiveHomework();
    if (!hw) return;
    const q = hw.questions[appState.currentQuestionIndex];
    if (!q) return;

    const isKeyPhase = hw.mode === 'manual' && hw.manualPhase === 'key_entry';
    if (isKeyPhase) {
        q.correct_answer = optionKey;
    } else {
        q.user_answer = optionKey;
    }

    appState.hasUnsavedChanges = true;
    renderActiveQuestion();
    renderQuestionMap();

    if (appState.solveMode === 'auto' && appState.currentQuestionIndex < hw.questions.length - 1) {
        setTimeout(() => {
            nextQuestion();
        }, 230);
    }
}

function revealEssayAnswer() {
    const modelText = document.getElementById('essay-model-text');
    const overlay = document.getElementById('essay-reveal-overlay');
    const gradingBox = document.getElementById('essay-grading-box');
    if (modelText) modelText.classList.remove('essay-blur');
    if (overlay) overlay.classList.add('hidden');
    if (gradingBox) gradingBox.classList.remove('hidden');
}

function gradeEssay(score) {
    const hw = getActiveHomework();
    if (!hw) return;
    const q = hw.questions[appState.currentQuestionIndex];
    if (!q) return;

    q.essay_score = score;
    q.user_answer = `${score} / 2`;
    appState.hasUnsavedChanges = true;
    renderActiveQuestion();
    renderQuestionMap();
}

function clearCurrentAnswer() {
    const hw = getActiveHomework();
    if (!hw) return;
    const q = hw.questions[appState.currentQuestionIndex];
    if (!q) return;

    const isKeyPhase = hw.mode === 'manual' && hw.manualPhase === 'key_entry';
    if (isKeyPhase) {
        q.correct_answer = '';
    } else {
        q.user_answer = null;
        q.essay_score = null;
    }
    appState.hasUnsavedChanges = true;
    renderActiveQuestion();
    renderQuestionMap();
}

function toggleFlagCurrent() {
    const hw = getActiveHomework();
    if (!hw) return;
    const q = hw.questions[appState.currentQuestionIndex];
    if (!q) return;

    q.flagged = !q.flagged;
    appState.hasUnsavedChanges = true;
    renderActiveQuestion();
    renderQuestionMap();
}

function prevQuestion() {
    if (appState.currentQuestionIndex > 0) {
        appState.currentQuestionIndex--;
        renderActiveQuestion();
        renderQuestionMap();
    }
}

function nextQuestion() {
    const hw = getActiveHomework();
    if (hw && appState.currentQuestionIndex < hw.questions.length - 1) {
        appState.currentQuestionIndex++;
        renderActiveQuestion();
        renderQuestionMap();
    }
}

function jumpToQuestion(index) {
    appState.currentQuestionIndex = index;
    renderActiveQuestion();
    renderQuestionMap();
}

function renderQuestionMap() {
    const hw = getActiveHomework();
    const grid = document.getElementById('question-map-grid');
    if (!hw || !grid) return;

    const isKeyPhase = hw.mode === 'manual' && hw.manualPhase === 'key_entry';

    grid.innerHTML = hw.questions.map((q, idx) => {
        const isCurrent = idx === appState.currentQuestionIndex;
        const isAnswered = isKeyPhase
            ? Boolean(q.correct_answer)
            : (q.type === 'essay' ? q.essay_score !== null : Boolean(q.user_answer));

        let btnClass = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700';
        if (isAnswered) {
            btnClass = isKeyPhase
                ? 'bg-emerald-600 text-white font-extrabold'
                : 'bg-blue-900 text-white font-extrabold';
        }
        if (isCurrent) {
            btnClass += ' ring-2 ring-offset-2 ring-blue-600 dark:ring-offset-slate-900';
        }

        return `
            <button type="button" onclick="jumpToQuestion(${idx})" class="relative h-10 rounded-xl text-xs font-bold flex items-center justify-center transition-all ${btnClass}">
                <span>${escapeHtml(q.number)}</span>
                ${q.flagged ? '<span class="w-2 h-2 rounded-full bg-amber-400 absolute top-1 right-1"></span>' : ''}
            </button>
        `;
    }).join('');
}

function updateSolveProgressHeader() {
    const hw = getActiveHomework();
    if (!hw) return;
    const isKeyPhase = hw.mode === 'manual' && hw.manualPhase === 'key_entry';
    const total = hw.questions.length;
    const answered = hw.questions.filter(q =>
        isKeyPhase ? Boolean(q.correct_answer) : (q.type === 'essay' ? q.essay_score !== null : Boolean(q.user_answer))
    ).length;

    const progEl = document.getElementById('solve-progress-text');
    const ratioEl = document.getElementById('map-answered-ratio');
    if (progEl) progEl.textContent = isKeyPhase ? `تم إدخال نموذج ${answered} من ${total} سؤال` : `تم حل ${answered} من ${total} سؤال`;
    if (ratioEl) ratioEl.textContent = `${answered} / ${total}`;
}

function saveCurrentProgress(notify = false) {
    const hw = getActiveHomework();
    if (!hw) return;
    hw.updatedAt = new Date().toISOString();
    appState.hasUnsavedChanges = false;
    saveStateToStorage();
    if (notify) showToast('تم حفظ تقدمك بنجاح! ✅', 'success');
}

function attemptExitSolve() {
    if (appState.hasUnsavedChanges) {
        openModal('unsaved-modal');
    } else {
        navigateTo('home');
    }
}

function confirmDiscardAndExit() {
    appState.hasUnsavedChanges = false;
    closeModal('unsaved-modal');
    navigateTo('home');
}

function saveAndExitSolve() {
    saveCurrentProgress(false);
    closeModal('unsaved-modal');
    navigateTo('home');
}

/* ========================================================================= */
/* SUB-QUESTIONS SPLITTING                                                   */
/* ========================================================================= */

function openSubQuestionsModal() {
    const hw = getActiveHomework();
    if (!hw) return;
    const q = hw.questions[appState.currentQuestionIndex];
    const targetLabel = document.getElementById('subq-target-label');
    const countInput = document.getElementById('subq-count-input');
    if (targetLabel) targetLabel.textContent = `سؤال ${q.number}`;
    if (countInput) countInput.value = 2;
    openModal('subquestions-modal');
}

function applySubQuestionsSplit(e) {
    e.preventDefault();
    const hw = getActiveHomework();
    if (!hw) return;
    const countInput = document.getElementById('subq-count-input');
    const count = Math.min(50, Math.max(2, parseInt(countInput?.value, 10) || 2));
    const idx = appState.currentQuestionIndex;
    const orig = hw.questions[idx];
    const groupId = 'grp_' + Date.now();

    const subItems = Array.from({ length: count }, (_, i) => ({
        ...orig,
        id: `q_${Date.now()}_${i}`,
        number: `${orig.number} (${i + 1})`,
        parentGroupId: groupId,
        originalNumber: orig.number,
        user_answer: null,
        essay_score: null,
        flagged: false
    }));

    hw.questions.splice(idx, 1, ...subItems);
    appState.hasUnsavedChanges = true;
    saveStateToStorage();
    closeModal('subquestions-modal');
    renderActiveQuestion();
    renderQuestionMap();
    showToast(`تم تفريع سؤال ${orig.number} إلى ${count} مطاليب!`, 'success');
}

function unsplitCurrentSubQuestion() {
    const hw = getActiveHomework();
    if (!hw) return;
    const q = hw.questions[appState.currentQuestionIndex];
    if (!q || !q.parentGroupId) return;

    const grpId = q.parentGroupId;
    const firstIdx = hw.questions.findIndex(item => item.parentGroupId === grpId);
    const merged = {
        ...q,
        id: 'q_' + Date.now(),
        number: q.originalNumber || q.number.split(' ')[0],
        parentGroupId: null,
        user_answer: null,
        essay_score: null
    };

    hw.questions = hw.questions.filter(item => item.parentGroupId !== grpId);
    hw.questions.splice(firstIdx, 0, merged);
    appState.currentQuestionIndex = firstIdx;
    appState.hasUnsavedChanges = true;
    saveStateToStorage();
    renderActiveQuestion();
    renderQuestionMap();
    showToast('تم إلغاء التفريع وإرجاع السؤال كسؤال واحد.', 'info');
}

function bindSolveKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (document.body.dataset.page !== 'solve') return;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

        const hw = getActiveHomework();
        if (!hw) return;
        const q = hw.questions[appState.currentQuestionIndex];
        const keys = Object.keys(q?.options || {});

        if (e.key === 'ArrowLeft') nextQuestion();
        else if (e.key === 'ArrowRight') prevQuestion();
        else if (['1', '2', '3', '4'].includes(e.key)) {
            const opt = keys[parseInt(e.key, 10) - 1];
            if (opt) selectMcqOption(opt);
        }
    });
}

/* ========================================================================= */
/* SUBMISSION & GRADING                                                      */
/* ========================================================================= */

function initiateSubmitHomework() {
    const hw = getActiveHomework();
    if (!hw) return;

    if (hw.mode === 'manual' && hw.manualPhase === 'student_solving') {
        handleManualPhaseAction();
        showToast('دلوقتي دخل الإجابات الصح من آخر الكتاب عشان نصححلك!', 'info');
        return;
    }

    const unansweredCount = hw.questions.filter(q =>
        q.type === 'essay' ? q.essay_score === null : !q.user_answer
    ).length;

    if (unansweredCount > 0) {
        const unansModalCount = document.getElementById('unanswered-modal-count');
        const totModalCount = document.getElementById('total-modal-count');
        if (unansModalCount) unansModalCount.textContent = unansweredCount;
        if (totModalCount) totModalCount.textContent = hw.questions.length;
        openModal('partial-submit-modal');
    } else {
        finalizeSubmission('full');
    }
}

function finalizeSubmission(submissionType) {
    const hw = getActiveHomework();
    if (!hw) return;
    closeModal('partial-submit-modal');

    hw.questions.forEach(q => {
        const hasAns = q.type === 'essay' ? q.essay_score !== null : Boolean(q.user_answer);

        if (submissionType === 'partial' && !hasAns) {
            q.graded = false;
            return;
        }

        q.graded = true;
        let isCorrect = false;

        if (q.type === 'essay') {
            const sc = q.essay_score ?? 0;
            isCorrect = sc >= 1.5;
        } else {
            isCorrect = Boolean(q.user_answer) && q.user_answer === q.correct_answer;
        }

        if (!isCorrect) {
            recordMistake(hw, q);
        }
    });

    const allGraded = hw.questions.every(q => q.graded);
    hw.status = allGraded ? 'completed' : 'partial';
    hw.updatedAt = new Date().toISOString();
    appState.hasUnsavedChanges = false;
    saveStateToStorage();
    navigateTo('results', { hwId: hw.id });
}

function recordMistake(hw, q) {
    const existingIdx = appState.mistakes.findIndex(m => m.homeworkId === hw.id && m.questionId === q.id);
    const mistakeEntry = {
        id: existingIdx >= 0 ? appState.mistakes[existingIdx].id : 'mis_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        homeworkId: hw.id,
        questionId: q.id,
        category: hw.category || 'homework',
        subject: hw.subject,
        book: hw.book,
        chapter: hw.chapter,
        lesson: hw.lesson,
        number: q.number,
        type: q.type,
        question_text: q.question_text || '',
        question_html: q.question_html || '',
        question_image: q.question_image || (existingIdx >= 0 ? appState.mistakes[existingIdx].question_image : ''),
        options: q.options || {},
        user_answer: q.user_answer || 'لم يُجب',
        correct_answer: q.type === 'essay' ? q.model_answer : q.correct_answer,
        explanation: q.explanation || '',
        student_note: existingIdx >= 0 ? appState.mistakes[existingIdx].student_note : '',
        mastered: false,
        createdAt: new Date().toISOString()
    };

    if (existingIdx >= 0) {
        appState.mistakes[existingIdx] = mistakeEntry;
    } else {
        appState.mistakes.unshift(mistakeEntry);
    }
}

/* ========================================================================= */
/* RESULTS PAGE LOGIC                                                        */
/* ========================================================================= */

function initResultsPage() {
    const hw = getActiveHomework();
    if (!hw) {
        navigateTo('home');
        return;
    }

    const cat = CATEGORY_META[hw.category] || CATEGORY_META.homework;
    const resCatBadge = document.getElementById('res-category-badge');
    if (resCatBadge) {
        resCatBadge.textContent = cat.label;
        resCatBadge.className = `px-3 py-1 rounded-full text-xs font-extrabold ${cat.badgeClass}`;
    }

    const subBadge = document.getElementById('res-subject-badge');
    const metaTitle = document.getElementById('res-meta-title');
    if (subBadge) subBadge.textContent = hw.subject;
    if (metaTitle) metaTitle.textContent = `${hw.book} • ${hw.chapter} • ${hw.lesson}`;

    let correct = 0;
    let wrong = 0;
    let unanswered = 0;

    hw.questions.forEach(q => {
        if (!q.graded) {
            unanswered++;
            return;
        }
        if (q.type === 'essay') {
            if ((q.essay_score ?? 0) >= 1.5) correct++;
            else wrong++;
        } else {
            if (q.user_answer && q.user_answer === q.correct_answer) correct++;
            else wrong++;
        }
    });

    const gradedTotal = correct + wrong;
    const pct = gradedTotal > 0 ? Math.round((correct / gradedTotal) * 100) : 0;

    const resPct = document.getElementById('res-percentage');
    const resFrac = document.getElementById('res-score-fraction');
    const resCorr = document.getElementById('res-correct-count');
    const resWrng = document.getElementById('res-wrong-count');
    const resUnans = document.getElementById('res-unanswered-count');

    if (resPct) resPct.textContent = `${pct}%`;
    if (resFrac) resFrac.textContent = `${correct} / ${gradedTotal}`;
    if (resCorr) resCorr.textContent = correct;
    if (resWrng) resWrng.textContent = wrong;
    if (resUnans) resUnans.textContent = unanswered;

    const encEl = document.getElementById('res-encouragement');
    if (encEl) {
        if (pct >= 85) encEl.textContent = 'أداء أسطوري! مستواك ممتاز 🚀';
        else if (pct >= 65) encEl.textContent = 'شغل حلو جداً! راجع غلطاتك وهتقفلها 💪';
        else encEl.textContent = 'بداية كويسة! ركز في مراجعة الغلطات وهتتحسن بسرعة 🎯';
    }

    if (hw.status === 'partial' && unanswered > 0) {
        const partNote = document.getElementById('res-partial-note');
        const contBtn = document.getElementById('res-continue-btn');
        if (partNote) partNote.classList.remove('hidden');
        if (contBtn) contBtn.classList.remove('hidden');
    }

    if (wrong > 0) {
        const retryBtn = document.getElementById('res-retry-mistakes-btn');
        if (retryBtn) retryBtn.classList.remove('hidden');
    }

    renderResultsQuestionsList();
}

function filterResultsList(filter) {
    appState.resultsFilter = filter;
    ['all', 'wrong', 'correct'].forEach(f => {
        const btn = document.getElementById(`res-filter-${f}`);
        if (!btn) return;
        btn.className = f === filter
            ? 'px-3 py-1.5 rounded-lg text-xs font-extrabold bg-blue-900 text-white'
            : 'px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300';
    });
    renderResultsQuestionsList();
}

function renderResultsQuestionsList() {
    const hw = getActiveHomework();
    const list = document.getElementById('results-questions-list');
    if (!hw || !list) return;

    const items = hw.questions.filter(q => {
        if (!q.graded) return appState.resultsFilter === 'all';
        const isCorrect = q.type === 'essay' ? (q.essay_score ?? 0) >= 1.5 : (q.user_answer === q.correct_answer);
        if (appState.resultsFilter === 'wrong') return !isCorrect;
        if (appState.resultsFilter === 'correct') return isCorrect;
        return true;
    });

    list.innerHTML = items.map(q => {
        if (!q.graded) {
            return `
                <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 opacity-75 flex items-center justify-between">
                    <span class="font-extrabold text-sm">سؤال ${escapeHtml(q.number)}</span>
                    <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">مؤجل (لم يُسلم بعد)</span>
                </div>
            `;
        }

        const isCorrect = q.type === 'essay' ? (q.essay_score ?? 0) >= 1.5 : (q.user_answer === q.correct_answer);
        const borderCls = isCorrect ? 'border-emerald-300 dark:border-emerald-800/70' : 'border-rose-300 dark:border-rose-800/70';
        const badgeCls = isCorrect
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300';

        const correctDisplay = q.type === 'essay' ? q.model_answer : `${q.correct_answer} ${q.options?.[q.correct_answer] && q.options[q.correct_answer] !== q.correct_answer ? `(${q.options[q.correct_answer]})` : ''}`;
        const userDisplay = q.type === 'essay' ? `${q.essay_score ?? 0} / 2` : (q.user_answer ? `${q.user_answer} ${q.options?.[q.user_answer] && q.options[q.user_answer] !== q.user_answer ? `(${q.options[q.user_answer]})` : ''}` : 'لم يُجب');

        return `
            <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border-2 ${borderCls} space-y-3">
                <div class="flex items-center justify-between gap-2">
                    <span class="font-black text-base">سؤال ${escapeHtml(q.number)}</span>
                    <span class="px-3 py-1 rounded-full text-xs font-extrabold ${badgeCls}">${isCorrect ? 'إجابة صحيحة ✅' : 'إجابة خاطئة ❌'}</span>
                </div>
                ${q.question_text ? `<div class="rich-question-content text-sm font-bold text-slate-800 dark:text-slate-100 whitespace-pre-line">${escapeHtml(q.question_text)}</div>` : ''}
                ${q.question_html ? `<div class="rich-question-content overflow-x-auto">${sanitizeRichHtml(q.question_html)}</div>` : ''}
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs sm:text-sm">
                    <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
                        <span class="text-slate-400 block text-[11px] font-bold">إجابتك:</span>
                        <strong class="${isCorrect ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${escapeHtml(userDisplay)}</strong>
                    </div>
                    <div class="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30">
                        <span class="text-emerald-700/70 dark:text-emerald-400/70 block text-[11px] font-bold">الإجابة الصحيحة:</span>
                        <strong class="text-emerald-800 dark:text-emerald-300">${escapeHtml(correctDisplay)}</strong>
                    </div>
                </div>
                ${q.explanation ? `
                    <div class="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 text-xs text-blue-950 dark:text-blue-200 leading-relaxed">
                        <strong>💡 التفسير:</strong> ${escapeHtml(q.explanation)}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    renderMathInContainer(list);
}

function continueCurrentHomework() {
    const hw = getActiveHomework();
    if (!hw) return;
    navigateTo('solve', { hwId: hw.id });
}

function retryMistakesFromCurrentSession() {
    const hw = getActiveHomework();
    if (!hw) return;
    const wrongQs = hw.questions.filter(q => {
        if (!q.graded) return false;
        return q.type === 'essay' ? (q.essay_score ?? 0) < 1.5 : (q.user_answer !== q.correct_answer);
    });
    if (wrongQs.length === 0) return;

    const retryHw = {
        id: 'hw_retry_' + Date.now(),
        category: hw.category || 'practice',
        subject: hw.subject,
        book: hw.book,
        chapter: hw.chapter,
        lesson: `مراجعة أخطاء: ${hw.lesson}`,
        mode: 'ai_json',
        manualPhase: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'in_progress',
        questions: wrongQs.map((q, i) => ({
            ...q,
            id: `rq_${Date.now()}_${i}`,
            user_answer: null,
            essay_score: null,
            flagged: false,
            graded: false
        }))
    };

    appState.homeworks.unshift(retryHw);
    saveStateToStorage();
    navigateTo('solve', { hwId: retryHw.id });
}

/* ========================================================================= */
/* HOMEWORKS & FOLDERS PAGE LOGIC                                            */
/* ========================================================================= */

function initHomeworksPage() {
    updateCategoryCounts();
    renderFoldersPage();
}

function updateCategoryCounts() {
    const all = appState.homeworks.length;
    const homework = appState.homeworks.filter(h => (h.category || 'homework') === 'homework').length;
    const practice = appState.homeworks.filter(h => h.category === 'practice').length;
    const exam = appState.homeworks.filter(h => h.category === 'exam').length;

    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setTxt('cat-count-all', all);
    setTxt('cat-count-homework', homework);
    setTxt('cat-count-practice', practice);
    setTxt('cat-count-exam', exam);
}

function setFolderCategoryFilter(cat) {
    appState.folderCategoryFilter = cat;
    document.querySelectorAll('.folder-cat-btn').forEach(btn => {
        const active = btn.dataset.cat === cat;
        btn.className = active
            ? 'folder-cat-btn px-3.5 py-2 rounded-xl text-xs font-extrabold bg-blue-900 text-white transition-all flex items-center gap-1'
            : 'folder-cat-btn px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1 transition-all';
    });
    renderFoldersPage();
}

function renderFoldersPage() {
    const container = document.getElementById('folders-container');
    if (!container) return;

    const searchInput = document.getElementById('folders-search-input');
    const search = (searchInput?.value || '').trim().toLowerCase();
    const catFilter = appState.folderCategoryFilter;

    const filtered = appState.homeworks.filter(hw => {
        const hwCat = hw.category || 'homework';
        if (catFilter !== 'all' && hwCat !== catFilter) return false;
        if (search) {
            const hay = `${hw.subject} ${hw.book} ${hw.chapter} ${hw.lesson}`.toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-10 border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
                <i class="ph-duotone ph-folder-dashed text-5xl text-slate-400"></i>
                <h4 class="font-extrabold text-base">مفيش جلسات مطابقة للبحث أو التصنيف ده</h4>
            </div>
        `;
        return;
    }

    const grouped = {};
    filtered.forEach(hw => {
        const subj = hw.subject || 'مادة عامة';
        if (!grouped[subj]) grouped[subj] = [];
        grouped[subj].push(hw);
    });

    container.innerHTML = Object.entries(grouped).map(([subject, items]) => {
        const icon = appState.subjectIcons[subject] || 'ph-folder';
        return `
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div class="flex items-center gap-3">
                        <button onclick="openSubjectIconModal('${escapeHtml(subject)}')" class="w-11 h-11 rounded-2xl bg-blue-100 dark:bg-blue-950/70 text-blue-900 dark:text-blue-300 flex items-center justify-center hover:scale-105 transition-transform" title="تغيير أيقونة المادة">
                            <i class="ph-fill ${icon} text-2xl"></i>
                        </button>
                        <div>
                            <h3 class="font-black text-lg">${escapeHtml(subject)}</h3>
                            <span class="text-xs font-bold text-slate-500">${items.length} جلسة مسجلة</span>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${items.map(hw => buildHomeworkCardHTML(hw)).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function openSubjectIconModal(subject) {
    appState.selectedIconSubject = subject;
    const nameEl = document.getElementById('icon-modal-subject-name');
    if (nameEl) nameEl.textContent = subject;

    const grid = document.getElementById('subject-icons-grid');
    if (grid) {
        grid.innerHTML = AVAILABLE_SUBJECT_ICONS.map(ic => `
            <button type="button" onclick="selectSubjectIcon('${ic}')" class="p-3 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 flex items-center justify-center text-2xl text-blue-900 dark:text-blue-400">
                <i class="ph-fill ${ic}"></i>
            </button>
        `).join('');
    }
    openModal('subject-icon-modal');
}

function selectSubjectIcon(iconName) {
    if (!appState.selectedIconSubject) return;
    appState.subjectIcons[appState.selectedIconSubject] = iconName;
    saveStateToStorage();
    closeModal('subject-icon-modal');
    renderFoldersPage();
}

/* ========================================================================= */
/* MISTAKES BANK PAGE LOGIC                                                  */
/* ========================================================================= */

function initMistakesPage() {
    populateMistakeFilters();
    renderMistakesPage();
}

function populateMistakeFilters() {
    const subjSel = document.getElementById('mistake-filter-subject');
    const bookSel = document.getElementById('mistake-filter-book');
    if (!subjSel || !bookSel) return;

    const subjects = [...new Set(appState.mistakes.map(m => m.subject).filter(Boolean))];
    const books = [...new Set(appState.mistakes.map(m => m.book).filter(Boolean))];

    subjSel.innerHTML = '<option value="all">كل المواد</option>' + subjects.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    bookSel.innerHTML = '<option value="all">كل الكتب</option>' + books.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
}

function onMistakeFilterChange() {
    renderMistakesPage();
}

function getFilteredMistakes() {
    const subj = document.getElementById('mistake-filter-subject')?.value || 'all';
    const book = document.getElementById('mistake-filter-book')?.value || 'all';
    const cat = document.getElementById('mistake-filter-category')?.value || 'all';
    const status = document.getElementById('mistake-filter-status')?.value || 'unmastered';

    return appState.mistakes.filter(m => {
        if (subj !== 'all' && m.subject !== subj) return false;
        if (book !== 'all' && m.book !== book) return false;
        if (cat !== 'all' && (m.category || 'homework') !== cat) return false;
        if (status === 'unmastered' && m.mastered) return false;
        if (status === 'mastered' && !m.mastered) return false;
        return true;
    });
}

function renderMistakesPage() {
    const container = document.getElementById('mistakes-list-container');
    if (!container) return;

    const items = getFilteredMistakes();
    if (items.length === 0) {
        container.innerHTML = `
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-10 border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
                <i class="ph-duotone ph-confetti text-5xl text-emerald-500"></i>
                <h4 class="font-extrabold text-base">مفيش أخطاء في التصنيف ده! عاش يا بطل 🎉</h4>
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(m => {
        const cat = CATEGORY_META[m.category] || CATEGORY_META.homework;
        return `
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3.5">
                <div class="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                    <div class="flex flex-wrap items-center gap-1.5">
                        <span class="px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold ${cat.badgeClass}">${cat.label}</span>
                        <span class="px-2.5 py-0.5 rounded-lg text-xs font-extrabold bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-blue-300">${escapeHtml(m.subject)}</span>
                        <span class="text-xs font-bold text-slate-500">${escapeHtml(m.book)} • ${escapeHtml(m.chapter)} • ${escapeHtml(m.lesson)} — <strong>سؤال ${escapeHtml(m.number)}</strong></span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="toggleMistakeMastered('${m.id}')" class="px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1 ${m.mastered ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-emerald-50'}">
                            <i class="ph-bold ph-check-circle"></i>
                            <span>${m.mastered ? 'تم الإتقان ✅' : 'علّم كـ متقن'}</span>
                        </button>
                        <button onclick="deleteMistake('${m.id}')" class="p-1.5 rounded-xl text-slate-400 hover:text-rose-600" title="حذف">
                            <i class="ph-bold ph-trash"></i>
                        </button>
                    </div>
                </div>

                ${m.question_text ? `<div class="rich-question-content text-sm sm:text-base font-bold leading-relaxed whitespace-pre-line">${escapeHtml(m.question_text)}</div>` : ''}
                ${m.question_html ? `<div class="rich-question-content overflow-x-auto">${sanitizeRichHtml(m.question_html)}</div>` : ''}
                ${m.question_image ? `<img src="${m.question_image}" onclick="openImageLightbox(this.src)" class="max-h-56 rounded-xl border border-slate-300 dark:border-slate-700 cursor-zoom-in bg-white">` : ''}

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                    <div class="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50">
                        <span class="text-rose-600 dark:text-rose-400 font-bold block text-[11px]">إجابتك السابقة:</span>
                        <strong class="text-rose-800 dark:text-rose-200">${escapeHtml(m.user_answer)}</strong>
                    </div>
                    <div class="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
                        <span class="text-emerald-600 dark:text-emerald-400 font-bold block text-[11px]">الإجابة الصحيحة:</span>
                        <strong class="text-emerald-800 dark:text-emerald-200">${escapeHtml(m.correct_answer)}</strong>
                    </div>
                </div>

                ${m.explanation ? `<div class="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 text-xs text-blue-950 dark:text-blue-200"><strong>💡 الشرح:</strong> ${escapeHtml(m.explanation)}</div>` : ''}

                <div class="flex flex-wrap items-center gap-2 pt-1">
                    <label class="cursor-pointer px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold flex items-center gap-1.5">
                        <input type="file" accept="image/*" class="hidden" onchange="attachImageToMistake('${m.id}', event)">
                        <i class="ph-bold ph-camera-plus text-base text-blue-800 dark:text-blue-400"></i>
                        <span>${m.question_image ? 'تغيير صورة السؤال' : 'إرفاق صورة للسؤال'}</span>
                    </label>
                    <input type="text" value="${escapeHtml(m.student_note || '')}" onchange="updateMistakeNote('${m.id}', this.value)" placeholder="اكتب ملاحظتك أو فكرة الحل هنا..." class="flex-1 min-w-[200px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold">
                </div>
            </div>
        `;
    }).join('');

    renderMathInContainer(container);
}

function toggleMistakeMastered(id) {
    const m = appState.mistakes.find(item => item.id === id);
    if (!m) return;
    m.mastered = !m.mastered;
    saveStateToStorage();
    updateGlobalHeaderUI();
    renderMistakesPage();
}

function deleteMistake(id) {
    appState.mistakes = appState.mistakes.filter(m => m.id !== id);
    saveStateToStorage();
    updateGlobalHeaderUI();
    renderMistakesPage();
}

function attachImageToMistake(id, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const m = appState.mistakes.find(item => item.id === id);
        if (!m) return;
        m.question_image = ev.target.result;
        saveStateToStorage();
        renderMistakesPage();
        showToast('تم إرفاق صورة السؤال بنجاح!', 'success');
    };
    reader.readAsDataURL(file);
}

function updateMistakeNote(id, note) {
    const m = appState.mistakes.find(item => item.id === id);
    if (!m) return;
    m.student_note = note;
    saveStateToStorage();
    showToast('تم حفظ ملاحظتك.', 'success');
}

function startRetryFilteredMistakes() {
    const items = getFilteredMistakes();
    if (items.length === 0) {
        showToast('مفيش أخطاء معروضة حالياً عشان تختبر نفسك فيها!', 'info');
        return;
    }

    const retryHw = {
        id: 'hw_mis_bank_' + Date.now(),
        category: 'practice',
        subject: items.length === 1 ? items[0].subject : 'مراجعة بنك الأخطاء',
        book: 'بنك أخطائي',
        chapter: 'مراجعة شاملة',
        lesson: `اختبار على ${items.length} خطأ`,
        mode: 'ai_json',
        manualPhase: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'in_progress',
        questions: items.map((m, i) => ({
            id: `mq_${Date.now()}_${i}`,
            number: m.number || String(i + 1),
            type: m.type || 'mcq',
            question_text: m.question_text || '',
            question_html: m.question_html || '',
            question_image: m.question_image || '',
            options: Object.keys(m.options || {}).length ? m.options : { 'أ': 'أ', 'ب': 'ب', 'ج': 'ج', 'د': 'د' },
            correct_answer: m.type === 'essay' ? '' : m.correct_answer,
            model_answer: m.type === 'essay' ? m.correct_answer : '',
            explanation: m.explanation || '',
            user_answer: null,
            essay_score: null,
            flagged: false,
            graded: false
        }))
    };

    appState.homeworks.unshift(retryHw);
    saveStateToStorage();
    navigateTo('solve', { hwId: retryHw.id });
}

/* ========================================================================= */
/* BACKUP & RESTORE                                                          */
/* ========================================================================= */

function openBackupModal() {
    openModal('backup-modal');
}

function exportFullBackup() {
    const payload = {
        version: '2.5',
        exportedAt: new Date().toISOString(),
        userProfile: appState.userProfile,
        settings: appState.settings,
        subjectIcons: appState.subjectIcons,
        homeworks: appState.homeworks,
        mistakes: appState.mistakes
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart_bubblesheet_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('تم تحميل النسخة الاحتياطية الكاملة بنجاح!', 'success');
}

function importFullBackup(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            if (Array.isArray(data.homeworks)) appState.homeworks = data.homeworks;
            if (Array.isArray(data.mistakes)) appState.mistakes = data.mistakes;
            if (data.userProfile) appState.userProfile = data.userProfile;
            if (data.settings) appState.settings = { ...appState.settings, ...data.settings };
            if (data.subjectIcons) appState.subjectIcons = data.subjectIcons;
            saveStateToStorage();
            showToast('تم استعادة بياناتك بنجاح! جاري تحديث الصفحة...', 'success');
            setTimeout(() => window.location.reload(), 700);
        } catch (err) {
            showToast('ملف النسخة الاحتياطية غير صالح.', 'error');
        }
    };
    reader.readAsText(file);
}

/* ========================================================================= */
/* UI UTILITIES & HELPERS                                                    */
/* ========================================================================= */

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}

function openImageLightbox(src) {
    const img = document.getElementById('lightbox-img-el');
    if (img) img.src = src;
    openModal('image-lightbox-modal');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const colors = {
        success: 'bg-emerald-600 text-white',
        error: 'bg-rose-600 text-white',
        info: 'bg-slate-900 text-white dark:bg-slate-800'
    };

    const toast = document.createElement('div');
    toast.className = `pointer-events-auto px-4 py-3 rounded-2xl shadow-xl text-xs sm:text-sm font-extrabold flex items-center gap-2 animate-pop ${colors[type] || colors.info}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.25s ease';
        setTimeout(() => toast.remove(), 260);
    }, 3200);
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getAIPromptText() {
    return `Role & Objective:
You are an expert OCR and Educational Data Engineer. Extract all questions from the provided images/text and output a strictly valid JSON containing ONLY an array of questions under the key "questions".

CRITICAL Output & Formatting Rules:
- Output ONLY valid JSON. No conversational text before or after.
- To handle 200+ questions without truncation, keep text concise where possible, BUT DO NOT SUMMARIZE OR TRUNCATE READING PASSAGES (القطع والنصوص القرائية). Extract reading passages completely and word-for-word.
- Chemical Formulas & Layout Protection: To prevent RTL/LTR character mixing and scrambled numbers in chemical formulas (e.g., H2SO4, Fe2O3) or math, wrap English words, numbers, and formulas inside explicit HTML tags with direction, like <span dir="ltr">H2SO4</span> or use LaTeX ($...$).
- Quranic Text: Preserve Uthmanic/Hafs diacritics (تشكيل) and text standards accurately.
- Tables & HTML: If a table exists, put its HTML code (<table>...</table>) inside "question_html". Otherwise, leave "question_html" as an empty string "".

Required JSON Schema:
{
  "questions": [
    {
      "number": "1",
      "type": "mcq",
      "question_text": "نص السؤال أو القطعة كاملة هنا. استخدم <span dir=\\\"ltr\\\">...</span> للصيغ الكيميائية.",
      "question_html": "",
      "options": {
        "أ": "نص الاختيار الأول",
        "ب": "نص الاختيار الثاني",
        "ج": "نص الاختيار الثالث",
        "د": "نص الاختيار الرابع"
      },
      "correct_answer": "أ",
      "explanation": "شرح الإجابة باختصار"
    },
    {
      "number": "2",
      "type": "essay",
      "question_text": "نص السؤال المقالي...",
      "question_html": "",
      "options": {},
      "correct_answer": "",
      "model_answer": "الإجابة النموذجية للسؤال المقالي",
      "explanation": "شرح أو ملاحظات"
    }
  ]
}`;
}

function copyAIPrompt() {
    const text = getAIPromptText();
    navigator.clipboard.writeText(text).then(() => {
        showToast('تم نسخ البرومت المحدث (بدون معلومات مكررة)! ابعته لـ Gemini.', 'success');
    }).catch(() => {
        showToast('فشل النسخ، حاول مرة أخرى.', 'error');
    });
}
