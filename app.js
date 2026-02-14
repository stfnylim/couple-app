// ==========================================
// FIREBASE CONFIGURATION
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBHC6WOG9Z2qI6XoeAxuqVAHwqhxPAGcE0",
    authDomain: "couple-app-18d2d.firebaseapp.com",
    projectId: "couple-app-18d2d",
    storageBucket: "couple-app-18d2d.firebasestorage.app",
    messagingSenderId: "759079152321",
    appId: "1:759079152321:web:a8c9a0b558529f2f414240",
    measurementId: "G-9ZZE93EHKE"
};

// Recipe parser URL - automatically detects local vs production
const RECIPE_PARSER_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/parse'
    : 'https://recipe-parser-163633956400.us-central1.run.app/parse';

// ==========================================
// APP STATE
// ==========================================
let db = null;
let auth = null;
let storage = null;
let currentUser = null;
let currentSpaceId = null;
let isOnline = navigator.onLine;
let dates = [];
let recipes = [];
let plans = [];
let restaurants = [];
let unsubscribeDates = null;
let unsubscribeRecipes = null;
let unsubscribePlans = null;
let unsubscribeRestaurants = null;
let currentFoodSubtab = 'recipes';
let currentFoodFilter = 'all';

// ==========================================
// INITIALIZE APP
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('authUser')) {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('app').style.display = '';
        document.getElementById('appHeader').style.display = '';
    }
    initFirebase();
    initEventListeners();
    initServiceWorker();
    updateSyncStatus();
});

function initFirebase() {
    try {
        if (firebaseConfig.apiKey === "YOUR_API_KEY") {
            console.warn("Firebase not configured. Using local storage only.");
            loadFromLocalStorage();
            renderAll();
            return;
        }

        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        auth = firebase.auth();
        storage = firebase.storage();

        db.enablePersistence().catch((err) => {
            console.log("Persistence error:", err);
        });

        auth.onAuthStateChanged(handleAuthStateChanged);

    } catch (error) {
        console.error("Firebase init error:", error);
        loadFromLocalStorage();
        renderAll();
    }
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast' + (type !== 'info' ? ' toast-' + type : '');
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('show'));
    });
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ==========================================
// AUTHENTICATION
// ==========================================
async function handleAuthStateChanged(user) {
    if (user) {
        currentUser = user;
        localStorage.setItem('authUser', '1');
        showApp();
        updateUserUI(user);

        try {
            const userDoc = await db.collection('users').doc(user.uid).get();

            if (userDoc.exists && userDoc.data().spaceId) {
                currentSpaceId = userDoc.data().spaceId;
                setupRealtimeListeners();
                updateSpaceUI();
            } else {
                showSpaceSetup();
            }
        } catch (error) {
            console.error("Error loading user data:", error);
            loadFromLocalStorage();
            renderAll();
        }
    } else {
        currentUser = null;
        currentSpaceId = null;
        localStorage.removeItem('authUser');
        teardownRealtimeListeners();
        showLoginScreen();
    }
}

function showApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('app').style.display = '';
    document.getElementById('appHeader').style.display = '';
}

function showLoginScreen() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('app').style.display = 'none';
    document.getElementById('appHeader').style.display = 'none';
}

function updateUserUI(user) {
    const avatar = document.getElementById('userAvatar');
    avatar.src = user.photoURL || '';
    avatar.alt = user.displayName || 'User';

    document.getElementById('settingsAvatar').src = user.photoURL || '';
    document.getElementById('settingsName').textContent = user.displayName || 'User';
    document.getElementById('settingsEmail').textContent = user.email || '';
}

function teardownRealtimeListeners() {
    if (unsubscribeDates) { unsubscribeDates(); unsubscribeDates = null; }
    if (unsubscribeRecipes) { unsubscribeRecipes(); unsubscribeRecipes = null; }
    if (unsubscribePlans) { unsubscribePlans(); unsubscribePlans = null; }
    if (unsubscribeRestaurants) { unsubscribeRestaurants(); unsubscribeRestaurants = null; }
    dates = [];
    recipes = [];
    plans = [];
    restaurants = [];
    renderAll();
}

async function signInWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(provider);
    } catch (error) {
        console.error("Sign-in error:", error);
        if (error.code === 'auth/popup-closed-by-user') return;
        showToast("Sign-in failed. Please try again.", 'error');
    }
}

async function signOut() {
    try {
        await auth.signOut();
        localStorage.removeItem('dates');
        localStorage.removeItem('recipes');
        localStorage.removeItem('plans');
        localStorage.removeItem('restaurants');
    } catch (error) {
        console.error("Sign-out error:", error);
    }
}

// ==========================================
// SPACE MANAGEMENT
// ==========================================
function getCollectionRef(collectionName) {
    if (!db || !currentSpaceId) return null;
    return db.collection('spaces').doc(currentSpaceId).collection(collectionName);
}

function generateInviteCode() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

async function handleCreateSpace() {
    if (!currentUser || !db) return;

    const btn = document.getElementById('createSpaceBtn');
    try {
        btn.disabled = true;
        btn.textContent = 'Creating...';

        const inviteCode = generateInviteCode();

        const spaceRef = await db.collection('spaces').add({
            members: [currentUser.uid],
            createdBy: currentUser.uid,
            inviteCode: inviteCode,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        currentSpaceId = spaceRef.id;

        await db.collection('users').doc(currentUser.uid).set({
            spaceId: currentSpaceId,
            displayName: currentUser.displayName,
            email: currentUser.email,
            photoURL: currentUser.photoURL,
            joinedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        await migrateRootData();
        setupRealtimeListeners();
        updateSpaceUI();

    } catch (error) {
        console.error("Error creating space:", error);
        showToast("Failed to create space. Please try again.", 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Create Space';
    }
}

async function handleJoinSpace() {
    if (!currentUser || !db) return;

    const code = document.getElementById('joinCodeInput').value.trim().toUpperCase();
    if (!code || code.length < 6) {
        showToast("Please enter a valid 6-character invite code.", 'warning');
        return;
    }

    const btn = document.getElementById('joinSpaceBtn');
    try {
        btn.disabled = true;
        btn.textContent = 'Joining...';

        const spacesSnapshot = await db.collection('spaces')
            .where('inviteCode', '==', code)
            .limit(1)
            .get();

        if (spacesSnapshot.empty) {
            showToast("Invalid invite code. Please check and try again.", 'warning');
            return;
        }

        const spaceDoc = spacesSnapshot.docs[0];
        const spaceData = spaceDoc.data();

        if (spaceData.members && spaceData.members.length >= 2) {
            showToast("This space already has two members.", 'warning');
            return;
        }

        if (spaceData.members && spaceData.members.includes(currentUser.uid)) {
            showToast("You are already a member of this space.", 'warning');
            return;
        }

        currentSpaceId = spaceDoc.id;

        await db.collection('spaces').doc(currentSpaceId).update({
            members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        });

        await db.collection('users').doc(currentUser.uid).set({
            spaceId: currentSpaceId,
            displayName: currentUser.displayName,
            email: currentUser.email,
            photoURL: currentUser.photoURL,
            joinedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        setupRealtimeListeners();
        updateSpaceUI();

    } catch (error) {
        console.error("Error joining space:", error);
        showToast("Failed to join space. Please try again.", 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Join';
    }
}

async function updateSpaceUI() {
    const inviteSection = document.getElementById('inviteCodeSection');
    const joinSection = document.getElementById('joinSpaceSection');
    const spaceStatus = document.getElementById('spaceStatus');

    if (!currentSpaceId) {
        showSpaceSetup();
        return;
    }

    joinSection.style.display = 'none';
    inviteSection.style.display = '';

    try {
        const spaceDoc = await db.collection('spaces').doc(currentSpaceId).get();
        if (spaceDoc.exists) {
            const data = spaceDoc.data();
            document.getElementById('inviteCodeDisplay').textContent = data.inviteCode;

            const memberCount = (data.members || []).length;
            spaceStatus.textContent = memberCount === 2
                ? 'Connected with your partner!'
                : 'Waiting for your partner to join...';
        }
    } catch (error) {
        console.error("Error loading space info:", error);
        spaceStatus.textContent = 'Space loaded (offline mode)';
    }
}

function showSpaceSetup() {
    document.getElementById('inviteCodeSection').style.display = 'none';
    document.getElementById('joinSpaceSection').style.display = '';
    document.getElementById('spaceStatus').textContent = 'Create a space or join your partner\'s.';
    loadFromLocalStorage();
    renderAll();
}

function handleCopyInviteCode() {
    const code = document.getElementById('inviteCodeDisplay').textContent;
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('copyInviteBtn');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    }).catch(() => {
        showToast('Invite code: ' + code, 'info');
    });
}

// ==========================================
// DATA MIGRATION
// ==========================================
async function migrateRootData() {
    if (!db || !currentSpaceId) return;

    try {
        console.log("Starting data migration to space:", currentSpaceId);
        updateSyncStatus('syncing');

        const collections = ['dates', 'recipes', 'plans'];
        let totalMigrated = 0;

        for (const collectionName of collections) {
            const rootSnapshot = await db.collection(collectionName).get();
            if (rootSnapshot.empty) continue;

            let batch = db.batch();
            let batchCount = 0;

            for (const doc of rootSnapshot.docs) {
                const targetRef = db.collection('spaces').doc(currentSpaceId)
                    .collection(collectionName).doc(doc.id);

                batch.set(targetRef, {
                    ...doc.data(),
                    migratedFrom: 'root',
                    migratedAt: new Date().toISOString()
                });

                batchCount++;
                totalMigrated++;

                if (batchCount >= 450) {
                    await batch.commit();
                    batch = db.batch();
                    batchCount = 0;
                }
            }

            if (batchCount > 0) {
                await batch.commit();
            }

            console.log(`Migrated ${rootSnapshot.size} ${collectionName}`);
        }

        await db.collection('spaces').doc(currentSpaceId).update({
            migrated: true,
            migratedAt: firebase.firestore.FieldValue.serverTimestamp(),
            migratedDocCount: totalMigrated
        });

        console.log(`Migration complete. ${totalMigrated} documents migrated.`);
        updateSyncStatus('synced');

    } catch (error) {
        console.error("Migration error:", error);
        showToast("Some data could not be migrated. Your original data is safe.", 'warning');
    }
}

function setupRealtimeListeners() {
    teardownRealtimeListeners();
    if (!currentSpaceId) return;

    unsubscribeDates = getCollectionRef('dates')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            dates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            saveToLocalStorage();
            renderDates();
            updateDateSelectorList();
            updateSyncStatus('synced');
        }, (error) => {
            console.error("Dates listener error:", error);
            updateSyncStatus('offline');
        });

    unsubscribeRecipes = getCollectionRef('recipes')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            recipes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            saveToLocalStorage();
            renderRecipes();
            updateSyncStatus('synced');
        }, (error) => {
            console.error("Recipes listener error:", error);
            updateSyncStatus('offline');
        });

    unsubscribePlans = getCollectionRef('plans')
        .orderBy('date', 'asc')
        .onSnapshot((snapshot) => {
            plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            saveToLocalStorage();
            renderPlans();
            updateSyncStatus('synced');
        }, (error) => {
            console.error("Plans listener error:", error);
            updateSyncStatus('offline');
        });

    unsubscribeRestaurants = getCollectionRef('restaurants')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            restaurants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            saveToLocalStorage();
            renderRestaurants();
            updateSyncStatus('synced');
        }, (error) => {
            console.error("Restaurants listener error:", error);
            updateSyncStatus('offline');
        });

    // Load customization (GIF + audio)
    loadCustomization();
}

// ==========================================
// LOCAL STORAGE FALLBACK
// ==========================================
function loadFromLocalStorage() {
    const prefix = currentSpaceId ? `space_${currentSpaceId}_` : '';
    dates = JSON.parse(localStorage.getItem(prefix + 'dates') || '[]');
    recipes = JSON.parse(localStorage.getItem(prefix + 'recipes') || '[]');
    plans = JSON.parse(localStorage.getItem(prefix + 'plans') || '[]');
    restaurants = JSON.parse(localStorage.getItem(prefix + 'restaurants') || '[]');
}

function saveToLocalStorage() {
    const prefix = currentSpaceId ? `space_${currentSpaceId}_` : '';
    localStorage.setItem(prefix + 'dates', JSON.stringify(dates));
    localStorage.setItem(prefix + 'recipes', JSON.stringify(recipes));
    localStorage.setItem(prefix + 'plans', JSON.stringify(plans));
    localStorage.setItem(prefix + 'restaurants', JSON.stringify(restaurants));
}

// ==========================================
// SYNC STATUS
// ==========================================
function updateSyncStatus(status) {
    const statusEl = document.getElementById('syncStatus');
    statusEl.className = 'sync-status ' + (status || (isOnline ? 'synced' : 'offline'));
    statusEl.title = status === 'synced' ? 'Synced' : status === 'syncing' ? 'Syncing...' : 'Offline';
}

window.addEventListener('online', () => {
    isOnline = true;
    updateSyncStatus('syncing');
});

window.addEventListener('offline', () => {
    isOnline = false;
    updateSyncStatus('offline');
});

// ==========================================
// EVENT LISTENERS
// ==========================================
function initEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Sub-tab navigation (food section)
    document.querySelectorAll('.sub-tab').forEach(tab => {
        tab.addEventListener('click', () => switchFoodSubtab(tab.dataset.subtab));
    });

    // Date filter buttons
    document.querySelectorAll('#dateFilters .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => filterDates(btn.dataset.filter));
    });

    // Food filter buttons
    document.querySelectorAll('#foodFilters .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => filterFood(btn.dataset.foodFilter));
    });

    // Modal close buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });

    // Close modals on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal.id);
        });
    });

    // FAB buttons
    document.getElementById('addDateBtn').addEventListener('click', () => openDateModal());
    document.getElementById('addFoodBtn').addEventListener('click', () => {
        if (currentFoodSubtab === 'recipes') {
            openRecipeUrlModal();
        } else {
            openRestaurantModal();
        }
    });
    document.getElementById('addPlanBtn').addEventListener('click', () => openPlanModal());

    // Form submissions
    document.getElementById('dateForm').addEventListener('submit', handleDateSubmit);
    document.getElementById('recipeForm').addEventListener('submit', handleRecipeSubmit);
    document.getElementById('planForm').addEventListener('submit', handlePlanSubmit);
    document.getElementById('restaurantForm').addEventListener('submit', handleRestaurantSubmit);

    // Recipe URL parsing
    document.getElementById('parseRecipeBtn').addEventListener('click', handleRecipeUrlParse);
    document.getElementById('skipParseBtn').addEventListener('click', () => {
        closeModal('recipeUrlModal');
        openRecipeModalBlank();
    });

    // Confirm delete
    document.getElementById('confirmDeleteBtn').addEventListener('click', handleConfirmDelete);

    // Auth
    document.getElementById('googleSignInBtn').addEventListener('click', signInWithGoogle);
    document.getElementById('signOutBtn').addEventListener('click', signOut);
    document.getElementById('settingsBtn').addEventListener('click', () => openModal('settingsModal'));

    // Space management
    document.getElementById('createSpaceBtn').addEventListener('click', handleCreateSpace);
    document.getElementById('joinSpaceBtn').addEventListener('click', handleJoinSpace);
    document.getElementById('copyInviteBtn').addEventListener('click', handleCopyInviteCode);

    // Hamburger / menu drawer
    document.getElementById('hamburgerBtn').addEventListener('click', toggleDrawer);
    document.getElementById('closeDrawerBtn').addEventListener('click', toggleDrawer);
    document.getElementById('drawerBackdrop').addEventListener('click', toggleDrawer);
    document.getElementById('drawerBackBtn').addEventListener('click', goBackToMenu);

    // Interactive star ratings
    initStarRatings();

    // Custom tags inputs
    setupCustomTagsInput('dateCustomTagInput', 'dateCustomTagsDisplay', 'dateCustomTags');
    setupCustomTagsInput('recipeCustomTagInput', 'recipeCustomTagsDisplay', 'recipeCustomTags');
    setupCustomTagsInput('restaurantCustomTagInput', 'restaurantCustomTagsDisplay', 'restaurantCustomTags');
}

// ==========================================
// STAR RATING COMPONENT
// ==========================================
function initStarRatings() {
    document.querySelectorAll('.star-rating.interactive').forEach(container => {
        container.addEventListener('click', (e) => {
            const star = e.target.closest('.star');
            if (!star) return;
            const value = parseInt(star.dataset.value);
            const targetId = container.dataset.target;
            const input = document.getElementById(targetId);

            // Toggle: clicking same value clears it
            if (input.value === String(value)) {
                input.value = '';
                updateStarDisplay(container, 0);
            } else {
                input.value = value;
                updateStarDisplay(container, value);
            }
        });

        container.addEventListener('mouseenter', (e) => {
            container._hovering = true;
        });

        container.addEventListener('mouseleave', () => {
            container._hovering = false;
            const targetId = container.dataset.target;
            const currentVal = parseInt(document.getElementById(targetId).value) || 0;
            updateStarDisplay(container, currentVal);
        });

        container.addEventListener('mousemove', (e) => {
            const star = e.target.closest('.star');
            if (!star) return;
            const value = parseInt(star.dataset.value);
            updateStarDisplay(container, value);
        });
    });
}

function updateStarDisplay(container, value) {
    container.querySelectorAll('.star').forEach(star => {
        const v = parseInt(star.dataset.value);
        star.classList.toggle('filled', v <= value);
    });
}

function renderStars(rating) {
    if (!rating) return '';
    let html = '<div class="star-rating small">';
    for (let i = 1; i <= 5; i++) {
        html += '<span class="star' + (i <= rating ? ' filled' : '') + '">&#9733;</span>';
    }
    html += '</div>';
    return html;
}

// ==========================================
// TAB NAVIGATION
// ==========================================
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector('[data-tab="' + tab + '"]').classList.add('active');

    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.getElementById(tab === 'food' ? 'foodSection' : tab + 'Section').classList.add('active');
}

function switchFoodSubtab(subtab) {
    currentFoodSubtab = subtab;

    document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('[data-subtab="' + subtab + '"]').classList.add('active');

    document.querySelectorAll('.food-subsection').forEach(s => s.classList.remove('active'));
    document.getElementById(subtab + 'Subsection').classList.add('active');

    // Show/hide cook time filters based on sub-tab
    const show = subtab === 'recipes';
    document.querySelectorAll('.cook-time-filter').forEach(btn => {
        btn.style.display = show ? '' : 'none';
    });

    // Reset filter to all
    filterFood('all');
}

// ==========================================
// FILTER DATES
// ==========================================
function filterDates(filter) {
    document.querySelectorAll('#dateFilters .filter-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('#dateFilters [data-filter="' + filter + '"]').classList.add('active');

    const cards = document.querySelectorAll('.date-card');
    cards.forEach(card => {
        if (filter === 'all') {
            card.style.display = 'block';
        } else {
            const tags = card.dataset.tags ? card.dataset.tags.split(',') : [];
            card.style.display = tags.includes(filter) ? 'block' : 'none';
        }
    });
}

// ==========================================
// FILTER FOOD
// ==========================================
function filterFood(filter) {
    currentFoodFilter = filter;

    document.querySelectorAll('#foodFilters .filter-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector('#foodFilters [data-food-filter="' + filter + '"]');
    if (activeBtn) activeBtn.classList.add('active');

    const containerSel = currentFoodSubtab === 'recipes' ? '#recipesContainer' : '#restaurantsContainer';
    const cards = document.querySelectorAll(containerSel + ' > div');

    cards.forEach(card => {
        if (filter === 'all') {
            card.style.display = '';
            return;
        }

        if (filter === '4stars') {
            const rating = parseInt(card.dataset.rating) || 0;
            card.style.display = rating >= 4 ? '' : 'none';
            return;
        }

        if (['short', 'medium', 'long'].includes(filter)) {
            const cooktime = card.dataset.cooktime || '';
            card.style.display = cooktime === filter ? '' : 'none';
            return;
        }

        // Cuisine filter
        const cuisines = card.dataset.cuisine ? card.dataset.cuisine.split(',') : [];
        card.style.display = cuisines.includes(filter) ? '' : 'none';
    });
}

// ==========================================
// HAMBURGER / MENU DRAWER
// ==========================================
function toggleDrawer() {
    const drawer = document.getElementById('pastPlansDrawer');
    const backdrop = document.getElementById('drawerBackdrop');
    const isOpen = drawer.classList.contains('open');

    if (isOpen) {
        drawer.classList.remove('open');
        backdrop.classList.remove('visible');
    } else {
        renderDrawerMenu();
        drawer.classList.add('open');
        backdrop.classList.add('visible');
    }
}

function renderDrawerMenu() {
    const title = document.getElementById('drawerTitle');
    const backBtn = document.getElementById('drawerBackBtn');
    const container = document.getElementById('drawerContent');

    title.textContent = 'Menu';
    backBtn.style.display = 'none';

    container.innerHTML = '<div class="menu-options">' +
        '<div class="menu-option" onclick="showPastDates()">' +
            '<div class="menu-option-icon">📅</div>' +
            '<div class="menu-option-content">' +
                '<div class="menu-option-title">Past Dates</div>' +
                '<div class="menu-option-desc">View your completed plans</div>' +
            '</div>' +
            '<div class="menu-option-arrow">›</div>' +
        '</div>' +
        '<div class="menu-option" onclick="openCustomizeModal()">' +
            '<div class="menu-option-icon">🎨</div>' +
            '<div class="menu-option-content">' +
                '<div class="menu-option-title">Customize</div>' +
                '<div class="menu-option-desc">Add a GIF and sound to header</div>' +
            '</div>' +
            '<div class="menu-option-arrow">›</div>' +
        '</div>' +
    '</div>';
}

function showPastDates() {
    const title = document.getElementById('drawerTitle');
    const backBtn = document.getElementById('drawerBackBtn');

    title.textContent = 'Past Dates';
    backBtn.style.display = 'block';

    renderPastPlans();
}

function goBackToMenu() {
    renderDrawerMenu();
}

function renderPastPlans() {
    const today = new Date().toISOString().split('T')[0];
    const pastPlans = plans.filter(p => p.date && p.date < today);
    const container = document.getElementById('drawerContent');

    if (pastPlans.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No past dates yet!</p><small>Your completed plans will appear here</small></div>';
        return;
    }

    // Sort most recent first
    pastPlans.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    container.innerHTML = pastPlans.map(plan => {
        const planDates = (plan.dateIds || []).map(id => dates.find(d => d.id === id)).filter(Boolean);
        const planRecipes = (plan.recipeIds || []).map(id => recipes.find(r => r.id === id)).filter(Boolean);
        const planRestaurants = (plan.restaurantIds || []).map(id => restaurants.find(r => r.id === id)).filter(Boolean);

        return '<div class="past-plan-card" onclick="openPlanDetailModal(\'' + plan.id + '\')">' +
            '<div class="plan-title">' + escapeHtml(plan.title || 'Untitled') + '</div>' +
            '<div class="plan-date">' + formatDate(plan.date) + '</div>' +
            (planDates.length > 0 || planRecipes.length > 0 || planRestaurants.length > 0 ? '<div class="plan-items">' +
                planDates.map(d => '<span class="plan-item">' + escapeHtml(d.name) + '</span>').join('') +
                planRecipes.map(r => '<span class="plan-item recipe-item">' + escapeHtml(r.name) + '</span>').join('') +
                planRestaurants.map(r => '<span class="plan-item restaurant-item">' + escapeHtml(r.name) + '</span>').join('') +
            '</div>' : '') +
        '</div>';
    }).join('');
}

// ==========================================
// MODALS
// ==========================================
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    // Only restore scroll if no other modals are open
    const anyOpen = document.querySelector('.modal.active');
    if (!anyOpen) {
        document.body.style.overflow = '';
    }
}

// ==========================================
// DATE MODAL
// ==========================================
function openDateModal(dateData = null) {
    const form = document.getElementById('dateForm');
    const title = document.getElementById('dateModalTitle');

    form.reset();
    document.querySelectorAll('#dateForm .tags-selector input').forEach(cb => cb.checked = false);
    loadCustomTags([], 'dateCustomTagsDisplay', 'dateCustomTags');

    if (dateData) {
        title.textContent = 'Edit Date Idea';
        document.getElementById('dateId').value = dateData.id;
        document.getElementById('dateName').value = dateData.name || '';
        document.getElementById('dateLocation').value = dateData.location || '';
        document.getElementById('dateAddress').value = dateData.address || '';
        document.getElementById('dateNotes').value = dateData.notes || '';

        (dateData.tags || []).forEach(tag => {
            const cb = document.querySelector('#dateForm .tags-selector input[value="' + tag + '"]');
            if (cb) cb.checked = true;
        });

        loadCustomTags(dateData.customTags || [], 'dateCustomTagsDisplay', 'dateCustomTags');
    } else {
        title.textContent = 'Add Date Idea';
        document.getElementById('dateId').value = '';
    }

    openModal('dateModal');
}

// ==========================================
// RECIPE MODALS
// ==========================================
function openRecipeUrlModal() {
    document.getElementById('recipeUrlInput').value = '';
    document.getElementById('parseLoader').style.display = 'none';
    openModal('recipeUrlModal');
}

function openRecipeModalBlank() {
    const form = document.getElementById('recipeForm');
    form.reset();
    document.getElementById('recipeModalTitle').textContent = 'Add Recipe';
    document.getElementById('recipeId').value = '';
    document.getElementById('recipeImageUrl').value = '';
    document.getElementById('recipeTotalTimeMinutes').value = '';
    document.getElementById('recipeRating').value = '';
    document.getElementById('recipeImagePreview').style.display = 'none';
    document.querySelectorAll('#recipeCuisineTags input').forEach(cb => cb.checked = false);
    loadCustomTags([], 'recipeCustomTagsDisplay', 'recipeCustomTags');
    updateStarDisplay(document.getElementById('recipeStarRating'), 0);
    openModal('recipeModal');
}

function openRecipeModal(recipeData = null) {
    if (!recipeData) {
        openRecipeUrlModal();
        return;
    }

    const form = document.getElementById('recipeForm');
    const title = document.getElementById('recipeModalTitle');
    form.reset();

    title.textContent = 'Edit Recipe';
    document.getElementById('recipeId').value = recipeData.id;
    document.getElementById('recipeName').value = recipeData.name || '';
    document.getElementById('recipeTime').value = recipeData.time || '';
    document.getElementById('recipeServings').value = recipeData.servings || '';
    document.getElementById('recipeIngredients').value = (recipeData.ingredients || []).join('\n');
    document.getElementById('recipeInstructions').value = recipeData.instructions || '';
    document.getElementById('recipeLink').value = recipeData.link || '';
    document.getElementById('recipeImageUrl').value = recipeData.imageUrl || '';
    document.getElementById('recipeTotalTimeMinutes').value = recipeData.totalTimeMinutes || '';
    document.getElementById('recipeRating').value = recipeData.rating || '';

    // Image preview
    if (recipeData.imageUrl) {
        document.getElementById('recipePreviewImg').src = recipeData.imageUrl;
        document.getElementById('recipeImagePreview').style.display = '';
    } else {
        document.getElementById('recipeImagePreview').style.display = 'none';
    }

    // Cuisine tags
    document.querySelectorAll('#recipeCuisineTags input').forEach(cb => cb.checked = false);
    (recipeData.cuisine || []).forEach(c => {
        const cb = document.querySelector('#recipeCuisineTags input[value="' + c + '"]');
        if (cb) cb.checked = true;
    });

    // Custom tags
    loadCustomTags(recipeData.customTags || [], 'recipeCustomTagsDisplay', 'recipeCustomTags');

    // Star rating
    updateStarDisplay(document.getElementById('recipeStarRating'), recipeData.rating || 0);

    openModal('recipeModal');
}

async function handleRecipeUrlParse() {
    const url = document.getElementById('recipeUrlInput').value.trim();
    if (!url) {
        closeModal('recipeUrlModal');
        openRecipeModalBlank();
        return;
    }

    const loader = document.getElementById('parseLoader');
    const buttons = document.querySelector('#recipeUrlModal .form-actions');
    loader.style.display = '';
    buttons.style.display = 'none';

    try {
        const response = await fetch(RECIPE_PARSER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await response.json();

        if (data.error) throw new Error(data.error);

        closeModal('recipeUrlModal');
        populateRecipeFromParsed(data);
        openModal('recipeModal');
        showToast('Recipe parsed successfully!', 'success');
    } catch (error) {
        console.error('Recipe parse error:', error);
        showToast('Could not parse recipe. Enter details manually.', 'warning');
        closeModal('recipeUrlModal');
        openRecipeModalBlank();
    } finally {
        loader.style.display = 'none';
        buttons.style.display = '';
    }
}

function populateRecipeFromParsed(data) {
    const form = document.getElementById('recipeForm');
    form.reset();
    document.getElementById('recipeModalTitle').textContent = 'Add Recipe';
    document.getElementById('recipeId').value = '';
    document.getElementById('recipeName').value = data.name || '';
    document.getElementById('recipeTime').value = data.total_time ? data.total_time + ' min' : '';
    document.getElementById('recipeServings').value = data.yields || '';
    document.getElementById('recipeIngredients').value = (data.ingredients || []).join('\n');
    document.getElementById('recipeInstructions').value = (data.instructions || []).join('\n\n');
    document.getElementById('recipeLink').value = data.url || '';
    document.getElementById('recipeImageUrl').value = data.image || '';
    document.getElementById('recipeTotalTimeMinutes').value = data.total_time || '';
    document.getElementById('recipeRating').value = '';

    // Image preview
    if (data.image) {
        document.getElementById('recipePreviewImg').src = data.image;
        document.getElementById('recipeImagePreview').style.display = '';
    } else {
        document.getElementById('recipeImagePreview').style.display = 'none';
    }

    // Auto-tag cuisine
    document.querySelectorAll('#recipeCuisineTags input').forEach(cb => cb.checked = false);
    if (data.cuisine) {
        const cuisineLower = data.cuisine.toLowerCase();
        const cb = document.querySelector('#recipeCuisineTags input[value="' + cuisineLower + '"]');
        if (cb) cb.checked = true;
    }

    updateStarDisplay(document.getElementById('recipeStarRating'), 0);
}

// ==========================================
// RESTAURANT MODAL
// ==========================================
function openRestaurantModal(restData = null) {
    const form = document.getElementById('restaurantForm');
    const title = document.getElementById('restaurantModalTitle');
    form.reset();
    document.querySelectorAll('#restaurantCuisineTags input').forEach(cb => cb.checked = false);
    document.getElementById('restaurantRating').value = '';
    updateStarDisplay(document.getElementById('restaurantStarRating'), 0);
    loadCustomTags([], 'restaurantCustomTagsDisplay', 'restaurantCustomTags');

    if (restData) {
        title.textContent = 'Edit Restaurant';
        document.getElementById('restaurantId').value = restData.id;
        document.getElementById('restaurantName').value = restData.name || '';
        document.getElementById('restaurantLocation').value = restData.location || '';
        document.getElementById('restaurantAddress').value = restData.address || '';
        document.getElementById('restaurantImageUrl').value = restData.imageUrl || '';
        document.getElementById('restaurantNotes').value = restData.notes || '';
        document.getElementById('restaurantRating').value = restData.rating || '';

        (restData.cuisine || []).forEach(c => {
            const cb = document.querySelector('#restaurantCuisineTags input[value="' + c + '"]');
            if (cb) cb.checked = true;
        });

        loadCustomTags(restData.customTags || [], 'restaurantCustomTagsDisplay', 'restaurantCustomTags');
        updateStarDisplay(document.getElementById('restaurantStarRating'), restData.rating || 0);
    } else {
        title.textContent = 'Add Restaurant';
        document.getElementById('restaurantId').value = '';
    }

    openModal('restaurantModal');
}

function openPlanModal() {
    document.getElementById('planForm').reset();
    document.getElementById('planId').value = '';
    updateDateSelectorList();
    openModal('planModal');
}

function openPlanModalForEdit(planData) {
    document.getElementById('planForm').reset();
    document.getElementById('planId').value = planData.id;
    document.getElementById('planDate').value = planData.date || '';
    document.getElementById('planTime').value = planData.time || '';
    document.getElementById('planTitle').value = planData.title || '';
    document.getElementById('planNotes').value = planData.notes || '';

    updateDateSelectorList();

    (planData.dateIds || []).forEach(id => {
        const checkbox = document.querySelector('#dateSelectorList input[value="' + id + '"]');
        if (checkbox) checkbox.checked = true;
    });

    (planData.recipeIds || []).forEach(id => {
        const checkbox = document.querySelector('#recipeSelectorList input[value="' + id + '"]');
        if (checkbox) checkbox.checked = true;
    });

    (planData.restaurantIds || []).forEach(id => {
        const checkbox = document.querySelector('#restaurantSelectorList input[value="' + id + '"]');
        if (checkbox) checkbox.checked = true;
    });

    openModal('planModal');
}

function updateDateSelectorList() {
    const container = document.getElementById('dateSelectorList');

    if (dates.length === 0) {
        container.innerHTML = '<p style="padding: 10px; color: #888;">No date ideas yet.</p>';
    } else {
        container.innerHTML = dates.map(date =>
            '<label class="date-select-option">' +
                '<input type="checkbox" value="' + date.id + '">' +
                '<span>' + escapeHtml(date.name) + '</span>' +
            '</label>'
        ).join('');
    }

    updateRecipeSelectorList();
    updateRestaurantSelectorList();
}

function updateRecipeSelectorList() {
    const container = document.getElementById('recipeSelectorList');

    if (recipes.length === 0) {
        container.innerHTML = '<p style="padding: 10px; color: #888;">No recipes yet.</p>';
    } else {
        container.innerHTML = recipes.map(recipe =>
            '<label class="date-select-option">' +
                '<input type="checkbox" value="' + recipe.id + '">' +
                '<span>' + escapeHtml(recipe.name) + '</span>' +
            '</label>'
        ).join('');
    }
}

function updateRestaurantSelectorList() {
    const container = document.getElementById('restaurantSelectorList');

    if (restaurants.length === 0) {
        container.innerHTML = '<p style="padding: 10px; color: #888;">No restaurants yet.</p>';
    } else {
        container.innerHTML = restaurants.map(r =>
            '<label class="date-select-option">' +
                '<input type="checkbox" value="' + r.id + '">' +
                '<span>' + escapeHtml(r.name) + '</span>' +
            '</label>'
        ).join('');
    }
}

// ==========================================
// PLAN DETAIL MODAL
// ==========================================
function openPlanDetailModal(planId) {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;

    // Close drawer if open
    const drawer = document.getElementById('pastPlansDrawer');
    if (drawer.classList.contains('open')) toggleDrawer();

    const planDates = (plan.dateIds || []).map(id => dates.find(d => d.id === id)).filter(Boolean);
    const planRecipes = (plan.recipeIds || []).map(id => recipes.find(r => r.id === id)).filter(Boolean);
    const planRestaurants = (plan.restaurantIds || []).map(id => restaurants.find(r => r.id === id)).filter(Boolean);

    const formattedDate = plan.date ? formatDate(plan.date) : 'TBD';
    const timeStr = plan.time ? ' at ' + formatTime(plan.time) : '';

    let html = '<div class="plan-detail-header">';
    if (plan.title) html += '<h2>' + escapeHtml(plan.title) + '</h2>';
    html += '<p class="plan-detail-date">' + formattedDate + timeStr + '</p>';
    html += '</div>';

    if (planDates.length > 0) {
        html += '<p class="plan-detail-section-label">Date Ideas</p>';
        planDates.forEach(d => {
            html += '<div class="plan-detail-item" onclick="openItemDetail(\'date\', \'' + d.id + '\')">' +
                '<span class="item-icon">📍</span>' +
                '<span class="item-name">' + escapeHtml(d.name) + '</span>' +
                '<span class="chevron">›</span>' +
            '</div>';
        });
    }

    if (planRecipes.length > 0) {
        html += '<p class="plan-detail-section-label">Recipes</p>';
        planRecipes.forEach(r => {
            html += '<div class="plan-detail-item" onclick="openItemDetail(\'recipe\', \'' + r.id + '\', \'' + plan.id + '\')">' +
                '<span class="item-icon">🍳</span>' +
                '<span class="item-name">' + escapeHtml(r.name) + '</span>' +
                '<span class="chevron">›</span>' +
            '</div>';
        });
    }

    if (planRestaurants.length > 0) {
        html += '<p class="plan-detail-section-label">Restaurants</p>';
        planRestaurants.forEach(r => {
            html += '<div class="plan-detail-item" onclick="openItemDetail(\'restaurant\', \'' + r.id + '\')">' +
                '<span class="item-icon">🍽️</span>' +
                '<span class="item-name">' + escapeHtml(r.name) + '</span>' +
                '<span class="chevron">›</span>' +
            '</div>';
        });
    }

    if (plan.notes) {
        html += '<div class="plan-detail-notes">' + escapeHtml(plan.notes) + '</div>';
    }

    document.getElementById('planDetailContent').innerHTML = html;
    document.getElementById('planDetailTitle').textContent = plan.title || 'Plan Details';
    openModal('planDetailModal');
}

// ==========================================
// ITEM DETAIL MODAL (nested)
// ==========================================
function openItemDetail(type, id, planId) {
    const container = document.getElementById('itemDetailContent');
    let html = '';

    if (type === 'date') {
        const d = dates.find(x => x.id === id);
        if (!d) return;

        document.getElementById('itemDetailTitle').textContent = d.name;
        const mapsLink = getMapsLink(d.address || d.location);

        html += '<div class="item-detail-title">' + escapeHtml(d.name) + '</div>';
        if (d.location) {
            html += '<a href="' + mapsLink + '" target="_blank" class="date-location" onclick="event.stopPropagation()">' +
                '📍 ' + escapeHtml(d.location) + '</a>';
        }
        if (d.tags && d.tags.length > 0) {
            html += '<div class="item-detail-tags">' +
                d.tags.map(tag => '<span class="tag ' + tag + '">' + tag + '</span>').join('') +
            '</div>';
        }
        if (d.notes) {
            html += '<p style="color: var(--text-light); line-height: 1.6;">' + escapeHtml(d.notes) + '</p>';
        }

    } else if (type === 'recipe') {
        const r = recipes.find(x => x.id === id);
        if (!r) return;

        document.getElementById('itemDetailTitle').textContent = r.name;
        const plan = planId ? plans.find(p => p.id === planId) : null;
        const checkedIngredients = plan && plan.ingredientChecks ? (plan.ingredientChecks[id] || []) : [];
        const cookTimeTag = r.cookTimeTag || getCookTimeTag(r.totalTimeMinutes);
        const allTags = [...(r.cuisine || []), ...(r.customTags || [])];

        // Header with thumbnail image and title
        html += '<div class="recipe-header-with-thumb">';
        if (r.imageUrl) {
            html += '<img src="' + escapeHtml(r.imageUrl) + '" class="recipe-thumbnail" onerror="this.style.display=\'none\'" alt="">';
        }
        html += '<div class="recipe-header-info">';
        html += '<div class="item-detail-title">' + escapeHtml(r.name) + '</div>';
        html += renderStars(r.rating);
        html += '<div class="item-detail-meta">';
        if (r.time) html += '<span>⏱️ ' + escapeHtml(r.time) + '</span>';
        if (r.servings) html += '<span>👥 ' + escapeHtml(r.servings) + '</span>';
        html += '</div>';
        html += '</div>';
        html += '</div>';

        if (allTags.length > 0 || cookTimeTag) {
            html += '<div class="item-detail-tags">' +
                (r.cuisine || []).map(c => '<span class="tag ' + c + '">' + c + '</span>').join('') +
                (cookTimeTag ? '<span class="tag ' + getCookTimeTagClass(cookTimeTag) + '">' + cookTimeTag + '</span>' : '') +
                (r.customTags || []).map(t => '<span class="custom-tag-chip">' + escapeHtml(t) + '</span>').join('') +
            '</div>';
        }

        // Two-column layout: ingredients + instructions
        const instructionsList = getInstructionsList(r);

        html += '<div class="recipe-two-column" id="recipeTwoColumn">';

        // Ingredients column
        html += '<div class="recipe-col-ingredients" style="flex: 1;">';
        html += '<div class="section-header">';
        html += '<h3>Ingredients</h3>';
        if (planId) {
            html += '<div class="font-control-inline">' +
                '<button onclick="adjustFontSize(\'ingredients\', -1)" class="font-btn-mini">−</button>' +
                '<button onclick="adjustFontSize(\'ingredients\', 1)" class="font-btn-mini">+</button>' +
            '</div>';
        }
        html += '</div>';
        if (r.ingredients && r.ingredients.length > 0) {
            html += '<ul class="checkable-ingredients">';
            r.ingredients.forEach(ing => {
                const escaped = escapeHtml(ing);
                const checked = checkedIngredients.includes(ing) ? ' checked' : '';
                const onchange = planId ?
                    ' onchange="toggleIngredientCheck(\'' + planId + '\', \'' + id + '\', this)"' : '';
                html += '<li><label class="ingredient-check">' +
                    '<input type="checkbox"' + checked + ' data-ingredient="' + escaped + '"' + onchange + '>' +
                    '<span>' + escaped + '</span>' +
                '</label></li>';
            });
            html += '</ul>';
        }
        html += '</div>';

        // Draggable divider
        if (planId) {
            html += '<div class="column-divider" onmousedown="initColumnResize(event)"></div>';
        }

        // Instructions column
        html += '<div class="recipe-col-instructions" style="flex: 1;">';
        html += '<div class="section-header">';
        html += '<h3>Instructions</h3>';
        if (planId) {
            html += '<div class="font-control-inline">' +
                '<button onclick="adjustFontSize(\'instructions\', -1)" class="font-btn-mini">−</button>' +
                '<button onclick="adjustFontSize(\'instructions\', 1)" class="font-btn-mini">+</button>' +
            '</div>';
        }
        html += '</div>';
        if (instructionsList.length > 0) {
            html += '<ol class="instructions-list">';
            instructionsList.forEach(step => {
                html += '<li>' + escapeHtml(step) + '</li>';
            });
            html += '</ol>';
        }
        if (r.link) {
            html += '<a href="' + escapeHtml(r.link) + '" target="_blank" class="recipe-link" onclick="event.stopPropagation()">🔗 View full recipe</a>';
        }
        html += '</div>';

        html += '</div>';

    } else if (type === 'restaurant') {
        const r = restaurants.find(x => x.id === id);
        if (!r) return;

        document.getElementById('itemDetailTitle').textContent = r.name;
        const mapsLink = getMapsLink(r.address || r.location);

        if (r.imageUrl) {
            html += '<img src="' + escapeHtml(r.imageUrl) + '" class="item-detail-image" onerror="this.style.display=\'none\'" alt="">';
        }

        html += '<div class="item-detail-title">' + escapeHtml(r.name) + '</div>';
        html += renderStars(r.rating);

        if (r.location) {
            html += '<a href="' + mapsLink + '" target="_blank" class="date-location" onclick="event.stopPropagation()">' +
                '📍 ' + escapeHtml(r.location) + '</a>';
        }

        if (r.cuisine && r.cuisine.length > 0) {
            html += '<div class="item-detail-tags" style="margin-top:12px;">' +
                r.cuisine.map(c => '<span class="tag ' + c + '">' + c + '</span>').join('') +
            '</div>';
        }

        if (r.notes) {
            html += '<p style="color: var(--text-light); line-height: 1.6; margin-top: 12px;">' + escapeHtml(r.notes) + '</p>';
        }
    }

    container.innerHTML = html;
    openModal('itemDetailModal');
}

// ==========================================
// CHECKABLE INGREDIENTS
// ==========================================
async function toggleIngredientCheck(planId, recipeId, checkbox) {
    const ingredient = checkbox.dataset.ingredient;
    const checked = checkbox.checked;
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;

    if (!plan.ingredientChecks) plan.ingredientChecks = {};
    if (!plan.ingredientChecks[recipeId]) plan.ingredientChecks[recipeId] = [];

    if (checked) {
        if (!plan.ingredientChecks[recipeId].includes(ingredient)) {
            plan.ingredientChecks[recipeId].push(ingredient);
        }
    } else {
        plan.ingredientChecks[recipeId] = plan.ingredientChecks[recipeId].filter(i => i !== ingredient);
    }

    if (db && currentSpaceId) {
        try {
            await getCollectionRef('plans').doc(planId).update({
                ingredientChecks: plan.ingredientChecks
            });
        } catch (e) {
            console.error('Error saving ingredient check:', e);
        }
    }
    saveToLocalStorage();
}

// ==========================================
// FORM HANDLERS
// ==========================================
async function handleDateSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('dateId').value;
    const tags = Array.from(document.querySelectorAll('#dateForm .tags-selector input:checked')).map(cb => cb.value);
    const customTags = document.getElementById('dateCustomTags').value ? JSON.parse(document.getElementById('dateCustomTags').value) : [];

    const dateData = {
        name: document.getElementById('dateName').value.trim(),
        location: document.getElementById('dateLocation').value.trim(),
        address: document.getElementById('dateAddress').value.trim(),
        notes: document.getElementById('dateNotes').value.trim(),
        tags: tags,
        customTags: customTags,
        updatedAt: new Date().toISOString()
    };

    try {
        updateSyncStatus('syncing');

        if (db && currentSpaceId) {
            const ref = getCollectionRef('dates');
            if (id) {
                await ref.doc(id).update(dateData);
            } else {
                dateData.createdAt = new Date().toISOString();
                dateData.addedBy = currentUser.uid;
                await ref.add(dateData);
            }
        } else {
            if (id) {
                const index = dates.findIndex(d => d.id === id);
                if (index !== -1) dates[index] = { ...dates[index], ...dateData };
            } else {
                dateData.id = 'local_' + Date.now();
                dateData.createdAt = new Date().toISOString();
                dates.unshift(dateData);
            }
            saveToLocalStorage();
            renderDates();
            updateDateSelectorList();
        }

    } catch (error) {
        console.error("Error saving date:", error);
        showToast("Failed to save. Please try again.", 'error');
    } finally {
        closeModal('dateModal');
    }
}

async function handleRecipeSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('recipeId').value;
    const ingredientsText = document.getElementById('recipeIngredients').value;
    const cuisine = Array.from(document.querySelectorAll('#recipeCuisineTags input:checked')).map(cb => cb.value);
    const rating = parseInt(document.getElementById('recipeRating').value) || null;
    const totalTimeMinutes = parseInt(document.getElementById('recipeTotalTimeMinutes').value) || null;
    const customTags = document.getElementById('recipeCustomTags').value ? JSON.parse(document.getElementById('recipeCustomTags').value) : [];

    const recipeData = {
        name: document.getElementById('recipeName').value.trim(),
        time: document.getElementById('recipeTime').value.trim(),
        servings: document.getElementById('recipeServings').value.trim(),
        ingredients: ingredientsText.split('\n').map(i => i.trim()).filter(i => i),
        instructions: document.getElementById('recipeInstructions').value.trim(),
        link: document.getElementById('recipeLink').value.trim(),
        imageUrl: document.getElementById('recipeImageUrl').value.trim(),
        cuisine: cuisine,
        customTags: customTags,
        rating: rating,
        totalTimeMinutes: totalTimeMinutes,
        cookTimeTag: getCookTimeTag(totalTimeMinutes),
        updatedAt: new Date().toISOString()
    };

    try {
        updateSyncStatus('syncing');

        if (db && currentSpaceId) {
            const ref = getCollectionRef('recipes');
            if (id) {
                await ref.doc(id).update(recipeData);
            } else {
                recipeData.createdAt = new Date().toISOString();
                recipeData.addedBy = currentUser.uid;
                await ref.add(recipeData);
            }
        } else {
            if (id) {
                const index = recipes.findIndex(r => r.id === id);
                if (index !== -1) recipes[index] = { ...recipes[index], ...recipeData };
            } else {
                recipeData.id = 'local_' + Date.now();
                recipeData.createdAt = new Date().toISOString();
                recipes.unshift(recipeData);
            }
            saveToLocalStorage();
            renderRecipes();
        }

    } catch (error) {
        console.error("Error saving recipe:", error);
        showToast("Failed to save. Please try again.", 'error');
    } finally {
        closeModal('recipeModal');
    }
}

async function handleRestaurantSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('restaurantId').value;
    const cuisine = Array.from(document.querySelectorAll('#restaurantCuisineTags input:checked')).map(cb => cb.value);
    const rating = parseInt(document.getElementById('restaurantRating').value) || null;
    const customTags = document.getElementById('restaurantCustomTags').value ? JSON.parse(document.getElementById('restaurantCustomTags').value) : [];

    const restData = {
        name: document.getElementById('restaurantName').value.trim(),
        cuisine: cuisine,
        customTags: customTags,
        location: document.getElementById('restaurantLocation').value.trim(),
        address: document.getElementById('restaurantAddress').value.trim(),
        imageUrl: document.getElementById('restaurantImageUrl').value.trim(),
        rating: rating,
        notes: document.getElementById('restaurantNotes').value.trim(),
        updatedAt: new Date().toISOString()
    };

    try {
        updateSyncStatus('syncing');

        if (db && currentSpaceId) {
            const ref = getCollectionRef('restaurants');
            if (id) {
                await ref.doc(id).update(restData);
            } else {
                restData.createdAt = new Date().toISOString();
                restData.addedBy = currentUser.uid;
                await ref.add(restData);
            }
        } else {
            if (id) {
                const index = restaurants.findIndex(r => r.id === id);
                if (index !== -1) restaurants[index] = { ...restaurants[index], ...restData };
            } else {
                restData.id = 'local_' + Date.now();
                restData.createdAt = new Date().toISOString();
                restaurants.unshift(restData);
            }
            saveToLocalStorage();
            renderRestaurants();
        }

    } catch (error) {
        console.error("Error saving restaurant:", error);
        showToast("Failed to save. Please try again.", 'error');
    } finally {
        closeModal('restaurantModal');
    }
}

async function handlePlanSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('planId').value;
    const selectedDateIds = Array.from(document.querySelectorAll('#dateSelectorList input:checked')).map(cb => cb.value);
    const selectedRecipeIds = Array.from(document.querySelectorAll('#recipeSelectorList input:checked')).map(cb => cb.value);
    const selectedRestaurantIds = Array.from(document.querySelectorAll('#restaurantSelectorList input:checked')).map(cb => cb.value);
    const title = document.getElementById('planTitle').value.trim();

    const planData = {
        date: document.getElementById('planDate').value,
        time: document.getElementById('planTime').value,
        title: title,
        dateIds: selectedDateIds,
        recipeIds: selectedRecipeIds,
        restaurantIds: selectedRestaurantIds,
        notes: document.getElementById('planNotes').value.trim(),
        updatedAt: new Date().toISOString()
    };

    try {
        updateSyncStatus('syncing');

        if (db && currentSpaceId) {
            const ref = getCollectionRef('plans');
            if (id) {
                await ref.doc(id).update(planData);
            } else {
                planData.createdAt = new Date().toISOString();
                planData.addedBy = currentUser.uid;
                await ref.add(planData);
            }
        } else {
            if (id) {
                const index = plans.findIndex(p => p.id === id);
                if (index !== -1) plans[index] = { ...plans[index], ...planData };
            } else {
                planData.id = 'local_' + Date.now();
                planData.createdAt = new Date().toISOString();
                plans.push(planData);
            }
            plans.sort((a, b) => (a.date || 'z').localeCompare(b.date || 'z'));
            saveToLocalStorage();
            renderPlans();
        }

    } catch (error) {
        console.error("Error saving plan:", error);
        showToast("Failed to save. Please try again.", 'error');
    } finally {
        closeModal('planModal');
    }
}

// ==========================================
// DELETE HANDLING
// ==========================================
let pendingDelete = null;

function confirmDelete(type, id, name) {
    pendingDelete = { type, id };
    document.getElementById('confirmMessage').textContent = 'Are you sure you want to delete "' + name + '"?';
    openModal('confirmModal');
}

async function handleConfirmDelete() {
    if (!pendingDelete) return;

    const { type, id } = pendingDelete;

    try {
        updateSyncStatus('syncing');

        if (db && currentSpaceId) {
            await getCollectionRef(type).doc(id).delete();
        } else {
            if (type === 'dates') {
                dates = dates.filter(d => d.id !== id);
                renderDates();
            } else if (type === 'recipes') {
                recipes = recipes.filter(r => r.id !== id);
                renderRecipes();
            } else if (type === 'plans') {
                plans = plans.filter(p => p.id !== id);
                renderPlans();
            } else if (type === 'restaurants') {
                restaurants = restaurants.filter(r => r.id !== id);
                renderRestaurants();
            }
            saveToLocalStorage();
        }

    } catch (error) {
        console.error("Error deleting:", error);
        showToast("Failed to delete. Please try again.", 'error');
    } finally {
        closeModal('confirmModal');
        pendingDelete = null;
    }
}

// ==========================================
// RENDERING
// ==========================================
function renderAll() {
    renderDates();
    renderRecipes();
    renderPlans();
    renderRestaurants();
}

function renderDates() {
    const container = document.getElementById('datesContainer');

    if (dates.length === 0) {
        container.innerHTML =
            '<div class="empty-state">' +
                '<p>No date ideas yet!</p>' +
                '<small>Tap the + button to add your first one</small>' +
            '</div>';
        return;
    }

    container.innerHTML = dates.map(date => {
        const mapsLink = getMapsLink(date.address || date.location);
        const allTags = [...(date.tags || []), ...(date.customTags || [])];

        return '<div class="date-card" data-tags="' + (date.tags || []).join(',') + '">' +
            '<div class="date-card-header">' +
                '<div>' +
                    '<h3>' + escapeHtml(date.name) + '</h3>' +
                    (date.location ? '<a href="' + mapsLink + '" target="_blank" class="date-location">📍 ' + escapeHtml(date.location) + '</a>' : '') +
                '</div>' +
                '<div class="card-actions">' +
                    '<button class="card-action-btn" onclick="openDateModal(' + JSON.stringify(date).replace(/"/g, '&quot;') + ')">✏️</button>' +
                    '<button class="card-action-btn" onclick="confirmDelete(\'dates\', \'' + date.id + '\', \'' + escapeHtml(date.name).replace(/'/g, "\\'") + '\')">🗑️</button>' +
                '</div>' +
            '</div>' +
            (date.notes ? '<p class="date-notes">' + escapeHtml(date.notes) + '</p>' : '') +
            (allTags.length > 0 ?
                '<div class="date-tags">' +
                    (date.tags || []).map(tag => '<span class="tag ' + tag + '">' + tag + '</span>').join('') +
                    (date.customTags || []).map(t => '<span class="custom-tag-chip">' + escapeHtml(t) + '</span>').join('') +
                '</div>'
            : '') +
        '</div>';
    }).join('');
}

function renderRecipes() {
    const container = document.getElementById('recipesContainer');

    if (recipes.length === 0) {
        container.innerHTML =
            '<div class="empty-state">' +
                '<p>No recipes yet!</p>' +
                '<small>Tap the + button to add your first one</small>' +
            '</div>';
        return;
    }

    container.innerHTML = recipes.map(recipe => {
        const cookTimeTag = recipe.cookTimeTag || getCookTimeTag(recipe.totalTimeMinutes);
        const cuisineStr = (recipe.cuisine || []).join(',');
        const allTags = [...(recipe.cuisine || []), ...(recipe.customTags || [])];

        return '<div class="recipe-card" onclick="openRecipeDetail(\'' + recipe.id + '\')" data-cuisine="' + cuisineStr + '" data-cooktime="' + (cookTimeTag || '') + '" data-rating="' + (recipe.rating || '') + '">' +
            (recipe.imageUrl ? '<img src="' + escapeHtml(recipe.imageUrl) + '" class="recipe-card-image" onerror="this.style.display=\'none\'" alt="">' : '') +
            '<div class="recipe-card-body">' +
                '<div class="recipe-card-header">' +
                    '<div>' +
                        '<h3>' + escapeHtml(recipe.name) + '</h3>' +
                        renderStars(recipe.rating) +
                    '</div>' +
                    '<div class="card-actions">' +
                        '<button class="card-action-btn" onclick="event.stopPropagation(); openRecipeModal(' + JSON.stringify(recipe).replace(/"/g, '&quot;') + ')">✏️</button>' +
                        '<button class="card-action-btn" onclick="event.stopPropagation(); confirmDelete(\'recipes\', \'' + recipe.id + '\', \'' + escapeHtml(recipe.name).replace(/'/g, "\\'") + '\')">🗑️</button>' +
                    '</div>' +
                '</div>' +
                '<div class="recipe-meta">' +
                    (recipe.time ? '<span>⏱️ ' + escapeHtml(recipe.time) + '</span>' : '') +
                    (recipe.servings ? '<span>👥 ' + escapeHtml(recipe.servings) + '</span>' : '') +
                '</div>' +
                (allTags.length > 0 || cookTimeTag ?
                    '<div class="recipe-tags">' +
                        (recipe.cuisine || []).map(c => '<span class="tag ' + c + '">' + c + '</span>').join('') +
                        (cookTimeTag ? '<span class="tag ' + getCookTimeTagClass(cookTimeTag) + '">' + cookTimeTag + '</span>' : '') +
                        (recipe.customTags || []).map(t => '<span class="custom-tag-chip">' + escapeHtml(t) + '</span>').join('') +
                    '</div>'
                : '') +
                '<p class="food-card-hint">Tap for full details</p>' +
            '</div>' +
        '</div>';
    }).join('');
}

function renderRestaurants() {
    const container = document.getElementById('restaurantsContainer');

    if (restaurants.length === 0) {
        container.innerHTML =
            '<div class="empty-state">' +
                '<p>No restaurants yet!</p>' +
                '<small>Tap the + button to add your first one</small>' +
            '</div>';
        return;
    }

    container.innerHTML = restaurants.map(r => {
        const cuisineStr = (r.cuisine || []).join(',');
        const allTags = [...(r.cuisine || []), ...(r.customTags || [])];

        return '<div class="restaurant-card" onclick="openRestaurantDetail(\'' + r.id + '\')" data-cuisine="' + cuisineStr + '" data-rating="' + (r.rating || '') + '">' +
            (r.imageUrl ? '<img src="' + escapeHtml(r.imageUrl) + '" class="restaurant-card-image" onerror="this.style.display=\'none\'" alt="">' : '') +
            '<div class="restaurant-card-body">' +
                '<div class="restaurant-card-header">' +
                    '<div>' +
                        '<h3>' + escapeHtml(r.name) + '</h3>' +
                        renderStars(r.rating) +
                    '</div>' +
                    '<div class="card-actions">' +
                        '<button class="card-action-btn" onclick="event.stopPropagation(); openRestaurantModal(' + JSON.stringify(r).replace(/"/g, '&quot;') + ')">✏️</button>' +
                        '<button class="card-action-btn" onclick="event.stopPropagation(); confirmDelete(\'restaurants\', \'' + r.id + '\', \'' + escapeHtml(r.name).replace(/'/g, "\\'") + '\')">🗑️</button>' +
                    '</div>' +
                '</div>' +
                (r.location ? '<div class="restaurant-location">📍 ' + escapeHtml(r.location) + '</div>' : '') +
                (allTags.length > 0 ?
                    '<div class="restaurant-tags">' +
                        (r.cuisine || []).map(c => '<span class="tag ' + c + '">' + c + '</span>').join('') +
                        (r.customTags || []).map(t => '<span class="custom-tag-chip">' + escapeHtml(t) + '</span>').join('') +
                    '</div>'
                : '') +
                '<p class="food-card-hint">Tap for full details</p>' +
            '</div>' +
        '</div>';
    }).join('');
}

function renderPlans() {
    const container = document.getElementById('plansContainer');

    const today = new Date().toISOString().split('T')[0];
    const upcomingPlans = plans.filter(p => !p.date || p.date >= today);

    if (upcomingPlans.length === 0) {
        container.innerHTML =
            '<div class="empty-plans">' +
                '<p>No upcoming plans yet!</p>' +
                '<small>Add a date from your ideas</small>' +
            '</div>';
        return;
    }

    container.innerHTML = upcomingPlans.map(plan => {
        const planDates = (plan.dateIds || []).map(id => dates.find(d => d.id === id)).filter(Boolean);
        const planRecipes = (plan.recipeIds || []).map(id => recipes.find(r => r.id === id)).filter(Boolean);
        const planRestaurants = (plan.restaurantIds || []).map(id => restaurants.find(r => r.id === id)).filter(Boolean);

        const formattedDate = plan.date ? formatDate(plan.date) : 'TBD';
        const timeStr = plan.time ? ' at ' + formatTime(plan.time) : '';

        return '<div class="plan-card">' +
            '<div class="plan-actions">' +
                '<button class="plan-action-btn" onclick="event.stopPropagation(); openPlanModalForEdit(' + JSON.stringify(plan).replace(/"/g, '&quot;') + ')">✏️</button>' +
                '<button class="plan-action-btn" onclick="event.stopPropagation(); confirmDelete(\'plans\', \'' + plan.id + '\', \'this plan\')">🗑️</button>' +
            '</div>' +
            (plan.title ? '<div class="plan-title">' + escapeHtml(plan.title) + '</div>' : '') +
            '<div class="plan-date">📅 ' + formattedDate + timeStr + '</div>' +

            // Date ideas with location preview
            (planDates.length > 0 ?
                '<div class="plan-preview-section">' +
                    planDates.map(d => {
                        const mapsLink = getMapsLink(d.address || d.location);
                        return '<div class="plan-preview-item" onclick="openItemDetail(\'date\', \'' + d.id + '\')">' +
                            '<div class="plan-preview-icon">📍</div>' +
                            '<div class="plan-preview-content">' +
                                '<div class="plan-preview-name">' + escapeHtml(d.name) + '</div>' +
                                (d.location ?
                                    '<a href="' + mapsLink + '" target="_blank" class="plan-preview-location" onclick="event.stopPropagation()">📌 ' + escapeHtml(d.location) + '</a>'
                                : '') +
                                (d.notes ? '<div class="plan-preview-notes">' + escapeHtml(d.notes.substring(0, 60)) + (d.notes.length > 60 ? '...' : '') + '</div>' : '') +
                            '</div>' +
                        '</div>';
                    }).join('') +
                '</div>'
            : '') +

            // Recipes with preview info
            (planRecipes.length > 0 ?
                '<div class="plan-preview-section">' +
                    planRecipes.map(r => {
                        return '<div class="plan-preview-item recipe" onclick="openItemDetail(\'recipe\', \'' + r.id + '\', \'' + plan.id + '\')">' +
                            '<div class="plan-preview-icon">🍳</div>' +
                            '<div class="plan-preview-content">' +
                                '<div class="plan-preview-name">' + escapeHtml(r.name) + '</div>' +
                                '<div class="plan-preview-meta">' +
                                    (r.time ? '<span>⏱️ ' + escapeHtml(r.time) + '</span>' : '') +
                                    (r.servings ? '<span>👥 ' + escapeHtml(r.servings) + '</span>' : '') +
                                    (r.rating ? renderStars(r.rating) : '') +
                                '</div>' +
                            '</div>' +
                        '</div>';
                    }).join('') +
                '</div>'
            : '') +

            // Restaurants
            (planRestaurants.length > 0 ?
                '<div class="plan-preview-section">' +
                    planRestaurants.map(r => {
                        const mapsLink = getMapsLink(r.address || r.location);
                        return '<div class="plan-preview-item restaurant" onclick="openItemDetail(\'restaurant\', \'' + r.id + '\')">' +
                            '<div class="plan-preview-icon">🍽️</div>' +
                            '<div class="plan-preview-content">' +
                                '<div class="plan-preview-name">' + escapeHtml(r.name) + '</div>' +
                                (r.location ?
                                    '<a href="' + mapsLink + '" target="_blank" class="plan-preview-location" onclick="event.stopPropagation()">📌 ' + escapeHtml(r.location) + '</a>'
                                : '') +
                                (r.rating ? '<div class="plan-preview-meta">' + renderStars(r.rating) + '</div>' : '') +
                            '</div>' +
                        '</div>';
                    }).join('') +
                '</div>'
            : '') +

            (plan.notes ? '<p class="plan-notes">' + escapeHtml(plan.notes) + '</p>' : '') +
        '</div>';
    }).join('');
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getMapsLink(address) {
    if (!address) return '#';
    if (address.startsWith('http')) return address;
    return 'https://maps.google.com/maps?q=' + encodeURIComponent(address);
}

function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

function formatTime(timeStr) {
    const [hours, minutes] = timeStr.split(':');
    const date = new Date();
    date.setHours(parseInt(hours), parseInt(minutes));
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function getCookTimeTag(minutes) {
    if (!minutes) return null;
    if (minutes <= 30) return 'short';
    if (minutes <= 60) return 'medium';
    return 'long';
}

function getCookTimeTagClass(tag) {
    if (tag === 'short') return 'short';
    if (tag === 'medium') return 'medium-time';
    return 'long-cook';
}

function getInstructionsList(recipe) {
    if (recipe.instructionsList && recipe.instructionsList.length > 0) {
        return recipe.instructionsList;
    }
    if (recipe.instructions) {
        return recipe.instructions.split('\n').filter(s => s.trim());
    }
    return [];
}

// ==========================================
// SERVICE WORKER
// ==========================================
function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker error:', err));
    }
}

// ==========================================
// FONT SIZE CONTROLS
// ==========================================
function setFontSize(target, size) {
    const container = target === 'ingredients'
        ? document.querySelector('.recipe-col-ingredients')
        : document.querySelector('.recipe-col-instructions');
    if (container) {
        if (target === 'ingredients') {
            // Scale text
            container.querySelectorAll('.ingredient-check span').forEach(el => {
                el.style.fontSize = size + 'px';
            });
            // Scale checkboxes proportionally (base size 20px at 14px font)
            const checkboxSize = Math.round((size / 14) * 20);
            container.querySelectorAll('.ingredient-check input[type="checkbox"]').forEach(el => {
                el.style.width = checkboxSize + 'px';
                el.style.height = checkboxSize + 'px';
            });
        } else {
            container.querySelectorAll('.instructions-list li').forEach(el => {
                el.style.fontSize = size + 'px';
            });
        }
    }
}

// Track current font sizes for mini buttons
const currentFontSizes = {
    ingredients: 14,
    instructions: 14
};

function adjustFontSize(target, delta) {
    const newValue = currentFontSizes[target] + delta;
    // Keep font size between 10 and 20px
    if (newValue >= 10 && newValue <= 20) {
        currentFontSizes[target] = newValue;
        setFontSize(target, newValue);
    }
}

// ==========================================
// RECIPE & RESTAURANT DETAIL VIEWS
// ==========================================
function openRecipeDetail(recipeId) {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;

    const modal = document.getElementById('itemDetailModal');
    const modalTitle = modal.querySelector('.modal-header h3');
    const modalBody = document.getElementById('itemDetailContent');

    modalTitle.textContent = recipe.name;

    const cookTimeTag = recipe.cookTimeTag || getCookTimeTag(recipe.totalTimeMinutes);
    const allTags = [...(recipe.cuisine || []), ...(recipe.customTags || [])];

    modalBody.innerHTML = '<div class="item-detail-content">' +
        (recipe.imageUrl ? '<img src="' + escapeHtml(recipe.imageUrl) + '" class="item-detail-image" onerror="this.style.display=\'none\'" alt="">' : '') +
        '<div class="item-detail-header">' +
            renderStars(recipe.rating) +
            '<div class="item-detail-meta">' +
                (recipe.time ? '<span>⏱️ ' + escapeHtml(recipe.time) + '</span>' : '') +
                (recipe.servings ? '<span>👥 ' + escapeHtml(recipe.servings) + '</span>' : '') +
            '</div>' +
        '</div>' +
        (allTags.length > 0 || cookTimeTag ?
            '<div class="item-detail-tags">' +
                (recipe.cuisine || []).map(c => '<span class="tag ' + c + '">' + c + '</span>').join('') +
                (cookTimeTag ? '<span class="tag ' + getCookTimeTagClass(cookTimeTag) + '">' + cookTimeTag + '</span>' : '') +
                (recipe.customTags || []).map(t => '<span class="custom-tag-chip">' + escapeHtml(t) + '</span>').join('') +
            '</div>'
        : '') +
        (recipe.ingredients && recipe.ingredients.length > 0 ?
            '<div class="item-detail-section">' +
                '<h4>Ingredients</h4>' +
                '<ul class="ingredients-list">' +
                    recipe.ingredients.map(ing => '<li>' + escapeHtml(ing) + '</li>').join('') +
                '</ul>' +
            '</div>'
        : '') +
        (recipe.instructions ?
            '<div class="item-detail-section">' +
                '<h4>Instructions</h4>' +
                '<div class="instructions-text">' + escapeHtml(recipe.instructions).replace(/\n/g, '<br>') + '</div>' +
            '</div>'
        : '') +
        (recipe.link ?
            '<div class="item-detail-section">' +
                '<a href="' + escapeHtml(recipe.link) + '" target="_blank" class="recipe-link">🔗 View original recipe</a>' +
            '</div>'
        : '') +
    '</div>';

    openModal('itemDetailModal');
}

function openRestaurantDetail(restaurantId) {
    const restaurant = restaurants.find(r => r.id === restaurantId);
    if (!restaurant) return;

    const modal = document.getElementById('itemDetailModal');
    const modalTitle = modal.querySelector('.modal-header h3');
    const modalBody = document.getElementById('itemDetailContent');

    modalTitle.textContent = restaurant.name;

    const mapsLink = getMapsLink(restaurant.address || restaurant.location);
    const allTags = [...(restaurant.cuisine || []), ...(restaurant.customTags || [])];

    modalBody.innerHTML = '<div class="item-detail-content">' +
        (restaurant.imageUrl ? '<img src="' + escapeHtml(restaurant.imageUrl) + '" class="item-detail-image" onerror="this.style.display=\'none\'" alt="">' : '') +
        '<div class="item-detail-header">' +
            renderStars(restaurant.rating) +
        '</div>' +
        (restaurant.location ?
            '<div class="item-detail-section">' +
                '<a href="' + mapsLink + '" target="_blank" class="restaurant-location">📍 ' + escapeHtml(restaurant.location) + '</a>' +
            '</div>'
        : '') +
        (restaurant.address ?
            '<div class="item-detail-section">' +
                '<p class="address-text">' + escapeHtml(restaurant.address) + '</p>' +
            '</div>'
        : '') +
        (allTags.length > 0 ?
            '<div class="item-detail-tags">' +
                (restaurant.cuisine || []).map(c => '<span class="tag ' + c + '">' + c + '</span>').join('') +
                (restaurant.customTags || []).map(t => '<span class="custom-tag-chip">' + escapeHtml(t) + '</span>').join('') +
            '</div>'
        : '') +
        (restaurant.notes ?
            '<div class="item-detail-section">' +
                '<h4>Notes</h4>' +
                '<p>' + escapeHtml(restaurant.notes) + '</p>' +
            '</div>'
        : '') +
    '</div>';

    openModal('itemDetailModal');
}

// ==========================================
// CUSTOM TAGS INPUT
// ==========================================
function setupCustomTagsInput(inputId, displayId, hiddenId) {
    const input = document.getElementById(inputId);
    const display = document.getElementById(displayId);
    const hidden = document.getElementById(hiddenId);

    if (!input || !display || !hidden) return;

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const tag = input.value.trim();
            if (tag) {
                addCustomTag(tag, displayId, hiddenId);
                input.value = '';
            }
        }
    });
}

function addCustomTag(tag, displayId, hiddenId) {
    const display = document.getElementById(displayId);
    const hidden = document.getElementById(hiddenId);

    const tags = hidden.value ? JSON.parse(hidden.value) : [];
    if (tags.includes(tag)) return; // Avoid duplicates

    tags.push(tag);
    hidden.value = JSON.stringify(tags);
    renderCustomTags(tags, displayId, hiddenId);
}

function removeCustomTag(tag, displayId, hiddenId) {
    const hidden = document.getElementById(hiddenId);
    let tags = hidden.value ? JSON.parse(hidden.value) : [];
    tags = tags.filter(t => t !== tag);
    hidden.value = JSON.stringify(tags);
    renderCustomTags(tags, displayId, hiddenId);
}

function renderCustomTags(tags, displayId, hiddenId) {
    const display = document.getElementById(displayId);
    display.innerHTML = tags.map(tag =>
        '<span class="custom-tag-chip">' +
            escapeHtml(tag) +
            '<span class="remove-tag" onclick="removeCustomTag(\'' + escapeHtml(tag) + '\', \'' + displayId + '\', \'' + hiddenId + '\')">&times;</span>' +
        '</span>'
    ).join('');
}

function loadCustomTags(tags, displayId, hiddenId) {
    const hidden = document.getElementById(hiddenId);
    hidden.value = JSON.stringify(tags || []);
    renderCustomTags(tags || [], displayId, hiddenId);
}

// ==========================================
// COLUMN RESIZE
// ==========================================
function initColumnResize(e) {
    e.preventDefault();
    const container = document.getElementById('recipeTwoColumn');
    const ingredientsCol = container.querySelector('.recipe-col-ingredients');
    const instructionsCol = container.querySelector('.recipe-col-instructions');
    const divider = e.target;

    const startX = e.clientX;
    const startWidthLeft = ingredientsCol.offsetWidth;
    const startWidthRight = instructionsCol.offsetWidth;
    const totalWidth = startWidthLeft + startWidthRight;

    function onMouseMove(e) {
        const deltaX = e.clientX - startX;
        const newLeftWidth = startWidthLeft + deltaX;
        const newRightWidth = totalWidth - newLeftWidth;

        // Prevent columns from getting too small (minimum 150px)
        if (newLeftWidth >= 150 && newRightWidth >= 150) {
            const leftFlex = newLeftWidth / totalWidth;
            const rightFlex = newRightWidth / totalWidth;
            ingredientsCol.style.flex = leftFlex;
            instructionsCol.style.flex = rightFlex;
        }
    }

    function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        divider.classList.remove('dragging');
    }

    divider.classList.add('dragging');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

// ==========================================
// CUSTOMIZATION (GIF + AUDIO)
// ==========================================
function openCustomizeModal() {
    toggleDrawer(); // Close the drawer
    loadCurrentCustomization();
    openModal('customizeModal');
}

async function loadCurrentCustomization() {
    if (!currentSpaceId) return;

    try {
        const customDoc = await db.collection('spaces').doc(currentSpaceId).collection('settings').doc('customization').get();
        if (customDoc.exists) {
            const data = customDoc.data();

            // Load GIF
            if (data.gifUrl) {
                document.getElementById('gifUrl').value = data.gifUrl;
                showGifPreview(data.gifUrl);
            }

            // Load audio
            if (data.audioUrl) {
                document.getElementById('audioUrl').value = data.audioUrl;
                showAudioPreview(data.audioUrl);
            }
        }
    } catch (error) {
        console.error('Error loading customization:', error);
    }
}

function showGifPreview(url) {
    const preview = document.getElementById('gifPreview');
    const img = document.getElementById('gifPreviewImg');
    img.src = url;
    preview.style.display = 'block';
}

function showAudioPreview(url) {
    const preview = document.getElementById('audioPreview');
    const audio = document.getElementById('audioPreviewPlayer');
    audio.src = url;
    preview.style.display = 'block';
}

async function saveCustomization() {
    if (!currentSpaceId) {
        showToast('Please create or join a space first', 'error');
        return;
    }

    const gifFile = document.getElementById('gifUpload').files[0];
    const audioFile = document.getElementById('audioUpload').files[0];
    const gifUrl = document.getElementById('gifUrl').value.trim();
    const audioUrl = document.getElementById('audioUrl').value.trim();

    let finalGifUrl = gifUrl;
    let finalAudioUrl = audioUrl;

    try {
        // Upload GIF if file selected
        if (gifFile) {
            showToast('Uploading GIF...', 'info');
            finalGifUrl = await uploadFile(gifFile, 'gifs');
        }

        // Upload audio if file selected
        if (audioFile) {
            showToast('Uploading audio...', 'info');
            finalAudioUrl = await uploadFile(audioFile, 'audio');
        }

        // Save to Firestore
        await db.collection('spaces').doc(currentSpaceId).collection('settings').doc('customization').set({
            gifUrl: finalGifUrl || null,
            audioUrl: finalAudioUrl || null,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update UI
        applyCustomization(finalGifUrl, finalAudioUrl);

        closeModal('customizeModal');
        showToast('Customization saved!', 'success');
    } catch (error) {
        console.error('Error saving customization:', error);
        showToast('Failed to save customization', 'error');
    }
}

async function uploadFile(file, folder) {
    const fileName = Date.now() + '_' + file.name;
    const storageRef = storage.ref().child(`${folder}/${currentSpaceId}/${fileName}`);

    await storageRef.put(file);
    const url = await storageRef.getDownloadURL();
    return url;
}

function applyCustomization(gifUrl, audioUrl) {
    const headerGif = document.getElementById('headerGif');
    const headerAudio = document.getElementById('headerAudio');

    if (gifUrl) {
        headerGif.src = gifUrl;
        headerGif.style.display = 'inline-block';
    } else {
        headerGif.style.display = 'none';
    }

    if (audioUrl) {
        headerAudio.src = audioUrl;
    }
}

async function loadCustomization() {
    if (!currentSpaceId) return;

    try {
        const customDoc = await db.collection('spaces').doc(currentSpaceId).collection('settings').doc('customization').get();
        if (customDoc.exists) {
            const data = customDoc.data();
            applyCustomization(data.gifUrl, data.audioUrl);
        }
    } catch (error) {
        console.error('Error loading customization:', error);
    }
}

function playHeaderAudio() {
    const audio = document.getElementById('headerAudio');
    if (audio.src) {
        audio.currentTime = 0; // Reset to start
        audio.play().catch(err => console.log('Audio play error:', err));
    }
}

// File input preview handlers
document.addEventListener('DOMContentLoaded', () => {
    const gifUpload = document.getElementById('gifUpload');
    const audioUpload = document.getElementById('audioUpload');
    const gifUrlInput = document.getElementById('gifUrl');
    const audioUrlInput = document.getElementById('audioUrl');

    if (gifUpload) {
        gifUpload.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                const url = URL.createObjectURL(e.target.files[0]);
                showGifPreview(url);
                gifUrlInput.value = ''; // Clear URL input if file selected
            }
        });
    }

    if (audioUpload) {
        audioUpload.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                const url = URL.createObjectURL(e.target.files[0]);
                showAudioPreview(url);
                audioUrlInput.value = ''; // Clear URL input if file selected
            }
        });
    }

    if (gifUrlInput) {
        gifUrlInput.addEventListener('input', (e) => {
            if (e.target.value) {
                showGifPreview(e.target.value);
            }
        });
    }

    if (audioUrlInput) {
        audioUrlInput.addEventListener('input', (e) => {
            if (e.target.value) {
                showAudioPreview(e.target.value);
            }
        });
    }
});

// Make functions globally available
window.openDateModal = openDateModal;
window.openRecipeModal = openRecipeModal;
window.openRestaurantModal = openRestaurantModal;
window.openPlanModalForEdit = openPlanModalForEdit;
window.openPlanDetailModal = openPlanDetailModal;
window.openItemDetail = openItemDetail;
window.toggleIngredientCheck = toggleIngredientCheck;
window.confirmDelete = confirmDelete;
window.setFontSize = setFontSize;
window.adjustFontSize = adjustFontSize;
window.removeCustomTag = removeCustomTag;
window.openRecipeDetail = openRecipeDetail;
window.openRestaurantDetail = openRestaurantDetail;
window.initColumnResize = initColumnResize;
window.showPastDates = showPastDates;
window.openCustomizeModal = openCustomizeModal;
window.saveCustomization = saveCustomization;
window.playHeaderAudio = playHeaderAudio;
