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

        const link = document.getElementById('apple-touch-icon-link');
        if (link) link.href = canvas.toDataURL('image/png');
    } catch (e) {}
}

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
    if (gender === 'female') selectInitColorTheme('pink');
    else selectInitColorTheme('blue');
}

function selectInitColorTheme(themeName) {
    selectedInitTheme = themeName;
    applyColorTheme(themeName, false);
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
    showToast(`أهلاً بك يا ${name}! تم تجهيز ملفك بنجاح.`, 'success');
}

function handleInitialBackupRestore(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data || !Array.isArray(data.homeworks)) throw new Error('Invalid backup file');
            appState.homeworks = data.homeworks;
            appState.solveMode = data.solveMode || 'standard';
            appState.subjectIcons = data.subjectIcons || {};
            appState.userProfile = data.userProfile || { name: 'بطل المذاكرة', gender: 'male', colorTheme: 'blue' };

            applyColorTheme(appState.userProfile.colorTheme || 'blue', true);
            persistState();
            refreshAllUI();
            closeModal('user-init-modal');
            showToast(`أهلاً بعودتك يا ${appState.userProfile.name}! تم استرجاع كل بياناتك.`, 'success');
        } catch (err) {
            showToast('الملف غير سليم!', 'error');
        }
    };
    reader.readAsText(file);
}

function applyUserPersonalization() {
    const profile = appState.userProfile;
    const nameEl = document.getElementById('header-user-name');
    const headingEl = document.getElementById('home-welcome-heading');
    if (!profile) return;
    if (nameEl) nameEl.textContent = profile.name;
    if (headingEl) {
        headingEl.textContent = `أهلاً بيك يا ${profile.name} 👋 ابدأ بابل شيت جديد أو تدريبات متكاملة`;
    }
}

function persistState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    } catch (e) {
        showToast('ذاكرة المتصفح ممتلئة!', 'error');
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'dark') document.documentElement.classList.add('dark');
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
}

function navigateTo(viewName) {
    const PAGE_ROUTES = {
        home: 'index.html',
        homeworks: 'homeworks.html',
        solve: 'solve.html',
        dashboard: 'dashboard.html',
        mistakes: 'mistakes.html'
    };
    window.location.href = PAGE_ROUTES[viewName] || 'index.html';
}

function processAnswerKeyFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            let content = e.target.result.trim();
            content = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
            const data = JSON.parse(content);

            if (!data.questions || !Array.isArray(data.questions)) throw new Error('Invalid JSON questions');

            const normalizedQuestions = data.questions.map((q, idx) => ({
                number: String(q.number || idx + 1),
                type: q.type === 'essay' ? 'essay' : 'mcq',
                questionHeader: q.questionHeader || '',
                questionText: q.questionText || '',
                passageText: q.passageText || '',
                tableData: q.tableData || null,
                options: q.options || [],
                correctAnswer: String(q.answer || '').trim(),
                userAnswer: null,
                essayScore: null,
                essayRevealed: false,
                flagged: false,
                status: 'unanswered',
                errorReason: '',
                understood: false,
                note: ''
            }));

            pendingParsedQuestions = normalizedQuestions;
            document.getElementById('parsed-q-count').textContent = normalizedQuestions.length;
            document.getElementById('metadata-setup-card').classList.remove('hidden');
            showToast('تم قراءة الملف بنجاح! أدخل بيانات الواجب.', 'success');
        } catch (err) {
            showToast('صيغة ملف الـ JSON غير صحيحة!', 'error');
        }
    };
    reader.readAsText(file);
}

function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    if (!dropZone) return;
    dropZone.addEventListener('dragover', (e) => e.preventDefault());
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files[0]) processAnswerKeyFile(e.dataTransfer.files[0]);
    });
}

function handleFileUpload(e) {
    if (e.target.files[0]) processAnswerKeyFile(e.target.files[0]);
}

function startNewHomework(e) {
    e.preventDefault();
    if (!pendingParsedQuestions) return;

    const newHw = {
        id: 'hw_' + Date.now(),
        subject: document.getElementById('meta-subject').value.trim(),
        book: document.getElementById('meta-book').value.trim(),
        chapter: document.getElementById('meta-chapter').value.trim(),
        lesson: document.getElementById('meta-lesson').value.trim(),
        language: document.getElementById('meta-lang').value,
        createdAt: new Date().toLocaleDateString('ar-EG'),
        status: 'in_progress',
        questions: pendingParsedQuestions,
        scoreEarned: 0,
        scoreMax: 0,
        percentage: 0
    };

    appState.homeworks.unshift(newHw);
    persistState();
    window.location.href = `solve.html?id=${newHw.id}`;
}

function refreshAllUI() {
    updateGlobalStats();
}

function updateGlobalStats() {
    const completed = appState.homeworks.filter(h => h.status !== 'in_progress');
    const elTotal = document.getElementById('stat-total-hw');
    if (elTotal) elTotal.textContent = completed.length;
}

function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }
function showToast(msg, type = 'info') { alert(msg); }

window.addEventListener('DOMContentLoaded', initApp);