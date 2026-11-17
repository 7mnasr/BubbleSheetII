// =========================================================================
// 1. STATE MANAGEMENT & LOCALSTORAGE PERSISTENCE
// =========================================================================
const STORAGE_KEY = 'smart_bubble_sheet_v1';
const THEME_KEY = 'smart_bubble_sheet_theme';
const TUTORIAL_DISMISSED_KEY = 'smart_bubble_sheet_tutorial_done';
const COLOR_THEME_KEY = 'smart_bubble_sheet_color_theme';
const ACTIVE_HW_KEY = 'smart_bubble_sheet_active_hw_id';
const RETRY_FLAG_KEY = 'smart_bubble_sheet_is_retry';

let selectedInitTheme = 'blue';

let appState = {
    userProfile: null, // { name, gender, colorTheme, createdAt }
    homeworks: [], // Array of Homework Objects
    subjectIcons: {}, // { [subjectName]: iconKey }
    solveMode: 'standard', // 'standard' or 'auto'
};

// Transient runtime state
let pendingParsedQuestions = null;
let pendingParsedLang = 'ar';
let currentHomeworkId = null;
let currentQuestionIndex = 0;
let hasUnsavedChanges = false;
let dashboardFilter = 'all';
let isRetrySession = false;
let pendingTargetUrl = null;
let pendingDeleteHwId = null;

// Homeworks Folders Explorer state
let folderNavState = {
    subject: null,
    book: null,
    chapter: null
};
let folderSelectionMode = false;
let selectedExportHwIds = new Set();
let iconPickerTargetSubject = null;

const ERROR_REASONS = [
    'عوضت غلط',
    'اخترت غلط سهواً',
    'مش فاهم الفكرة',
    'متلخبط / ناسي قاعدة'
];

function getCurrentPage() {
    return document.body.dataset.page || 'home';
}

function initApp() {
    initTheme();
    generateHomeScreenAppIcon();

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.homeworks)) {
                appState.homeworks = parsed.homeworks;
                appState.solveMode = parsed.solveMode || 'standard';
                appState.userProfile = parsed.userProfile || null;
                appState.subjectIcons = parsed.subjectIcons || {};
            }
        }
    } catch (e) {
        console.error('Error loading localStorage:', e);
    }

    const savedColor = (appState.userProfile && appState.userProfile.colorTheme)
        || localStorage.getItem(COLOR_THEME_KEY)
        || 'blue';
    applyColorTheme(savedColor, false);

    setupBeforeUnloadGuard();
    updateGlobalStats();
    applyUserPersonalization();

    const page = getCurrentPage();
    updateActiveNavHighlight(page);

    if (page === 'home') {
        setupDragAndDrop();
        refreshAllUI();
    } else if (page === 'homeworks') {
        initHomeworksExplorerPage();
    } else if (page === 'solve') {
        setupKeyboardShortcuts();
        initSolvePage();
    } else if (page === 'dashboard') {
        initDashboardPage();
    } else if (page === 'mistakes') {
        renderMistakesHub();
    }

    // Check if user profile exists on this device; if not, show welcome/restore prompt first
    if (!appState.userProfile) {
        showUserInitStep('ask');
        openModal('user-init-modal');
    } else if (page === 'home' && localStorage.getItem(TUTORIAL_DISMISSED_KEY) !== 'true') {
        openTutorialFromStart();
    }
}

function updateActiveNavHighlight(page) {
    const homeBtn = document.getElementById('nav-home-btn');
    const homeworksBtn = document.getElementById('nav-homeworks-btn');
    const mistakesBtn = document.getElementById('nav-mistakes-btn');
    if (!homeBtn || !mistakesBtn) return;

    const inactiveBase = 'px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';
    homeBtn.className = inactiveBase;
    if (homeworksBtn) homeworksBtn.className = inactiveBase;
    mistakesBtn.className = 'relative ' + inactiveBase;

    if (page === 'home') {
        homeBtn.className = 'px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors bg-blue-50 text-blue-900 dark:bg-blue-950/60 dark:text-blue-300';
    } else if (page === 'homeworks' && homeworksBtn) {
        homeworksBtn.className = 'px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors bg-blue-50 text-blue-900 dark:bg-blue-950/60 dark:text-blue-300';
    } else if (page === 'mistakes') {
        mistakesBtn.className = 'relative px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors bg-rose-50 text-rose-900 dark:bg-rose-950/50 dark:text-rose-300';
    }
}

// Generate crisp PNG icon dynamically for mobile Home Screen shortcut (apple-touch-icon)
function generateHomeScreenAppIcon() {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 180;
        canvas.height = 180;
        const ctx = canvas.getContext('2d');

        const grad = ctx.createLinearGradient(0, 0, 180, 180);
        grad.addColorStop(0, '#1e3a8a');
        grad.addColorStop(1, '#3b82f6');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(0, 0, 180, 180, 40);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.strokeRect(38, 44, 38, 38);
        ctx.beginPath();
        ctx.moveTo(94, 63);
        ctx.lineTo(142, 63);
        ctx.stroke();

        ctx.strokeRect(38, 98, 38, 38);
        ctx.beginPath();
        ctx.moveTo(94, 117);
        ctx.lineTo(142, 117);
        ctx.stroke();

        ctx.strokeStyle = '#34d399';
        ctx.beginPath();
        ctx.moveTo(47, 63);
        ctx.lineTo(55, 71);
        ctx.lineTo(69, 54);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(47, 117);
        ctx.lineTo(55, 125);
        ctx.lineTo(69, 108);
        ctx.stroke();

        const link = document.getElementById('apple-touch-icon-link');
        if (link) link.href = canvas.toDataURL('image/png');
    } catch (e) {}
}

// =========================================================================
// 1.2 USER PROFILE, COLOR THEMES & FIRST-TIME ONBOARDING
// =========================================================================
function applyColorTheme(themeName, saveToProfile = false) {
    const validThemes = ['blue', 'pink', 'green', 'red', 'purple'];
    const theme = validThemes.includes(themeName) ? themeName : 'blue';
    document.documentElement.setAttribute('data-color-theme', theme);
    localStorage.setItem(COLOR_THEME_KEY, theme);

    const themeHexMap = {
        blue: '#1e3a8a',
        pink: '#831843',
        green: '#064e3b',
        red: '#7f1d1d',
        purple: '#4c1d95'
    };
    const metaColor = document.getElementById('meta-theme-color');
    if (metaColor) metaColor.setAttribute('content', themeHexMap[theme]);

    document.querySelectorAll('.edit-theme-btn').forEach(btn => {
        if (btn.dataset.editTval === theme) {
            btn.classList.add('border-slate-900', 'dark:border-white', 'bg-slate-100', 'dark:bg-slate-800');
        } else {
            btn.classList.remove('border-slate-900', 'dark:border-white', 'bg-slate-100', 'dark:bg-slate-800');
        }
    });

    if (saveToProfile && appState.userProfile) {
        appState.userProfile.colorTheme = theme;
        persistState();
    }
}

function showUserInitStep(step) {
    ['ask', 'restore', 'new'].forEach(s => {
        const el = document.getElementById(`user-init-step-${s}`);
        if (el) el.classList.toggle('hidden', s !== step);
    });
}

function suggestThemeByGender(gender) {
    if (gender === 'female') {
        selectInitColorTheme('pink');
    } else {
        selectInitColorTheme('blue');
    }
}

function selectInitColorTheme(themeName) {
    selectedInitTheme = themeName;
    applyColorTheme(themeName, false);
    document.querySelectorAll('.init-theme-btn').forEach(btn => {
        if (btn.dataset.tval === themeName) {
            btn.className = 'init-theme-btn p-2.5 rounded-xl border-2 border-blue-900 bg-blue-50 dark:bg-blue-950/50 flex flex-col items-center gap-1.5 transition-all scale-105';
        } else {
            btn.className = 'init-theme-btn p-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 flex flex-col items-center gap-1.5 transition-all';
        }
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
        colorTheme: selectedInitTheme,
        createdAt: new Date().toISOString()
    };
    applyColorTheme(selectedInitTheme, true);
    persistState();
    applyUserPersonalization();
    closeModal('user-init-modal');

    showToast(
        genderEl.value === 'female'
            ? `نورتي الموقع يا ${name}! تم تجهيز ملفك بنجاح.`
            : `نورت الموقع يا ${name}! تم تجهيز ملفك بنجاح.`,
        'success'
    );

    // New user: show usage guide immediately right after entering profile data
    localStorage.removeItem(TUTORIAL_DISMISSED_KEY);
    openTutorialFromStart();
}

function handleInitialBackupRestore(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data || !Array.isArray(data.homeworks)) {
                throw new Error('Invalid backup file');
            }
            appState.homeworks = data.homeworks;
            appState.solveMode = data.solveMode || 'standard';
            appState.subjectIcons = data.subjectIcons || {};
            appState.userProfile = data.userProfile || {
                name: 'بطل المذاكرة',
                gender: 'male',
                colorTheme: 'blue',
                createdAt: new Date().toISOString()
            };

            applyColorTheme(appState.userProfile.colorTheme || 'blue', true);
            persistState();
            refreshAllUI();
            if (getCurrentPage() === 'homeworks') renderFoldersExplorer();
            applyUserPersonalization();
            closeModal('user-init-modal');
            localStorage.setItem(TUTORIAL_DISMISSED_KEY, 'true');

            showToast(`أهلاً بعودتك يا ${appState.userProfile.name}! تم استرجاع كل بياناتك بنجاح.`, 'success');
        } catch (err) {
            showToast('الملف ده مش ملف نسخة احتياطية سليم! تأكد من اختيار الملف الصح.', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function applyUserPersonalization() {
    const profile = appState.userProfile;
    const nameEl = document.getElementById('header-user-name');
    const headingEl = document.getElementById('home-welcome-heading');
    if (!profile) return;

    if (nameEl) nameEl.textContent = profile.name;
    if (headingEl) {
        const greeting = profile.gender === 'female'
            ? `أهلاً بيكي يا ${profile.name} 👋 ابدئي بابل شيت جديد`
            : `أهلاً بيك يا ${profile.name} 👋 ابدأ بابل شيت جديد`;
        headingEl.textContent = greeting;
    }
}

function openProfileSettingsModal() {
    const profile = appState.userProfile || { name: '', gender: 'male', colorTheme: 'blue' };
    document.getElementById('edit-user-name').value = profile.name || '';
    const genderRadio = document.querySelector(`input[name="edit-gender"][value="${profile.gender || 'male'}"]`);
    if (genderRadio) genderRadio.checked = true;
    applyColorTheme(profile.colorTheme || 'blue', false);
    openModal('profile-settings-modal');
}

function updateExistingUserProfile(e) {
    e.preventDefault();
    const name = document.getElementById('edit-user-name').value.trim();
    const genderEl = document.querySelector('input[name="edit-gender"]:checked');
    const currentTheme = localStorage.getItem(COLOR_THEME_KEY) || 'blue';
    if (!name) return;

    appState.userProfile = {
        ...(appState.userProfile || {}),
        name,
        gender: genderEl ? genderEl.value : 'male',
        colorTheme: currentTheme
    };
    persistState();
    applyUserPersonalization();
    closeModal('profile-settings-modal');
    showToast('تم حفظ بياناتك وتحديث الثيم بنجاح!', 'success');
}

function persistState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    } catch (e) {
        showToast('ذاكرة المتصفح ممتلئة! حاول تصدير نسخة احتياطية أو تقليل حجم الصور المرفقة.', 'error');
    }
}

// =========================================================================
// 1.5 FIRST-TIME WELCOME & INTERACTIVE GRAPHIC TUTORIAL
// =========================================================================
function openTutorialFromStart() {
    goToTutorialStep(0);
    openModal('onboarding-modal');
}

function goToTutorialStep(stepIndex) {
    [0, 1, 2, 3].forEach(idx => {
        const el = document.getElementById(`tut-step-${idx}`);
        if (el) el.classList.toggle('hidden', idx !== stepIndex);
    });
    if (stepIndex === 1) {
        replayTutorialAnimation(1);
    }
}

function replayTutorialAnimation(step) {
    if (step === 1) {
        const stage = document.getElementById('tut-anim-stage-1');
        if (!stage) return;
        const clone = stage.cloneNode(true);
        stage.parentNode.replaceChild(clone, stage);
    }
}

function dismissTutorialForever() {
    localStorage.setItem(TUTORIAL_DISMISSED_KEY, 'true');
    closeModal('onboarding-modal');
}

// =========================================================================
// 2. THEME MANAGEMENT (DARK / LIGHT MODE)
// =========================================================================
function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.documentElement.classList.add('dark');
        updateThemeIcon(true);
    } else {
        document.documentElement.classList.remove('dark');
        updateThemeIcon(false);
    }
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
    const icon = document.getElementById('theme-icon');
    if (icon) {
        icon.className = isDark ? 'ph-bold ph-sun text-lg text-amber-400' : 'ph-bold ph-moon text-lg';
    }
}

// =========================================================================
// 3. MULTI-PAGE NAVIGATION & ROUTER
// =========================================================================
const PAGE_ROUTES = {
    home: 'index.html',
    homeworks: 'homeworks.html',
    solve: 'solve.html',
    dashboard: 'dashboard.html',
    mistakes: 'mistakes.html'
};

function navigateTo(viewName) {
    const targetUrl = PAGE_ROUTES[viewName] || 'index.html';
    if (getCurrentPage() === 'solve' && viewName !== 'solve' && hasUnsavedChanges) {
        pendingTargetUrl = targetUrl;
        openModal('unsaved-modal');
        return;
    }
    window.location.href = targetUrl;
}

function attemptExitSolve() {
    if (hasUnsavedChanges) {
        pendingTargetUrl = 'index.html';
        openModal('unsaved-modal');
    } else {
        window.location.href = 'index.html';
    }
}

function confirmDiscardAndExit() {
    hasUnsavedChanges = false;
    closeModal('unsaved-modal');
    window.location.href = pendingTargetUrl || 'index.html';
}

function saveAndExitSolve() {
    saveCurrentProgress(false);
    closeModal('unsaved-modal');
    window.location.href = pendingTargetUrl || 'index.html';
}

function setupBeforeUnloadGuard() {
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

// =========================================================================
// 4. ANSWER KEY UPLOAD, MANUAL CREATION & DEMO HOMEWORK
// =========================================================================
function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    if (!dropZone) return;

    ['dragenter', 'dragover'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropZone.classList.add('border-blue-800', 'bg-blue-50/50', 'dark:bg-blue-950/30');
        });
    });

    ['dragleave', 'drop'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-blue-800', 'bg-blue-50/50', 'dark:bg-blue-950/30');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files[0];
        if (file) processAnswerKeyFile(file);
    });
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) processAnswerKeyFile(file);
    event.target.value = '';
}

function processAnswerKeyFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            let content = e.target.result.trim();
            content = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
            const data = JSON.parse(content);

            if (!data.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
                throw new Error('ملف الإجابات لا يحتوي على قائمة أسئلة صحيحة.');
            }

            const normalizedQuestions = data.questions.map((q, idx) => {
                const qType = (q.type === 'essay') ? 'essay' : 'mcq';
                let ans = String(q.answer || '').trim();
                if (qType === 'mcq') {
                    if (ans === 'ا') ans = 'أ';
                    if (['a', 'b', 'c', 'd'].includes(ans.toLowerCase())) ans = ans.toUpperCase();
                }
                return {
                    number: (q.number !== undefined && q.number !== null && String(q.number).trim() !== '') ? String(q.number).trim() : String(idx + 1),
                    type: qType,
                    correctAnswer: ans,
                    userAnswer: null,
                    essayRevealed: false,
                    essayScore: null,
                    flagged: false,
                    status: 'unanswered',
                    errorReason: '',
                    understood: false,
                    note: '',
                    questionText: '',
                    questionImage: ''
                };
            });

            pendingParsedQuestions = normalizedQuestions;
            pendingParsedLang = (data.language === 'en') ? 'en' : 'ar';

            populateSubjectsDatalist();

            document.getElementById('parsed-q-count').textContent = normalizedQuestions.length;
            document.getElementById('meta-lang').value = pendingParsedLang;
            document.getElementById('metadata-setup-card').classList.remove('hidden');
            document.getElementById('metadata-setup-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
            showToast('تم قراءة نموذج الإجابة! اكتب بيانات الواجب للبدء.', 'success');
        } catch (err) {
            showToast('صيغة الملف غير صحيحة! تأكد إنك نسخت كود JSON صح من الذكاء الاصطناعي.', 'error');
        }
    };
    reader.readAsText(file);
}

function cancelMetadataSetup() {
    pendingParsedQuestions = null;
    document.getElementById('metadata-setup-card').classList.add('hidden');
}

function startNewHomework(e) {
    e.preventDefault();
    if (!pendingParsedQuestions) return;

    const subject = document.getElementById('meta-subject').value.trim();
    const book = document.getElementById('meta-book').value.trim();
    const chapter = document.getElementById('meta-chapter').value.trim();
    const lesson = document.getElementById('meta-lesson').value.trim();
    const language = document.getElementById('meta-lang').value;

    const newHw = {
        id: 'hw_' + Date.now(),
        subject,
        book,
        chapter,
        lesson,
        language,
        createdAt: new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }),
        status: 'in_progress',
        isManual: false,
        manualPhase: null,
        manualOrder: null,
        questions: pendingParsedQuestions,
        scoreEarned: 0,
        scoreMax: 0,
        percentage: 0
    };

    appState.homeworks.unshift(newHw);
    persistState();

    document.getElementById('homework-metadata-form').reset();
    document.getElementById('metadata-setup-card').classList.add('hidden');
    pendingParsedQuestions = null;

    openSolveView(newHw.id);
}

// Manual Homework Setup & Two-Phase Logic
function openManualSetupModal() {
    populateSubjectsDatalist();
    openModal('manual-setup-modal');
}

function startManualHomework(startOrder) {
    const subject = document.getElementById('man-subject').value.trim();
    const book = document.getElementById('man-book').value.trim();
    const chapter = document.getElementById('man-chapter').value.trim();
    const lesson = document.getElementById('man-lesson').value.trim();
    const qCount = parseInt(document.getElementById('man-qcount').value, 10);
    const language = document.getElementById('man-lang').value;

    if (!subject || !book || !chapter || !lesson || !qCount || qCount < 1) {
        showToast('من فضلك املا كل البيانات وعدد الأسئلة الأول!', 'error');
        return;
    }

    const questions = Array.from({ length: qCount }, (_, i) => ({
        number: i + 1,
        type: 'mcq',
        correctAnswer: null,
        userAnswer: null,
        essayRevealed: false,
        essayScore: null,
        flagged: false,
        status: 'unanswered',
        errorReason: '',
        understood: false,
        note: '',
        questionText: '',
        questionImage: ''
    }));

    const newHw = {
        id: 'hw_man_' + Date.now(),
        subject,
        book,
        chapter,
        lesson,
        language,
        createdAt: new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }),
        status: 'in_progress',
        isManual: true,
        manualOrder: startOrder,
        manualPhase: startOrder === 'user_first' ? 'user' : 'key',
        questions,
        scoreEarned: 0,
        scoreMax: 0,
        percentage: 0
    };

    appState.homeworks.unshift(newHw);
    persistState();

    document.getElementById('manual-homework-form').reset();
    closeModal('manual-setup-modal');

    openSolveView(newHw.id);
}

function loadDemoHomework() {
    const demoQuestions = [
        { number: 1, type: 'mcq', correctAnswer: 'أ' },
        { number: 2, type: 'mcq', correctAnswer: 'ج' },
        { number: 3, type: 'mcq', correctAnswer: 'ب' },
        { number: 4, type: 'mcq', correctAnswer: 'د' },
        { number: 5, type: 'mcq', correctAnswer: 'ب' },
        { number: 6, type: 'mcq', correctAnswer: 'أ' },
        { number: 7, type: 'mcq', correctAnswer: 'ج' },
        { number: 8, type: 'mcq', correctAnswer: 'د' },
        { number: 9, type: 'mcq', correctAnswer: 'أ' },
        { number: 10, type: 'essay', correctAnswer: 'لأن المقاومة النوعية تتوقف على نوع المادة ودرجة الحرارة فقط، ولا تتغير بتغير طول السلك أو مساحة مقطعه.' }
    ].map(q => ({
        ...q,
        userAnswer: null,
        essayRevealed: false,
        essayScore: null,
        flagged: false,
        status: 'unanswered',
        errorReason: '',
        understood: false,
        note: '',
        questionText: '',
        questionImage: ''
    }));

    const demoHw = {
        id: 'hw_demo_' + Date.now(),
        subject: 'الفيزياء',
        book: 'كتاب الامتحان (نموذج تجريبي)',
        chapter: 'الفصل الأول: التيار الكهربي',
        lesson: 'الدرس الثاني: المقاومة النوعية',
        language: 'ar',
        createdAt: new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }),
        status: 'in_progress',
        isManual: false,
        manualPhase: null,
        manualOrder: null,
        questions: demoQuestions,
        scoreEarned: 0,
        scoreMax: 0,
        percentage: 0
    };

    appState.homeworks.unshift(demoHw);
    persistState();
    openSolveView(demoHw.id);
}

function openAiPromptModal() {
    openModal('ai-prompt-modal');
}

function copyAiPrompt() {
    const textarea = document.getElementById('ai-prompt-text');
    textarea.select();
    textarea.setSelectionRange(0, 99999);
    try {
        document.execCommand('copy');
        showToast('تم نسخ البرومت! ابعته لـ Gemini مع صور نموذج الإجابة.', 'success');
        closeModal('ai-prompt-modal');
    } catch (err) {
        showToast('تعذر النسخ التلقائي، حدد النص وانسخه يدوياً.', 'error');
    }
}

// =========================================================================
// 5. SMART BUBBLE SHEET SOLVING ENGINE (NORMAL + MANUAL TWO-PHASE)
// =========================================================================
function openSolveView(hwId, isRetry = false) {
    localStorage.setItem(ACTIVE_HW_KEY, hwId);
    if (isRetry) {
        localStorage.setItem(RETRY_FLAG_KEY, 'true');
    } else {
        localStorage.removeItem(RETRY_FLAG_KEY);
    }
    window.location.href = 'solve.html';
}

function initSolvePage() {
    const params = new URLSearchParams(window.location.search);
    const hwId = params.get('id') || localStorage.getItem(ACTIVE_HW_KEY);
    const hw = appState.homeworks.find(h => h.id === hwId);

    if (!hw) {
        window.location.href = 'index.html';
        return;
    }

    currentHomeworkId = hwId;
    isRetrySession = localStorage.getItem(RETRY_FLAG_KEY) === 'true' || hwId.startsWith('retry_');
    hasUnsavedChanges = false;

    const firstUnanswered = hw.questions.findIndex(q => !isQuestionAnsweredInCurrentPhase(hw, q));
    currentQuestionIndex = firstUnanswered !== -1 ? firstUnanswered : 0;

    document.getElementById('solve-subject-badge').textContent = hw.subject;
    document.getElementById('solve-title').textContent = `${hw.book} • ${hw.chapter} • ${hw.lesson}`;

    updateSolveModeUI();
    updateManualPhaseBannerUI(hw);
    renderCurrentQuestion();
    renderQuestionMap();
}

function isEnteringKeyPhase(hw) {
    return hw && hw.isManual && hw.manualPhase === 'key';
}

function isQuestionAnsweredInCurrentPhase(hw, q) {
    if (isEnteringKeyPhase(hw)) {
        return q.correctAnswer !== null && q.correctAnswer !== '';
    }
    if (q.type === 'mcq') return q.userAnswer !== null && q.userAnswer !== '';
    if (q.type === 'essay') return q.essayScore !== null;
    return false;
}

function updateManualPhaseBannerUI(hw) {
    const banner = document.getElementById('manual-phase-banner');
    const submitBtnText = document.getElementById('main-submit-btn-text');
    const submitBtn = document.getElementById('main-submit-btn');
    const legendDot = document.getElementById('legend-answered-dot');
    const legendLabel = document.getElementById('legend-answered-label');

    if (!hw || !hw.isManual) {
        banner.classList.add('hidden');
        submitBtnText.textContent = 'تسليم الواجب';
        submitBtn.className = 'px-5 sm:px-7 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm sm:text-base shadow-md flex items-center gap-2 transition-all active:scale-95';
        legendDot.className = 'w-3 h-3 rounded bg-blue-900 inline-block';
        legendLabel.textContent = 'متجاوب';
        return;
    }

    banner.classList.remove('hidden');
    const isPhase1 = (hw.manualOrder === 'user_first' && hw.manualPhase === 'user')
                  || (hw.manualOrder === 'key_first' && hw.manualPhase === 'key');

    const stepBadge = document.getElementById('manual-phase-step-badge');
    const titleEl = document.getElementById('manual-phase-title');
    const descEl = document.getElementById('manual-phase-desc');
    const switchBtn = document.getElementById('manual-phase-switch-btn');
    const iconWrap = document.getElementById('manual-phase-icon');

    if (isEnteringKeyPhase(hw)) {
        banner.className = 'rounded-2xl p-3.5 sm:p-4 border-2 border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 flex flex-wrap items-center justify-between gap-3 animate-pop';
        iconWrap.className = 'w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0';
        iconWrap.innerHTML = '<i class="ph-bold ph-check-circle text-xl"></i>';
        stepBadge.className = 'text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200';
        stepBadge.textContent = isPhase1 ? 'المرحلة ١ من ٢ • إدخال النموذج' : 'المرحلة ٢ من ٢ • إدخال النموذج';
        titleEl.textContent = 'حط إجابات النموذج الصح دلوقتي ✅';
        descEl.textContent = isPhase1
            ? 'سجّل الإجابات الصحيحة من النموذج اللي معاك، وبعد ما تخلص اضغط "ابدأ حل إجاباتي".'
            : 'سجّل الإجابات الصحيحة من النموذج عشان نصحح إجاباتك فوراً ونطلع النتيجة!';

        if (isPhase1) {
            switchBtn.className = 'px-4 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center gap-1.5';
            switchBtn.innerHTML = '<span>خلصت النموذج، ابدأ حل إجاباتي</span><i class="ph-bold ph-arrow-left"></i>';
            submitBtnText.textContent = 'الانتقال لحل إجاباتي';
            submitBtn.className = 'px-5 sm:px-7 py-3.5 rounded-2xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-sm sm:text-base shadow-md flex items-center gap-2 transition-all active:scale-95';
        } else {
            switchBtn.className = 'px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center gap-1.5';
            switchBtn.innerHTML = '<span>احسب النتيجة وصحّح الآن</span><i class="ph-bold ph-check"></i>';
            submitBtnText.textContent = 'تصحيح وعرض النتيجة';
            submitBtn.className = 'px-5 sm:px-7 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm sm:text-base shadow-md flex items-center gap-2 transition-all active:scale-95';
        }
        legendDot.className = 'w-3 h-3 rounded bg-emerald-600 inline-block';
        legendLabel.textContent = 'متسجل بالنموذج';
    } else {
        banner.className = 'rounded-2xl p-3.5 sm:p-4 border-2 border-blue-700 bg-blue-50/80 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100 flex flex-wrap items-center justify-between gap-3 animate-pop';
        iconWrap.className = 'w-10 h-10 rounded-xl bg-blue-900 text-white flex items-center justify-center shrink-0';
        iconWrap.innerHTML = '<i class="ph-bold ph-pencil-simple text-xl"></i>';
        stepBadge.className = 'text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-blue-200 text-blue-900 dark:bg-blue-900 dark:text-blue-200';
        stepBadge.textContent = isPhase1 ? 'المرحلة ١ من ٢ • إجاباتك' : 'المرحلة ٢ من ٢ • إجاباتك';
        titleEl.textContent = 'اختار إجاباتك أنت دلوقتي ✍️';
        descEl.textContent = isPhase1
            ? 'اختار إجاباتك لكل سؤال، ولما تخلص اضغط "حط نموذج الإجابة للتصحيح".'
            : 'نموذج الإجابة متسجل وجاهز! اختار إجاباتك وبعدين اضغط "تسليم الواجب".';

        if (isPhase1) {
            switchBtn.className = 'px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center gap-1.5';
            switchBtn.innerHTML = '<span>حط نموذج الإجابة للتصحيح</span><i class="ph-bold ph-arrow-left"></i>';
            submitBtnText.textContent = 'الانتقال لإدخال النموذج';
            submitBtn.className = 'px-5 sm:px-7 py-3.5 rounded-2xl bg-indigo-700 hover:bg-indigo-600 text-white font-extrabold text-sm sm:text-base shadow-md flex items-center gap-2 transition-all active:scale-95';
        } else {
            switchBtn.className = 'px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center gap-1.5';
            switchBtn.innerHTML = '<span>تسليم وتصحيح الواجب</span><i class="ph-bold ph-paper-plane-tilt"></i>';
            submitBtnText.textContent = 'تسليم الواجب';
            submitBtn.className = 'px-5 sm:px-7 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm sm:text-base shadow-md flex items-center gap-2 transition-all active:scale-95';
        }
        legendDot.className = 'w-3 h-3 rounded bg-blue-900 inline-block';
        legendLabel.textContent = 'متجاوب';
    }
}

function handleManualPhaseAction() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw || !hw.isManual) return;

    const isPhase1 = (hw.manualOrder === 'user_first' && hw.manualPhase === 'user')
                  || (hw.manualOrder === 'key_first' && hw.manualPhase === 'key');

    if (isPhase1) {
        switchToSecondManualPhase(hw);
    } else {
        initiateSubmitHomework();
    }
}

function switchToSecondManualPhase(hw) {
    hw.manualPhase = (hw.manualPhase === 'user') ? 'key' : 'user';
    currentQuestionIndex = 0;
    hasUnsavedChanges = true;
    persistState();

    updateManualPhaseBannerUI(hw);
    renderCurrentQuestion();
    renderQuestionMap();

    showToast(
        hw.manualPhase === 'key'
            ? 'المرحلة ٢: حط بقى إجابات النموذج الصح بنفسك!'
            : 'المرحلة ٢: اختار إجاباتك أنت دلوقتي!',
        'success'
    );
}

function setSolveMode(mode) {
    appState.solveMode = mode;
    persistState();
    updateSolveModeUI();
    showToast(mode === 'auto' ? 'تم تفعيل النمط السريع (ينقل تلقائياً)' : 'تم التبديل للنمط العادي', 'info');
}

function updateSolveModeUI() {
    const stdBtn = document.getElementById('mode-standard-btn');
    const autoBtn = document.getElementById('mode-auto-btn');
    if (!stdBtn || !autoBtn) return;

    if (appState.solveMode === 'standard') {
        stdBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-white dark:bg-slate-700 text-blue-900 dark:text-white shadow-sm';
        autoBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-600 dark:text-slate-400 flex items-center gap-1';
    } else {
        autoBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-blue-900 text-white shadow-sm flex items-center gap-1';
        stdBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-600 dark:text-slate-400';
    }
}

function renderCurrentQuestion() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;

    const q = hw.questions[currentQuestionIndex];
    const total = hw.questions.length;
    const keyMode = isEnteringKeyPhase(hw);

    const answeredCount = hw.questions.filter(item => isQuestionAnsweredInCurrentPhase(hw, item)).length;
    document.getElementById('solve-progress-text').textContent = keyMode
        ? `تم تسجيل ${answeredCount} من ${total} إجابة في النموذج`
        : `تم حل ${answeredCount} من ${total} سؤال`;
    document.getElementById('map-answered-ratio').textContent = `${answeredCount} / ${total}`;

    document.getElementById('q-number-display').textContent = formatQuestionLabel(q.number);
    document.getElementById('q-total-display').textContent = `(عنصر ${currentQuestionIndex + 1} من ${total})`;
    const splitBtn = document.getElementById('split-subq-btn');
    const splitBtnText = document.getElementById('split-subq-btn-text');
    const unsplitBtn = document.getElementById('unsplit-subq-btn');
    const isSubQ = isSubQuestionNumber(q.number);
    if (splitBtn) {
        splitBtn.classList.toggle('hidden', isRetrySession);
        if (splitBtnText) {
            splitBtnText.textContent = isSubQ ? '+ فرّع المطلوب لمطاليب' : '+ فرّع السؤال لمطاليب';
        }
    }
    if (unsplitBtn) {
        unsplitBtn.classList.toggle('hidden', isRetrySession || !isSubQ);
    }
    document.getElementById('q-type-badge').textContent = keyMode
        ? 'إدخال إجابة النموذج'
        : (q.type === 'mcq' ? 'اختيار من متعدد' : 'سؤال مقالي (تقييم ذاتي)');

    const attachBox = document.getElementById('retry-attachment-box');
    const qTextEl = document.getElementById('retry-q-text');
    const qImgWrap = document.getElementById('retry-q-img-wrap');
    const qImgEl = document.getElementById('retry-q-img');
    const originMetaEl = document.getElementById('retry-origin-meta');

    if (q.questionText || q.questionImage || q.originLabel) {
        attachBox.classList.remove('hidden');
        originMetaEl.textContent = q.originLabel || '';
        if (q.questionText) {
            qTextEl.textContent = q.questionText;
            qTextEl.classList.remove('hidden');
        } else {
            qTextEl.classList.add('hidden');
        }
        if (q.questionImage) {
            qImgEl.src = q.questionImage;
            qImgWrap.classList.remove('hidden');
        } else {
            qImgWrap.classList.add('hidden');
        }
    } else {
        attachBox.classList.add('hidden');
    }

    const flagBtn = document.getElementById('flag-q-btn');
    const flagIcon = document.getElementById('flag-icon');
    if (q.flagged) {
        flagBtn.className = 'px-3.5 py-2 rounded-xl text-xs font-extrabold border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 flex items-center gap-1.5';
        flagIcon.className = 'ph-fill ph-flag text-base text-amber-500';
    } else {
        flagBtn.className = 'px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 flex items-center gap-1.5';
        flagIcon.className = 'ph-bold ph-flag text-base';
    }

    document.getElementById('prev-q-btn').disabled = (currentQuestionIndex === 0);
    document.getElementById('next-q-btn').disabled = (currentQuestionIndex === total - 1);

    const mcqContainer = document.getElementById('mcq-container');
    const essayContainer = document.getElementById('essay-container');
    const mcqInst = document.getElementById('mcq-instruction-text');

    mcqInst.textContent = keyMode
        ? 'اختر الإجابة الصحيحة الموجودة في نموذج الإجابة (أو بالكيبورد 1-4):'
        : 'اختر الإجابة الصحيحة من البابل شيت (أو استخدم الكيبورد 1-4):';

    if (q.type === 'mcq' || keyMode) {
        mcqContainer.classList.remove('hidden');
        essayContainer.classList.add('hidden');
        renderMcqOptions(hw, q, keyMode);
    } else {
        mcqContainer.classList.add('hidden');
        essayContainer.classList.remove('hidden');
        renderEssayBox(q);
    }
}

function renderMcqOptions(hw, q, keyMode = false) {
    const grid = document.getElementById('mcq-options-grid');
    const isEnglish = hw.language === 'en';
    const options = isEnglish ? ['A', 'B', 'C', 'D'] : ['أ', 'ب', 'ج', 'د'];
    const labels = isEnglish ? ['Option A', 'Option B', 'Option C', 'Option D'] : ['الاختيار الأول', 'الاختيار الثاني', 'الاختيار الثالث', 'الاختيار الرابع'];

    const currentVal = keyMode ? q.correctAnswer : q.userAnswer;

    grid.dir = isEnglish ? 'ltr' : 'rtl';
    grid.innerHTML = options.map((opt, idx) => {
        const isSelected = (currentVal === opt);
        const selectedTheme = keyMode
            ? 'border-emerald-600 bg-emerald-600 text-white shadow-lg scale-[1.01]'
            : 'border-blue-900 bg-blue-900 text-white shadow-lg scale-[1.01]';
        const baseClasses = isSelected
            ? selectedTheme
            : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50 hover:border-blue-700 dark:hover:border-blue-500 text-slate-800 dark:text-slate-100';
        const circleClasses = isSelected
            ? (keyMode ? 'bg-white text-emerald-700 font-black' : 'bg-white text-blue-900 font-black')
            : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 font-extrabold';

        return `
            <button type="button" onclick="selectMcqOption('${opt}')" class="p-4 sm:p-5 rounded-2xl border-2 transition-all flex items-center gap-4 text-start active:scale-95 ${baseClasses}">
                <span class="w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0 ${isEnglish ? 'font-en' : ''} ${circleClasses}">
                    ${opt}
                </span>
                <div class="flex-1">
                    <span class="font-extrabold text-base sm:text-lg block ${isEnglish ? 'font-en' : ''}">${opt}</span>
                    <span class="text-xs ${isSelected ? 'text-white/80' : 'text-slate-400'}">${labels[idx]}</span>
                </div>
                ${isSelected ? '<i class="ph-fill ph-check-circle text-2xl text-white"></i>' : ''}
            </button>
        `;
    }).join('');
}

function selectMcqOption(option) {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;

    const q = hw.questions[currentQuestionIndex];
    const keyMode = isEnteringKeyPhase(hw);

    if (keyMode) {
        q.correctAnswer = option;
    } else {
        q.userAnswer = option;
    }
    hasUnsavedChanges = true;

    renderCurrentQuestion();
    renderQuestionMap();

    const isLastQuestion = (currentQuestionIndex === hw.questions.length - 1);

    if (appState.solveMode === 'auto' && !isLastQuestion) {
        setTimeout(() => {
            currentQuestionIndex++;
            renderCurrentQuestion();
            renderQuestionMap();
        }, 180);
    } else if (isLastQuestion && hw.isManual) {
        const isPhase1 = (hw.manualOrder === 'user_first' && hw.manualPhase === 'user')
                      || (hw.manualOrder === 'key_first' && hw.manualPhase === 'key');
        if (isPhase1) {
            setTimeout(() => {
                showToast(
                    hw.manualPhase === 'user'
                        ? 'وصلت لآخر سؤال! اضغط "حط نموذج الإجابة للتصحيح" فوق أو تحت.'
                        : 'سجّلت آخر سؤال في النموذج! اضغط "ابدأ حل إجاباتي" للتصحيح.',
                    'info'
                );
            }, 220);
        }
    }
}

function renderEssayBox(q) {
    const textEl = document.getElementById('essay-model-text');
    const overlay = document.getElementById('essay-reveal-overlay');
    const gradingBox = document.getElementById('essay-grading-box');

    textEl.textContent = q.correctAnswer;

    if (q.essayRevealed || q.essayScore !== null) {
        textEl.classList.remove('essay-blur');
        overlay.classList.add('hidden');
        gradingBox.classList.remove('hidden');
    } else {
        textEl.classList.add('essay-blur');
        overlay.classList.remove('hidden');
        gradingBox.classList.add('hidden');
    }

    document.querySelectorAll('.essay-score-btn').forEach(btn => {
        const sc = parseFloat(btn.dataset.score);
        if (q.essayScore === sc) {
            btn.className = 'essay-score-btn py-3.5 rounded-xl font-black text-base sm:text-lg border-2 border-blue-900 bg-blue-900 text-white shadow-md';
        } else {
            btn.className = 'essay-score-btn py-3.5 rounded-xl font-black text-base sm:text-lg border-2 border-slate-200 dark:border-slate-700 hover:border-blue-700 transition-all';
        }
    });
}

function revealEssayAnswer() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;
    hw.questions[currentQuestionIndex].essayRevealed = true;
    hasUnsavedChanges = true;
    renderCurrentQuestion();
}

function gradeEssay(score) {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;
    hw.questions[currentQuestionIndex].essayScore = score;
    hasUnsavedChanges = true;
    renderCurrentQuestion();
    renderQuestionMap();
}

function isSubQuestionNumber(numVal) {
    const s = String(numVal ?? '').trim();
    return /\([^)]+\)/.test(s) || s.includes('.');
}

function formatQuestionLabel(numVal) {
    const s = String(numVal ?? '').trim();
    const match = s.match(/^([^(\s]+)\s*\(([^)]+)\)$/);
    if (match) {
        return `سؤال ${match[1]} - مطلوب (${match[2]})`;
    }
    return `سؤال ${s}`;
}

function formatCompactMapNumber(numVal) {
    const s = String(numVal ?? '').trim();
    const match = s.match(/^([^(\s]+)\s*\(([^)]+)\)$/);
    if (match) {
        return `${match[1]}.${match[2]}`;
    }
    return s;
}

function openSubQuestionsModal() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;
    const q = hw.questions[currentQuestionIndex];
    const sNum = String(q.number).trim();
    const isSub = isSubQuestionNumber(sNum);

    // If current item is ALREADY a sub-question like "5 (2)" or "5 (2.1)", allow splitting THAT sub-question into nested parts "5 (2.1)", "5 (2.2)"
    document.getElementById('subq-target-label').textContent = isSub ? formatQuestionLabel(sNum) : `سؤال ${sNum}`;

    if (isSub) {
        const match = sNum.match(/^([^(\s]+)\s*\(([^)]+)\)$/);
        const mainRoot = match ? match[1] : sNum;
        const subPart = match ? match[2] : '';
        const existingNested = hw.questions.filter(item => {
            const m = String(item.number).trim().match(/^([^(\s]+)\s*\(([^)]+)\)$/);
            return m && m[1] === mainRoot && (m[2] === subPart || m[2].startsWith(subPart + '.'));
        });
        document.getElementById('subq-count-input').value = existingNested.length >= 2 ? existingNested.length : 2;
    } else {
        const existingParts = hw.questions.filter(item => {
            const itemBase = String(item.number).replace(/\s*\([^)]*\)$/, '').trim();
            return itemBase === sNum;
        });
        document.getElementById('subq-count-input').value = existingParts.length >= 2 ? existingParts.length : 2;
    }

    openModal('subquestions-modal');
}

function applySubQuestionsSplit(e) {
    e.preventDefault();
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;

    const count = parseInt(document.getElementById('subq-count-input').value, 10);
    if (!count || count < 2 || count > 50) {
        showToast('اختار عدد مطاليب بين 2 و 50', 'error');
        return;
    }

    const currentQ = hw.questions[currentQuestionIndex];
    const sNum = String(currentQ.number).trim();
    const subMatch = sNum.match(/^([^(\s]+)\s*\(([^)]+)\)$/);

    if (subMatch) {
        // Splitting an existing sub-question (e.g., "5 (2)" -> "5 (2.1)", "5 (2.2)", ...)
        const mainRoot = subMatch[1];
        const subPart = subMatch[2];
        const matchingIndices = [];
        hw.questions.forEach((item, idx) => {
            const m = String(item.number).trim().match(/^([^(\s]+)\s*\(([^)]+)\)$/);
            if (m && m[1] === mainRoot && (m[2] === subPart || m[2].startsWith(subPart + '.'))) {
                matchingIndices.push(idx);
            }
        });

        const firstIdx = matchingIndices[0];
        const existingItems = matchingIndices.map(i => hw.questions[i]);

        const newNested = Array.from({ length: count }, (_, i) => {
            const prev = existingItems[i];
            const newNum = `${mainRoot} (${subPart}.${i + 1})`;
            if (prev) {
                return { ...prev, number: newNum };
            }
            return {
                number: newNum,
                type: currentQ.type || 'mcq',
                correctAnswer: null,
                userAnswer: null,
                essayRevealed: false,
                essayScore: null,
                flagged: false,
                status: 'unanswered',
                errorReason: '',
                understood: false,
                note: '',
                questionText: '',
                questionImage: ''
            };
        });

        hw.questions.splice(firstIdx, matchingIndices.length, ...newNested);
        currentQuestionIndex = firstIdx;
        hasUnsavedChanges = true;
        persistState();

        closeModal('subquestions-modal');
        renderCurrentQuestion();
        renderQuestionMap();
        showToast(`تم تفريع مطلوب (${subPart}) إلى ${count} مطاليب فرعية!`, 'success');
        return;
    }

    // Splitting a main question (e.g., "5" -> "5 (1)", "5 (2)", ...)
    const baseNum = sNum;
    const matchingIndices = [];
    hw.questions.forEach((item, idx) => {
        const itemBase = String(item.number).replace(/\s*\([^)]*\)$/, '').trim();
        if (itemBase === baseNum) matchingIndices.push(idx);
    });

    const firstIdx = matchingIndices[0];
    const existingItems = matchingIndices.map(i => hw.questions[i]);

    const newSubQuestions = Array.from({ length: count }, (_, i) => {
        const prev = existingItems[i];
        if (prev) {
            return {
                ...prev,
                number: `${baseNum} (${i + 1})`
            };
        }
        return {
            number: `${baseNum} (${i + 1})`,
            type: currentQ.type || 'mcq',
            correctAnswer: null,
            userAnswer: null,
            essayRevealed: false,
            essayScore: null,
            flagged: false,
            status: 'unanswered',
            errorReason: '',
            understood: false,
            note: '',
            questionText: '',
            questionImage: ''
        };
    });

    hw.questions.splice(firstIdx, matchingIndices.length, ...newSubQuestions);
    currentQuestionIndex = firstIdx;
    hasUnsavedChanges = true;
    persistState();

    closeModal('subquestions-modal');
    renderCurrentQuestion();
    renderQuestionMap();
    showToast(`تم تفريع سؤال ${baseNum} إلى ${count} مطاليب مع الحفاظ على ترتيب الكتاب!`, 'success');
}

function unsplitCurrentSubQuestion() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;

    const currentQ = hw.questions[currentQuestionIndex];
    const sNum = String(currentQ.number).trim();
    const match = sNum.match(/^([^(\s]+)\s*\(([^)]+)\)$/);
    if (!match) return;

    const mainRoot = match[1];
    const subPart = match[2];

    // If nested sub-question like "5 (2.1)", merge back to parent sub-question "5 (2)" first
    if (subPart.includes('.')) {
        const parentSub = subPart.split('.').slice(0, -1).join('.');
        const matchingIndices = [];
        hw.questions.forEach((item, idx) => {
            const m = String(item.number).trim().match(/^([^(\s]+)\s*\(([^)]+)\)$/);
            if (m && m[1] === mainRoot && (m[2] === parentSub || m[2].startsWith(parentSub + '.'))) {
                matchingIndices.push(idx);
            }
        });
        const firstIdx = matchingIndices[0];
        const kept = { ...hw.questions[firstIdx], number: `${mainRoot} (${parentSub})` };
        hw.questions.splice(firstIdx, matchingIndices.length, kept);
        currentQuestionIndex = firstIdx;
        hasUnsavedChanges = true;
        persistState();
        renderCurrentQuestion();
        renderQuestionMap();
        showToast(`تم إلغاء تفريع مطلوب (${parentSub}) وإرجاعه مطلوب واحد!`, 'info');
        return;
    }

    // Otherwise merge all sub-questions of mainRoot back into single main question "mainRoot"
    const matchingIndices = [];
    hw.questions.forEach((item, idx) => {
        const itemBase = String(item.number).replace(/\s*\([^)]*\)$/, '').trim();
        if (itemBase === mainRoot) matchingIndices.push(idx);
    });

    if (matchingIndices.length === 0) return;
    const firstIdx = matchingIndices[0];
    const keptQuestion = {
        ...hw.questions[firstIdx],
        number: mainRoot
    };

    hw.questions.splice(firstIdx, matchingIndices.length, keptQuestion);
    currentQuestionIndex = firstIdx;
    hasUnsavedChanges = true;
    persistState();

    renderCurrentQuestion();
    renderQuestionMap();
    showToast(`تم إلغاء تفريع سؤال ${mainRoot} وإرجاعه سؤال واحد!`, 'info');
}

function clearCurrentAnswer() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;
    const q = hw.questions[currentQuestionIndex];
    if (isEnteringKeyPhase(hw)) {
        q.correctAnswer = null;
    } else {
        q.userAnswer = null;
        q.essayScore = null;
    }
    hasUnsavedChanges = true;
    renderCurrentQuestion();
    renderQuestionMap();
    showToast('تم تصفير الاختيار', 'info');
}

function toggleFlagCurrent() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;
    hw.questions[currentQuestionIndex].flagged = !hw.questions[currentQuestionIndex].flagged;
    hasUnsavedChanges = true;
    renderCurrentQuestion();
    renderQuestionMap();
}

function prevQuestion() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderCurrentQuestion();
        renderQuestionMap();
    }
}

function nextQuestion() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (hw && currentQuestionIndex < hw.questions.length - 1) {
        currentQuestionIndex++;
        renderCurrentQuestion();
        renderQuestionMap();
    }
}

function jumpToQuestion(index) {
    currentQuestionIndex = index;
    renderCurrentQuestion();
    renderQuestionMap();
}

function renderQuestionMap() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;

    const keyMode = isEnteringKeyPhase(hw);
    const grid = document.getElementById('question-map-grid');
    grid.innerHTML = hw.questions.map((q, idx) => {
        const answered = isQuestionAnsweredInCurrentPhase(hw, q);
        const isCurrent = (idx === currentQuestionIndex);

        let colorClasses = answered
            ? (keyMode
                ? 'bg-emerald-600 dark:bg-emerald-700 text-white font-extrabold shadow-sm'
                : 'bg-blue-900 dark:bg-blue-800 text-white font-extrabold shadow-sm')
            : 'bg-slate-200/60 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 font-semibold';

        let ringClasses = isCurrent
            ? 'ring-2 ring-offset-2 ring-blue-600 dark:ring-blue-400 dark:ring-offset-slate-900 scale-105'
            : '';

        const compactNum = formatCompactMapNumber(q.number);
        const isSub = String(q.number).includes('(') || String(q.number).includes('.');
        return `
            <button type="button" onclick="jumpToQuestion(${idx})" title="${escapeHtml(formatQuestionLabel(q.number))}" class="relative h-10 rounded-xl ${isSub ? 'text-[10px] font-en tracking-tighter' : 'text-xs'} flex items-center justify-center transition-all ${colorClasses} ${ringClasses}">
                ${escapeHtml(compactNum)}
                ${q.flagged ? '<span class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900"></span>' : ''}
            </button>
        `;
    }).join('');
}

function saveCurrentProgress(showNotification = true) {
    persistState();
    hasUnsavedChanges = false;
    if (showNotification) {
        showToast('تم حفظ تقدمك بنجاح! تقدر تكمل في أي وقت.', 'success');
    }
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (getCurrentPage() !== 'solve') return;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

        const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
        if (!hw) return;
        const q = hw.questions[currentQuestionIndex];
        const isEn = hw.language === 'en';
        const opts = isEn ? ['A', 'B', 'C', 'D'] : ['أ', 'ب', 'ج', 'د'];

        if (q.type === 'mcq' || isEnteringKeyPhase(hw)) {
            if (['1', '2', '3', '4'].includes(e.key)) {
                selectMcqOption(opts[parseInt(e.key) - 1]);
            } else if (['a', 'b', 'c', 'd'].includes(e.key.toLowerCase())) {
                const idx = ['a', 'b', 'c', 'd'].indexOf(e.key.toLowerCase());
                selectMcqOption(opts[idx]);
            }
        }

        if (e.key === 'ArrowLeft') nextQuestion();
        if (e.key === 'ArrowRight') prevQuestion();
        if (e.key.toLowerCase() === 'f') toggleFlagCurrent();
    });
}

// =========================================================================
// 6. SMART SUBMISSION & GRADING LOGIC
// =========================================================================
function initiateSubmitHomework() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;

    if (hw.isManual) {
        const isPhase1 = (hw.manualOrder === 'user_first' && hw.manualPhase === 'user')
                      || (hw.manualOrder === 'key_first' && hw.manualPhase === 'key');
        if (isPhase1) {
            switchToSecondManualPhase(hw);
            return;
        }

        const missingKeysForAnswered = hw.questions.filter(q => q.userAnswer && !q.correctAnswer).length;
        if (missingKeysForAnswered > 0) {
            showToast(`فيه ${missingKeysForAnswered} سؤال إنت جاوبته بس لسه محطتش إجابته الصح في النموذج!`, 'error');
            return;
        }
    }

    const unansweredCount = hw.questions.filter(q => !(q.type === 'mcq' ? q.userAnswer : q.essayScore !== null)).length;

    if (unansweredCount > 0) {
        document.getElementById('unanswered-modal-count').textContent = unansweredCount;
        document.getElementById('total-modal-count').textContent = hw.questions.length;
        openModal('partial-submit-modal');
    } else {
        finalizeSubmission('complete');
    }
}

function finalizeSubmission(mode) {
    closeModal('partial-submit-modal');
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;

    let earned = 0;
    let max = 0;

    hw.questions.forEach(q => {
        const answered = (q.type === 'mcq') ? Boolean(q.userAnswer) : (q.essayScore !== null);
        const qMax = (q.type === 'essay') ? 2 : 1;

        if (!answered && mode === 'partial') {
            q.status = 'skipped_unrevealed';
            return;
        }

        if (hw.isManual && !q.correctAnswer && !answered) {
            q.status = 'skipped_unrevealed';
            return;
        }

        max += qMax;

        if (!answered && mode === 'all_wrong') {
            q.status = 'wrong';
            return;
        }

        if (q.type === 'mcq') {
            if (q.userAnswer === q.correctAnswer) {
                q.status = 'correct';
                earned += 1;
            } else {
                q.status = 'wrong';
            }
        } else if (q.type === 'essay') {
            const sc = parseFloat(q.essayScore) || 0;
            earned += sc;
            if (sc === 2) q.status = 'correct';
            else if (sc > 0) q.status = 'partial';
            else q.status = 'wrong';
        }
    });

    hw.scoreEarned = earned;
    hw.scoreMax = max;
    hw.percentage = max > 0 ? Math.round((earned / max) * 100) : 0;
    hw.status = (mode === 'partial') ? 'partial' : 'completed';

    if (isRetrySession && hw.originMap) {
        syncRetryResultsToOriginals(hw);
        appState.homeworks = appState.homeworks.filter(h => h.id !== hw.id);
        localStorage.removeItem(RETRY_FLAG_KEY);
        persistState();
        hasUnsavedChanges = false;
        window.location.href = 'mistakes.html';
        return;
    }

    hasUnsavedChanges = false;
    persistState();
    openDashboardView(hw.id);
}

function syncRetryResultsToOriginals(retryHw) {
    retryHw.questions.forEach((rq, idx) => {
        const origin = retryHw.originMap[idx];
        if (!origin) return;
        const origHw = appState.homeworks.find(h => h.id === origin.hwId);
        if (!origHw) return;
        const origQ = origHw.questions[origin.qIdx];
        if (origQ && rq.status === 'correct') {
            origQ.understood = true;
        }
    });
}

// =========================================================================
// 7. RESULTS DASHBOARD, ERROR ANALYSIS & QUESTION TEXT/IMAGE ATTACHMENT
// =========================================================================
function openDashboardView(hwId) {
    localStorage.setItem(ACTIVE_HW_KEY, hwId);
    window.location.href = 'dashboard.html';
}

function initDashboardPage() {
    const params = new URLSearchParams(window.location.search);
    const hwId = params.get('id') || localStorage.getItem(ACTIVE_HW_KEY);
    const hw = appState.homeworks.find(h => h.id === hwId);

    if (!hw) {
        window.location.href = 'index.html';
        return;
    }

    currentHomeworkId = hwId;
    dashboardFilter = 'all';

    document.getElementById('dash-subject-tag').textContent = hw.subject;
    document.getElementById('dash-hw-title').textContent = `${hw.book} • ${hw.lesson}`;
    document.getElementById('dash-hw-subtitle').textContent = `${hw.chapter} • تاريخ التسليم: ${hw.createdAt}`;

    const statusBadge = document.getElementById('dash-status-badge');
    const resumePartialBtn = document.getElementById('dash-resume-partial-btn');

    if (hw.status === 'partial') {
        statusBadge.textContent = 'تسليم جزئي';
        statusBadge.className = 'px-3 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
        resumePartialBtn.classList.remove('hidden');
    } else {
        statusBadge.textContent = 'مكتمل ومصحح';
        statusBadge.className = 'px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
        resumePartialBtn.classList.add('hidden');
    }

    const correctCount = hw.questions.filter(q => q.status === 'correct').length;
    const wrongCount = hw.questions.filter(q => q.status === 'wrong').length;
    const partialCount = hw.questions.filter(q => q.status === 'partial' || q.status === 'skipped_unrevealed').length;

    document.getElementById('dash-score-fraction').textContent = `${hw.scoreEarned} / ${hw.scoreMax}`;
    document.getElementById('dash-score-percent').textContent = `${hw.percentage}%`;
    document.getElementById('dash-correct-count').textContent = correctCount;
    document.getElementById('dash-wrong-count').textContent = wrongCount;
    document.getElementById('dash-partial-count').textContent = partialCount;

    updateDashboardFilterButtons();
    renderDashboardQuestions();
}

function resumeFromDashboard() {
    if (currentHomeworkId) {
        const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
        if (hw && hw.isManual) {
            hw.manualPhase = 'user';
            persistState();
        }
        openSolveView(currentHomeworkId);
    }
}

function setDashboardFilter(filter) {
    dashboardFilter = filter;
    updateDashboardFilterButtons();
    renderDashboardQuestions();
}

function updateDashboardFilterButtons() {
    document.querySelectorAll('.dash-filter-btn').forEach(btn => {
        if (btn.dataset.dfilter === dashboardFilter) {
            btn.className = 'dash-filter-btn px-3.5 py-2 rounded-xl text-xs font-extrabold bg-blue-900 text-white';
        } else {
            btn.className = 'dash-filter-btn px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
        }
    });
}

function renderDashboardQuestions() {
    const hw = appState.homeworks.find(h => h.id === currentHomeworkId);
    if (!hw) return;

    const container = document.getElementById('dash-questions-list');
    const filtered = hw.questions.map((q, idx) => ({ q, idx })).filter(({ q }) => {
        if (dashboardFilter === 'wrong') return q.status === 'wrong';
        if (dashboardFilter === 'partial') return q.status === 'partial' || q.status === 'skipped_unrevealed';
        if (dashboardFilter === 'flagged') return q.flagged;
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-500 font-bold">مفيش أسئلة في الفلتر ده!</div>`;
        return;
    }

    container.innerHTML = filtered.map(({ q, idx }) => {
        let cardBorder = 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900';
        let badgeHtml = '';

        if (q.status === 'correct') {
            cardBorder = 'border-emerald-300 dark:border-emerald-800/70 bg-emerald-50/40 dark:bg-emerald-950/15';
            badgeHtml = '<span class="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">صح ✅</span>';
        } else if (q.status === 'wrong') {
            cardBorder = 'border-rose-300 dark:border-rose-800/70 bg-rose-50/40 dark:bg-rose-950/15';
            badgeHtml = '<span class="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300">غلط ❌</span>';
        } else if (q.status === 'partial') {
            cardBorder = 'border-amber-300 dark:border-amber-800/70 bg-amber-50/40 dark:bg-amber-950/15';
            badgeHtml = `<span class="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">درجة جزئية (${q.essayScore}/2) 🟡</span>`;
        } else {
            cardBorder = 'border-amber-200 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/10';
            badgeHtml = '<span class="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">متروك (تسليم جزئي) 🟡</span>';
        }

        let comparisonHtml = '';
        if (q.status === 'skipped_unrevealed') {
            comparisonHtml = `<p class="text-xs text-slate-500 dark:text-slate-400 italic">لم يتم حل هذا السؤال بعد — الإجابة مخفية عشان تقدر تحله بنفسك لاحقاً.</p>`;
        } else if (q.type === 'mcq') {
            comparisonHtml = `
                <div class="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
                    <span>إجابتك: <strong class="px-2.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 ${hw.language === 'en' ? 'font-en' : ''}">${q.userAnswer || 'لم تجب'}</strong></span>
                    <span>الإجابة النموذجية: <strong class="px-2.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 ${hw.language === 'en' ? 'font-en' : ''}">${q.correctAnswer || '-'}</strong></span>
                </div>
            `;
        } else {
            comparisonHtml = `
                <div class="text-xs sm:text-sm space-y-1">
                    <span class="text-slate-500">تقييمك لنفسك: <strong>${q.essayScore ?? 0} من 2</strong></span>
                    <p class="p-2.5 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 font-semibold">${q.correctAnswer}</p>
                </div>
            `;
        }

        let errorAnalysisHtml = '';
        if (q.status === 'wrong' || q.status === 'partial') {
            errorAnalysisHtml = `
                <div class="mt-3 pt-3 border-t border-slate-200/70 dark:border-slate-700/70 space-y-3">
                    <div class="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
                        <div class="md:col-span-4">
                            <select onchange="updateQuestionErrorMeta('${hw.id}', ${idx}, 'errorReason', this.value)" class="w-full px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
                                <option value="">-- اختر سبب الغلط --</option>
                                ${ERROR_REASONS.map(r => `<option value="${r}" ${q.errorReason === r ? 'selected' : ''}>${r}</option>`).join('')}
                            </select>
                        </div>
                        <div class="md:col-span-3">
                            <button type="button" onclick="toggleQuestionUnderstood('${hw.id}', ${idx})" class="w-full px-3 py-2 rounded-xl text-xs font-extrabold border transition-all ${q.understood ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800'}">
                                ${q.understood ? 'فهمت غلطي خلاص ✅' : 'لسه مفهمتوش ❌'}
                            </button>
                        </div>
                        <div class="md:col-span-5">
                            <input type="text" value="${escapeHtml(q.note || '')}" onchange="updateQuestionErrorMeta('${hw.id}', ${idx}, 'note', this.value)" placeholder="ملاحظة شخصية سريعة (قانون / تنبيه)..." class="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
                        </div>
                    </div>

                    <div class="p-3 rounded-2xl bg-white/80 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2.5">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <span class="text-xs font-extrabold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                                <i class="ph-bold ph-image text-base"></i> إرفاق السؤال نفسه (كتابة أو صورة مخطط/جدول):
                            </span>
                            <div class="flex items-center gap-2">
                                <label class="cursor-pointer px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900/70 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold flex items-center gap-1 transition-colors">
                                    <i class="ph-bold ph-camera-plus text-sm"></i>
                                    <span>${q.questionImage ? 'تغيير الصورة' : 'ارفع صورة السؤال'}</span>
                                    <input type="file" accept="image/*" class="hidden" onchange="handleQuestionImageUpload(event, '${hw.id}', ${idx})">
                                </label>
                                ${q.questionImage ? `
                                    <button type="button" onclick="removeQuestionImage('${hw.id}', ${idx})" class="px-2.5 py-1.5 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 text-xs font-bold hover:bg-rose-100">
                                        حذف الصورة
                                    </button>
                                ` : ''}
                            </div>
                        </div>

                        <textarea rows="2" onchange="updateQuestionErrorMeta('${hw.id}', ${idx}, 'questionText', this.value)" placeholder="اكتب نص السؤال هنا (أو ارفع صورته لو فيه رسمة أو جدول عشان تلاقيه في وشك في الاختبار)..." class="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-indigo-600 focus:outline-none">${escapeHtml(q.questionText || '')}</textarea>

                        ${q.questionImage ? `
                            <div class="pt-1">
                                <img src="${q.questionImage}" alt="صورة السؤال" onclick="openImageLightbox(this.src)" class="max-h-48 rounded-xl border border-slate-300 dark:border-slate-600 cursor-zoom-in object-contain bg-white">
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        return `
            <div class="rounded-2xl p-4 border ${cardBorder} transition-all">
                <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div class="flex items-center gap-2">
                        <span class="font-black text-base">${escapeHtml(formatQuestionLabel(q.number))}</span>
                        ${badgeHtml}
                        ${q.flagged ? '<span class="text-amber-500 text-xs font-bold"><i class="ph-fill ph-flag"></i> مراجعة</span>' : ''}
                    </div>
                    ${comparisonHtml}
                </div>
                ${errorAnalysisHtml}
            </div>
        `;
    }).join('');
}

function handleQuestionImageUpload(event, hwId, qIdx) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxDim = 900;
            let w = img.width;
            let h = img.height;
            if (w > maxDim || h > maxDim) {
                if (w > h) {
                    h = Math.round((h * maxDim) / w);
                    w = maxDim;
                } else {
                    w = Math.round((w * maxDim) / h);
                    h = maxDim;
                }
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);

            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.72);
            updateQuestionErrorMeta(hwId, qIdx, 'questionImage', compressedDataUrl);

            if (getCurrentPage() === 'dashboard') {
                renderDashboardQuestions();
            }
            if (getCurrentPage() === 'mistakes') {
                renderMistakesHub();
            }
            showToast('تم حفظ صورة السؤال! هتظهرلك في وشك لما تراجع أو تختبر نفسك.', 'success');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

function removeQuestionImage(hwId, qIdx) {
    updateQuestionErrorMeta(hwId, qIdx, 'questionImage', '');
    if (getCurrentPage() === 'dashboard') {
        renderDashboardQuestions();
    }
    if (getCurrentPage() === 'mistakes') {
        renderMistakesHub();
    }
    showToast('تم حذف صورة السؤال.', 'info');
}

function openImageLightbox(src) {
    document.getElementById('lightbox-img-el').src = src;
    openModal('image-lightbox-modal');
}

function updateQuestionErrorMeta(hwId, qIdx, field, value) {
    const hw = appState.homeworks.find(h => h.id === hwId);
    if (!hw) return;
    hw.questions[qIdx][field] = value;
    persistState();
    updateGlobalStats();
}

function toggleQuestionUnderstood(hwId, qIdx) {
    const hw = appState.homeworks.find(h => h.id === hwId);
    if (!hw) return;
    hw.questions[qIdx].understood = !hw.questions[qIdx].understood;
    persistState();
    updateGlobalStats();
    if (getCurrentPage() === 'dashboard') {
        renderDashboardQuestions();
    }
    if (getCurrentPage() === 'mistakes') {
        renderMistakesHub();
    }
}

// =========================================================================
// 8. "أخطائي" (MY MISTAKES HUB, ANALYTICS & RETRY MODE WITH ATTACHMENTS)
// =========================================================================
function getAllMistakes() {
    const list = [];
    appState.homeworks.forEach(hw => {
        if (hw.status === 'in_progress') return;
        hw.questions.forEach((q, qIdx) => {
            if (q.status === 'wrong' || q.status === 'partial') {
                list.push({
                    hwId: hw.id,
                    qIdx,
                    subject: hw.subject,
                    book: hw.book,
                    chapter: hw.chapter,
                    lesson: hw.lesson,
                    language: hw.language,
                    question: q
                });
            }
        });
    });
    return list;
}

function renderMistakesHub() {
    const allMistakes = getAllMistakes();

    const subjSelect = document.getElementById('mistakes-filter-subject');
    if (!subjSelect) return;

    const currentSubjVal = subjSelect.value;
    const subjects = [...new Set(appState.homeworks.map(h => h.subject))];
    subjSelect.innerHTML = `<option value="all">كل المواد (${subjects.length})</option>` +
        subjects.map(s => `<option value="${escapeHtml(s)}" ${currentSubjVal === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');

    renderSubjectPerformanceAndImprovement(subjects);
    renderErrorRadarChart(allMistakes);

    const fSubj = subjSelect.value;
    const fReason = document.getElementById('mistakes-filter-reason').value;
    const fStatus = document.getElementById('mistakes-filter-status').value;

    const filtered = allMistakes.filter(item => {
        if (fSubj !== 'all' && item.subject !== fSubj) return false;
        if (fReason !== 'all') {
            const r = item.question.errorReason || 'غير محدد';
            if (r !== fReason) return false;
        }
        if (fStatus === 'understood' && !item.question.understood) return false;
        if (fStatus === 'ununderstood' && item.question.understood) return false;
        return true;
    });

    const retryBtn = document.getElementById('retry-mistakes-btn');
    document.getElementById('retry-count-label').textContent = filtered.length;
    retryBtn.disabled = (filtered.length === 0);

    const container = document.getElementById('mistakes-grouped-container');
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-10 text-center border border-slate-200 dark:border-slate-800">
                <i class="ph-bold ph-smiley text-5xl text-emerald-500 mb-2"></i>
                <h4 class="font-extrabold text-lg">مفيش أخطاء مطابقة للفلتر ده!</h4>
                <p class="text-xs text-slate-500 mt-1">عاش يا بطل، استمر في المذاكرة!</p>
            </div>
        `;
        return;
    }

    const groups = {};
    filtered.forEach(item => {
        const key = `${item.subject}|||${item.chapter} - ${item.lesson}|||${item.book}`;
        if (!groups[key]) {
            groups[key] = {
                subject: item.subject,
                lessonPath: `${item.chapter} • ${item.lesson}`,
                book: item.book,
                items: []
            };
        }
        groups[key].items.push(item);
    });

    container.innerHTML = Object.values(groups).map(group => `
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="px-2.5 py-0.5 rounded-lg text-xs font-extrabold bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-blue-300">${escapeHtml(group.subject)}</span>
                        <h4 class="font-extrabold text-base">${escapeHtml(group.lessonPath)}</h4>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                        <i class="ph-bold ph-book-open text-blue-700 dark:text-blue-400"></i>
                        المصدر: <strong>${escapeHtml(group.book)}</strong>
                    </p>
                </div>
                <span class="px-3 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                    ${group.items.length} أخطاء
                </span>
            </div>

            <div class="space-y-3">
                ${group.items.map(item => {
                    const q = item.question;
                    return `
                        <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-3">
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <div class="flex items-center gap-2">
                                    <span class="font-black text-sm px-2.5 py-1 rounded-lg bg-rose-500 text-white">${escapeHtml(formatQuestionLabel(q.number))}</span>
                                    ${q.type === 'mcq'
                                        ? `<span class="text-xs">إجابتك: <strong class="text-rose-600 ${item.language === 'en' ? 'font-en' : ''}">${q.userAnswer || 'متروك'}</strong> | الصح: <strong class="text-emerald-600 ${item.language === 'en' ? 'font-en' : ''}">${q.correctAnswer}</strong></span>`
                                        : `<span class="text-xs font-bold text-amber-600">مقالي (${q.essayScore}/2)</span>`
                                    }
                                </div>

                                <button type="button" onclick="toggleQuestionUnderstood('${item.hwId}', ${item.qIdx})" class="px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all ${q.understood ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-900 text-rose-600 border-rose-300 dark:border-rose-800'}">
                                    ${q.understood ? 'فهمت غلطي خلاص ✅' : 'لسه مفهمتوش ❌'}
                                </button>
                            </div>

                            ${(q.questionText || q.questionImage) ? `
                                <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200/70 dark:border-indigo-800/50 space-y-2">
                                    ${q.questionText ? `<p class="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 whitespace-pre-line">${escapeHtml(q.questionText)}</p>` : ''}
                                    ${q.questionImage ? `<img src="${q.questionImage}" alt="صورة السؤال" onclick="openImageLightbox(this.src)" class="max-h-48 rounded-lg border border-slate-200 dark:border-slate-700 cursor-zoom-in object-contain bg-white">` : ''}
                                </div>
                            ` : ''}

                            <div class="flex flex-wrap items-center gap-2">
                                <label class="cursor-pointer px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 text-[11px] font-bold flex items-center gap-1">
                                    <i class="ph-bold ph-camera-plus"></i>
                                    <span>${q.questionImage ? 'تغيير صورة السؤال' : 'إضافة صورة للسؤال'}</span>
                                    <input type="file" accept="image/*" class="hidden" onchange="handleQuestionImageUpload(event, '${item.hwId}', ${item.qIdx})">
                                </label>
                                ${q.questionImage ? `<button type="button" onclick="removeQuestionImage('${item.hwId}', ${item.qIdx})" class="text-[11px] font-bold text-rose-500 hover:underline">حذف الصورة</button>` : ''}
                            </div>

                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <select onchange="updateQuestionErrorMeta('${item.hwId}', ${item.qIdx}, 'errorReason', this.value); renderErrorRadarChart(getAllMistakes());" class="px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                                    <option value="">-- سبب الغلط --</option>
                                    ${ERROR_REASONS.map(r => `<option value="${r}" ${q.errorReason === r ? 'selected' : ''}>${r}</option>`).join('')}
                                </select>
                                <input type="text" value="${escapeHtml(q.note || '')}" onchange="updateQuestionErrorMeta('${item.hwId}', ${item.qIdx}, 'note', this.value)" placeholder="ملاحظة شخصية..." class="px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `).join('');
}

function renderSubjectPerformanceAndImprovement(subjects) {
    const grid = document.getElementById('subjects-analytics-grid');
    if (subjects.length === 0) {
        grid.innerHTML = `<div class="col-span-full p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500">سلم أول واجب عشان تشوف نسبة مستواك ومؤشر التحسن لكل مادة.</div>`;
        return;
    }

    grid.innerHTML = subjects.map(subj => {
        const gradedHws = appState.homeworks
            .filter(h => h.subject === subj && h.status !== 'in_progress' && h.scoreMax > 0)
            .slice()
            .reverse();

        if (gradedHws.length === 0) {
            return `
                <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
                    <h4 class="font-extrabold text-sm">${escapeHtml(subj)}</h4>
                    <p class="text-xs text-slate-400 mt-1">لم يتم تسليم واجبات مصححة بعد</p>
                </div>
            `;
        }

        const avgPercent = Math.round(gradedHws.reduce((acc, h) => acc + h.percentage, 0) / gradedHws.length);

        let improvementHtml = `<span class="text-[11px] text-slate-400">أول واجب مسجل</span>`;
        if (gradedHws.length >= 2) {
            const latest = gradedHws[gradedHws.length - 1].percentage;
            const prevList = gradedHws.slice(0, gradedHws.length - 1);
            const prevAvg = prevList.reduce((acc, h) => acc + h.percentage, 0) / prevList.length;
            const diff = Math.round(latest - prevAvg);

            if (diff > 0) {
                improvementHtml = `<span class="inline-flex items-center gap-0.5 text-xs font-extrabold text-emerald-600 dark:text-emerald-400"><i class="ph-bold ph-trend-up"></i> +${diff}% تحسن</span>`;
            } else if (diff < 0) {
                improvementHtml = `<span class="inline-flex items-center gap-0.5 text-xs font-extrabold text-rose-600 dark:text-rose-400"><i class="ph-bold ph-trend-down"></i> ${diff}% تراجع</span>`;
            } else {
                improvementHtml = `<span class="text-xs font-bold text-slate-500">ثبات في المستوى (0%)</span>`;
            }
        }

        return `
            <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2.5">
                <div class="flex items-center justify-between">
                    <h4 class="font-extrabold text-base">${escapeHtml(subj)}</h4>
                    <span class="text-xl font-black text-blue-900 dark:text-blue-400">${avgPercent}%</span>
                </div>
                <div class="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div class="h-full bg-blue-900 dark:bg-blue-500 rounded-full" style="width: ${avgPercent}%"></div>
                </div>
                <div class="flex items-center justify-between text-xs pt-1">
                    <span class="text-slate-500">${gradedHws.length} واجبات</span>
                    ${improvementHtml}
                </div>
            </div>
        `;
    }).join('');
}

function renderErrorRadarChart(allMistakes) {
    const container = document.getElementById('error-radar-bars');
    const total = allMistakes.length || 1;

    container.innerHTML = ERROR_REASONS.map(reason => {
        const count = allMistakes.filter(m => m.question.errorReason === reason).length;
        const pct = allMistakes.length > 0 ? Math.round((count / total) * 100) : 0;

        return `
            <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 space-y-2">
                <div class="flex items-center justify-between text-xs font-extrabold">
                    <span>${reason}</span>
                    <span class="text-rose-600 dark:text-rose-400">${pct}% (${count})</span>
                </div>
                <div class="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div class="h-full bg-rose-500 rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

function startRetryMistakesSession() {
    const allMistakes = getAllMistakes();
    const fSubj = document.getElementById('mistakes-filter-subject').value;
    const fReason = document.getElementById('mistakes-filter-reason').value;
    const fStatus = document.getElementById('mistakes-filter-status').value;

    const filtered = allMistakes.filter(item => {
        if (fSubj !== 'all' && item.subject !== fSubj) return false;
        if (fReason !== 'all' && (item.question.errorReason || 'غير محدد') !== fReason) return false;
        if (fStatus === 'understood' && !item.question.understood) return false;
        if (fStatus === 'ununderstood' && item.question.understood) return false;
        return true;
    });

    if (filtered.length === 0) return;

    const originMap = [];
    const retryQuestions = filtered.map((item, idx) => {
        originMap.push({ hwId: item.hwId, qIdx: item.qIdx });
        return {
            number: idx + 1,
            type: item.question.type,
            correctAnswer: item.question.correctAnswer,
            userAnswer: null,
            essayRevealed: false,
            essayScore: null,
            flagged: false,
            status: 'unanswered',
            errorReason: '',
            understood: false,
            note: '',
            questionText: item.question.questionText || '',
            questionImage: item.question.questionImage || '',
            originLabel: `${item.subject} • ${item.book} • ${item.chapter} • ${item.lesson} (${formatQuestionLabel(item.question.number)})`
        };
    });

    const retryHw = {
        id: 'retry_' + Date.now(),
        subject: fSubj !== 'all' ? fSubj : 'مراجعة شاملة',
        book: 'اختبرني في غلطاتي',
        chapter: 'أسئلة مختارة من أخطائك',
        lesson: `${retryQuestions.length} سؤال`,
        language: filtered[0].language || 'ar',
        createdAt: new Date().toLocaleDateString('ar-EG'),
        status: 'in_progress',
        isManual: false,
        questions: retryQuestions,
        originMap
    };

    appState.homeworks = appState.homeworks.filter(h => !h.id.startsWith('retry_'));
    appState.homeworks.unshift(retryHw);
    persistState();
    openSolveView(retryHw.id, true);
}

// =========================================================================
// 9. HOME ARCHIVE, GLOBAL STATS & DATA PORTABILITY (BACKUP / SHARE)
// =========================================================================
function refreshAllUI() {
    updateGlobalStats();
    populateSubjectsDatalist();
    renderHomeArchive();
}

function updateGlobalStats() {
    const completed = appState.homeworks.filter(h => h.status !== 'in_progress' && !h.id.startsWith('retry_'));
    const allMistakes = getAllMistakes();
    const ununderstood = allMistakes.filter(m => !m.question.understood).length;
    const understood = allMistakes.filter(m => m.question.understood).length;

    const avgScore = completed.length > 0
        ? Math.round(completed.reduce((acc, h) => acc + h.percentage, 0) / completed.length)
        : 0;

    const elTotal = document.getElementById('stat-total-hw');
    const elAvg = document.getElementById('stat-avg-score');
    const elUn = document.getElementById('stat-ununderstood');
    const elUnd = document.getElementById('stat-understood');
    const elBadge = document.getElementById('mistakes-badge');

    if (elTotal) elTotal.textContent = completed.length;
    if (elAvg) elAvg.textContent = `${avgScore}%`;
    if (elUn) elUn.textContent = ununderstood;
    if (elUnd) elUnd.textContent = understood;
    if (elBadge) elBadge.textContent = ununderstood;
}

function populateSubjectsDatalist() {
    const subjects = [...new Set(appState.homeworks.map(h => h.subject))];
    const datalist = document.getElementById('subjects-datalist');
    if (datalist) {
        datalist.innerHTML = subjects.map(s => `<option value="${escapeHtml(s)}">`).join('');
    }

    const filterSelect = document.getElementById('archive-subject-filter');
    if (filterSelect) {
        const cur = filterSelect.value;
        filterSelect.innerHTML = `<option value="all">كل المواد</option>` +
            subjects.map(s => `<option value="${escapeHtml(s)}" ${cur === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
    }
}

function renderHomeArchive() {
    const container = document.getElementById('homeworks-archive-list');
    const filterEl = document.getElementById('archive-subject-filter');
    if (!container || !filterEl) return;

    const filterSubj = filterEl.value;
    const list = appState.homeworks.filter(h => !h.id.startsWith('retry_') && (filterSubj === 'all' || h.subject === filterSubj));

    if (list.length === 0) {
        container.innerHTML = `
            <div class="col-span-full bg-white dark:bg-slate-900 rounded-3xl p-8 text-center border border-slate-200 dark:border-slate-800">
                <p class="font-bold text-slate-500 dark:text-slate-400">مفيش واجبات محفوظة لسه. ارفع أول ملف إجابات، أنشئ واجب يدوي، أو جرّب الواجب التجريبي!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(hw => {
        let statusPill = '';
        if (hw.status === 'in_progress') {
            statusPill = '<span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-blue-300">محفوظ - قيد الحل</span>';
        } else if (hw.status === 'partial') {
            statusPill = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">مسلّم جزئياً (${hw.percentage}%)</span>`;
        } else {
            statusPill = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">مكتمل (${hw.percentage}%)</span>`;
        }

        return `
            <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-4">
                <div>
                    <div class="flex items-center justify-between gap-2 mb-2">
                        <span class="text-xs font-extrabold text-blue-900 dark:text-blue-400">${escapeHtml(hw.subject)}</span>
                        ${statusPill}
                    </div>
                    <h4 class="font-extrabold text-base line-clamp-1">${escapeHtml(hw.book)}</h4>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">${escapeHtml(hw.chapter)} • ${escapeHtml(hw.lesson)}</p>
                    <p class="text-[11px] text-slate-400 mt-2">${hw.questions.length} سؤال • ${hw.createdAt}</p>
                </div>

                <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div class="flex items-center gap-1.5">
                        <button onclick="openSolveView('${hw.id}')" class="px-3 py-2 rounded-xl bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-1">
                            <i class="ph-bold ph-pencil-simple"></i>
                            <span>${hw.status === 'completed' ? 'إعادة الحل' : 'استكمال / حل'}</span>
                        </button>
                        ${hw.status !== 'in_progress' ? `
                            <button onclick="openDashboardView('${hw.id}')" class="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold">
                                النتيجة
                            </button>
                        ` : ''}
                    </div>

                    <div class="flex items-center gap-1">
                        <button onclick="openEditHomeworkMetaModal('${hw.id}')" class="p-2 rounded-xl text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40" title="تعديل بيانات التسليم">
                            <i class="ph-bold ph-note-pencil text-base"></i>
                        </button>
                        <button onclick="shareHomeworkKey('${hw.id}')" class="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="مشاركة ملف نموذج الإجابة مع أصحابك">
                            <i class="ph-bold ph-share-network text-base"></i>
                        </button>
                        <button onclick="deleteHomework('${hw.id}')" class="p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40" title="حذف الواجب">
                            <i class="ph-bold ph-trash text-base"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function deleteHomework(hwId) {
    const hw = appState.homeworks.find(h => h.id === hwId);
    if (!hw) return;
    pendingDeleteHwId = hwId;
    const targetEl = document.getElementById('delete-hw-target-name');
    if (targetEl) {
        targetEl.textContent = `${hw.subject} — ${hw.book} (${hw.chapter} • ${hw.lesson})`;
        openModal('delete-confirm-modal');
    } else {
        // Fallback if modal not present
        confirmDeleteHomework();
    }
}

function confirmDeleteHomework() {
    if (!pendingDeleteHwId) return;
    const deletedId = pendingDeleteHwId;
    appState.homeworks = appState.homeworks.filter(h => h.id !== deletedId);
    selectedExportHwIds.delete(deletedId);
    pendingDeleteHwId = null;
    persistState();
    updateGlobalStats();

    if (getCurrentPage() === 'home') refreshAllUI();
    if (getCurrentPage() === 'homeworks') renderFoldersExplorer();

    closeModal('delete-confirm-modal');
    showToast('تم حذف الواجب من الأرشيف.', 'info');
}

function openEditHomeworkMetaModal(hwId) {
    const hw = appState.homeworks.find(h => h.id === hwId);
    if (!hw) return;
    populateSubjectsDatalist();
    document.getElementById('edit-meta-hw-id').value = hw.id;
    document.getElementById('edit-meta-subject').value = hw.subject || '';
    document.getElementById('edit-meta-book').value = hw.book || '';
    document.getElementById('edit-meta-chapter').value = hw.chapter || '';
    document.getElementById('edit-meta-lesson').value = hw.lesson || '';
    document.getElementById('edit-meta-lang').value = hw.language || 'ar';
    openModal('edit-hw-meta-modal');
}

function saveEditedHomeworkMeta(e) {
    e.preventDefault();
    const hwId = document.getElementById('edit-meta-hw-id').value;
    const hw = appState.homeworks.find(h => h.id === hwId);
    if (!hw) return;

    hw.subject = document.getElementById('edit-meta-subject').value.trim();
    hw.book = document.getElementById('edit-meta-book').value.trim();
    hw.chapter = document.getElementById('edit-meta-chapter').value.trim();
    hw.lesson = document.getElementById('edit-meta-lesson').value.trim();
    hw.language = document.getElementById('edit-meta-lang').value;

    persistState();
    closeModal('edit-hw-meta-modal');

    const page = getCurrentPage();
    if (page === 'home') refreshAllUI();
    if (page === 'homeworks') renderFoldersExplorer();
    if (page === 'dashboard') initDashboardPage();

    showToast('تم تعديل بيانات الواجب بنجاح!', 'success');
}

function shareHomeworkKey(hwId) {
    const hw = appState.homeworks.find(h => h.id === hwId);
    if (!hw) return;

    const cleanKey = {
        language: hw.language,
        questions: hw.questions.map(q => ({
            number: q.number,
            type: q.type,
            answer: q.correctAnswer || ''
        }))
    };

    downloadJsonFile(cleanKey, `نموذج_${hw.subject}_${hw.lesson}.json`);
    showToast('تم تحميل ملف نموذج الإجابة الصافي! ابعته لأصحابك يحلوه.', 'success');
}

function openBackupModal() {
    openModal('backup-modal');
}

function exportFullBackup() {
    const userNamePart = (appState.userProfile && appState.userProfile.name)
        ? `_${appState.userProfile.name.replace(/\s+/g, '_')}`
        : '';
    downloadJsonFile(appState, `ملف_البابل_شيت${userNamePart}_${new Date().toISOString().slice(0, 10)}.json`);
    showToast('تم تحميل ملفك الاحتياطي الشامل (الاسم + النماذج + الأخطاء) بنجاح!', 'success');
}

function importFullBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data || !Array.isArray(data.homeworks)) {
                throw new Error('Invalid backup');
            }
            const existingIds = new Set(appState.homeworks.map(h => h.id));
            data.homeworks.forEach(hw => {
                if (!existingIds.has(hw.id)) {
                    appState.homeworks.push(hw);
                }
            });
            if (data.subjectIcons && typeof data.subjectIcons === 'object') {
                appState.subjectIcons = { ...appState.subjectIcons, ...data.subjectIcons };
            }
            if (data.userProfile) {
                appState.userProfile = data.userProfile;
                applyColorTheme(data.userProfile.colorTheme || 'blue', true);
                applyUserPersonalization();
            }
            persistState();
            updateGlobalStats();

            const page = getCurrentPage();
            if (page === 'home') refreshAllUI();
            if (page === 'mistakes') renderMistakesHub();
            if (page === 'dashboard') initDashboardPage();

            closeModal('backup-modal');
            showToast('تم استيراد ودمج النسخة الاحتياطية بنجاح!', 'success');
        } catch (err) {
            showToast('ملف النسخة الاحتياطية غير صالح!', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function downloadJsonFile(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// =========================================================================
// 10. UI HELPERS (MODALS, TOASTS & SANITIZATION)
// =========================================================================
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    const bg = type === 'success' ? 'bg-emerald-600 text-white'
             : type === 'error' ? 'bg-rose-600 text-white'
             : 'bg-slate-900 dark:bg-slate-800 text-white border border-slate-700';

    toast.className = `${bg} px-4 py-3 rounded-2xl shadow-xl text-xs sm:text-sm font-bold flex items-center gap-2 pointer-events-auto animate-pop`;
    toast.innerHTML = `<i class="ph-bold ${type === 'success' ? 'ph-check-circle' : type === 'error' ? 'ph-warning-circle' : 'ph-info'} text-lg"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3400);
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


// =========================================================================
// 11. HOMEWORKS FOLDERS EXPLORER, CUSTOM SVG SUBJECT ICONS & SELECTIVE EXPORT
// =========================================================================
const SUBJECT_SVG_ICONS = [
    { key: 'folder', label: 'مجلد عام', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' },
    { key: 'atom', label: 'فيزياء / ذرة', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(30 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(90 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(150 12 12)"/></svg>' },
    { key: 'flask', label: 'كيمياء / مختبر', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3"/><path d="M7 15h10"/></svg>' },
    { key: 'dna', label: 'أحياء / وراثة', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><path d="M2 15c6.667-6 13.333 0 20-6"/><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/><path d="M17 6l-2.5-2.5"/><path d="M14 8l-1-1"/><path d="M7 18l2.5 2.5"/><path d="M3.5 14.5l.5.5"/><path d="M20 9l.5.5"/><path d="M6.5 12.5l1 1"/><path d="M16.5 10.5l1 1"/><path d="M10 16l1.5 1.5"/></svg>' },
    { key: 'calculator', label: 'رياضيات / جبر', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg>' },
    { key: 'compass', label: 'هندسة / رسم', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><circle cx="12" cy="5" r="2"/><path d="M10.5 6.5L5 21"/><path d="M13.5 6.5L19 21"/><path d="M6 15h12"/><path d="M12 2v1"/></svg>' },
    { key: 'sigma', label: 'تفاضل وتكامل', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><path d="M18 7V4H6l6 8-6 8h12v-3"/></svg>' },
    { key: 'feather', label: 'لغة عربية / أدب', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/></svg>' },
    { key: 'languages', label: 'لغة أجنبية', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>' },
    { key: 'globe', label: 'جغرافيا / عالم', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>' },
    { key: 'landmark', label: 'تاريخ / حضارة', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>' },
    { key: 'brain', label: 'فلسفة / علم نفس', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.54"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.54"/></svg>' },
    { key: 'layers', label: 'جيولوجيا / طبقات', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>' },
    { key: 'cpu', label: 'برمجة / حاسب', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>' },
    { key: 'microscope', label: 'علوم / مجهر', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 1 0 0-14h-1"/><path d="M9 14h2"/><path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z"/><path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/></svg>' },
    { key: 'magnet', label: 'كهربية ومغناطيسية', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><path d="M6 15v-2a6 6 0 1 1 12 0v2"/><path d="M6 15h4v4H6z"/><path d="M14 15h4v4h-4z"/></svg>' },
    { key: 'book_open', label: 'كتاب / قراءة', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>' },
    { key: 'scale', label: 'اقتصاد / قانون', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><path d="M16 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z"/><path d="M2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>' },
    { key: 'heart_pulse', label: 'طب / فسيولوجي', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/></svg>' },
    { key: 'mosque_star', label: 'تربية دينية', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/><path d="M19 3v4"/><path d="M21 5h-4"/></svg>' },
    { key: 'music_art', label: 'فنون / موسيقى', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>' },
    { key: 'trophy', label: 'مراجعة نهائية / امتحانات', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>' },
    { key: 'pen_tool', label: 'تعبير / بلاغة', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>' },
    { key: 'chart_pie', label: 'إحصاء / بيانات', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>' }
];

const FOLDER_LEVEL_SVGS = {
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    unit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-7 h-7"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M8 10h8"/><path d="M8 14h5"/></svg>',
    lesson: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/></svg>'
};

function getSubjectSvgMarkup(subjectName) {
    const savedKey = appState.subjectIcons && appState.subjectIcons[subjectName];
    if (savedKey) {
        const found = SUBJECT_SVG_ICONS.find(i => i.key === savedKey);
        if (found) return found.svg;
    }
    // Smart auto-detection based on Arabic/English subject keywords (only when user hasn't picked one yet)
    const s = String(subjectName || '').toLowerCase();
    let autoKey = 'folder';
    if (s.includes('فيزي') || s.includes('phys')) autoKey = 'atom';
    else if (s.includes('كيمي') || s.includes('chem')) autoKey = 'flask';
    else if (s.includes('أحياء') || s.includes('احياء') || s.includes('بيولوج') || s.includes('bio')) autoKey = 'dna';
    else if (s.includes('رياض') || s.includes('جبر') || s.includes('math')) autoKey = 'calculator';
    else if (s.includes('هندس') || s.includes('استاتيك') || s.includes('ديناميك')) autoKey = 'compass';
    else if (s.includes('تفاضل') || s.includes('تكامل')) autoKey = 'sigma';
    else if (s.includes('عرب') || s.includes('نحو') || s.includes('بلاغ') || s.includes('أدب')) autoKey = 'feather';
    else if (s.includes('انجليز') || s.includes('إنجليز') || s.includes('فرنس') || s.includes('ألمان') || s.includes('ايطال') || s.includes('english') || s.includes('french')) autoKey = 'languages';
    else if (s.includes('جغرافي') || s.includes('geog')) autoKey = 'globe';
    else if (s.includes('تاريخ') || s.includes('hist')) autoKey = 'landmark';
    else if (s.includes('فلسف') || s.includes('نفس') || s.includes('اجتماع')) autoKey = 'brain';
    else if (s.includes('جيولوج') || s.includes('geol')) autoKey = 'layers';
    else if (s.includes('حاسب') || s.includes('برمج') || s.includes('كمبيوتر')) autoKey = 'cpu';
    else if (s.includes('إحصاء') || s.includes('احصاء')) autoKey = 'chart_pie';

    const matched = SUBJECT_SVG_ICONS.find(i => i.key === autoKey) || SUBJECT_SVG_ICONS[0];
    return matched.svg;
}

function initHomeworksExplorerPage() {
    folderNavState = { subject: null, book: null, chapter: null };
    folderSelectionMode = false;
    selectedExportHwIds.clear();
    populateSubjectsDatalist();
    updateSelectionToolbarUI();
    renderFoldersExplorer();
}

function getValidHomeworksList() {
    return appState.homeworks.filter(h => !h.id.startsWith('retry_'));
}

function navigateFolderTo(subject = null, book = null, chapter = null) {
    folderNavState = { subject, book, chapter };
    renderFoldersExplorer();
}

function navigateFolderUp() {
    if (folderNavState.chapter !== null) {
        folderNavState.chapter = null;
    } else if (folderNavState.book !== null) {
        folderNavState.book = null;
    } else if (folderNavState.subject !== null) {
        folderNavState.subject = null;
    }
    renderFoldersExplorer();
}

function renderFoldersBreadcrumb() {
    const bc = document.getElementById('folders-breadcrumb');
    const backBtn = document.getElementById('folders-back-btn');
    if (!bc) return;

    const { subject, book, chapter } = folderNavState;
    if (backBtn) {
        backBtn.classList.toggle('hidden', subject === null);
    }

    const parts = [];
    parts.push(`
        <button type="button" onclick="navigateFolderTo(null, null, null)" class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${subject === null ? 'bg-blue-900 text-white' : 'text-blue-900 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50'}">
            <i class="ph-bold ph-folders text-base"></i>
            <span>كل المواد</span>
        </button>
    `);

    if (subject !== null) {
        parts.push(`<i class="ph-bold ph-caret-left text-slate-400"></i>`);
        parts.push(`
            <button type="button" onclick="navigateFolderTo('${escapeJsArg(subject)}', null, null)" class="px-2.5 py-1 rounded-lg transition-colors ${book === null ? 'bg-blue-900 text-white' : 'text-blue-900 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50'}">
                ${escapeHtml(subject)}
            </button>
        `);
    }

    if (book !== null) {
        parts.push(`<i class="ph-bold ph-caret-left text-slate-400"></i>`);
        parts.push(`
            <button type="button" onclick="navigateFolderTo('${escapeJsArg(subject)}', '${escapeJsArg(book)}', null)" class="px-2.5 py-1 rounded-lg transition-colors ${chapter === null ? 'bg-blue-900 text-white' : 'text-blue-900 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50'}">
                ${escapeHtml(book)}
            </button>
        `);
    }

    if (chapter !== null) {
        parts.push(`<i class="ph-bold ph-caret-left text-slate-400"></i>`);
        parts.push(`
            <span class="px-2.5 py-1 rounded-lg bg-blue-900 text-white">
                ${escapeHtml(chapter)}
            </span>
        `);
    }

    bc.innerHTML = parts.join('');
}

function renderFoldersExplorer() {
    const grid = document.getElementById('folders-explorer-grid');
    const totalCountEl = document.getElementById('hw-explorer-total-count');
    if (!grid) return;

    const allHws = getValidHomeworksList();
    if (totalCountEl) {
        totalCountEl.textContent = `${allHws.length} واجب مسجل`;
    }

    renderFoldersBreadcrumb();
    updateSelectionToolbarUI();

    if (allHws.length === 0) {
        grid.className = 'grid grid-cols-1 gap-4';
        grid.innerHTML = `
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-10 text-center border border-slate-200 dark:border-slate-800 space-y-3">
                <div class="w-16 h-16 rounded-2xl bg-blue-900/10 text-blue-900 dark:text-blue-400 flex items-center justify-center mx-auto">
                    ${SUBJECT_SVG_ICONS[0].svg}
                </div>
                <h3 class="font-black text-lg">مفيش أي واجبات مضافة لسه!</h3>
                <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    المجلدات هنا بتتعمل تلقائياً من واجباتك الحقيقية! ارفع أول ملف إجابات أو أنشئ واجب يدوي من الصفحة الرئيسية وهتلاقي مواده ومصادره ووحداته ظهرت هنا فوراً.
                </p>
                <div class="pt-2">
                    <button type="button" onclick="navigateTo('home')" class="px-6 py-3 rounded-2xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-sm shadow-md inline-flex items-center gap-2">
                        <i class="ph-bold ph-plus-circle text-lg"></i>
                        <span>إضافة أول واجب الآن</span>
                    </button>
                </div>
            </div>
        `;
        return;
    }

    const { subject, book, chapter } = folderNavState;

    // LEVEL 1: SUBJECTS FOLDERS
    if (subject === null) {
        const subjectsMap = {};
        allHws.forEach(hw => {
            if (!subjectsMap[hw.subject]) subjectsMap[hw.subject] = [];
            subjectsMap[hw.subject].push(hw);
        });

        grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4';
        grid.innerHTML = Object.entries(subjectsMap).map(([subjName, hws]) => {
            const booksCount = new Set(hws.map(h => h.book)).size;
            const ids = hws.map(h => h.id);
            const allSelected = ids.length > 0 && ids.every(id => selectedExportHwIds.has(id));
            const someSelected = !allSelected && ids.some(id => selectedExportHwIds.has(id));

            return `
                <div onclick="handleFolderCardClick(event, 'subject', '${escapeJsArg(subjName)}')" class="cursor-pointer group relative bg-white dark:bg-slate-900 rounded-3xl p-5 border-2 ${allSelected ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20' : someSelected ? 'border-amber-400' : 'border-slate-200 dark:border-slate-800 hover:border-blue-800 dark:hover:border-blue-500'} shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4">
                    <div class="flex items-start justify-between gap-2">
                        <div class="w-14 h-14 rounded-2xl bg-blue-900/10 dark:bg-blue-500/15 text-blue-900 dark:text-blue-300 flex items-center justify-center group-hover:scale-105 transition-transform">
                            ${getSubjectSvgMarkup(subjName)}
                        </div>
                        <div class="flex items-center gap-1.5">
                            ${folderSelectionMode ? `
                                <button type="button" onclick="event.stopPropagation(); toggleGroupSelection('subject', '${escapeJsArg(subjName)}')" class="w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-colors ${allSelected ? 'bg-emerald-600 border-emerald-600 text-white' : someSelected ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'}" title="تحديد كل واجبات المادة">
                                    <i class="ph-bold ${allSelected ? 'ph-check' : someSelected ? 'ph-minus' : ''}"></i>
                                </button>
                            ` : ''}
                            <button type="button" onclick="event.stopPropagation(); openSubjectIconPicker('${escapeJsArg(subjName)}')" class="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-100 dark:bg-slate-800 dark:hover:bg-blue-950/60 text-slate-600 dark:text-slate-300 hover:text-blue-900 dark:hover:text-blue-300 text-[11px] font-bold flex items-center gap-1 transition-colors" title="تغيير أيقونة المادة">
                                <i class="ph-bold ph-sparkle"></i>
                                <span>الأيقونة</span>
                            </button>
                        </div>
                    </div>

                    <div>
                        <h3 class="font-black text-lg text-slate-900 dark:text-white group-hover:text-blue-900 dark:group-hover:text-blue-400 transition-colors">${escapeHtml(subjName)}</h3>
                        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
                            <span>${booksCount} مصدر / كتاب</span>
                            <span>•</span>
                            <span>${hws.length} واجب</span>
                        </p>
                    </div>

                    <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-extrabold text-blue-900 dark:text-blue-400">
                        <span>فتح مجلد المادة</span>
                        <i class="ph-bold ph-arrow-left text-base group-hover:-translate-x-1 transition-transform"></i>
                    </div>
                </div>
            `;
        }).join('');
        return;
    }

    // LEVEL 2: BOOKS / SOURCES INSIDE SUBJECT
    const subjectHws = allHws.filter(h => h.subject === subject);
    if (book === null) {
        const booksMap = {};
        subjectHws.forEach(hw => {
            if (!booksMap[hw.book]) booksMap[hw.book] = [];
            booksMap[hw.book].push(hw);
        });

        grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4';
        grid.innerHTML = Object.entries(booksMap).map(([bookName, hws]) => {
            const unitsCount = new Set(hws.map(h => h.chapter)).size;
            const ids = hws.map(h => h.id);
            const allSelected = ids.length > 0 && ids.every(id => selectedExportHwIds.has(id));
            const someSelected = !allSelected && ids.some(id => selectedExportHwIds.has(id));

            return `
                <div onclick="handleFolderCardClick(event, 'book', '${escapeJsArg(bookName)}')" class="cursor-pointer group relative bg-white dark:bg-slate-900 rounded-3xl p-5 border-2 ${allSelected ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20' : someSelected ? 'border-amber-400' : 'border-slate-200 dark:border-slate-800 hover:border-blue-800 dark:hover:border-blue-500'} shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4">
                    <div class="flex items-start justify-between gap-2">
                        <div class="w-14 h-14 rounded-2xl bg-indigo-500/10 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 flex items-center justify-center group-hover:scale-105 transition-transform">
                            ${FOLDER_LEVEL_SVGS.book}
                        </div>
                        ${folderSelectionMode ? `
                            <button type="button" onclick="event.stopPropagation(); toggleGroupSelection('book', '${escapeJsArg(bookName)}')" class="w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-colors ${allSelected ? 'bg-emerald-600 border-emerald-600 text-white' : someSelected ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'}" title="تحديد كل واجبات المصدر">
                                <i class="ph-bold ${allSelected ? 'ph-check' : someSelected ? 'ph-minus' : ''}"></i>
                            </button>
                        ` : ''}
                    </div>

                    <div>
                        <span class="text-[11px] font-bold text-indigo-700 dark:text-indigo-400">${escapeHtml(subject)}</span>
                        <h3 class="font-black text-base sm:text-lg text-slate-900 dark:text-white mt-0.5 line-clamp-2">${escapeHtml(bookName)}</h3>
                        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
                            <span>${unitsCount} وحدة / فصل</span>
                            <span>•</span>
                            <span>${hws.length} واجب</span>
                        </p>
                    </div>

                    <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-extrabold text-indigo-700 dark:text-indigo-400">
                        <span>عرض الوحدات</span>
                        <i class="ph-bold ph-arrow-left text-base group-hover:-translate-x-1 transition-transform"></i>
                    </div>
                </div>
            `;
        }).join('');
        return;
    }

    // LEVEL 3: CHAPTERS / UNITS INSIDE BOOK
    const bookHws = subjectHws.filter(h => h.book === book);
    if (chapter === null) {
        const chaptersMap = {};
        bookHws.forEach(hw => {
            if (!chaptersMap[hw.chapter]) chaptersMap[hw.chapter] = [];
            chaptersMap[hw.chapter].push(hw);
        });

        grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4';
        grid.innerHTML = Object.entries(chaptersMap).map(([chapName, hws]) => {
            const ids = hws.map(h => h.id);
            const allSelected = ids.length > 0 && ids.every(id => selectedExportHwIds.has(id));
            const someSelected = !allSelected && ids.some(id => selectedExportHwIds.has(id));

            return `
                <div onclick="handleFolderCardClick(event, 'chapter', '${escapeJsArg(chapName)}')" class="cursor-pointer group relative bg-white dark:bg-slate-900 rounded-3xl p-5 border-2 ${allSelected ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20' : someSelected ? 'border-amber-400' : 'border-slate-200 dark:border-slate-800 hover:border-blue-800 dark:hover:border-blue-500'} shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4">
                    <div class="flex items-start justify-between gap-2">
                        <div class="w-14 h-14 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center justify-center group-hover:scale-105 transition-transform">
                            ${FOLDER_LEVEL_SVGS.unit}
                        </div>
                        ${folderSelectionMode ? `
                            <button type="button" onclick="event.stopPropagation(); toggleGroupSelection('chapter', '${escapeJsArg(chapName)}')" class="w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-colors ${allSelected ? 'bg-emerald-600 border-emerald-600 text-white' : someSelected ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'}" title="تحديد كل واجبات الوحدة">
                                <i class="ph-bold ${allSelected ? 'ph-check' : someSelected ? 'ph-minus' : ''}"></i>
                            </button>
                        ` : ''}
                    </div>

                    <div>
                        <span class="text-[11px] font-bold text-amber-700 dark:text-amber-400">${escapeHtml(book)}</span>
                        <h3 class="font-black text-base sm:text-lg text-slate-900 dark:text-white mt-0.5 line-clamp-2">${escapeHtml(chapName)}</h3>
                        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${hws.length} درس / واجب</p>
                    </div>

                    <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-extrabold text-amber-700 dark:text-amber-400">
                        <span>عرض الدروس</span>
                        <i class="ph-bold ph-arrow-left text-base group-hover:-translate-x-1 transition-transform"></i>
                    </div>
                </div>
            `;
        }).join('');
        return;
    }

    // LEVEL 4: LESSONS / HOMEWORKS INSIDE UNIT
    const lessonHws = bookHws.filter(h => h.chapter === chapter);
    grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
    grid.innerHTML = lessonHws.map(hw => {
        const isSelected = selectedExportHwIds.has(hw.id);
        let statusPill = '';
        if (hw.status === 'in_progress') {
            statusPill = '<span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-blue-300">محفوظ - قيد الحل</span>';
        } else if (hw.status === 'partial') {
            statusPill = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">مسلّم جزئياً (${hw.percentage}%)</span>`;
        } else {
            statusPill = `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">مكتمل (${hw.percentage}%)</span>`;
        }

        return `
            <div onclick="${folderSelectionMode ? `toggleSingleHomeworkSelection('${hw.id}')` : ''}" class="${folderSelectionMode ? 'cursor-pointer' : ''} bg-white dark:bg-slate-900 rounded-3xl p-5 border-2 ${isSelected ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-800'} shadow-sm flex flex-col justify-between gap-4 transition-all">
                <div>
                    <div class="flex items-center justify-between gap-2 mb-3">
                        <div class="flex items-center gap-2">
                            <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                                ${FOLDER_LEVEL_SVGS.lesson}
                            </div>
                            ${statusPill}
                        </div>
                        ${folderSelectionMode ? `
                            <button type="button" onclick="event.stopPropagation(); toggleSingleHomeworkSelection('${hw.id}')" class="w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'}">
                                <i class="ph-bold ${isSelected ? 'ph-check' : ''}"></i>
                            </button>
                        ` : ''}
                    </div>

                    <h4 class="font-black text-base sm:text-lg text-slate-900 dark:text-white">${escapeHtml(hw.lesson)}</h4>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${escapeHtml(hw.subject)} • ${escapeHtml(hw.book)}</p>
                    <p class="text-[11px] text-slate-400 mt-2">${hw.questions.length} سؤال • ${hw.createdAt}</p>
                </div>

                <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2" onclick="event.stopPropagation()">
                    <div class="flex items-center gap-1.5">
                        <button type="button" onclick="openSolveView('${hw.id}')" class="px-3 py-2 rounded-xl bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-1">
                            <i class="ph-bold ph-pencil-simple"></i>
                            <span>${hw.status === 'completed' ? 'إعادة الحل' : 'حل'}</span>
                        </button>
                        ${hw.status !== 'in_progress' ? `
                            <button type="button" onclick="openDashboardView('${hw.id}')" class="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold">
                                النتيجة
                            </button>
                        ` : ''}
                    </div>

                    <div class="flex items-center gap-1">
                        <button type="button" onclick="openEditHomeworkMetaModal('${hw.id}')" class="p-2 rounded-xl text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40" title="تعديل بيانات التسليم">
                            <i class="ph-bold ph-note-pencil text-base"></i>
                        </button>
                        <button type="button" onclick="shareHomeworkKey('${hw.id}')" class="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="مشاركة نموذج الإجابة">
                            <i class="ph-bold ph-share-network text-base"></i>
                        </button>
                        <button type="button" onclick="deleteHomework('${hw.id}')" class="p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40" title="حذف الواجب">
                            <i class="ph-bold ph-trash text-base"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function handleFolderCardClick(event, level, value) {
    if (level === 'subject') {
        navigateFolderTo(value, null, null);
    } else if (level === 'book') {
        navigateFolderTo(folderNavState.subject, value, null);
    } else if (level === 'chapter') {
        navigateFolderTo(folderNavState.subject, folderNavState.book, value);
    }
}

// Selective Export Functions
function toggleFolderSelectionMode() {
    folderSelectionMode = !folderSelectionMode;
    if (!folderSelectionMode) {
        selectedExportHwIds.clear();
    }
    updateSelectionToolbarUI();
    renderFoldersExplorer();
}

function updateSelectionToolbarUI() {
    const toggleBtn = document.getElementById('toggle-select-mode-btn');
    const toggleLabel = document.getElementById('toggle-select-mode-label');
    const selectAllBtn = document.getElementById('select-all-current-btn');
    const exportBtn = document.getElementById('export-selected-btn');
    const countEl = document.getElementById('selected-export-count');
    if (!toggleBtn) return;

    if (folderSelectionMode) {
        toggleBtn.className = 'px-4 py-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800 font-extrabold text-xs sm:text-sm flex items-center gap-1.5 transition-all';
        toggleLabel.textContent = 'إلغاء التحديد';
        selectAllBtn.classList.remove('hidden');
        exportBtn.classList.remove('hidden');
        countEl.textContent = selectedExportHwIds.size;
    } else {
        toggleBtn.className = 'px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 font-extrabold text-xs sm:text-sm flex items-center gap-1.5 transition-all';
        toggleLabel.textContent = 'تحديد للتصدير';
        selectAllBtn.classList.add('hidden');
        exportBtn.classList.add('hidden');
    }
}

function toggleGroupSelection(level, value) {
    const allHws = getValidHomeworksList();
    let matching = [];
    if (level === 'subject') {
        matching = allHws.filter(h => h.subject === value);
    } else if (level === 'book') {
        matching = allHws.filter(h => h.subject === folderNavState.subject && h.book === value);
    } else if (level === 'chapter') {
        matching = allHws.filter(h => h.subject === folderNavState.subject && h.book === folderNavState.book && h.chapter === value);
    }

    const allAlreadySelected = matching.length > 0 && matching.every(h => selectedExportHwIds.has(h.id));
    if (allAlreadySelected) {
        matching.forEach(h => selectedExportHwIds.delete(h.id));
    } else {
        matching.forEach(h => selectedExportHwIds.add(h.id));
    }
    updateSelectionToolbarUI();
    renderFoldersExplorer();
}

function toggleSingleHomeworkSelection(hwId) {
    if (selectedExportHwIds.has(hwId)) {
        selectedExportHwIds.delete(hwId);
    } else {
        selectedExportHwIds.add(hwId);
    }
    updateSelectionToolbarUI();
    renderFoldersExplorer();
}

function selectAllInCurrentFolderView() {
    const allHws = getValidHomeworksList();
    const { subject, book, chapter } = folderNavState;
    const scoped = allHws.filter(h => {
        if (subject !== null && h.subject !== subject) return false;
        if (book !== null && h.book !== book) return false;
        if (chapter !== null && h.chapter !== chapter) return false;
        return true;
    });

    const allSelected = scoped.length > 0 && scoped.every(h => selectedExportHwIds.has(h.id));
    if (allSelected) {
        scoped.forEach(h => selectedExportHwIds.delete(h.id));
    } else {
        scoped.forEach(h => selectedExportHwIds.add(h.id));
    }
    updateSelectionToolbarUI();
    renderFoldersExplorer();
}

function exportSelectedHomeworks() {
    if (selectedExportHwIds.size === 0) {
        showToast('حدد مادة أو مصدر أو درس واحد على الأقل عشان تصدّره!', 'error');
        return;
    }

    const selectedHws = getValidHomeworksList().filter(h => selectedExportHwIds.has(h.id));
    const selectedSubjects = [...new Set(selectedHws.map(h => h.subject))];
    const selectedIcons = {};
    selectedSubjects.forEach(s => {
        if (appState.subjectIcons && appState.subjectIcons[s]) {
            selectedIcons[s] = appState.subjectIcons[s];
        }
    });

    const exportPayload = {
        exportedAt: new Date().toISOString(),
        partialExport: true,
        subjectIcons: selectedIcons,
        homeworks: selectedHws
    };

    const labelPart = selectedSubjects.length === 1 ? `_${selectedSubjects[0].replace(/\s+/g, '_')}` : '_مختارات';
    downloadJsonFile(exportPayload, `تصدير_واجبات${labelPart}_${selectedHws.length}واجب.json`);
    showToast(`تم تصدير ${selectedHws.length} واجب بنجاح! تقدر تستوردهم من "نسخة احتياطية" في أي جهاز.`, 'success');
}

// Subject Icon Picker Functions
function openSubjectIconPicker(subjectName) {
    iconPickerTargetSubject = subjectName;
    document.getElementById('icon-picker-subject-name').textContent = subjectName;
    document.getElementById('icon-picker-preview-box').innerHTML = getSubjectSvgMarkup(subjectName);

    const currentKey = (appState.subjectIcons && appState.subjectIcons[subjectName]) || '';
    const gallery = document.getElementById('subject-icons-gallery');
    gallery.innerHTML = SUBJECT_SVG_ICONS.map(item => {
        const isCurrent = item.key === currentKey;
        return `
            <button type="button" onclick="selectSubjectSvgIcon('${item.key}')" class="p-3 rounded-2xl border-2 ${isCurrent ? 'border-blue-900 bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 hover:border-blue-700 text-slate-700 dark:text-slate-200'} flex flex-col items-center justify-center gap-1.5 text-center transition-all active:scale-95">
                ${item.svg}
                <span class="text-[10px] font-bold leading-tight line-clamp-1">${item.label}</span>
            </button>
        `;
    }).join('');

    openModal('subject-icon-modal');
}

function selectSubjectSvgIcon(iconKey) {
    if (!iconPickerTargetSubject) return;
    if (!appState.subjectIcons) appState.subjectIcons = {};
    appState.subjectIcons[iconPickerTargetSubject] = iconKey;
    persistState();
    closeModal('subject-icon-modal');
    renderFoldersExplorer();
    showToast(`تم تحديث أيقونة مادة "${iconPickerTargetSubject}" بنجاح!`, 'success');
}

function escapeJsArg(str) {
    return String(str ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '&quot;');
}

window.addEventListener('DOMContentLoaded', initApp);
